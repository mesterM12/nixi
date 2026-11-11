export const qualities = [
  "best",
  "2160",
  "1440",
  "1080",
  "720",
  "480",
] as const;
export const formats = [
  "video",
  "original",
  "mp3",
  "m4a",
  "opus",
  "flac",
  "wav",
] as const;
export const browsers = [
  "none",
  "chrome",
  "chromium",
  "firefox",
  "zen",
  "safari",
  "edge",
  "brave",
  "opera",
  "vivaldi",
  "whale",
] as const;
export type Quality = (typeof qualities)[number];
export type Format = (typeof formats)[number];
export type Browser = (typeof browsers)[number];
export type CookieAccess = {
  browser: Browser;
  ok: boolean;
  count: number;
  message: string;
  permissionRequired?: boolean;
  toolPath?: string;
  runtimePath?: string;
};
export type Options = {
  format: Format;
  quality: Quality;
  playlist: boolean;
  cookiesBrowser: Browser;
  subtitles: boolean;
};
export type Settings = Options & { downloadDir: string; concurrency: number };
export type JobStatus =
  | "queued"
  | "extracting"
  | "downloading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";
export type DownloadFile = { path: string; name: string; size: number };
export type Job = {
  id: string;
  url: string;
  title: string;
  site: string;
  thumbnail: string | null;
  status: JobStatus;
  options: Options;
  directory: string;
  progress: number;
  speed: number | null;
  eta: number | null;
  files: DownloadFile[];
  error: string | null;
  logs: string;
  queuedAt?: number;
  createdAt: string;
  updatedAt: string;
};
export type VideoInfo = {
  title: string;
  uploader: string | null;
  site: string;
  thumbnail: string | null;
  duration: number | null;
  heights: number[];
  entries: number | null;
};
export type Dependency = { path: string | null; version: string | null };
export type SystemStatus = {
  ready: boolean;
  ytDlp: Dependency;
  ffmpeg: Dependency;
  ffprobe: Dependency;
  runtime: Dependency;
  active: number;
  queued: number;
  progress?: number;
};
export type Snapshot = {
  jobs: Job[];
  settings: Settings;
  system: SystemStatus;
};
