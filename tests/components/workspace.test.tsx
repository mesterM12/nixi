import { expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/nixi/workspace";
import { useLibrary } from "@/hooks/use-library";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Library } from "@/lib/library";
vi.mock("@/hooks/use-library", () => ({ useLibrary: vi.fn() }));
vi.mock("@/hooks/use-theme", () => ({
  initializeTheme: vi.fn(),
  useTheme: () => ["amber", vi.fn()],
}));
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));
const dependency = { path: "/tool", version: "1" };
const data: Library = {
  jobs: [],
  total: 0,
  counts: { all: 0, active: 0, completed: 0, failed: 0 },
  revision: 1,
  settings: {
    downloadDir: "/tmp",
    concurrency: 2,
    format: "video",
    quality: "best",
    cookiesBrowser: "none",
    playlist: false,
    subtitles: false,
  },
  system: {
    ready: true,
    active: 0,
    queued: 0,
    ytDlp: dependency,
    ffmpeg: dependency,
    ffprobe: dependency,
    runtime: dependency,
  },
};
function setup(value = data, error?: string) {
  const refresh = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useLibrary).mockReturnValue({
    data: value,
    error,
    loading: false,
    refresh,
  });
  vi.mocked(api).mockResolvedValue({ ok: true });
  return refresh;
}
test("workspace queues input, refreshes the collection and preserves media on history clearing", async () => {
  const refresh = setup();
  vi.mocked(api).mockResolvedValue({ jobs: [{ id: "abc" }], skipped: 0 });
  const user = userEvent.setup();
  render(<Workspace />);
  await user.type(
    screen.getByLabelText("Video links"),
    "https://example.com/clip",
  );
  await user.click(screen.getByRole("button", { name: "Capture links" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(api).toHaveBeenCalledWith(
    "/api/jobs",
    "POST",
    expect.objectContaining({ urls: ["https://example.com/clip"] }),
  );
  await user.click(screen.getByRole("button", { name: "Clear finished" }));
  expect(api).toHaveBeenCalledWith("/api/history/clear", "POST");
  expect(toast.success).toHaveBeenCalledWith(
    "History cleared. Saved files are still on your Mac.",
  );
  await user.click(
    screen.getByRole("button", { name: "Open download folder" }),
  );
  expect(api).toHaveBeenCalledWith("/api/open-folder", "POST");
});
test("workspace exposes service failures without losing the composer", () => {
  setup(data, "Offline");
  render(<Workspace />);
  expect(screen.getByRole("alert")).toHaveTextContent("Cannot reach nixi");
  expect(screen.getByRole("button", { name: "Capture links" })).toBeDisabled();
  expect(screen.getByLabelText("Video links")).toBeEnabled();
});
test("missing tools disable submission and explain setup", () => {
  setup({ ...data, system: { ...data.system, ready: false } });
  render(<Workspace />);
  expect(screen.getByRole("alert")).toHaveTextContent("pnpm run setup");
  expect(screen.getByRole("button", { name: "Capture links" })).toBeDisabled();
});
test("collection filters, debounced search and paging are passed to the service", async () => {
  setup({ ...data, total: 102, counts: { ...data.counts, all: 102 } });
  const user = userEvent.setup();
  render(<Workspace />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(useLibrary).toHaveBeenLastCalledWith({
    filter: "all",
    search: "",
    offset: 50,
    limit: 50,
  });
  await user.click(screen.getByRole("button", { name: "In progress 0" }));
  expect(useLibrary).toHaveBeenLastCalledWith({
    filter: "active",
    search: "",
    offset: 0,
    limit: 50,
  });
  await user.type(
    screen.getByRole("textbox", { name: "Search downloads" }),
    "clip",
  );
  await waitFor(() =>
    expect(useLibrary).toHaveBeenLastCalledWith({
      filter: "active",
      search: "clip",
      offset: 0,
      limit: 50,
    }),
  );
});
test("removing the final page returns the collection to a valid page", async () => {
  setup({ ...data, total: 51 });
  const user = userEvent.setup();
  const { rerender } = render(<Workspace />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  setup({ ...data, total: 1 });
  rerender(<Workspace />);
  await waitFor(() =>
    expect(useLibrary).toHaveBeenLastCalledWith({
      filter: "all",
      search: "",
      offset: 0,
      limit: 50,
    }),
  );
});
test("nixi identity uses the approved name and capture direction", () => {
  setup();
  render(<Workspace />);
  expect(screen.getByRole("link", { name: "nixi home" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Capture what moves." }),
  ).toBeVisible();
  expect(
    screen.getByText("A quiet little utility for keeping the internet close."),
  ).toBeVisible();
  expect(
    screen.getByRole("status", { name: "Queue status" }),
  ).toHaveTextContent("All quiet");
});
