import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store";
import { Queue } from "../../src/queue";
import type { Options } from "../../src/types";
const processes = vi.hoisted(
  () =>
    [] as {
      finish: (value: { code: number; stderr: string }) => void;
      cancel: ReturnType<typeof vi.fn>;
    }[],
);
vi.mock("../../src/engine", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runYtDlp: vi.fn(() => {
    let finish!: (value: { code: number; stderr: string }) => void;
    const done = new Promise<{ code: number; stderr: string }>(
      (resolve) => (finish = resolve),
    );
    const cancel = vi.fn(() => finish({ code: 1, stderr: "stopped" }));
    processes.push({ finish, cancel });
    return { done, cancel };
  }),
}));
const conversions = vi.hoisted(
  () =>
    [] as {
      finish: (value: { code: number; stderr: string }) => void;
      cancel: ReturnType<typeof vi.fn>;
    }[],
);
vi.mock("../../src/media", () => ({
  normalizeMp4: vi.fn(() => {
    let finish!: (value: { code: number; stderr: string }) => void;
    const done = new Promise<{ code: number; stderr: string }>(
      (resolve) => (finish = resolve),
    );
    const cancel = vi.fn(() => finish({ code: 1, stderr: "cancelled" }));
    conversions.push({ finish, cancel });
    return { done, cancel };
  }),
}));
const opts: Options = {
  format: "video",
  quality: "best",
  cookiesBrowser: "none",
  playlist: false,
  subtitles: false,
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  processes.length = 0;
  conversions.length = 0;
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "nixi-queue-"));
  const store = new Store(":memory:");
  const q = new Queue(store);
  q.updateSettings({ ...q.settings, downloadDir: dir, concurrency: 1 });
  cleanups.push(async () => {
    await q.shutdown();
    store.close();
    rmSync(dir, { recursive: true });
  });
  return q;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
test("queue signal progress averages running jobs and ignores waiting or cancelled work", async () => {
  const q = setup();
  q.updateSettings({ ...q.settings, concurrency: 2 });
  const [first, second, waiting] = q.add(
    ["https://example.com/a", "https://example.com/b", "https://example.com/c"],
    opts,
  ).jobs;
  expect(q.progress).toBe(0);
  q.start();
  first.progress = 20;
  second.progress = 60;
  waiting.progress = 100;
  expect(q.progress).toBe(40);
  q.cancel(first.id);
  expect(q.progress).toBe(60);
  await q.shutdown();
  expect(q.progress).toBe(0);
});
test("a cancelled process cannot remove a replacement's deduplication key", async () => {
  const q = setup();
  q.start();
  const first = q.add(["https://example.com/a"], opts).jobs[0];
  q.cancel(first.id);
  q.add([first.url], opts);
  await settle();
  expect(q.add([first.url], opts).skipped).toBe(1);
});
test("retry joins the end of FIFO after a queued cancellation", async () => {
  const q = setup();
  const [first, second] = q.add(
    ["https://example.com/a", "https://example.com/b"],
    opts,
  ).jobs;
  q.cancel(first.id);
  q.retry(first.id);
  q.start();
  expect(second.status).toBe("extracting");
  expect(first.status).toBe("queued");
});
test("retry does not duplicate an active replacement", () => {
  const q = setup();
  const first = q.add(["https://example.com/a"], opts).jobs[0];
  q.cancel(first.id);
  q.add([first.url], opts);
  expect(() => q.retry(first.id)).toThrow(/already queued|already downloading/);
});
test("failure remains retryable and shutdown stops processes", async () => {
  const q = setup();
  q.start();
  const job = q.add(["https://example.com/a"], opts).jobs[0];
  processes[0].finish({ code: 1, stderr: "ERROR: test failure" });
  await settle();
  expect(job.status).toBe("failed");
  expect(job.error).toContain("test failure");
  q.retry(job.id);
  expect(job.status).toBe("extracting");
  await q.shutdown();
  expect(processes[1].cancel).toHaveBeenCalled();
  expect(job.status).toBe("failed");
  expect(job.error).toContain("nixi stopped");
});

test("FIFO retry ordering survives reopening the persisted queue", () => {
  const q = setup();
  const [first, second] = q.add(
    ["https://example.com/a", "https://example.com/b"],
    opts,
  ).jobs;
  first.createdAt = "2026-01-01T00:00:00.000Z";
  second.createdAt = "2026-01-02T00:00:00.000Z";
  q.store.save(second);
  q.cancel(first.id);
  q.retry(first.id);
  const restored = new Queue(q.store);
  restored.start();
  expect(restored.get(second.id).status).toBe("extracting");
  expect(restored.get(first.id).status).toBe("queued");
  cleanups.push(() => restored.shutdown());
});

for (const action of ["cancel", "shutdown", "complete"] as const) {
  test(`MP4 conversion owns the queue slot and supports ${action}`, async () => {
    const q = setup();
    q.start();
    const [job, waiting] = q.add(
      ["https://example.com/a", "https://example.com/b"],
      opts,
    ).jobs;
    mkdirSync(job.directory, { recursive: true });
    const path = join(job.directory, "clip.mp4");
    writeFileSync(path, "media");
    job.files = [{ path, name: "clip.mp4", size: 0 }];
    processes[0].finish({ code: 0, stderr: "" });
    await settle();
    expect(job.status).toBe("processing");
    expect(q.active).toBe(1);
    expect(waiting.status).toBe("queued");
    if (action === "cancel") {
      q.cancel(job.id);
      await settle();
      expect(conversions[0].cancel).toHaveBeenCalled();
      expect(job.status).toBe("cancelled");
      expect(waiting.status).toBe("extracting");
    } else if (action === "shutdown") {
      await q.shutdown();
      expect(conversions[0].cancel).toHaveBeenCalled();
      expect(job.status).toBe("failed");
      expect(waiting.status).toBe("queued");
    } else {
      conversions[0].finish({ code: 0, stderr: "" });
      await settle();
      expect(job.status).toBe("completed");
      expect(job.files[0].size).toBe(5);
      expect(waiting.status).toBe("extracting");
    }
  });
}
