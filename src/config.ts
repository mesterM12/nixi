import { homedir } from "node:os";
import { join, dirname, resolve, delimiter } from "node:path";
import { accessSync, constants, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
export const root = resolve(import.meta.dirname, "..");
import { environmentValue, selectStorage } from "./lib/identity";
const storage = selectStorage(
  homedir(),
  environmentValue("DATA_DIR"),
  environmentValue("DOWNLOAD_DIR"),
);
export const { dataDir, database } = storage;
export const defaultDownloadDir = storage.downloadDir;
export const port = Number(environmentValue("PORT") || 43174);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("NIXI_PORT must be a valid port.");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const executable = (path: string) => {
  try {
    accessSync(path, constants.X_OK);
    return path;
  } catch {
    return null;
  }
};
const onPath = (name: string) =>
  name.includes("/")
    ? executable(name)
    : (process.env.PATH || "")
        .split(delimiter)
        .map((dir) => join(dir, name))
        .find((path) => executable(path)) || null;
export function findTool(name: string, override?: string): string | null {
  if (override) return onPath(override);
  const mise = onPath("mise") || executable(join(homedir(), ".local/bin/mise"));
  if (mise) {
    const result = spawnSync(mise, ["which", name], {
      encoding: "utf8",
      timeout: 5000,
      cwd: root,
    });
    if (result.status === 0 && executable(result.stdout.trim()))
      return result.stdout.trim();
  }
  return (
    onPath(name) ||
    executable(join(homedir(), ".local/bin", name)) ||
    executable(`/opt/homebrew/bin/${name}`) ||
    executable(`/usr/local/bin/${name}`)
  );
}
export const toolPaths = {
  ytDlp: findTool("yt-dlp", environmentValue("YTDLP")),
  ffmpeg: findTool("ffmpeg", environmentValue("FFMPEG")),
  ffprobe: findTool("ffprobe", environmentValue("FFPROBE")),
  runtime: findTool("node", environmentValue("NODE")),
};
export function subprocessEnv() {
  return {
    ...process.env,
    PATH: [
      ...new Set([
        ...Object.values(toolPaths)
          .filter((p): p is string => Boolean(p))
          .map(dirname),
        process.env.PATH || "",
        "/usr/bin",
        "/bin",
      ]),
    ].join(delimiter),
    PYTHONUNBUFFERED: "1",
  };
}
