import { statSync } from "node:fs";
import { describe, test, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store";
import { Queue } from "../../src/queue";
import { allowedRequest } from "../../src/app";
import { downloadArgs, explainError, parseInfo } from "../../src/engine";
import { options, parseUrls, settings, videoUrl } from "../../src/validation";
import type { Job, Options } from "../../src/types";
const defaults: Options = {
  format: "video",
  quality: "best",
  cookiesBrowser: "none",
  playlist: false,
  subtitles: false,
};
describe("input and process safety", () => {
  test("supports arbitrary http sites and deduplicates without dropping signed query strings", () => {
    expect(
      parseUrls(
        "https://example.net/video?a=1&b=2\nhttps://example.net/video?a=1&b=2",
      ),
    ).toEqual(["https://example.net/video?a=1&b=2"]);
    for (const value of [
      "file:///etc/passwd",
      "--exec=bad",
      "ftp://example.com/x",
      "https://user:secret@example.com/v",
    ])
      expect(() => videoUrl(value)).toThrow();
  });
  test("validates options and does not leak settings fields into saved per-job options", () => {
    expect(
      options({}, {
        ...defaults,
        downloadDir: "/tmp",
        concurrency: 2,
      } as Options),
    ).toEqual(defaults);
    expect(() =>
      options({ cookiesBrowser: "chrome --exec bad" }, defaults),
    ).toThrow();
    expect(() => options({ format: "--exec" }, defaults)).toThrow();
    expect(() => options({ playlist: "yes" }, defaults)).toThrow();
    expect(() => parseUrls(Array(101).fill("https://example.com"))).toThrow();
    expect(() =>
      settings(
        { downloadDir: "relative" },
        { ...defaults, downloadDir: "/tmp", concurrency: 2 },
      ),
    ).toThrow();
    expect(() =>
      settings(
        { concurrency: 7 },
        { ...defaults, downloadDir: "/tmp", concurrency: 2 },
      ),
    ).toThrow();
  });
  test("URLs stay a single argument after --; format choices preserve fallback", () => {
    const url = "https://example.com/$(whoami)?v=a&b=2";
    const args = downloadArgs(
      url,
      { ...defaults, quality: "1080" },
      "/tmp/nixi test",
    );
    expect(args.slice(-2)).toEqual(["--", url]);
    expect(args).toContain("--ignore-config");
    expect(args).toContain("--no-playlist");
    expect(args[args.indexOf("--format") + 1]).toContain("b[height<=?1080]");
    const audio = downloadArgs(
      url,
      { ...defaults, format: "mp3", cookiesBrowser: "firefox", playlist: true },
      "/tmp/x",
    );
    expect(audio).toContain("--yes-playlist");
    expect(audio).toContain("--extract-audio");
    expect(audio[audio.indexOf("--audio-format") + 1]).toBe("mp3");
    expect(audio[audio.indexOf("--cookies-from-browser") + 1]).toBe("firefox");
  });
  test("rejects remote hosts, cross-site reads and cross-origin mutations", () => {
    const req = (
      method: string,
      host: string,
      origin?: string,
      site?: string,
    ) =>
      new Request("http://127.0.0.1:43174/api/jobs", {
        method,
        headers: {
          host,
          ...(origin ? { origin } : {}),
          ...(site ? { "sec-fetch-site": site } : {}),
        },
      });
    expect(allowedRequest(req("GET", "127.0.0.1:43174"))).toBe(true);
    expect(
      allowedRequest(req("POST", "127.0.0.1:43174", "http://127.0.0.1:43174")),
    ).toBe(true);
    expect(allowedRequest(req("POST", "127.0.0.1:43174"))).toBe(false);
    expect(
      allowedRequest(
        req("POST", "127.0.0.1:43175", "http://127.0.0.1:3000"),
        "http://127.0.0.1:3000",
      ),
    ).toBe(true);
    expect(
      allowedRequest(
        req("POST", "127.0.0.1:43175", "https://evil.test"),
        "https://evil.test",
      ),
    ).toBe(false);
    expect(
      allowedRequest(req("POST", "127.0.0.1:43174", "https://evil.test")),
    ).toBe(false);
    expect(allowedRequest(req("GET", "evil.test"))).toBe(false);
    expect(allowedRequest(req("GET", "127.0.0.1.evil.test"))).toBe(false);
    expect(
      allowedRequest(req("GET", "127.0.0.1:43174", undefined, "cross-site")),
    ).toBe(false);
  });
  test("understands multi-video metadata and gives auth recovery advice", () => {
    expect(
      parseInfo(
        JSON.stringify({
          title: "Post",
          entries: [
            null,
            {
              title: "Clip",
              duration: 3,
              formats: [{ height: 720 }, { height: 1080 }, { height: 720 }],
            },
          ],
        }),
      ),
    ).toMatchObject({ title: "Post", heights: [1080, 720], entries: 2 });
    expect(explainError("WARNING: ignored\nERROR: Login required")).toContain(
      "signed-in browser",
    );
  });
});
describe("durable queue", () => {
  test("persists settings and queued jobs through a real SQLite reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "nixi-persist-"));
    const path = join(dir, "history.sqlite");
    const first = new Store(path);
    const queue = new Queue(first);
    queue.updateSettings({
      ...queue.settings,
      downloadDir: join(dir, "media"),
      concurrency: 3,
      cookiesBrowser: "firefox",
    });
    const job = queue.add(["https://example.com/persist"], {
      ...defaults,
      format: "mp3",
    }).jobs[0];
    first.close();
    const reopened = new Store(path);
    const restored = new Queue(reopened);
    expect(restored.settings.concurrency).toBe(3);
    expect(restored.settings.cookiesBrowser).toBe("firefox");
    expect(restored.get(job.id).options.format).toBe("mp3");
    expect(restored.get(job.id).status).toBe("queued");
    reopened.close();
    rmSync(dir, { recursive: true });
  });

  test("deduplicates active jobs, honors per-job options, cancels queued jobs and preserves files when clearing history", () => {
    const dir = mkdtempSync(join(tmpdir(), "nixi-core-"));
    const store = new Store(":memory:");
    const q = new Queue(store);
    q.updateSettings({ ...q.settings, downloadDir: dir });
    const first = q.add(["https://example.com/clip"], defaults);
    expect(first.jobs).toHaveLength(1);
    expect(q.add(["https://example.com/clip"], defaults).skipped).toBe(1);
    expect(
      q.add(["https://example.com/clip"], { ...defaults, format: "mp3" }).jobs,
    ).toHaveLength(1);
    const job = first.jobs[0];
    mkdirSync(job.directory, { recursive: true });
    const file = join(job.directory, "clip.mp4");
    writeFileSync(file, "media");
    q.cancel(job.id);
    q.clearHistory();
    expect(statSync(file).size).toBe(5);
    expect(store.jobs()).toHaveLength(1);
    store.close();
    rmSync(dir, { recursive: true });
  });
  test("recovers interrupted jobs as retryable without auto-repeating network requests", () => {
    const store = new Store(":memory:");
    const q = new Queue(store);
    const job = q.add(["https://example.com/clip"], defaults).jobs[0];
    job.status = "downloading";
    store.save(job);
    const recovered = new Queue(store);
    expect(recovered.get(job.id).status).toBe("failed");
    expect(recovered.get(job.id).error).toContain("Retry");
    expect(recovered.retry(job.id).status).toBe("queued");
    store.close();
  });
  test("rejects files replaced by symlinks to outside the job directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "nixi-file-"));
    const store = new Store(":memory:");
    const q = new Queue(store);
    q.updateSettings({ ...q.settings, downloadDir: dir });
    const job = q.add(["https://example.com"], defaults).jobs[0];
    mkdirSync(job.directory, { recursive: true });
    const outside = join(dir, "outside");
    writeFileSync(outside, "secret");
    const link = join(job.directory, "clip.mp4");
    symlinkSync(outside, link);
    job.files = [{ path: link, name: "clip.mp4", size: 6 }];
    expect(() => q.file(job, 0)).toThrow();
    store.close();
    rmSync(dir, { recursive: true });
  });
});
