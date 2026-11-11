import type { Server as HttpServer } from "node:http";
import { serve } from "@hono/node-server";
import { once } from "node:events";
export async function testServer(
  fetch: (request: Request) => Response | Promise<Response>,
) {
  const server = serve({ hostname: "127.0.0.1", port: 0, fetch });
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    stop() {
      server.close();
      (server as HttpServer).closeAllConnections();
    },
  };
}
