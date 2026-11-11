import { afterEach, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDebounced } from "@/hooks/use-debounced";
import { useLibrary } from "@/hooks/use-library";
import { api } from "@/lib/api";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test("search waits for a pause and discards intermediate terms", () => {
  vi.useFakeTimers();
  const { result, rerender, unmount } = renderHook(
    ({ text }) => useDebounced(text),
    { initialProps: { text: "" } },
  );
  rerender({ text: "a" });
  act(() => vi.advanceTimersByTime(100));
  rerender({ text: "abc" });
  act(() => vi.advanceTimersByTime(199));
  expect(result.current).toBe("");
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe("abc");
  unmount();
});
class Events {
  static current: Events;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  listeners = new Map<string, (event: unknown) => void>();
  constructor() {
    Events.current = this;
  }
  addEventListener(name: string, handler: (event: unknown) => void) {
    this.listeners.set(name, handler);
  }
}
test("library handles notifications, ETags, failure recovery and cleanup", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ jobs: [], revision: 1 }), {
      headers: { etag: '"one"' },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("EventSource", Events);
  const { result, unmount } = renderHook(() =>
    useLibrary({ filter: "all", search: "", offset: 0, limit: 50 }),
  );
  await waitFor(() => expect(result.current.data?.revision).toBe(1));
  fetcher.mockResolvedValue(new Response(null, { status: 304 }));
  await act(async () => {
    await result.current.refresh();
  });
  expect(fetcher.mock.calls.at(-1)![1].headers).toEqual({
    "If-None-Match": '"one"',
  });
  expect(result.current.data?.revision).toBe(1);
  act(() => Events.current.onerror?.());
  expect(result.current.error).toContain("Reconnecting");
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ jobs: [], revision: 2 })),
  );
  act(() => Events.current.listeners.get("revision")?.({ data: "2" }));
  await waitFor(() => expect(result.current.data?.revision).toBe(2));
  expect(result.current.error).toBeUndefined();
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ error: "Storage unavailable" }), {
      status: 500,
    }),
  );
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.error).toBe("Storage unavailable");
  unmount();
  expect(Events.current.close).toHaveBeenCalled();
  expect(fetcher.mock.calls.at(-1)![1].signal.aborted).toBe(true);
});
test("API sends JSON and returns readable errors", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    api("/api/settings", "PUT", { concurrency: 1 }),
  ).resolves.toEqual({ ok: true });
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "PUT",
    body: '{"concurrency":1}',
    headers: { "Content-Type": "application/json" },
  });
  fetcher.mockResolvedValue(
    new Response('{"error":"Offline"}', { status: 503 }),
  );
  await expect(api("/api/status")).rejects.toThrow("Offline");
});
