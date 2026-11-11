import { afterEach, expect, test, vi } from "vitest";
import {
  baseUrl,
  parseLinks,
  api,
  getStatus,
  isActive,
  captureFormat,
  browserOptions,
} from "../src/nixi";
const preference = vi.hoisted(() => ({ serverUrl: "http://127.0.0.1:43174" }));
vi.mock("@raycast/api", () => ({ getPreferenceValues: () => preference }));
afterEach(() => {
  preference.serverUrl = "http://127.0.0.1:43174";
  vi.unstubAllGlobals();
});
test("Extract Audio preserves an audio default and converts video defaults to MP3", () => {
  expect(captureFormat("video", true)).toBe("mp3");
  expect(captureFormat("original", true)).toBe("mp3");
  for (const format of ["mp3", "m4a", "opus", "flac", "wav"])
    expect(captureFormat(format, true)).toBe(format);
  expect(captureFormat("video", false)).toBe("video");
  expect(browserOptions).toContainEqual(["zen", "Zen"]);
});
test("Raycast accepts only local service addresses", () => {
  for (const url of [
    "https://localhost:43174",
    "http://example.com",
    "http://user:pass@localhost",
    "http://localhost/path",
    "http://localhost?query=1",
    "http://localhost#hash",
  ]) {
    preference.serverUrl = url;
    expect(() => baseUrl()).toThrow("nixi Address");
  }
  preference.serverUrl = "http://localhost:43174";
  expect(baseUrl()).toBe("http://localhost:43174");
  preference.serverUrl = "";
  expect(baseUrl()).toBe("http://127.0.0.1:43174");
});
test("Raycast parses deduplicated batches and rejects unsafe links", () => {
  expect(parseLinks("https://example.com/a \nhttps://example.com/a")).toEqual([
    "https://example.com/a",
  ]);
  for (const text of [
    "",
    "bad",
    "file:///tmp/a",
    "https://user:pass@example.com/a",
    Array.from({ length: 101 }, (_, i) => `https://example.com/${i}`).join(
      "\n",
    ),
  ])
    expect(() => parseLinks(text)).toThrow();
  expect(isActive({ status: "queued" } as never)).toBe(true);
  expect(isActive({ status: "completed" } as never)).toBe(false);
});
test("Raycast API uses local Origin, JSON, errors and offline guidance", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    api("/api/jobs", "POST", { url: "https://example.com" }),
  ).resolves.toEqual({ ok: true });
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    headers: {
      Origin: "http://127.0.0.1:43174",
      "Content-Type": "application/json",
    },
    body: '{"url":"https://example.com"}',
  });
  fetcher.mockResolvedValue(
    new Response('{"error":"Invalid format"}', { status: 400 }),
  );
  await expect(api("/api/jobs")).rejects.toThrow("Invalid format");
  fetcher.mockRejectedValue(new Error("Disconnected"));
  await expect(api("/api/status")).rejects.toThrow("pnpm run install:agent");
});
test("Raycast conditional refresh reuses unchanged compact snapshots", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response('{"jobs":[],"system":{"active":0,"queued":0}}', {
      headers: { etag: '"rev1"' },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const first = await getStatus();
  fetcher.mockResolvedValue(new Response(null, { status: 304 }));
  expect(await getStatus()).toBe(first);
  expect(fetcher.mock.calls.at(-1)![0]).toContain("compact=1");
  expect(fetcher.mock.calls.at(-1)![1].headers["If-None-Match"]).toBe('"rev1"');
});
