import type { Server as HttpServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { serve } from "@hono/node-server";
import { browserCookieFixtures, hasFixtureCookie } from "./browser-cookies";
const directory = mkdtempSync(join(tmpdir(), "nixi-playwright-"));
process.env.NIXI_DATA_DIR = join(directory, "data");
process.env.NIXI_BROWSER_HOME = join(directory, "home");
const cookies = browserCookieFixtures(process.env.NIXI_BROWSER_HOME);
const { formatMedia } = await import("./format-media");
const { createApp } = await import("../../src/app");
const { toolPaths, subprocessEnv, dataDir, database } =
  await import("../../src/config");
if (
  dataDir !== join(directory, "data") ||
  !database.startsWith(join(directory, "data") + "/")
)
  throw new Error(
    "Refusing to start E2E with a database outside its temporary directory.",
  );
if (!toolPaths.ytDlp || !toolPaths.ffmpeg || !toolPaths.ffprobe)
  throw new Error(
    "E2E requires the real mise-managed download tools. Run mise install.",
  );
const mediaPath = join(directory, "fixture.mp4");
const generated = spawnSync(
  toolPaths.ffmpeg,
  [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=160x90:r=10:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:v",
    "libvpx-vp9",
    "-c:a",
    "aac",
    "-shortest",
    mediaPath,
  ],
  { env: subprocessEnv(), encoding: "utf8" },
);
if (generated.status !== 0) throw new Error(generated.stderr);
const formatFixture = formatMedia(join(directory, "format-sources"));
const media = serve({
  hostname: "127.0.0.1",
  port: 43275,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/formats/")) {
      const url = new URL(request.url);
      url.pathname = path.slice("/formats".length);
      return formatFixture(new Request(url));
    }
    if (path === "/__fixtures/safari" && request.method === "POST") {
      chmodSync(
        cookies.safari,
        new URL(request.url).searchParams.get("locked") === "true" ? 0 : 0o600,
      );
      return Response.json({ ok: true });
    }
    if (path === "/auth.mp4" && !hasFixtureCookie(request))
      return new Response("Sign in required", { status: 401 });
    if (path === "/multi")
      return new Response(
        '<html><head><title>Two clips</title></head><body><video src="/one.mp4"></video><video src="/two.mp4"></video></body></html>',
        { headers: { "Content-Type": "text/html" } },
      );
    if (path === "/slow.mp4")
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(readFileSync(mediaPath)));
          },
        }),
        { headers: { "Content-Type": "video/mp4" } },
      );
    if (path.endsWith(".mp4"))
      return new Response(new Uint8Array(readFileSync(mediaPath)), {
        headers: { "Content-Type": "video/mp4" },
      });
    return new Response("Not found", { status: 404 });
  },
});
const app = createApp();
app.queue.updateSettings({
  ...app.queue.settings,
  downloadDir: join(directory, "downloads"),
});
app.queue.start();
const server = serve({ hostname: "127.0.0.1", port: 43274, fetch: app.fetch });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  (server as HttpServer).closeAllConnections();
  media.close();
  (media as HttpServer).closeAllConnections();
  await app.shutdown();
  rmSync(directory, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
