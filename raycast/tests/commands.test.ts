import { afterEach, expect, test, vi } from "vitest";
import QuickCapture from "../src/quick-capture";
import OpenPanel from "../src/open-panel";
const native = vi.hoisted(() => ({
  readText: vi.fn(),
  showHUD: vi.fn(),
  showToast: vi.fn(),
  open: vi.fn(),
}));
vi.mock("@raycast/api", () => ({
  getPreferenceValues: () => ({ serverUrl: "http://127.0.0.1:43174" }),
  Clipboard: { readText: native.readText },
  showHUD: native.showHUD,
  showToast: native.showToast,
  open: native.open,
  Toast: { Style: { Failure: "failure" } },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
test("Quick Capture queues deduplicated clipboard links with saved Zen/audio/playlist defaults and returns to work", async () => {
  native.readText.mockResolvedValue(
    "https://example.test/one\nhttps://example.test/two\nhttps://example.test/one",
  );
  const settings = {
    format: "mp3",
    quality: "best",
    cookiesBrowser: "zen",
    playlist: true,
    subtitles: false,
    concurrency: 2,
    downloadDir: "/tmp",
  };
  const fetcher = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.includes("/api/status")
            ? {
                jobs: [],
                settings,
                system: { ready: true, active: 0, queued: 0 },
              }
            : { jobs: [{ id: "one" }, { id: "two" }] },
        ),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  await QuickCapture();
  const call = fetcher.mock.calls.find(([url]) => url.endsWith("/api/jobs"))!;
  expect(JSON.parse(call[1].body)).toMatchObject({
    ...settings,
    urls: ["https://example.test/one", "https://example.test/two"],
  });
  expect(native.showHUD).toHaveBeenCalledWith("nixi: 2 links queued");
  expect(native.showToast).not.toHaveBeenCalled();
});
test("Quick Capture rejects invalid clipboard content before contacting the service", async () => {
  native.readText.mockResolvedValue("file:///private/cookies");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await QuickCapture();
  expect(fetcher).not.toHaveBeenCalled();
  expect(native.showToast).toHaveBeenCalledWith(
    expect.objectContaining({
      style: "failure",
      message: expect.stringContaining("http"),
    }),
  );
});
test("Open Panel opens the local web interface", async () => {
  await OpenPanel();
  expect(native.open).toHaveBeenCalledWith("http://127.0.0.1:43174");
});
