import { testServer } from "../fixtures/server";
import { setTimeout as sleep } from "node:timers/promises";
import { expect, test } from "vitest";
import { createApp } from "../../src/app";
import { Store } from "../../src/store";

test("library is compact, paginated and conditionally cached; event subscriptions clean up", async () => {
  const store = new Store(":memory:");
  const app = createApp(store);
  const server = await testServer(app.fetch);
  const base = server.url;
  const controller = new AbortController();
  try {
    const compact = await fetch(base + "/api/status?compact=1");
    expect((await compact.json()).jobs).toEqual([]);
    expect(
      (
        await fetch(base + "/api/status?compact=1", {
          headers: { "If-None-Match": compact.headers.get("etag")! },
        })
      ).status,
    ).toBe(304);
    const first = await fetch(base + "/api/library");
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const unchanged = await fetch(base + "/api/library", {
      headers: { "If-None-Match": etag! },
    });
    expect(unchanged.status).toBe(304);
    const response = await fetch(base + "/api/events", {
      signal: controller.signal,
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const initial = new TextDecoder().decode((await reader.read()).value);
    expect(initial).toContain("event: revision");
    expect(app.queue.subscriberCount).toBe(1);
    const job = app.queue.add(["https://example.test/video"], {
      format: "video",
      quality: "best",
      cookiesBrowser: "none",
      playlist: false,
      subtitles: false,
    }).jobs[0];
    const event = new TextDecoder().decode((await reader.read()).value);
    expect(event).toContain("event: revision");
    const changed = await fetch(base + "/api/library", {
      headers: { "If-None-Match": etag! },
    });
    expect(changed.status).toBe(200);
    const value = await changed.json();
    expect(value.jobs[0].id).toBe(job.id);
    expect(value.jobs[0]).not.toHaveProperty("logs");
    expect(value.total).toBe(1);
    expect((await fetch(base + "/api/library?limit=100000")).status).toBe(400);
    controller.abort();
    await reader.cancel().catch(() => {});
    for (let i = 0; i < 20 && app.queue.subscriberCount; i++) await sleep(20);
    expect(app.queue.subscriberCount).toBe(0);
  } finally {
    controller.abort();
    server.stop();
    await app.queue.shutdown();
    store.close();
  }
});
