import { expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Preferences from "@/components/nixi/preferences";
import JobDetails from "@/components/nixi/job-details";
import { api } from "@/lib/api";
import type { Job, Settings, SystemStatus } from "@/types";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
const settings: Settings = {
  format: "video",
  quality: "best",
  cookiesBrowser: "none",
  playlist: false,
  subtitles: false,
  downloadDir: "/tmp",
  concurrency: 2,
};
const dependency = { path: "/tools/engine", version: "1.0" };
const system: SystemStatus = {
  ready: true,
  active: 0,
  queued: 0,
  ytDlp: dependency,
  ffmpeg: dependency,
  ffprobe: dependency,
  runtime: dependency,
};
test("preferences apply draft options and theme, close only after save", async () => {
  const save = vi.fn().mockResolvedValue(undefined),
    close = vi.fn(),
    theme = vi.fn(),
    user = userEvent.setup();
  render(
    <Preferences
      open
      onOpenChange={close}
      settings={settings}
      system={system}
      theme="amber"
      onTheme={theme}
      onSave={save}
    />,
  );
  await user.selectOptions(screen.getByLabelText("Visual deck"), "phosphor");
  expect(theme).toHaveBeenCalledWith("phosphor");
  await user.selectOptions(screen.getByLabelText("Default format"), "mp3");
  await user.selectOptions(
    screen.getByLabelText("Simultaneous downloads"),
    "4",
  );
  await user.click(screen.getByLabelText("Save English subtitles by default"));
  await user.click(
    screen.getByLabelText("Include entire playlists by default"),
  );
  await user.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(save).toHaveBeenCalledWith({
    ...settings,
    format: "mp3",
    concurrency: 4,
    subtitles: true,
    playlist: true,
  });
});
test("failed preferences keep the draft and expose the server error", async () => {
  const user = userEvent.setup(),
    close = vi.fn();
  render(
    <Preferences
      open
      onOpenChange={close}
      settings={settings}
      system={system}
      theme="infrared"
      onTheme={() => {}}
      onSave={vi.fn().mockRejectedValue(new Error("Folder is not writable"))}
    />,
  );
  await user.clear(screen.getByLabelText(/^Download folder/));
  await user.type(screen.getByLabelText(/^Download folder/), "/new-folder");
  await user.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Folder is not writable",
  );
  expect(screen.getByLabelText(/^Download folder/)).toHaveValue("/new-folder");
  expect(close).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalledWith(false);
});
test("details fetch full logs only on demand and expose saved files", async () => {
  vi.mocked(api).mockResolvedValue({
    id: "abc",
    title: "My clip",
    url: "https://example.com/a",
    status: "completed",
    directory: "/tmp/abc",
    createdAt: new Date().toISOString(),
    files: [{ path: "/tmp/abc/clip.mp4", name: "clip.mp4", size: 1024 }],
    logs: "Engine finished",
    error: "Previous warning",
  } as Job);
  render(<JobDetails id="abc" onClose={() => {}} />);
  expect(await screen.findByText("My clip")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Download clip.mp4" }),
  ).toHaveAttribute("href", "/api/jobs/abc/files/0");
  expect(screen.getByText("Previous warning")).toBeVisible();
  await userEvent.click(screen.getByText("Download log"));
  expect(screen.getByText("Engine finished")).toBeVisible();
});
test("details report missing downloads and cancel the request on close", async () => {
  vi.mocked(api).mockRejectedValue(new Error("Download not found"));
  const { unmount } = render(<JobDetails id="missing" onClose={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Download not found",
  );
  const signal = vi.mocked(api).mock.calls.at(-1)![3];
  unmount();
  expect(signal?.aborted).toBe(true);
});
