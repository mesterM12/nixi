import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { libraryView, parseLibraryQuery } from "./lib/library";
import { root, toolPaths, subprocessEnv } from "./config";
import { inspectVideo, checkCookieAccess } from "./engine";
import { Queue } from "./queue";
import { Store } from "./store";
import { options, parseUrls, settings, videoUrl } from "./validation";
import type { Dependency, Snapshot } from "./types";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' https: http: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}
function dependency(path: string | null, flag: string): Dependency {
  if (!path) return { path: null, version: null };
  try {
    const result = spawnSync(path, [flag], {
      env: subprocessEnv(),
      timeout: 10_000,
    });
    return {
      path,
      version:
        result.status === 0
          ? result.stdout?.toString().trim().split("\n")[0].slice(0, 160)
          : null,
    };
  } catch {
    return { path, version: null };
  }
}
export function allowedRequest(
  request: Request,
  developmentOrigin?: string,
): boolean {
  const host = request.headers.get("host");
  if (!host || !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host))
    return false;
  const origin = request.headers.get("origin");
  const mutation = !["GET", "HEAD"].includes(request.method);
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (mutation && !origin) return false;
  const localDevelopment =
    developmentOrigin &&
    /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(developmentOrigin) &&
    origin === developmentOrigin;
  if (origin && origin !== `http://${host}` && !localDevelopment) return false;
  return true;
}
export function createApp(store = new Store(), webDir = join(root, "out")) {
  const queue = new Queue(store);
  const dependencies = {
    ytDlp: dependency(toolPaths.ytDlp, "--version"),
    ffmpeg: dependency(toolPaths.ffmpeg, "-version"),
    ffprobe: dependency(toolPaths.ffprobe, "-version"),
    runtime: dependency(toolPaths.runtime, "--version"),
  };
  let lookups = 0;
  const activeLookups = new Set<AbortController>();
  const eventStreams = new Set<() => void>();
  const epoch = crypto.randomUUID();
  const assetCache = new Map<
    string,
    { data: Uint8Array; etag: string; csp: string }
  >();
  const snapshot = (): Snapshot => ({
    jobs: queue.jobs,
    settings: queue.settings,
    system: {
      ...dependencies,
      ready: Boolean(
        dependencies.ytDlp.version &&
        dependencies.ffmpeg.version &&
        dependencies.ffprobe.version,
      ),
      active: queue.active,
      queued: queue.queued,
      progress: queue.progress,
    },
  });
  const open = (path: string, reveal = false) =>
    new Promise<void>((resolve, reject) => {
      if (process.platform !== "darwin") {
        reject(new Error("Opening Finder is only available on macOS."));
        return;
      }
      const child = spawn("/usr/bin/open", reveal ? ["-R", path] : [path], {
        stdio: "ignore",
      });
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error("Finder could not open this path.")),
      );
    });
  async function body(request: Request) {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new Error("Send JSON with Content-Type application/json.");
    const limit = 100_000;
    if (Number(request.headers.get("content-length")) > limit) {
      await request.body?.cancel();
      throw new Error("The request is too large.");
    }
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let text = "",
      size = 0;
    if (reader)
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) {
            await reader.cancel();
            throw new Error("The request is too large.");
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Send a JSON object.");
    return value as Record<string, unknown>;
  }
  const fetch = async (request: Request): Promise<Response> => {
    if (
      !allowedRequest(
        request,
        process.env.NODE_ENV === "development"
          ? process.env.NIXI_DEV_ORIGIN
          : undefined,
      )
    )
      return json(
        { error: "This request must come from nixi on this Mac." },
        403,
      );
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    try {
      if (method === "GET" && path === "/api/status") {
        const etag = `"${epoch}-${queue.revision}-${url.search}"`;
        if (request.headers.get("if-none-match") === etag)
          return new Response(null, {
            status: 304,
            headers: { ...headers, ETag: etag },
          });
        const value = snapshot();
        const jobs =
          url.searchParams.get("compact") === "1"
            ? value.jobs.map(({ logs, ...job }) => job)
            : value.jobs;
        return Response.json(
          { ...value, jobs },
          { headers: { ...headers, ETag: etag } },
        );
      }
      if (method === "GET" && path === "/api/library") {
        const query = parseLibraryQuery(url.searchParams);
        const etag = `"${epoch}-${queue.revision}-${url.searchParams.toString()}"`;
        if (request.headers.get("if-none-match") === etag)
          return new Response(null, {
            status: 304,
            headers: { ...headers, ETag: etag },
          });
        return Response.json(
          {
            ...libraryView(queue.jobs, query),
            settings: queue.settings,
            system: snapshot().system,
            revision: queue.revision,
          },
          { headers: { ...headers, ETag: etag } },
        );
      }
      if (method === "GET" && path === "/api/events") {
        let dispose = () => {};
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            let closed = false;
            const sendText = (text: string) => {
              if (!closed)
                try {
                  controller.enqueue(encoder.encode(text));
                } catch {
                  dispose();
                }
            };
            const send = () =>
              sendText(`event: revision\ndata: ${queue.revision}\n\n`);
            const unsubscribe = queue.subscribe(send);
            const heartbeat = setInterval(
              () => sendText(": heartbeat\n\n"),
              15000,
            );
            heartbeat.unref();
            dispose = () => {
              if (closed) return;
              closed = true;
              clearInterval(heartbeat);
              unsubscribe();
              request.signal.removeEventListener("abort", dispose);
              eventStreams.delete(dispose);
              try {
                controller.close();
              } catch {
                /* The consumer already cancelled. */
              }
            };
            eventStreams.add(dispose);
            request.signal.addEventListener("abort", dispose, { once: true });
            if (request.signal.aborted) dispose();
            else send();
          },
          cancel() {
            dispose();
          },
        });
        return new Response(stream, {
          headers: {
            ...headers,
            "Content-Type": "text/event-stream",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }
      if (method === "POST" && path === "/api/jobs") {
        if (!snapshot().system.ready)
          return json(
            {
              error:
                "nixi needs yt-dlp, ffmpeg and ffprobe. Run pnpm run setup, then restart the service.",
            },
            503,
          );
        const value = await body(request);
        const opts = options(value, queue.settings);
        return json(queue.add(parseUrls(value.urls ?? value.url), opts), 201);
      }
      if (method === "POST" && path === "/api/info") {
        if (lookups >= 3)
          return json(
            {
              error: "Other previews are still loading. Try again in a moment.",
            },
            429,
          );
        const value = await body(request);
        const link = videoUrl(value.url);
        const opts = options(value, queue.settings);
        lookups++;
        const controller = new AbortController();
        activeLookups.add(controller);
        try {
          return json(
            await inspectVideo(
              link,
              opts,
              AbortSignal.any([request.signal, controller.signal]),
            ),
          );
        } finally {
          lookups--;
          activeLookups.delete(controller);
        }
      }
      if (method === "POST" && path === "/api/cookies/check") {
        if (lookups >= 3)
          return json(
            {
              error:
                "Other cookie checks or previews are still running. Try again in a moment.",
            },
            429,
          );
        const opts = options(await body(request), queue.settings);
        lookups++;
        const controller = new AbortController();
        activeLookups.add(controller);
        try {
          return json(
            await checkCookieAccess(
              opts.cookiesBrowser,
              AbortSignal.any([request.signal, controller.signal]),
            ),
          );
        } finally {
          lookups--;
          activeLookups.delete(controller);
        }
      }
      if (method === "POST" && path === "/api/cookies/permissions") {
        await open(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
        );
        return json({ ok: true });
      }
      if (method === "POST" && path === "/api/cookies/reveal-tool") {
        if (!toolPaths.ytDlp)
          throw new Error("The download tool is not installed.");
        await open(toolPaths.ytDlp, true);
        return json({ ok: true });
      }
      if (method === "PUT" && path === "/api/settings") {
        queue.updateSettings(settings(await body(request), queue.settings));
        return json(queue.settings);
      }
      if (method === "POST" && path === "/api/open-folder") {
        mkdirSync(queue.settings.downloadDir, { recursive: true });
        await open(queue.settings.downloadDir);
        return json({ ok: true });
      }
      if (method === "POST" && path === "/api/history/clear") {
        queue.clearHistory();
        return json({ ok: true });
      }
      const match =
        /^\/api\/jobs\/([a-f0-9-]+)(?:\/(cancel|retry|reveal|files)(?:\/(\d+))?)?$/.exec(
          path,
        );
      if (match) {
        let job;
        try {
          job = queue.get(match[1]);
        } catch {}
        if (!job) return json({ error: "Download not found." }, 404);
        const action = match[2];
        if (method === "GET" && !action) return json(job);
        if (method === "DELETE" && !action) {
          queue.remove(job.id);
          return json({ ok: true });
        }
        if (method === "POST" && action === "cancel")
          return json(queue.cancel(job.id));
        if (method === "POST" && action === "retry")
          return json(queue.retry(job.id));
        if (method === "POST" && action === "reveal") {
          await open(queue.file(job, Number(match[3] || 0)).path, true);
          return json({ ok: true });
        }
        if (method === "GET" && action === "files" && match[3] !== undefined) {
          let file;
          try {
            file = queue.file(job, Number(match[3]));
          } catch {
            return json(
              { error: "This file was moved or is no longer available." },
              404,
            );
          }
          return new Response(
            Readable.toWeb(createReadStream(file.path)) as ReadableStream,
            {
              headers: {
                ...headers,
                "Content-Disposition": `attachment; filename="download.${
                  file.name
                    .split(".")
                    .at(-1)
                    ?.replace(/[^a-zA-Z0-9]/g, "") || "bin"
                }"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
              },
            },
          );
        }
      }
      if (method === "GET" || method === "HEAD") {
        const decoded = decodeURIComponent(path);
        const candidate = join(
          webDir,
          decoded === "/" ? "index.html" : decoded,
        );
        const rel = relative(webDir, candidate);
        if (
          !rel.startsWith("..") &&
          !isAbsolute(rel) &&
          existsSync(candidate) &&
          statSync(candidate).isFile()
        ) {
          const types: Record<string, string> = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
            ".webmanifest": "application/manifest+json",
            ".txt": "text/plain",
          };
          const isHtml = extname(candidate) === ".html";
          let asset = assetCache.get(candidate);
          if (!asset) {
            const data = new Uint8Array(readFileSync(candidate));
            const hashes = isHtml
              ? [
                  ...new TextDecoder()
                    .decode(data)
                    .matchAll(
                      /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
                    ),
                ].map(
                  (match) =>
                    `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`,
                )
              : [];
            const csp = headers["Content-Security-Policy"]
              .replace(
                "script-src 'self'",
                `script-src 'self' ${hashes.join(" ")}`,
              )
              .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
            asset = {
              data,
              etag: `"${createHash("sha256").update(data).digest("base64url")}"`,
              csp,
            };
            assetCache.set(candidate, asset);
          }
          const assetHeaders = {
            ...headers,
            "Content-Security-Policy": asset.csp,
            "Content-Type":
              types[extname(candidate)] || "application/octet-stream",
            "Cache-Control": decoded.startsWith("/_next/static/")
              ? "public, max-age=31536000, immutable"
              : isHtml
                ? "no-cache"
                : "public, max-age=3600",
            ETag: asset.etag,
          };
          if (request.headers.get("if-none-match") === asset.etag)
            return new Response(null, { status: 304, headers: assetHeaders });
          return new Response(
            method === "HEAD" ? null : new Uint8Array(asset.data),
            { headers: assetHeaders },
          );
        }
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Something went wrong.",
        },
        400,
      );
    }
  };
  return {
    fetch,
    queue,
    snapshot,
    async shutdown() {
      for (const close of eventStreams) close();
      for (const controller of activeLookups) controller.abort();
      await queue.shutdown();
      store.close();
    },
  };
}
