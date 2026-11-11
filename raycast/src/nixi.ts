import { getPreferenceValues } from "@raycast/api";
export type Options = {
  format: string;
  quality: string;
  cookiesBrowser: string;
  playlist: boolean;
  subtitles: boolean;
};
export type Job = {
  id: string;
  url: string;
  title: string;
  site: string;
  status: string;
  options: Options;
  directory: string;
  progress: number;
  files: { path: string; name: string; size: number }[];
  error: string | null;
  logs: string;
  createdAt: string;
};
export type Snapshot = {
  jobs: Job[];
  settings: Options & { downloadDir: string; concurrency: number };
  system: { ready: boolean; active: number; queued: number };
};
export const formatOptions = [
  ["video", "Video · MP4"],
  ["original", "Video · Original container"],
  ["mp3", "Audio · MP3"],
  ["m4a", "Audio · M4A"],
  ["opus", "Audio · Opus"],
  ["flac", "Audio · FLAC"],
  ["wav", "Audio · WAV"],
];
export const browserOptions = [
  ["none", "No browser cookies"],
  ["chrome", "Chrome"],
  ["chromium", "Chromium"],
  ["firefox", "Firefox"],
  ["zen", "Zen"],
  ["safari", "Safari"],
  ["edge", "Edge"],
  ["brave", "Brave"],
  ["opera", "Opera"],
  ["vivaldi", "Vivaldi"],
  ["whale", "Whale"],
];
export const qualityOptions = [
  ["best", "Best available"],
  ["2160", "Up to 4K"],
  ["1440", "Up to 1440p"],
  ["1080", "Up to 1080p"],
  ["720", "Up to 720p"],
  ["480", "Up to 480p"],
];
export function baseUrl() {
  const url = new URL(
    getPreferenceValues<{ serverUrl?: string }>().serverUrl?.trim() ||
      "http://127.0.0.1:43174",
  );
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Set nixi Address to http://127.0.0.1:43174 or another local port.",
    );
  return url.origin;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const base = baseUrl();
  let response: Response;
  try {
    response = await fetch(base + path, {
      method,
      headers: { Origin: base, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(
      "nixi is offline. Run ‘pnpm run install:agent’ in the nixi project directory, then try again.",
    );
  }
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || `nixi returned ${response.status}.`);
  return result;
}
let statusCache:
  { base: string; etag: string | null; value: Snapshot } | undefined;
export async function getStatus(): Promise<Snapshot> {
  const base = baseUrl();
  try {
    const response = await fetch(base + "/api/status?compact=1", {
      headers: {
        Origin: base,
        ...(statusCache?.base === base && statusCache.etag
          ? { "If-None-Match": statusCache.etag }
          : {}),
      },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 304 && statusCache) return statusCache.value;
    const value = (await response.json()) as Snapshot & { error?: string };
    if (!response.ok)
      throw new Error(value.error || "nixi could not read downloads.");
    statusCache = { base, etag: response.headers.get("etag"), value };
    return value;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "nixi is offline.",
    );
  }
}
export const isActive = (job: Job) =>
  ["queued", "extracting", "downloading", "processing"].includes(job.status);
export function parseLinks(text: string) {
  const urls = [...new Set(text.trim().split(/\s+/).filter(Boolean))];
  if (!urls.length || urls.length > 100)
    throw new Error("Paste between 1 and 100 video links.");
  for (const value of urls) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Use complete https:// links, one per line.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Use http or https links without embedded credentials.");
  }
  return urls;
}

export function captureFormat(saved: string, audioOnly: boolean) {
  return audioOnly && ["video", "original"].includes(saved) ? "mp3" : saved;
}
