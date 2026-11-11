import { expect, test } from "vitest";
import { bytes, duration } from "../../src/lib/format";
import { settings, options } from "../../src/validation";
import { parseUrls, videoUrl } from "../../src/lib/links";
const defaults = {
  format: "video",
  quality: "best",
  cookiesBrowser: "none",
  playlist: false,
  subtitles: false,
  downloadDir: "/tmp",
  concurrency: 2,
} as const;
test("human readable sizes and durations handle boundaries", () => {
  expect([0, -1, NaN, Infinity].map(bytes)).toEqual([
    "0 B",
    "0 B",
    "0 B",
    "0 B",
  ]);
  expect(bytes(1024)).toBe("1.0 KB");
  expect(bytes(1024 ** 5)).toBe("1024.0 TB");
  expect(bytes(1)).toBe("1 B");
  expect([null, -1, 0, 65, 3601].map(duration)).toEqual([
    "",
    "",
    "0:00",
    "1:05",
    "1:00:01",
  ]);
});
test("settings reject invalid object shapes, folders and concurrency", () => {
  for (const value of [null, [], "bad"])
    expect(() => options(value, defaults)).toThrow();
  for (const downloadDir of ["", 1, "/tmp/\nwrong"])
    expect(() => settings({ downloadDir }, defaults)).toThrow();
  for (const concurrency of [0, 5, 1.5, "2"])
    expect(() => settings({ concurrency }, defaults)).toThrow();
  expect(
    settings(
      {
        downloadDir: "~/Downloads",
        concurrency: 4,
        subtitles: true,
        playlist: true,
      },
      defaults,
    ),
  ).toMatchObject({ concurrency: 4, subtitles: true, playlist: true });
});
test("links enforce bounded batches and preserve encoded queries", () => {
  for (const value of [null, 1, "a".repeat(8193)])
    expect(() => videoUrl(value)).toThrow();
  for (const value of [[], null, Array(101).fill("https://example.com")])
    expect(() => parseUrls(value)).toThrow();
  expect(
    parseUrls(
      " https://example.com/a?q=x%20y \nhttps://example.com/a?q=x%20y ",
    ),
  ).toEqual(["https://example.com/a?q=x%20y"]);
});
