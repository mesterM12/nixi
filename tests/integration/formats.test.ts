import { beforeAll, afterAll, test, expect } from "vitest";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { formatCases, formatMedia } from "../fixtures/format-media";
import { macosMediaChecker } from "../fixtures/macos-media";
import { testServer } from "../fixtures/server";
import { createApp } from "../../src/app";
import { Store } from "../../src/store";
import { toolPaths, subprocessEnv, root } from "../../src/config";
import type { Job } from "../../src/types";

let directory: string;
let app: ReturnType<typeof createApp>;
let media: Awaited<ReturnType<typeof testServer>>;
let server: Awaited<ReturnType<typeof testServer>>;
let native: ReturnType<typeof macosMediaChecker> | undefined;
const results: Record<string, unknown>[] = [];
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "nixi-format-tests-"));
  media = await testServer(formatMedia(join(directory, "sources")));
  if (process.platform === "darwin") native = macosMediaChecker(directory);
  app = createApp(new Store(":memory:"));
  app.queue.updateSettings({
    ...app.queue.settings,
    downloadDir: join(directory, "downloads"),
    concurrency: 1,
  });
  app.queue.start();
  server = await testServer(app.fetch);
}, 60_000);
afterAll(async () => {
  const report = {
    testedAt: new Date().toISOString(),
    platform: process.platform,
    os: spawnSync("/usr/bin/sw_vers", ["-productVersion"], {
      encoding: "utf8",
    }).stdout?.trim(),
    nativeDecoder: "AVFoundation / decoded video and PCM audio samples",
    results,
  };
  mkdirSync(join(root, "test-results"), { recursive: true });
  writeFileSync(
    join(root, "test-results/macos-formats.json"),
    JSON.stringify(report, null, 2),
  );
  server?.stop();
  media?.stop();
  await app?.shutdown();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

for (const entry of formatCases)
  test(`format compatibility: ${entry.name}`, async () => {
    const response = await fetch(server.url + "/api/jobs", {
      method: "POST",
      headers: { Origin: server.url, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: media.url + entry.source,
        format: entry.format,
        quality: entry.quality,
      }),
    });
    expect(response.status).toBe(201);
    const id = (await response.json()).jobs[0].id;
    const deadline = Date.now() + 25_000;
    let job: Job;
    do {
      job = app.queue.get(id);
      if (
        ["completed", "failed", "cancelled"].includes(job.status) &&
        app.queue.active === 0
      )
        break;
      await sleep(50);
    } while (Date.now() < deadline);
    expect(job.error, job.logs).toBeNull();
    expect(job.status).toBe("completed");
    expect(basename(job.directory)).toMatch(/^\d{4}-\d{2}-\d{2}_\d{3,}$/);
    expect(job.files).toHaveLength(entry.companion ? 2 : 1);
    if (entry.companion)
      expect(readFileSync(job.files[0].path)).toEqual(
        readFileSync(join(directory, "sources", entry.source.slice(1))),
      );
    const files = [];
    for (const [index, file] of job.files.entries()) {
      const probe = spawnSync(
        toolPaths.ffprobe!,
        [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          file.path,
        ],
        { env: subprocessEnv(), encoding: "utf8" },
      );
      expect(probe.status, probe.stderr).toBe(0);
      const info = JSON.parse(probe.stdout);
      const video = info.streams.find(
        (s: { codec_type: string }) => s.codec_type === "video",
      );
      const audio = info.streams.find(
        (s: { codec_type: string }) => s.codec_type === "audio",
      );
      expect(audio).toBeTruthy();
      if (entry.height)
        expect(video.height).toBe(
          entry.companion && index === 1 && entry.quality !== "best"
            ? Math.min(entry.height, Number(entry.quality))
            : entry.height,
        );
      else expect(video).toBeUndefined();
      const decode = spawnSync(
        toolPaths.ffmpeg!,
        ["-v", "error", "-xerror", "-i", file.path, "-f", "null", "-"],
        { env: subprocessEnv(), encoding: "utf8", timeout: 30_000 },
      );
      expect(decode.status, decode.stderr).toBe(0);
      const served = await fetch(`${server.url}/api/jobs/${id}/files/${index}`);
      expect(served.status).toBe(200);
      expect(Buffer.from(await served.arrayBuffer())).toEqual(
        readFileSync(file.path),
      );
      const compatibility = native?.(file.path);
      files.push({
        name: file.name,
        streams: info.streams.map(
          ({
            codec_name,
            codec_type,
            height,
            pix_fmt,
          }: Record<string, unknown>) => ({
            codec_name,
            codec_type,
            height,
            pix_fmt,
          }),
        ),
        native: compatibility,
      });
      if (compatibility && !(entry.companion && index === 0)) {
        expect(
          compatibility.error,
          JSON.stringify(compatibility),
        ).toBeUndefined();
        expect(compatibility).toMatchObject({
          playable: true,
          completed: true,
        });
        expect(compatibility.audioSamples).toBeGreaterThan(0);
        if (entry.height) expect(compatibility.videoSamples).toBeGreaterThan(0);
      }
      if (entry.companion && index === 1)
        expect(video).toMatchObject({ codec_name: "h264", pix_fmt: "yuv420p" });
    }
    results.push({
      ...entry,
      status: job.status,
      directory: basename(job.directory),
      files,
    });
  });
