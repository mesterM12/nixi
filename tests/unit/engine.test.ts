import { afterEach, expect, test, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import {
  inspectVideo,
  runYtDlp,
  downloadArgs,
  parseInfo,
  explainError,
  checkCookieAccess,
} from "../../src/engine";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../../src/config", () => ({
  toolPaths: {
    ytDlp: "/tools/yt-dlp",
    ffmpeg: "/tools/ffmpeg",
    runtime: "/tools/node",
  },
  subprocessEnv: () => ({}),
}));
const opts = {
  format: "video",
  quality: "best",
  cookiesBrowser: "none",
  playlist: false,
  subtitles: false,
} as const;
afterEach(() => vi.restoreAllMocks());
function child() {
  const value = Object.assign(new EventEmitter(), {
    pid: 123456789,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  vi.mocked(spawn).mockReturnValue(value as never);
  return value;
}
test("engine drains fragmented stdout/stderr and ignores cancel after close", async () => {
  const value = child(),
    line = vi.fn(),
    kill = vi.spyOn(process, "kill").mockReturnValue(true);
  const processHandle = runYtDlp(["--version"], line);
  value.stdout.write("first\nsec");
  value.stdout.end("ond");
  value.stderr.end("ERROR: error\n");
  await new Promise((resolve) => setTimeout(resolve, 0));
  value.emit("close", 1);
  expect(await processHandle.done).toEqual({
    code: 1,
    stderr: "ERROR: error\n",
  });
  expect(line.mock.calls.map(([line]) => line)).toEqual(
    expect.arrayContaining(["first", "second", "ERROR: error"]),
  );
  processHandle.cancel();
  expect(kill).not.toHaveBeenCalled();
});
test("preview uses Effect to release its process on success", async () => {
  const value = child();
  const pending = inspectVideo("https://example.com", opts);
  await new Promise((resolve) => setTimeout(resolve, 0));
  value.stdout.write('{"title":"Preview","formats":[{"height":720}]}\n');
  value.emit("close", 0);
  await expect(pending).resolves.toMatchObject({
    title: "Preview",
    heights: [720],
  });
});
test("aborted preview terminates its process group and waits for closure", async () => {
  const value = child();
  const kill = vi.spyOn(process, "kill").mockImplementation(() => {
    queueMicrotask(() => value.emit("close", 1));
    return true;
  });
  const controller = new AbortController();
  const pending = inspectVideo("https://example.com", opts, controller.signal);
  const rejection = expect(pending).rejects.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await rejection;
  expect(kill).toHaveBeenCalledWith(-value.pid, "SIGTERM");
});
test("preview errors and missing metadata stay actionable", async () => {
  for (const [code, stderr, message] of [
    [1, "ERROR: private video", "signed-in browser"],
    [0, "", "No video information"],
  ] as const) {
    const value = child();
    const pending = inspectVideo("https://example.com", opts);
    const rejection = expect(pending).rejects.toThrow(message);
    await new Promise((resolve) => setTimeout(resolve, 0));
    value.stderr.write(stderr);
    value.emit("close", code);
    await rejection;
  }
});
test("original and subtitles preserve extractor flexibility", () => {
  const args = downloadArgs(
    "https://example.com",
    { ...opts, format: "original", subtitles: true },
    "/tmp",
  );
  expect(args).toContain("bv*+ba/b");
  expect(args).not.toContain("--remux-video");
  expect(args).toContain("--write-subs");
  expect(args).toContain("--write-auto-subs");
  expect(parseInfo("{}")).toMatchObject({
    title: "Untitled video",
    site: "Video",
    heights: [],
    entries: null,
  });
  expect(explainError("")).toContain("could not complete");
});
test("cookie diagnostics distinguish disabled, readable and empty stores without exporting cookies", async () => {
  expect(await checkCookieAccess("none")).toMatchObject({ ok: true, count: 0 });
  for (const count of [0, 2]) {
    const value = child();
    vi.mocked(spawn).mockImplementationOnce(() => {
      queueMicrotask(() => {
        value.stdout.write(`Extracted ${count} cookies from firefox\n`);
        value.emit("close", 0);
      });
      return value as never;
    });
    const result = await checkCookieAccess("firefox");
    expect(result).toMatchObject({ ok: count > 0, count });
    expect(JSON.stringify(result)).not.toContain("http_headers");
    const args = vi.mocked(spawn).mock.calls.at(-1)![1] as string[];
    expect(args).toContain("--simulate");
    expect(args).not.toContain("--cookies");
  }
});
test("cookie diagnostics cancel their process when the caller disconnects", async () => {
  const value = child();
  const kill = vi.spyOn(process, "kill").mockImplementation(() => {
    queueMicrotask(() => value.emit("close", 1));
    return true;
  });
  const controller = new AbortController();
  vi.mocked(spawn).mockImplementationOnce(() => {
    queueMicrotask(() => controller.abort());
    return value as never;
  });
  expect(await checkCookieAccess("firefox", controller.signal)).toMatchObject({
    ok: false,
    message: "Cookie access check was cancelled.",
  });
  expect(kill).toHaveBeenCalledWith(-value.pid, "SIGTERM");
});
