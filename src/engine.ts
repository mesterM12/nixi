import { Effect } from "effect";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { toolPaths, subprocessEnv } from "./config";
import { cookieBrowserSpec, cookieError } from "./browser-cookies";
import type { Browser, CookieAccess, Options, VideoInfo } from "./types";

export const META = "NIXI_META:";
export const PROGRESS = "NIXI_PROGRESS:";
export const FILE = "NIXI_FILE:";

export function commonArgs(options: Options): string[] {
  const args = [
    "--ignore-config",
    "--no-color",
    "--encoding",
    "utf-8",
    "--socket-timeout",
    "30",
    "--retries",
    "3",
    "--extractor-retries",
    "2",
  ];
  if (toolPaths.ffmpeg) args.push("--ffmpeg-location", toolPaths.ffmpeg);
  if (toolPaths.runtime)
    args.push("--js-runtimes", `node:${toolPaths.runtime}`);
  const browser = cookieBrowserSpec(options.cookiesBrowser);
  if (browser) args.push("--cookies-from-browser", browser);
  return args;
}
export function downloadArgs(
  url: string,
  options: Options,
  directory: string,
): string[] {
  const args = [
    ...commonArgs(options),
    options.playlist ? "--yes-playlist" : "--no-playlist",
    "--newline",
    "--progress",
    "--progress-delta",
    "0.5",
    "--no-simulate",
    "--no-overwrites",
    "--trim-filenames",
    "180",
    "--paths",
    directory,
    "--output",
    "%(title).140B [%(id).40B].%(ext)s",
    "--print",
    `before_dl:${META}%(title)j\t%(extractor_key)j\t%(thumbnail)j`,
    "--print",
    `after_move:${FILE}%(filepath)j`,
    "--progress-template",
    `download:${PROGRESS}%(progress)j`,
  ];
  if (options.format === "video" || options.format === "original") {
    const limit =
      options.quality === "best" ? "" : `[height<=?${options.quality}]`;
    if (options.format === "video") {
      args.push(
        "--format",
        `bv${limit}[vcodec^=avc1]+ba[acodec^=mp4a]/b${limit}[vcodec^=avc1][acodec^=mp4a]/bv*${limit}+ba/b${limit}${limit ? "/bv*+ba/b" : ""}`,
        "--merge-output-format",
        "mp4",
        "--remux-video",
        "mp4",
      );
    } else
      args.push(
        "--format",
        `bv*${limit}+ba/b${limit}${limit ? "/bv*+ba/b" : ""}`,
      );
  } else
    args.push(
      "--format",
      "ba/b",
      "--extract-audio",
      "--audio-format",
      options.format,
      "--audio-quality",
      "0",
    );
  if (options.subtitles)
    args.push(
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "en.*,en",
      "--sub-format",
      "srt/best",
      "--convert-subs",
      "srt",
    );
  args.push("--", url);
  return args;
}
export type RunningProcess = {
  done: Promise<{ code: number; stderr: string }>;
  cancel: () => void;
};
export function runYtDlp(
  args: string[],
  onLine: (line: string) => void,
  timeout?: number,
): RunningProcess {
  if (!toolPaths.ytDlp)
    throw new Error(
      "yt-dlp is missing. Run pnpm run setup in the nixi folder, then restart nixi.",
    );
  return runTool(toolPaths.ytDlp, args, onLine, timeout);
}

