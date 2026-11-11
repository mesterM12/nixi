import { expect, test } from "vitest";
import {
  libraryView,
  parseLibraryQuery,
  optionsKey,
} from "../../src/lib/library";
import type { Job } from "../../src/types";
const job = (id: string, status: Job["status"], title = id): Job => ({
  id,
  status,
  title,
  url: `https://example.test/${id}`,
  site: "Example",
  thumbnail: null,
  options: {
    format: "video",
    quality: "best",
    playlist: false,
    cookiesBrowser: "none",
    subtitles: false,
  },
  directory: "/tmp",
  progress: 0,
  speed: null,
  eta: null,
  files: [],
  error: null,
  logs: "private long log",
  createdAt: id,
  updatedAt: id,
});
test("library pages exclude logs, count every state, and filter before pagination", () => {
  const jobs = [
    job("1", "completed", "First"),
    job("2", "downloading", "Second"),
    job("3", "cancelled", "Third"),
    job("4", "failed", "Fourth"),
  ];
  const result = libraryView(jobs, {
    filter: "all",
    search: "",
    offset: 1,
    limit: 2,
  });
  expect(result.total).toBe(4);
  expect(result.jobs.map((j) => j.id)).toEqual(["2", "3"]);
  expect(result.counts).toEqual({ all: 4, active: 1, completed: 1, failed: 2 });
  expect(result.jobs[0]).not.toHaveProperty("logs");
  expect(
    libraryView(jobs, {
      filter: "failed",
      search: "third",
      offset: 0,
      limit: 50,
    }).jobs.map((j) => j.id),
  ).toEqual(["3"]);
  expect(
    libraryView(jobs, {
      filter: "active",
      search: "example",
      offset: 0,
      limit: 50,
    }).total,
  ).toBe(1);
});
test("library query caps payload size and rejects invalid pagination", () => {
  expect(parseLibraryQuery(new URLSearchParams())).toEqual({
    filter: "all",
    search: "",
    offset: 0,
    limit: 50,
  });
  for (const query of [
    "limit=0",
    "limit=1001",
    "offset=-1",
    "offset=0.5",
    "filter=wat",
    "limit=1e9",
  ])
    expect(() => parseLibraryQuery(new URLSearchParams(query))).toThrow();
});
test("option identity is independent of property insertion order", () => {
  const opts = job("1", "queued").options;
  expect(optionsKey("https://example.test", opts)).toBe(
    optionsKey("https://example.test", {
      subtitles: false,
      playlist: false,
      quality: "best",
      format: "video",
      cookiesBrowser: "none",
    }),
  );
  expect(optionsKey("https://example.test", opts)).not.toBe(
    optionsKey("https://example.test", { ...opts, format: "mp3" }),
  );
});
