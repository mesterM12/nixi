import { rename, rm } from "node:fs/promises";
import { dirname, join, extname, basename } from "node:path";
import type { Quality } from "./types";
import { toolPaths } from "./config";
import { runTool, type RunningProcess } from "./engine";

export type MediaStream = {
  codec_type: string;
  codec_name?: string;
  pix_fmt?: string;
  profile?: string;
  height?: number;
};

export function compatibilityPlan(streams: MediaStream[], maxHeight?: number) {
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error("The downloaded file has no video stream.");
  const audio = streams.find((s) => s.codec_type === "audio");
  return {
    video:
      video.codec_name !== "h264" ||
      video.pix_fmt !== "yuv420p" ||
      (!!maxHeight && Number(video.height) > maxHeight),
    audio: !!audio && (audio.codec_name !== "aac" || audio.profile !== "LC"),
  };
}

// Keep the source intact until the replacement has been written and probed.
// The queue owns this handle throughout probing and conversion, including shutdown.
export function normalizeMp4(
  path: string,
  onLine: (line: string) => void,
  options: {
    destination?: string;
    skipCompatibleMp4?: boolean;
    quality?: Quality;
  } = {},
): RunningProcess & {
  done: Promise<{ code: number; stderr: string; filePath: string }>;
} {
  if (!toolPaths.ffmpeg || !toolPaths.ffprobe)
    throw new Error(
      "MP4 compatibility requires ffmpeg and ffprobe. Run pnpm run setup, then restart nixi.",
    );
  const {
    destination = path,
    skipCompatibleMp4 = false,
    quality = "best",
  } = options;
  const maxHeight = quality === "best" ? undefined : Number(quality);
  let current: RunningProcess | undefined;
  let cancelled = false;
  const temp = join(dirname(path), `.nixi-${crypto.randomUUID()}.mp4`);
  const run = async (
    executable: string,
    args: string[],
    line: (line: string) => void,
    timeout?: number,
  ) => {
    if (cancelled) throw new Error("MP4 conversion cancelled.");
    current = runTool(executable, args, line, timeout);
    const result = await current.done;
    if (cancelled) throw new Error("MP4 conversion cancelled.");
    if (result.code !== 0)
      throw new Error(
        `MP4 compatibility failed: ${result.stderr.slice(-2000) || "media tool stopped"}`,
      );
  };
  const probe = async (file: string) => {
    const lines: string[] = [];
    await run(
      toolPaths.ffprobe!,
      ["-v", "error", "-show_streams", "-of", "json", file],
      (line) => lines.push(line),
      30_000,
    );
    return compatibilityPlan(JSON.parse(lines.join("\n")).streams, maxHeight);
  };
  const done = (async () => {
    try {
      const plan = await probe(path);
      if (
        plan.video ||
        plan.audio ||
        (destination !== path &&
          !(skipCompatibleMp4 && extname(path).toLowerCase() === ".mp4"))
      ) {
        onLine("[nixi] Preparing a QuickTime-compatible MP4 (H.264 / AAC).");
        await run(
          toolPaths.ffmpeg!,
          [
            "-hide_banner",
            "-nostdin",
            "-v",
            "error",
            "-n",
            "-i",
            path,
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-c:v",
            plan.video ? "libx264" : "copy",
            ...(plan.video
              ? [
                  "-preset",
                  "fast",
                  "-crf",
                  "18",
                  "-pix_fmt",
                  "yuv420p",
                  "-vf",
                  `${maxHeight ? `scale=w=-2:h='min(ih,${maxHeight})',` : ""}pad=ceil(iw/2)*2:ceil(ih/2)*2`,
                ]
              : []),
            "-c:a",
            plan.audio ? "aac" : "copy",
            ...(plan.audio
              ? ["-profile:a", "aac_low", "-b:a", "192k", "-ac", "2"]
              : []),
            "-tag:v",
            "avc1",
            "-movflags",
            "+faststart",
            temp,
          ],
          onLine,
        );
        const verified = await probe(temp);
        if (verified.video || verified.audio)
          throw new Error("The converted MP4 did not pass its codec check.");
        if (cancelled) throw new Error("MP4 conversion cancelled.");
        await rename(temp, destination);
        return { code: 0, stderr: "", filePath: destination };
      }
      return { code: 0, stderr: "", filePath: path };
    } finally {
      await rm(temp, { force: true });
    }
  })();
  return {
    done,
    cancel() {
      cancelled = true;
      current?.cancel();
    },
  };
}

export function prepareOriginal(
  path: string,
  onLine: (line: string) => void,
  quality: Quality = "best",
) {
  const companion = join(
    dirname(path),
    `${basename(path, extname(path))}.mac.mp4`,
  );
  return normalizeMp4(path, onLine, {
    destination: companion,
    skipCompatibleMp4: true,
    quality,
  });
}
