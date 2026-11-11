import type { Server as HttpServer } from "node:http";
import { serve } from "@hono/node-server";
import { once } from "node:events";
import { createApp } from "./app";
import { port } from "./config";
let handler: (request: Request) => Promise<Response> = async () =>
  new Response("Starting nixi", { status: 503 });
// Claim the port before opening the store. A second process must never recover
// jobs that are still being downloaded by the current service.
const server = serve({
  hostname: "127.0.0.1",
  port,
  fetch: (request) => handler(request),
});
await once(server, "listening");
const app = createApp();
handler = app.fetch;
app.queue.start();
console.log(`nixi listening at http://127.0.0.1:${port}`);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  (server as HttpServer).closeAllConnections();
  await app.shutdown();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
