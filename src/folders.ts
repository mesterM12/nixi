import {
  mkdirSync,
  readdirSync,
  existsSync,
  lstatSync,
  renameSync,
  rmdirSync,
} from "node:fs";
import type { Job } from "./types";
import { join, basename, dirname, relative, isAbsolute } from "node:path";

export function createCaptureDirectory(
  root: string,
  date = new Date(),
): string {
  mkdirSync(root, { recursive: true });
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const prefix = `${day}_`;
  let index =
    readdirSync(root).reduce((max, name) => {
      const suffix = name.startsWith(prefix) ? name.slice(prefix.length) : "";
      return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
    }, 0) + 1;
  while (Number.isSafeInteger(index)) {
    const directory = join(root, `${prefix}${String(index).padStart(3, "0")}`);
    try {
      mkdirSync(directory);
      return directory;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      index++;
    }
  }
  throw new Error("The capture folder index is too large.");
}

// Only migrate Nixi's former UUID-named capture folders. Run while the queue is stopped.
export function migrateCaptureFolders(jobs: Job[], save: (job: Job) => void) {
  const changes: { id: string; from: string; to: string }[] = [];
  for (const job of [...jobs].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )) {
    if (
      basename(job.directory) !== job.id ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(job.id) ||
      !existsSync(job.directory)
    )
      continue;
    if (lstatSync(job.directory).isSymbolicLink())
      throw new Error("A capture folder was replaced by a symlink.");
    const date = new Date(job.createdAt);
    if (!Number.isFinite(date.getTime()))
      throw new Error("A capture has an invalid date.");
    const files = job.files.map((file) => {
      const path = relative(job.directory, file.path);
      if (path.startsWith("..") || isAbsolute(path))
        throw new Error("A capture file is outside its folder.");
      return { file, path };
    });
    const target = createCaptureDirectory(dirname(job.directory), date);
    const updated: Job = {
      ...job,
      directory: target,
      files: files.map(({ file, path }) => ({
        ...file,
        path: join(target, path),
      })),
    };
    try {
      renameSync(job.directory, target);
    } catch (error) {
      rmdirSync(target);
      throw error;
    }
    try {
      save(updated);
    } catch (error) {
      renameSync(target, job.directory);
      throw error;
    }
    changes.push({ id: job.id, from: job.directory, to: target });
  }
  return changes;
}
