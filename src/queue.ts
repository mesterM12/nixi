import { mkdirSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative } from "node:path";
import {
  downloadArgs,
  explainError,
  FILE,
  META,
  PROGRESS,
  runYtDlp,
  type RunningProcess,
} from "./engine";
import { createCaptureDirectory } from "./folders";
import { Store } from "./store";
import { normalizeMp4, prepareOriginal } from "./media";
import { optionsKey } from "./lib/library";
import type { Job, Options, Settings } from "./types";

export const activeStatuses = new Set([
  "extracting",
  "downloading",
  "processing",
]);
export class Queue {
  jobs: Job[];
  settings: Settings;
  private running = new Map<string, RunningProcess>();
  private writes = new Map<string, number>();
  private stopping = false;
  private tasks = new Set<Promise<void>>();
  private started = false;
  private enqueueOrder = Date.now();
  private byId = new Map<string, Job>();
  private activeKeys = new Map<string, string>();
  private pending: string[] = [];
  private listeners = new Set<() => void>();
  private notification: ReturnType<typeof setTimeout> | undefined;
  revision = Date.now();
  get subscriberCount() {
    return this.listeners.size;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    this.revision++;
    if (!this.notification)
      this.notification = setTimeout(() => {
        this.notification = undefined;
        for (const listener of this.listeners) listener();
      }, 100);
  }
  constructor(readonly store: Store) {
    this.settings = store.settings();
    this.jobs = store.jobs();
    this.byId = new Map(this.jobs.map((job) => [job.id, job]));
    this.enqueueOrder = this.jobs.reduce(
      (order, job) => Math.max(order, job.queuedAt || 0),
      this.enqueueOrder,
    );
    for (const job of this.jobs) {
      if (activeStatuses.has(job.status)) {
        job.status = "failed";
        job.error =
          "nixi stopped before this download finished. Retry to resume any partial files.";
        this.save(job);
      }
    }
    this.indexPending();
  }
  private indexPending() {
    this.pending = this.jobs
      .filter((job) => job.status === "queued")
      .reverse()
      .sort(
        (a, b) =>
          (a.queuedAt || Date.parse(a.createdAt)) -
          (b.queuedAt || Date.parse(b.createdAt)),
      )
      .map((job) => job.id);
    this.activeKeys = new Map(
      this.jobs
        .filter(
          (job) => job.status === "queued" || activeStatuses.has(job.status),
        )
        .map((job) => [optionsKey(job.url, job.options), job.id]),
    );
  }
  private releaseKey(job: Job) {
    const key = optionsKey(job.url, job.options);
    if (this.activeKeys.get(key) === job.id) this.activeKeys.delete(key);
  }
  start() {
    this.started = true;
    this.pump();
  }
  get active() {
    return this.running.size;
  }
  get progress() {
    const jobs = [...this.running.keys()]
      .map((id) => this.byId.get(id)!)
      .filter((job) => activeStatuses.has(job.status));
    return jobs.length
      ? jobs.reduce((total, job) => total + job.progress, 0) / jobs.length
      : 0;
  }
  get queued() {
    return this.jobs.filter((j) => j.status === "queued").length;
  }
  get(id: string) {
    const job = this.byId.get(id);
    if (!job) throw new Error("Download not found.");
    return job;
  }
  private save(job: Job) {
    job.updatedAt = new Date().toISOString();
    this.store.save(job);
    this.changed();
  }
  add(urls: string[], options: Options) {
    if (this.queued + this.active + urls.length > 1000)
      throw new Error("The queue is full. Let some downloads finish first.");
    mkdirSync(this.settings.downloadDir, { recursive: true });
    const added: Job[] = [];
    let skipped = 0;
    for (const url of urls) {
      const key = optionsKey(url, options);
      if (this.activeKeys.has(key)) {
        skipped++;
        continue;
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const job: Job = {
        id,
        url,
        title:
          new URL(url).pathname.split("/").filter(Boolean).at(-1) ||
          "New download",
        site: new URL(url).hostname.replace(/^www\./, ""),
        thumbnail: null,
        status: "queued",
        options: { ...options },
        directory: createCaptureDirectory(this.settings.downloadDir),
        progress: 0,
        speed: null,
        eta: null,
        files: [],
        error: null,
        logs: "",
        queuedAt: ++this.enqueueOrder,
        createdAt: now,
        updatedAt: now,
      };
      this.jobs.unshift(job);
      this.byId.set(id, job);
      this.pending.push(id);
      this.activeKeys.set(key, id);
      this.save(job);
      added.push(job);
    }
    this.pump();
    return { jobs: added, skipped };
  }
  updateSettings(value: Settings) {
    mkdirSync(value.downloadDir, { recursive: true });
    this.store.saveSettings(value);
    this.settings = value;
    this.changed();
    this.pump();
  }
  cancel(id: string) {
    const job = this.get(id);
    if (job.status !== "queued" && !activeStatuses.has(job.status))
      throw new Error("This download has already stopped.");
    job.status = "cancelled";
    job.speed = null;
    job.eta = null;
    this.save(job);
    this.releaseKey(job);
    this.pending = this.pending.filter((pending) => pending !== id);
    this.running.get(id)?.cancel();
    this.pump();
    return job;
  }
  retry(id: string) {
    const job = this.get(id);
    if (!["failed", "cancelled"].includes(job.status) || this.running.has(id))
      throw new Error("Wait for this download to stop before retrying.");
    if (this.activeKeys.has(optionsKey(job.url, job.options)))
      throw new Error(
        "This video is already queued or already downloading with these options.",
      );
    job.status = "queued";
    job.error = null;
    job.progress = 0;
    job.logs = "";
    job.queuedAt = ++this.enqueueOrder;
    this.pending = this.pending.filter((pending) => pending !== id);
    this.pending.push(id);
    this.activeKeys.set(optionsKey(job.url, job.options), id);
    this.save(job);
    this.pump();
    return job;
  }
  remove(id: string) {
    const job = this.get(id);
    if (
      job.status === "queued" ||
      activeStatuses.has(job.status) ||
      this.running.has(id)
    )
      throw new Error("Cancel the download before removing it.");
    this.store.remove(id);
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.writes.delete(id);
    this.byId.delete(id);
    this.changed();
  }
  clearHistory() {
    for (const job of [...this.jobs])
      if (
        !["queued", "extracting", "downloading", "processing"].includes(
          job.status,
        ) &&
        !this.running.has(job.id)
      )
        this.remove(job.id);
  }
  file(job: Job, index: number) {
    const file = job.files[index];
    if (!file) throw new Error("File not found.");
    // Validate again at use time: a file could have been replaced by a symlink.
    const actual = realpathSync(file.path);
    const rel = relative(realpathSync(job.directory), actual);
    if (rel.startsWith("..") || isAbsolute(rel) || !statSync(actual).isFile())
      throw new Error("This file is outside the download folder.");
    return { ...file, path: actual };
  }
  private pump() {
    if (this.stopping || !this.started) return;
    while (this.running.size < this.settings.concurrency) {
      const id = this.pending.shift();
      if (!id) break;
      const job = this.byId.get(id);
      if (!job || job.status !== "queued") continue;
      this.launch(job);
    }
  }
  private launch(job: Job) {
    job.status = "extracting";
    job.error = null;
    this.save(job);
    try {
      mkdirSync(job.directory, { recursive: true });
      const running = runYtDlp(
        downloadArgs(job.url, job.options, job.directory),
        (line) => this.line(job, line),
      );
      this.running.set(job.id, running);
      const finished = running.done
        .then(async (result) => {
          if (job.status !== "cancelled") {
            if (result.code === 0 && job.files.length) {
              if (this.stopping) throw new Error("nixi is stopping.");
              if (["video", "original"].includes(job.options.format)) {
                job.status = "processing";
                job.speed = null;
                job.eta = null;
                this.save(job);
                const sourceFiles = job.files.length;
                for (let index = 0; index < sourceFiles; index++) {
                  if (this.get(job.id).status === "cancelled" || this.stopping)
                    return;
                  const file = this.file(job, index);
                  const onLine = (line: string) => this.line(job, line);
                  const conversion =
                    job.options.format === "original"
                      ? prepareOriginal(file.path, onLine, job.options.quality)
                      : normalizeMp4(file.path, onLine, {
                          quality: job.options.quality,
                        });
                  this.running.set(job.id, conversion);
                  const result = await conversion.done;
                  if (
                    result.filePath &&
                    result.filePath !== file.path &&
                    !job.files.some((f) => f.path === result.filePath)
                  )
                    job.files.push({
                      path: result.filePath,
                      name: basename(result.filePath),
                      size: statSync(result.filePath).size,
                    });
                  job.files[index].size = statSync(file.path).size;
                }
                if (this.get(job.id).status === "cancelled" || this.stopping)
                  return;
              }
              job.status = "completed";
              job.progress = 100;
            } else {
              job.status = "failed";
              job.error =
                result.code === 0
                  ? "yt-dlp finished without creating a media file."
                  : explainError(result.stderr, job.options.cookiesBrowser);
            }
          }
        })
        .catch((error) => {
          if (job.status !== "cancelled") {
            job.status = "failed";
            job.error =
              error instanceof Error ? error.message : "Download failed.";
          }
        })
        .finally(() => {
          if (
            this.stopping &&
            job.status !== "completed" &&
            job.status !== "cancelled"
          ) {
            job.status = "failed";
            job.error =
              "nixi stopped before this download finished. Retry to resume any partial files.";
          }
          job.speed = null;
          job.eta = null;
          this.save(job);
          this.running.delete(job.id);
          this.releaseKey(job);
          this.changed();
          this.writes.delete(job.id);
          this.tasks.delete(finished);
          this.pump();
        });
      this.tasks.add(finished);
    } catch (error) {
      job.status = "failed";
      job.error =
        error instanceof Error ? error.message : "Unable to start yt-dlp.";
      this.releaseKey(job);
      this.save(job);
    }
  }
  private line(job: Job, line: string) {
    if (job.status === "cancelled") return;
    try {
      if (line.startsWith(META)) {
        const [title, site, thumbnail] = line
          .slice(META.length)
          .split("\t")
          .map((s) => (s === "NA" ? null : JSON.parse(s)));
        if (typeof title === "string") job.title = title;
        if (typeof site === "string") job.site = site;
        if (typeof thumbnail === "string" && /^https?:\/\//.test(thumbnail))
          job.thumbnail = thumbnail;
        job.status = "downloading";
        job.progress = 0;
        this.save(job);
        return;
      }
      if (line.startsWith(PROGRESS)) {
        const p = JSON.parse(line.slice(PROGRESS.length));
        const total = Number(p.total_bytes || p.total_bytes_estimate);
        const downloaded = Number(p.downloaded_bytes);
        job.progress =
          total > 0 && Number.isFinite(downloaded)
            ? Math.min(100, Math.max(0, (downloaded / total) * 100))
            : 0;
        job.speed = Number.isFinite(p.speed) && p.speed > 0 ? p.speed : null;
        job.eta = Number.isFinite(p.eta) && p.eta >= 0 ? p.eta : null;
        job.status = p.status === "finished" ? "processing" : "downloading";
        if (Date.now() - (this.writes.get(job.id) || 0) > 1000) {
          this.save(job);
          this.writes.set(job.id, Date.now());
        }
        return;
      }
      if (line.startsWith(FILE)) {
        const path = realpathSync(JSON.parse(line.slice(FILE.length)));
        const rel = relative(realpathSync(job.directory), path);
        if (rel.startsWith("..") || isAbsolute(rel))
          throw new Error(
            "yt-dlp returned a file outside its download folder.",
          );
        const stat = statSync(path);
        if (!stat.isFile()) return;
        if (!job.files.some((f) => f.path === path))
          job.files.push({ path, name: basename(path), size: stat.size });
        this.save(job);
        return;
      }
    } catch (error) {
      // Malformed progress output must not stop draining the child's streams.
      job.logs =
        `${job.logs}\n${error instanceof Error ? error.message : "Unable to read progress"}`.slice(
          -16_000,
        );
    }
    if (line) job.logs = `${job.logs}\n${line}`.slice(-16_000);
  }
  async shutdown() {
    this.stopping = true;
    const pending = [...this.running.values()];
    for (const process of pending) process.cancel();
    await Promise.allSettled([...this.tasks]);
    clearTimeout(this.notification);
    this.listeners.clear();
  }
}
