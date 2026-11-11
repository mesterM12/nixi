import { spawn } from "node:child_process";
import { join } from "node:path";
import { root } from "../src/config";
const processes = [
  spawn(process.execPath, ["--import", "tsx", "--watch", "src/server.ts"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      NIXI_DEV_ORIGIN: "http://127.0.0.1:3000",
      NIXI_PORT: "43175",
      NIXI_DATA_DIR: process.env.NIXI_DATA_DIR || join(root, ".nixi-dev"),
      NIXI_DOWNLOAD_DIR: join(root, ".nixi-dev", "downloads"),
    },
  }),
  spawn(
    "pnpm",
    ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", "3000"],
    { cwd: root, stdio: "inherit" },
  ),
];
const stop = () => {
  for (const child of processes) child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of processes) child.on("exit", stop);
