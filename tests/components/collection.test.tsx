import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionFilters } from "@/components/nixi/collection";
test("filters the collection without presenting navigation pages", async () => {
  const change = vi.fn();
  render(
    <CollectionFilters
      value="all"
      counts={{ all: 8, active: 2, completed: 5, failed: 1 }}
      onChange={change}
    />,
  );
  expect(screen.queryByRole("navigation")).toBeNull();
  const active = screen.getByRole("button", { name: "In progress 2" });
  await userEvent.click(active);
  expect(change).toHaveBeenCalledWith("active");
  expect(
    screen.getByRole("button", { name: "All downloads 8" }),
  ).toHaveAttribute("aria-pressed", "true");
});
import { Collection } from "@/components/nixi/collection";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { JobSummary } from "@/lib/library";
const job: JobSummary = {
  id: "abc",
  url: "https://example.com/clip",
  title: "Clip",
  site: "Example",
  thumbnail: null,
  status: "downloading",
  progress: 42,
  speed: 1024,
  eta: 10,
  options: {
    format: "video",
    quality: "best",
    cookiesBrowser: "none",
    playlist: false,
    subtitles: false,
  },
  directory: "/tmp/abc",
  files: [],
  error: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
test("active rows expose progress, details, copy and cancellation", async () => {
  const action = vi.fn(),
    details = vi.fn();
  render(
    <TooltipProvider>
      <Collection
        jobs={[job]}
        theme="phosphor"
        filter="all"
        search=""
        onAction={action}
        onDetails={details}
      />
    </TooltipProvider>,
  );
  expect(screen.getByText("Downloading 42%")).toBeVisible();
  expect(screen.getByText("1.0 KB/s")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Clip" }));
  expect(details).toHaveBeenCalledWith("abc");
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel download" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Copy source link" }),
  );
  expect(action.mock.calls).toEqual([
    ["abc", "cancel"],
    ["abc", "copy"],
  ]);
  expect(
    screen.queryByRole("button", { name: "Remove from history" }),
  ).toBeNull();
});
test("failed and completed rows offer the correct recovery and file actions", async () => {
  const action = vi.fn();
  render(
    <TooltipProvider>
      <Collection
        jobs={[
          {
            ...job,
            status: "failed",
            speed: null,
            error: "Sign in required",
            files: [{ name: "clip.mp3", path: "/tmp/a", size: 1024 }],
            options: { ...job.options, format: "mp3", playlist: true },
          },
        ]}
        theme="infrared"
        filter="failed"
        search=""
        onAction={action}
        onDetails={() => {}}
      />
    </TooltipProvider>,
  );
  expect(screen.getByText("Sign in required")).toBeVisible();
  expect(screen.getByText("MP3")).toBeVisible();
  expect(screen.getByText("Playlist")).toBeVisible();
  for (const name of [
    "Retry download",
    "Show in Finder",
    "Remove from history",
  ])
    await userEvent.click(screen.getByRole("button", { name }));
  expect(action.mock.calls).toEqual([
    ["abc", "retry"],
    ["abc", "reveal"],
    ["abc", "remove"],
  ]);
});
test.each([
  ["all", "query", "No matching downloads."],
  ["active", "", "All quiet on the download front."],
  ["failed", "", "Clear signal. No interruptions."],
  ["completed", "", "Nothing saved. Yet."],
] as const)(
  "empty %s collection has useful guidance",
  (filter, search, title) => {
    render(
      <Collection
        jobs={[]}
        theme="ultraviolet"
        filter={filter}
        search={search}
        onAction={() => {}}
        onDetails={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
  },
);
