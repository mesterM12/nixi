import { existsSync } from "node:fs";
import { join } from "node:path";
export function environmentValue(
  name: string,
  env: Record<string, string | undefined> = process.env,
) {
  return env[`NIXI_${name}`] ?? env[`GRABBY_${name}`];
}
export function selectStorage(
  home: string,
  override?: string,
  downloadOverride?: string,
) {
  const current = join(home, "Library", "Application Support", "Nixi");
  const legacy = join(home, "Library", "Application Support", "Grabby");
  const dataDir =
    override ||
    (existsSync(join(current, "nixi.sqlite"))
      ? current
      : existsSync(join(legacy, "grabby.sqlite"))
        ? legacy
        : current);
  const database = existsSync(join(dataDir, "nixi.sqlite"))
    ? join(dataDir, "nixi.sqlite")
    : existsSync(join(dataDir, "grabby.sqlite"))
      ? join(dataDir, "grabby.sqlite")
      : join(dataDir, "nixi.sqlite");
  return {
    dataDir,
    database,
    downloadDir: downloadOverride || join(home, "Downloads", "Nixi"),
  };
}
