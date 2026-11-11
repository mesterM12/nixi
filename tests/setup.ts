import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
// Establish isolated defaults before importing any app modules, even for tests
// that construct an in-memory database without changing download preferences.
const directory = mkdtempSync(join(tmpdir(), "nixi-vitest-"));
process.env.NIXI_DATA_DIR = join(directory, "data");
process.env.NIXI_DOWNLOAD_DIR = join(directory, "downloads");
afterAll(() => rmSync(directory, { recursive: true, force: true }));