// Downloads, probing and encoding share process-group cancellation and draining.
export function runTool(
  executable: string,
  args: string[],
  onLine: (line: string) => void,
  timeout?: number,
): RunningProcess {
  const child: ChildProcess = spawn(executable, args, {
    env: subprocessEnv(),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  let killed = false;
  let closed = false;
  let hardKill: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (killed || closed) return;
    killed = true;
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signal);
      } catch {
        /* Already stopped. */
      }
    };
    kill("SIGTERM");
    hardKill = setTimeout(() => kill("SIGKILL"), 3000);
    hardKill.unref();
  };
  const done = new Promise<{ code: number; stderr: string }>(
    (resolve, reject) => {
      const timer = timeout ? setTimeout(cancel, timeout) : undefined;
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(hardKill);
        // The parent may close before ffmpeg; finish terminating its process group.
        if (killed && child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            /* Already stopped. */
          }
        }
      };
      for (const [stream, isError] of [
        [child.stdout!, false],
        [child.stderr!, true],
      ] as const) {
        let buffer = "";
        stream.setEncoding("utf8");
        stream.on("data", (chunk: string) => {
          if (isError) stderr = (stderr + chunk).slice(-24_000);
          buffer += chunk;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) onLine(line);
          if (buffer.length > 8_000_000) {
            cancel();
            reject(new Error("The video response was too large."));
          }
        });
        stream.on("end", () => {
          if (buffer) onLine(buffer);
        });
      }
      child.once("error", (error) => {
        cleanup();
        reject(error);
      });
      child.once("close", (code) => {
        closed = true;
        cleanup();
        resolve({
          code: code ?? 1,
          stderr:
            killed && timeout
              ? "The video lookup timed out. Try again."
              : stderr,
        });
      });
    },
  );
  return { done, cancel };
}
export function explainError(stderr: string, browser?: Browser): string {
  const cookies = cookieError(stderr, browser);
  if (cookies) return cookies;
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const line =
    [...lines].reverse().find((l) => l.startsWith("ERROR:")) ||
    lines.at(-1) ||
    "yt-dlp could not complete this download.";
  let message = line.replace(/^ERROR:\s*/, "");
  if (
    /sign in|log[ -]?in|private|cookies|age.restrict|guest token|429/i.test(
      message,
    )
  )
    message +=
      " Try choosing your signed-in browser under Cookies, then retry.";
  return message.slice(0, 2000);
}
export function parseInfo(output: string): VideoInfo {
  // -J may return a multi-video post even when --no-playlist was requested.
  const info = JSON.parse(
    output
      .trim()
      .split("\n")
      .find((line) => line.startsWith("{")) || "{}",
  );
  const entry = info.entries?.find((item: unknown) => Boolean(item)) || info;
  return {
    title: info.title || entry.title || "Untitled video",
    uploader: info.uploader || entry.uploader || null,
    site:
      info.extractor_key || info.extractor || entry.extractor_key || "Video",
    thumbnail: entry.thumbnail || null,
    duration: entry.duration || null,
    heights: [
      ...new Set<number>(
        (entry.formats || [])
          .map((f: { height?: number }) => f.height)
          .filter((h: unknown) => typeof h === "number" && h > 0),
      ),
    ].sort((a, b) => b - a),
    entries: Array.isArray(info.entries)
      ? info.playlist_count || info.n_entries || info.entries.length
      : null,
  };
}
export async function inspectVideo(
  url: string,
  options: Options,
  signal?: AbortSignal,
): Promise<VideoInfo> {
  const lines: string[] = [];
  const program = Effect.acquireUseRelease(
    Effect.try({
      try: () =>
        runYtDlp(
          [
            ...commonArgs(options),
            "--no-playlist",
            "--skip-download",
            "--playlist-end",
            "1",
            "--dump-single-json",
            "--",
            url,
          ],
          (line) => {
            if (line.startsWith("{")) lines.push(line);
          },
        ),
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    }),
    (running) =>
      Effect.tryPromise({
        try: () => running.done,
        catch: (error) =>
          error instanceof Error ? error : new Error(String(error)),
      }).pipe(
        Effect.timeout("90 seconds"),
        Effect.flatMap((result) =>
          result.code === 0
            ? Effect.try({
                try: () => {
                  if (!lines.length)
                    throw new Error("No video information was returned.");
                  return parseInfo(lines.join("\n"));
                },
                catch: (error) =>
                  error instanceof Error ? error : new Error(String(error)),
              })
            : Effect.fail(
                new Error(explainError(result.stderr, options.cookiesBrowser)),
              ),
        ),
      ),
    (running) =>
      Effect.promise(async () => {
        running.cancel();
        await running.done.catch(() => {});
      }),
  );
  return Effect.runPromise(program, { signal });
}

// Simulated metadata forces yt-dlp's real cookie reader without a network
// request or exporting cookie contents. Only this non-secret metadata hits disk.
export async function checkCookieAccess(
  browser: Browser,
  signal?: AbortSignal,
): Promise<CookieAccess> {
  if (browser === "none")
    return {
      browser,
      ok: true,
      count: 0,
      message: "Browser cookies are turned off.",
    };
  const directory = await mkdtemp(join(tmpdir(), "nixi-cookie-check-"));
  let running: RunningProcess | undefined;
  let count = 0;
  try {
    const path = join(directory, "check.json");
    await writeFile(
      path,
      JSON.stringify({
        id: "nixi-cookie-check",
        title: "Cookie access check",
        url: "https://example.invalid/nixi-cookie-check.mp4",
        webpage_url: "https://example.invalid/nixi-cookie-check.mp4",
        ext: "mp4",
        extractor: "generic",
      }),
      { mode: 0o600 },
    );
    const args = commonArgs({
      cookiesBrowser: browser,
      format: "video",
      quality: "best",
      playlist: false,
      subtitles: false,
    });
    running = runYtDlp(
      [...args, "--simulate", "--skip-download", "--load-info-json", path],
      (line) => {
        const match = /Extracted (\d+) cookies/.exec(line);
        if (match) count = Number(match[1]);
      },
      10000,
    );
    const cancel = running.cancel;
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    let result;
    try {
      result = await running.done;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
    if (signal?.aborted) throw new Error("Cookie access check was cancelled.");
    if (result.code !== 0) {
      return {
        browser,
        ok: false,
        count: 0,
        message: explainError(result.stderr, browser),
        permissionRequired:
          /Operation not permitted|Permission denied|EACCES|EPERM/i.test(
            result.stderr,
          ),
        toolPath: toolPaths.ytDlp || undefined,
        runtimePath: process.execPath,
      };
    }
    return {
      browser,
      ok: count > 0,
      count,
      message:
        count > 0
          ? `Cookie access works. ${count} cookies loaded. A site's sign-in may still need refreshing in your browser.`
          : "The cookie store is readable but empty. Open your browser, sign in to the video site, then check again.",
    };
  } catch (error) {
    return {
      browser,
      ok: false,
      count: 0,
      message:
        error instanceof Error
          ? error.message
          : "Could not check browser cookies.",
    };
  } finally {
    running?.cancel();
    if (running) await running.done.catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
}
