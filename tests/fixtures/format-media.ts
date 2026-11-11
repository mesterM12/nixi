import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, basename, extname } from "node:path";
import { toolPaths, subprocessEnv } from "../../src/config";
import { qualities, type Format, type Quality } from "../../src/types";

export const formatCases: {
  name: string;
  format: Format;
  quality: Quality;
  source: string;
  height?: number;
  companion?: boolean;
}[] = [
  ...(["video", "original"] as const).flatMap((format) =>
    qualities.map((quality) => ({
      name: `${format} / ${quality}`,
      format,
      quality,
      source: "/master.m3u8",
      height: quality === "best" ? 2160 : Number(quality),
    })),
  ),
  ...(["mp3", "m4a", "opus", "flac", "wav"] as const).map((format) => ({
    name: format,
    format,
    quality: "best" as const,
    source: "/fallback.webm",
  })),
  ...qualities.map((quality) => ({
    name: `VP9 conversion / ${quality}`,
    format: "video" as const,
    quality,
    source: "/fallback.webm",
    height: 90,
  })),
  ...qualities.map((quality) => ({
    name: `Unknown source height / ${quality}`,
    format: "video" as const,
    quality,
    source: "/unknown.mp4",
    height: quality === "best" ? 2160 : Number(quality),
  })),
  {
    name: "Original 4K + 720p companion",
    format: "original",
    quality: "720",
    source: "/unknown.mp4",
    height: 2160,
    companion: true,
  },
  {
    name: "Original WebM + MP4 companion",
    format: "original",
    quality: "best",
    source: "/fallback.webm",
    height: 90,
    companion: true,
  },
  {
    name: "Original VP9 MP4 + MP4 companion",
    format: "original",
    quality: "best",
    source: "/fallback.mp4",
    height: 90,
    companion: true,
  },
  {
    name: "Original H.264 MKV + MP4 companion",
    format: "original",
    quality: "best",
    source: "/fallback.mkv",
    height: 90,
    companion: true,
  },
];

export function formatMedia(directory: string) {
  mkdirSync(directory, { recursive: true });
  const generate = (args: string[]) => {
    const result = spawnSync(toolPaths.ffmpeg!, ["-v", "error", ...args], {
      env: subprocessEnv(),
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  const lavfi = (size: string) => [
    "-f",
    "lavfi",
    "-i",
    `color=c=0x123f52:s=${size}:r=2:d=1`,
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
  ];
  const variants = [
    [854, 480],
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ];
  for (const [width, height] of variants)
    generate([
      ...lavfi(`${width}x${height}`),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-f",
      "hls",
      "-hls_time",
      "2",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      join(directory, `${height}-%03d.ts`),
      join(directory, `${height}.m3u8`),
    ]);
  writeFileSync(
    join(directory, "master.m3u8"),
    "#EXTM3U\n" +
      variants
        .map(
          ([width, height]) =>
            `#EXT-X-STREAM-INF:BANDWIDTH=${height * 1000},RESOLUTION=${width}x${height},CODECS="avc1.640033,mp4a.40.2"\n${height}.m3u8\n`,
        )
        .join(""),
  );
  generate([
    "-i",
    join(directory, "2160.m3u8"),
    "-c",
    "copy",
    join(directory, "unknown.mp4"),
  ]);
  const webm = join(directory, "fallback.webm");
  generate([
    ...lavfi("160x90"),
    "-c:v",
    "libvpx-vp9",
    "-deadline",
    "realtime",
    "-c:a",
    "libopus",
    "-shortest",
    webm,
  ]);
  generate([
    "-i",
    webm,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    join(directory, "fallback.mp4"),
  ]);
  generate([
    "-i",
    webm,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    join(directory, "fallback.mkv"),
  ]);
  const files = new Set(readdirSync(directory));
  return (request: Request) => {
    const path = new URL(request.url).pathname.slice(1);
    if (basename(path) !== path || !files.has(path))
      return new Response("Not found", { status: 404 });
    const types: Record<string, string> = {
      ".m3u8": "application/vnd.apple.mpegurl",
      ".ts": "video/mp2t",
      ".webm": "video/webm",
      ".mp4": "video/mp4",
      ".mkv": "video/x-matroska",
    };
    return new Response(new Uint8Array(readFileSync(join(directory, path))), {
      headers: {
        "Content-Type": types[extname(path)] || "application/octet-stream",
      },
    });
  };
}
