import { expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectStorage, environmentValue } from "../../src/lib/identity";
import { Store } from "../../src/store";
import { Queue } from "../../src/queue";
test("new installs use nixi paths", () => {
  const home = mkdtempSync(join(tmpdir(), "nixi-identity-"));
  try {
    const storage = selectStorage(home);
    expect(storage.dataDir).toBe(
      join(home, "Library/Application Support/Nixi"),
    );
    expect(storage.database).toBe(join(storage.dataDir, "nixi.sqlite"));
    expect(storage.downloadDir).toBe(join(home, "Downloads/Nixi"));
  } finally {
    rmSync(home, { recursive: true });
  }
});
test("existing history is reused without moving media or overwriting new nixi data", () => {
  const home = mkdtempSync(join(tmpdir(), "nixi-identity-"));
  try {
    const legacy = join(home, "Library/Application Support/Grabby");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "grabby.sqlite"), "existing");
    expect(selectStorage(home).database).toBe(join(legacy, "grabby.sqlite"));
    const current = join(home, "Library/Application Support/Nixi");
    mkdirSync(current, { recursive: true });
    writeFileSync(join(current, "nixi.sqlite"), "newer");
    expect(selectStorage(home).database).toBe(join(current, "nixi.sqlite"));
  } finally {
    rmSync(home, { recursive: true });
  }
});
test("explicit data paths isolate tests and custom installations from legacy history", () => {
  const home = mkdtempSync(join(tmpdir(), "nixi-identity-"));
  try {
    const custom = join(home, "custom");
    expect(selectStorage(home, custom, "/custom-media")).toEqual({
      dataDir: custom,
      database: join(custom, "nixi.sqlite"),
      downloadDir: "/custom-media",
    });
  } finally {
    rmSync(home, { recursive: true });
  }
});
test("new environment names win while legacy overrides remain compatible", () => {
  expect(
    environmentValue("PORT", { NIXI_PORT: "5000", GRABBY_PORT: "6000" }),
  ).toBe("5000");
  expect(environmentValue("PORT", { GRABBY_PORT: "6000" })).toBe("6000");
});
test("opening legacy SQLite retains history, options and the saved media directory", () => {
  const home = mkdtempSync(join(tmpdir(), "nixi-upgrade-"));
  const legacy = join(home, "Library/Application Support/Grabby");
  mkdirSync(legacy, { recursive: true });
  let store: Store | undefined;
  try {
    store = new Store(join(legacy, "grabby.sqlite"));
    const settings = {
      ...store.settings(),
      downloadDir: join(home, "Downloads/Grabby"),
      concurrency: 3,
    };
    store.saveSettings(settings);
    const queue = new Queue(store);
    const job = queue.add(["https://example.com/kept"], {
      format: "mp3",
      quality: "best",
      cookiesBrowser: "none",
      playlist: false,
      subtitles: false,
    }).jobs[0];
    store.close();
    store = undefined;
    store = new Store(selectStorage(home).database);
    expect(store.settings()).toEqual(settings);
    expect(store.jobs()).toEqual([job]);
  } finally {
    store?.close();
    rmSync(home, { recursive: true, force: true });
  }
});
