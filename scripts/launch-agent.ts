import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { write } from "../src/platform";
const spawnCommand = (
  args: string[],
  options: Parameters<typeof spawnSync>[2],
) => spawnSync(args[0], args.slice(1), options);
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dataDir, root, toolPaths, port } from "../src/config";
const label = "com.local.nixi";
const legacyLabel = "com.local.grabby";
const legacyPath = join(
  homedir(),
  "Library",
  "LaunchAgents",
  `${legacyLabel}.plist`,
);
const uid = process.getuid?.();
if (process.platform !== "darwin" || uid === undefined)
  throw new Error("A macOS user session is required.");
const path = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
const domain = `gui/${uid}`;
const run = (args: string[]) => spawnCommand(["/bin/launchctl", ...args], {});
if (process.argv[2] === "uninstall") {
  run(["bootout", `${domain}/${legacyLabel}`]);
  if (existsSync(legacyPath)) unlinkSync(legacyPath);
  run(["bootout", `${domain}/${label}`]);
  if (existsSync(path)) unlinkSync(path);
  console.log(
    "nixi login service removed. Downloads and history are preserved.",
  );
} else {
  if (!toolPaths.ytDlp || !toolPaths.ffmpeg || !toolPaths.ffprobe)
    throw new Error("Run pnpm run setup before installing the service.");
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  const logs = join(dataDir, "logs");
  mkdirSync(logs, { recursive: true, mode: 0o700 });
  const xml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const env: Record<string, string> = {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: homedir(),
    NIXI_DATA_DIR: dataDir,
  };
  for (const [key, value] of Object.entries({
    NIXI_YTDLP: toolPaths.ytDlp,
    NIXI_FFMPEG: toolPaths.ffmpeg,
    NIXI_FFPROBE: toolPaths.ffprobe,
    NIXI_NODE: toolPaths.runtime,
    NIXI_PORT: String(port),
  }))
    if (value) env[key] = value;
  await write(
    path,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>--import</string><string>${xml(join(root, "node_modules/tsx/dist/loader.mjs"))}</string><string>${xml(join(root, "src/server.ts"))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(env)
      .map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`)
      .join("")}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(join(logs, "stdout.log"))}</string>
<key>StandardErrorPath</key><string>${xml(join(logs, "stderr.log"))}</string>
</dict></plist>\n`,
  );
  run(["bootout", `${domain}/${legacyLabel}`]);
  if (existsSync(legacyPath)) unlinkSync(legacyPath);
  run(["bootout", `${domain}/${label}`]);
  // launchd may finish the prior bootout asynchronously. Retry the bounded
  // registration step so updating an existing service is reliable.
  let result = run(["bootstrap", domain, path]);
  for (let attempt = 0; result.status !== 0 && attempt < 8; attempt++) {
    await sleep(250);
    result = run(["bootstrap", domain, path]);
  }
  if (result.status !== 0)
    throw new Error(result.stderr?.toString() || "Could not start nixi.");
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(1000),
      });
      const status = await response.json();
      if (response.ok && status.system?.ytDlp && status.settings?.downloadDir) {
        healthy = true;
        break;
      }
    } catch {
      /* The service is still starting. */
    }
    await sleep(250);
  }
  if (!healthy)
    throw new Error(
      `The service was registered but did not become ready. See ${join(logs, "stderr.log")}.`,
    );
  console.log(
    `nixi is installed and starts at login. Open http://127.0.0.1:${port}`,
  );
}
