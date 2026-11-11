import { test, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  createCaptureDirectory,
  migrateCaptureFolders,
} from "../../src/folders";

test("capture folders use the local calendar date and a collision-safe daily index", () => {
  const root = mkdtempSync(join(tmpdir(), "nixi-folders-"));
  const day = new Date(2026, 10, 10, 23, 50);
  try {
    mkdirSync(join(root, "2026-11-10_002"));
    mkdirSync(join(root, "unrelated"));
    expect(basename(createCaptureDirectory(root, day))).toBe("2026-11-10_003");
    expect(basename(createCaptureDirectory(root, day))).toBe("2026-11-10_004");
    expect(basename(createCaptureDirectory(root, new Date(2026, 10, 11)))).toBe(
      "2026-11-11_001",
    );
    mkdirSync(join(root, "2026-11-11_999"));
    expect(basename(createCaptureDirectory(root, new Date(2026, 10, 11)))).toBe(
      "2026-11-11_1000",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import { Store } from "../../src/store";
import { Queue } from "../../src/queue";

test("migration preserves media, rewrites saved file paths and rolls back if history cannot be saved", () => {
  const root = mkdtempSync(join(tmpdir(), "nixi-migrate-"));
  const store = new Store(":memory:");
  try {
    const q = new Queue(store);
    q.updateSettings({ ...q.settings, downloadDir: root });
    const jobs = q.add(
      ["https://example.com/one", "https://example.com/two"],
      q.settings,
    ).jobs;
    for (const job of jobs) {
      rmSync(job.directory, { recursive: true });
      job.directory = join(root, job.id);
      mkdirSync(job.directory);
      const path = join(job.directory, "clip.mp4");
      writeFileSync(path, "preserved-media");
      job.files = [{ path, name: "clip.mp4", size: 15 }];
      job.createdAt = new Date(2026, 10, 10, 23).toISOString();
      store.save(job);
    }
    expect(() =>
      migrateCaptureFolders([jobs[0]], () => {
        throw new Error("database failure");
      }),
    ).toThrow("database failure");
    expect(existsSync(jobs[0].directory)).toBe(true);
    const changes = migrateCaptureFolders(store.jobs(), (job) =>
      store.save(job),
    );
    expect(changes.map((c) => basename(c.to))).toEqual([
      "2026-11-10_001",
      "2026-11-10_002",
    ]);
    const reopened = new Queue(store);
    for (const job of reopened.jobs) {
      expect(readFileSync(reopened.file(job, 0).path, "utf8")).toBe(
        "preserved-media",
      );
      expect(basename(job.directory)).toMatch(/^2026-11-10_00[12]$/);
    }
    expect(
      migrateCaptureFolders(store.jobs(), (job) => store.save(job)),
    ).toEqual([]);
    for (const job of jobs) expect(existsSync(job.directory)).toBe(false);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
