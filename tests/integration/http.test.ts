import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/app";
import { Store } from "../../src/store";
const host = "127.0.0.1:43174",
  base = `http://${host}`;
function request(
  path: string,
  method = "GET",
  body?: string,
  headers: Record<string, string> = {},
) {
  return new Request(base + path, {
    method,
    headers: { host, Origin: base, ...headers },
    body,
  });
}
test("HTTP validates bodies, job actions and missing resources", async () => {
  const app = createApp(new Store(":memory:"));
  try {
    for (const [value, message] of [
      ["[]", "JSON object"],
      ["null", "JSON object"],
      ["{", "JSON"],
      ["x".repeat(100001), "too large"],
    ]) {
      const response = await app.fetch(
        request("/api/settings", "PUT", value, {
          "Content-Type": "application/json",
        }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain(message);
    }
    expect(
      (await app.fetch(request("/api/settings", "PUT", "{}"))).status,
    ).toBe(400);
    expect(
      (
        await app.fetch(
          request("/api/settings", "PUT", '{"concurrency":0}', {
            "Content-Type": "application/json",
          }),
        )
      ).status,
    ).toBe(400);
    const job = app.queue.add(["https://example.test/one"], app.queue.settings)
      .jobs[0];
    expect((await app.fetch(request(`/api/jobs/${job.id}`))).status).toBe(200);
    expect(
      (await app.fetch(request(`/api/jobs/${job.id}`, "DELETE"))).status,
    ).toBe(400);
    expect(
      (await app.fetch(request(`/api/jobs/${job.id}/files/0`))).status,
    ).toBe(404);
    expect(
      (await app.fetch(request(`/api/jobs/${job.id}/cancel`, "POST"))).status,
    ).toBe(200);
    expect(
      (await app.fetch(request(`/api/jobs/${job.id}/cancel`, "POST"))).status,
    ).toBe(400);
    expect(
      (await app.fetch(request(`/api/jobs/${job.id}/retry`, "POST"))).status,
    ).toBe(200);
    expect(
      (await app.fetch(request(`/api/jobs/${job.id}/cancel`, "POST"))).status,
    ).toBe(200);
    expect(
      (await app.fetch(request(`/api/jobs/${job.id}`, "DELETE"))).status,
    ).toBe(200);
    expect((await app.fetch(request(`/api/jobs/${job.id}`))).status).toBe(404);
    expect((await app.fetch(request("/missing"))).status).toBe(404);
    expect(
      (
        await app.fetch(
          new Request(base + "/api/status", { headers: { host: "evil.test" } }),
        )
      ).status,
    ).toBe(403);
  } finally {
    await app.shutdown();
  }
});
test("oversized streaming bodies stop reading as soon as the limit is reached", async () => {
  const app = createApp(new Store(":memory:"));
  let chunks = 0,
    cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      chunks++;
      controller.enqueue(new Uint8Array(60000));
      if (chunks === 10) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  try {
    const response = await app.fetch(
      new Request(base + "/api/settings", {
        method: "PUT",
        headers: { host, Origin: base, "Content-Type": "application/json" },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    expect(response.status).toBe(400);
    expect(cancelled).toBe(true);
    expect(chunks).toBeLessThan(10);
  } finally {
    await app.shutdown();
  }
});
test("static export supports HEAD, cache validation, CSP hydration hashes and traversal rejection", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nixi-http-"));
  writeFileSync(
    join(dir, "index.html"),
    '<html><script>console.log("hydration")</script></html>',
  );
  const app = createApp(new Store(":memory:"), dir);
  try {
    const response = await app.fetch(request("/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "'sha256-",
    );
    expect(response.headers.get("content-security-policy")).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    const head = await app.fetch(request("/", "HEAD"));
    expect(await head.text()).toBe("");
    expect(head.headers.get("etag")).toBe(response.headers.get("etag"));
    expect(
      (
        await app.fetch(
          request("/", "GET", undefined, {
            "If-None-Match": response.headers.get("etag")!,
          }),
        )
      ).status,
    ).toBe(304);
    expect((await app.fetch(request("/%2e%2e%2fpackage.json"))).status).toBe(
      404,
    );
    expect((await app.fetch(request("/%E0%A4%A"))).status).toBe(400);
  } finally {
    await app.shutdown();
    rmSync(dir, { recursive: true });
  }
});
test("shutdown closes event streams and removes subscribers", async () => {
  const app = createApp(new Store(":memory:"));
  const response = await app.fetch(request("/api/events"));
  const reader = response.body!.getReader();
  await reader.read();
  expect(app.queue.subscriberCount).toBe(1);
  await app.shutdown();
  expect(app.queue.subscriberCount).toBe(0);
  expect(
    await Promise.race([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve("still open"), 100)),
    ]),
  ).toMatchObject({ done: true });
});
