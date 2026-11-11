import { testServer } from "../fixtures/server";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const spawnCommand = (
  args: string[],
  options: Parameters<typeof spawnSync>[2],
) => spawnSync(args[0], args.slice(1), options);
import { setTimeout as sleep } from "node:timers/promises";
import { test, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolPaths, subprocessEnv } from "../../src/config";
import { createApp } from "../../src/app";
import { Store } from "../../src/store";
import type { Job } from "../../src/types";

// Real yt-dlp + ffmpeg against an isolated, generated media fixture. No accounts,
// site availability, large downloads, or writes to the user's actual collection.
test.skipIf(!toolPaths.ytDlp || !toolPaths.ffmpeg || !toolPaths.ffprobe)(
  "real engine: preview, MP4, MP3, multi-video posts, file serving, errors and cancellation",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "nixi-e2e-"));
    const fixture = join(dir, "fixture.mp4");
    const generated = spawnCommand(
      [
        toolPaths.ffmpeg!,
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=160x90:r=10:d=1",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-c:v",
        "libvpx-vp9",
        "-c:a",
        "aac",
        "-shortest",
        fixture,
      ],
      { env: subprocessEnv() },
    );
    expect(generated.status).toBe(0);
    const media = await testServer((r) => {
      const path = new URL(r.url).pathname;
      if (path === "/post")
        return new Response(
          '<html><head><title>Two clips</title></head><body><video controls src="/one.mp4"></video><video controls src="/two.mp4"></video></body></html>',
          { headers: { "Content-Type": "text/html" } },
        );
      if (path === "/slow.mp4")
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(
                new Uint8Array(readFileSync(fixture)),
              ); /* Keep the connection open until cancellation. */
            },
          }),
          { headers: { "Content-Type": "video/mp4" } },
        );
      if (path.endsWith(".mp4"))
        return new Response(new Uint8Array(readFileSync(fixture)));
      return new Response("not found", { status: 404 });
    });
    const store = new Store(":memory:");
    const app = createApp(store, join(process.cwd(), "public"));
    app.queue.updateSettings({
      ...app.queue.settings,
      downloadDir: join(dir, "downloads"),
      concurrency: 2,
    });
    const server = await testServer(app.fetch);
    app.queue.start();
    const base = server.url;
    const source = media.url;
    const request = (path: string, method = "GET", body?: unknown) =>
      fetch(base + path, {
        method,
        headers: { Origin: base, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const wait = async (id: string) => {
      for (let i = 0; i < 160; i++) {
        const job = app.queue.get(id);
        if (
          ["completed", "failed", "cancelled"].includes(job.status) &&
          app.queue.active === 0
        )
          return job;
        await sleep(100);
      }
      throw new Error("Fixture download timed out");
    };
    try {
      const preview = await request("/api/info", "POST", {
        url: source + "/one.mp4",
      });
      expect(preview.status).toBe(200);
      expect((await preview.json()).title).toBeTruthy();
      for (const format of ["video", "mp3", "original"]) {
        const response = await request("/api/jobs", "POST", {
          urls: [source + "/one.mp4"],
          format,
        });
        expect(response.status).toBe(201);
        const job = await wait((await response.json()).jobs[0].id);
        expect(job.error).toBeNull();
        expect(job.status).toBe("completed");
        expect(job.files).toHaveLength(format === "original" ? 2 : 1);
        expect(
          job.files[0].name.endsWith(format === "mp3" ? ".mp3" : ".mp4"),
        ).toBe(true);
        const file = await request(`/api/jobs/${job.id}/files/0`);
        expect(file.status).toBe(200);
        expect((await file.arrayBuffer()).byteLength).toBeGreaterThan(1000);
        const probe = spawnCommand(
          [
            toolPaths.ffprobe!,
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name,pix_fmt",
            "-of",
            "json",
            job.files[0].path,
          ],
          { env: subprocessEnv() },
        );
        expect(probe.status).toBe(0);
        const streams = JSON.parse(probe.stdout?.toString()).streams;
        expect(
          streams.some((s: { codec_type: string }) => s.codec_type === "audio"),
        ).toBe(true);
        if (format === "video") {
          expect(
            streams.find(
              (s: { codec_type: string }) => s.codec_type === "video",
            ),
          ).toMatchObject({ codec_name: "h264", pix_fmt: "yuv420p" });
          expect(
            streams.find(
              (s: { codec_type: string }) => s.codec_type === "audio",
            ),
          ).toMatchObject({ codec_name: "aac" });
          const decode = spawnCommand(
            [
              toolPaths.ffmpeg!,
              "-v",
              "error",
              "-i",
              job.files[0].path,
              "-f",
              "null",
              "-",
            ],
            { env: subprocessEnv() },
          );
          expect(decode.status).toBe(0);
        }
        if (format === "original")
          expect(
            streams.find(
              (s: { codec_type: string }) => s.codec_type === "video",
            ).codec_name,
          ).toBe("vp9");
        if (format === "video")
          expect(
            streams.some(
              (s: { codec_type: string }) => s.codec_type === "video",
            ),
          ).toBe(true);
      }
      const multi = await request("/api/jobs", "POST", {
        url: source + "/post",
      });
      const multiJob = await wait((await multi.json()).jobs[0].id);
      expect(multiJob.error).toBeNull();
      expect(multiJob.files).toHaveLength(2);
      const bad = await request("/api/jobs", "POST", {
        url: source + "/missing",
      });
      const badJob = await wait((await bad.json()).jobs[0].id);
      expect(badJob.status).toBe("failed");
      expect(badJob.error).toContain("404");
      const batch = await request("/api/jobs", "POST", {
        urls: [1, 2, 3].map((i) => source + `/one.mp4?batch=${i}`),
      });
      const batchJobs = (await batch.json()).jobs as Job[];
      expect(batchJobs).toHaveLength(3);
      expect(app.queue.active).toBe(2);
      expect(app.queue.queued).toBe(1);
      for (const job of batchJobs)
        expect((await wait(job.id)).status).toBe("completed");
      const slow = await request("/api/jobs", "POST", {
        url: source + "/slow.mp4",
      });
      const slowJob = (await slow.json()).jobs[0] as Job;
      await sleep(500);
      expect(
        (await request(`/api/jobs/${slowJob.id}/cancel`, "POST")).status,
      ).toBe(200);
      await wait(slowJob.id);
      expect(app.queue.get(slowJob.id).status).toBe("cancelled");
      const foreign = await fetch(base + "/api/history/clear", {
        method: "POST",
        headers: { Origin: "https://evil.test" },
      });
      expect(foreign.status).toBe(403);
      expect(
        (await request("/api/jobs", "POST", { url: "file:///etc/passwd" }))
          .status,
      ).toBe(400);
      expect((await request("/brand-card.svg")).status).toBe(200);
      expect((await request("/favicon.ico")).status).toBe(200);
      const deleted = await request(`/api/jobs/${multiJob.id}`, "DELETE");
      expect(deleted.status).toBe(200);
      expect(existsSync(multiJob.files[0].path)).toBe(true);
    } finally {
      server.stop();
      media.stop();
      await app.queue.shutdown();
      store.close();
      rmSync(dir, { recursive: true });
    }
  },
  60_000,
);
