import { expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "@/components/nixi/composer";
import type { Settings } from "@/types";
const settings: Settings = {
  format: "video",
  quality: "best",
  cookiesBrowser: "none",
  playlist: false,
  subtitles: false,
  downloadDir: "/tmp",
  concurrency: 2,
};
test("validates links before sending and preserves input after a failed submission", async () => {
  const submit = vi.fn().mockRejectedValue(new Error("Offline"));
  const user = userEvent.setup();
  render(<Composer settings={settings} ready onQueued={submit} />);
  const input = screen.getByLabelText("Video links");
  await user.type(input, "not a link");
  await user.click(screen.getByRole("button", { name: "Capture links" }));
  expect(submit).not.toHaveBeenCalled();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "complete video link",
  );
  await user.clear(input);
  await user.type(input, "https://example.test/a");
  await user.click(screen.getByRole("button", { name: "Capture links" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(input).toHaveValue("https://example.test/a");
});
test("deduplicates links, applies audio options and clears only successful input", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<Composer settings={settings} ready onQueued={submit} />);
  await user.type(
    screen.getByLabelText("Video links"),
    "https://example.test/a\nhttps://example.test/a",
  );
  await user.selectOptions(screen.getByLabelText("Download format"), "mp3");
  expect(screen.getByLabelText("Maximum video resolution")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Capture links" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({
      urls: ["https://example.test/a"],
      format: "mp3",
      quality: "best",
      cookiesBrowser: "none",
      playlist: false,
      subtitles: false,
    }),
  );
  expect(screen.getByLabelText("Video links")).toHaveValue("");
});
import { fireEvent } from "@testing-library/react";
import { api } from "@/lib/api";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
test("preview shows source metadata and clears when the links change", async () => {
  vi.mocked(api).mockResolvedValue({
    title: "A great clip",
    site: "Example",
    uploader: "Creator",
    duration: 65,
    heights: [1080, 720],
    thumbnail: "https://example.com/thumb.png",
  });
  const user = userEvent.setup();
  render(<Composer settings={settings} ready onQueued={vi.fn()} />);
  await user.type(
    screen.getByLabelText("Video links"),
    "https://example.com/a",
  );
  await user.click(screen.getByRole("button", { name: "Preview" }));
  expect(await screen.findByText("A great clip")).toBeVisible();
  expect(screen.getByText("Available: 1080p / 720p")).toBeVisible();
  await user.type(screen.getByLabelText("Video links"), "b");
  expect(screen.queryByText("A great clip")).toBeNull();
  expect(vi.mocked(api).mock.calls.at(-1)![3]?.aborted).toBe(true);
});
test("batch preview is blocked; advanced options are captured on submit", async () => {
  const submit = vi.fn().mockResolvedValue(undefined),
    user = userEvent.setup();
  render(<Composer settings={settings} ready onQueued={submit} />);
  await user.type(
    screen.getByLabelText("Video links"),
    "https://example.com/a\nhttps://example.com/b",
  );
  await user.click(screen.getByRole("button", { name: "Preview" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Preview one link",
  );
  await user.click(
    screen.getByText("More options", { exact: false, selector: "summary" }),
  );
  await user.selectOptions(screen.getByLabelText("Cookies from"), "firefox");
  await user.selectOptions(
    screen.getByLabelText("Maximum video resolution"),
    "720",
  );
  await user.click(screen.getByLabelText("Include entire playlist"));
  await user.click(screen.getByLabelText("Save English subtitles"));
  await user.click(screen.getByRole("button", { name: "Capture links" }));
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      quality: "720",
      cookiesBrowser: "firefox",
      playlist: true,
      subtitles: true,
    }),
  );
});
test("drop strips URL-list comments, shortcut focuses links, clipboard denial gives paste guidance", async () => {
  const user = userEvent.setup();
  render(<Composer settings={settings} ready onQueued={vi.fn()} />);
  fireEvent.drop(screen.getByRole("region", { name: "New download" }), {
    dataTransfer: {
      getData: (type: string) =>
        type === "text/uri-list" ? "# link\nhttps://example.com/a" : "",
    },
  });
  expect(screen.getByLabelText("Video links")).toHaveValue(
    "https://example.com/a",
  );
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  expect(screen.getByLabelText("Video links")).toHaveFocus();
  vi.spyOn(navigator.clipboard, "readText").mockRejectedValueOnce(
    new Error("denied"),
  );
  await user.click(screen.getByRole("button", { name: /Paste/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Press ⌘V");
});
test("preview failure is recoverable without losing input", async () => {
  vi.mocked(api).mockRejectedValue(new Error("Preview unavailable"));
  const user = userEvent.setup();
  render(<Composer settings={settings} ready onQueued={vi.fn()} />);
  await user.type(
    screen.getByLabelText("Video links"),
    "https://example.com/a",
  );
  await user.click(screen.getByRole("button", { name: "Preview" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Preview unavailable",
  );
  expect(screen.getByLabelText("Video links")).toHaveValue(
    "https://example.com/a",
  );
});
