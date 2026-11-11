import { test, expect } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeMp4 } from "../../src/media";
import { toolPaths, subprocessEnv } from "../../src/config";

const ffmpeg = (args: string[]) => {
  const result = spawnSync(toolPaths.ffmpeg!, ["-v", "error", ...args], {
    env: subprocessEnv(),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
};
const probe = (path: string) => {
  const result = spawnSync(
    toolPaths.ffprobe!,
    ["-v", "error", "-show_streams", "-of", "json", path],
    { env: subprocessEnv(), encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout).streams;
};

test("compatible files are untouched; audio-only conversion preserves encoded H.264 packets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nixi-media-"));
  try {
    const native = join(dir, "native.mp4");
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=s=160x90:d=1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      native,
    ]);
    const before = readFileSync(native);
    await normalizeMp4(native, () => {}).done;
    expect(readFileSync(native)).toEqual(before);
    const opus = join(dir, "opus.mp4");
    ffmpeg([
      "-i",
      native,
      "-f",
      "lavfi",
      "-i",
      "sine=duration=1",
      "-c:v",
      "copy",
      "-c:a",
      "libopus",
      "-shortest",
      opus,
    ]);
    const packets = (path: string) =>
      ffmpeg(["-i", path, "-map", "0:v:0", "-c", "copy", "-f", "hash", "-"]);
    const video = packets(opus);
    await normalizeMp4(opus, () => {}).done;
    expect(packets(opus)).toBe(video);
    expect(
      probe(opus).find((s: { codec_type: string }) => s.codec_type === "audio"),
    ).toMatchObject({ codec_name: "aac", profile: "LC" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("conversion failure and cancellation leave the source intact and remove temporary files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nixi-media-cancel-"));
  try {
    const path = join(dir, "source.mp4");
    writeFileSync(path, "invalid media");
    await expect(normalizeMp4(path, () => {}).done).rejects.toThrow(
      "MP4 compatibility failed",
    );
    expect(readFileSync(path, "utf8")).toBe("invalid media");
    rmSync(path);
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=640x360:r=30:d=4",
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      path,
    ]);
    const before = readFileSync(path);
    for (const during of [false, true]) {
      const process = normalizeMp4(path, () => {
        if (during) setTimeout(() => process.cancel(), 10);
      });
      if (!during) process.cancel();
      await expect(process.done).rejects.toThrow("cancelled");
      expect(readFileSync(path)).toEqual(before);
      expect(readdirSync(dir)).toEqual(["source.mp4"]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
