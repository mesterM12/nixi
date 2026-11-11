import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const spawnCommand = (
  args: string[],
  options: Parameters<typeof spawnSync>[2],
) => spawnSync(args[0], args.slice(1), options);
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Queue } from "../src/queue";
import { Store } from "../src/store";
import { toolPaths, subprocessEnv } from "../src/config";

// Optional real-network smoke test. Temporary media is removed on completion.
const dir = mkdtempSync(join(tmpdir(), "nixi-youtube-"));
const store = new Store(":memory:");
const queue = new Queue(store);
queue.updateSettings({ ...queue.settings, downloadDir: dir, concurrency: 1 });
const job = queue.add(["https://www.youtube.com/watch?v=jNQXAC9IVRw"], {
  format: "video",
  quality: "480",
  cookiesBrowser: "none",
  playlist: false,
  subtitles: false,
}).jobs[0];
queue.start();
try {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && (queue.active || job.status === "queued"))
    await sleep(250);
  if (job.status !== "completed")
    throw new Error(job.error || "YouTube download timed out.");
  const result = spawnCommand(
    [
      toolPaths.ffprobe!,
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      job.files[0].path,
    ],
    { env: subprocessEnv() },
  );
  if (result.status !== 0) throw new Error(result.stderr?.toString());
  const info = JSON.parse(result.stdout?.toString());
  if (
    !info.streams.some(
      (s: { codec_type: string }) => s.codec_type === "video",
    ) ||
    !info.streams.some((s: { codec_type: string }) => s.codec_type === "audio")
  )
    throw new Error(
      "The downloaded video must contain video and audio streams.",
    );
  console.log(
    JSON.stringify(
      {
        title: job.title,
        status: job.status,
        files: job.files.map((f) => ({ name: f.name, size: f.size })),
        media: info,
      },
      null,
      2,
    ),
  );
} finally {
  await queue.shutdown();
  store.close();
  rmSync(dir, { recursive: true });
}
