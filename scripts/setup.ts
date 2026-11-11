import { spawnSync } from "node:child_process";
import { findTool, root } from "../src/config";
const mise = findTool("mise");
if (!mise)
  throw new Error(
    "Install mise first, then run mise install in the nixi directory.",
  );
const result = spawnSync(mise, ["install"], { cwd: root, stdio: "inherit" });
if (result.status !== 0)
  throw new Error("mise could not install nixi's tools.");
for (const name of ["yt-dlp", "ffmpeg", "ffprobe", "node"]) {
  const path = findTool(name);
  if (!path) throw new Error(`mise could not resolve ${name}.`);
  console.log(`${name}: ${path}`);
}
console.log(
  "Ready. Run pnpm run install:agent to keep nixi available after login.",
);
