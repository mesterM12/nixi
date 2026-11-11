import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { createApp } from "../src/app";
import { Store } from "../src/store";
import { toolPaths, subprocessEnv, root } from "../src/config";
import { testServer } from "../tests/fixtures/server";
import { commonArgs, runYtDlp } from "../src/engine";
const cases = [
  { site: "YouTube", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" },
  { site: "YouTube", url: "https://www.youtube.com/watch?v=BaW_jenozKc" },
  { site: "YouTube", url: "https://www.youtube.com/watch?v=J---aiyznGQ" },
  { site: "YouTube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  {
    site: "TikTok",
    url: "https://www.tiktok.com/@patroxofficial/video/6742501081818877190",
  },
  {
    site: "TikTok",
    url: "https://www.tiktok.com/@pokemonlife22/video/7059698374567611694",
  },
  {
    site: "TikTok",
    url: "https://www.tiktok.com/@moxypatch/video/7206382937372134662",
  },
  {
    site: "TikTok",
    url: "https://www.tiktok.com/@hankgreen1/video/7047596209028074758",
  },
  { site: "Instagram", url: "https://www.instagram.com/reel/Chunk8-jurw/" },
  { site: "Instagram", url: "https://www.instagram.com/reel/CDUMkliABpa/" },
  { site: "Instagram", url: "https://www.instagram.com/reel/DeTUk4sDSp-/" },
];
const media = mkdtempSync(join(tmpdir(), "nixi-live-sites-"));
const reportDir = join(root, "test-results", "live-sites");
mkdirSync(reportDir, { recursive: true });
const app = createApp(new Store(":memory:"));
app.queue.updateSettings({
  ...app.queue.settings,
  downloadDir: media,
  concurrency: 3,
});
app.queue.start();
const server = await testServer(app.fetch);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const previous = process.argv.includes("--append")
  ? JSON.parse(readFileSync(join(reportDir, "report.json"), "utf8"))
  : undefined;
const results: Record<string, unknown>[] = previous?.results || [];
const selectedCases = previous
  ? cases.filter((item) => !results.some((result) => result.url === item.url))
  : cases;
const previews: Record<string, unknown>[] = [];
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const startedAt = new Date().toISOString();
try {
  await page.goto(server.url);
  await page.getByText("nixi is online", { exact: true }).waitFor();
  for (const site of ["YouTube", "TikTok", "Instagram"]) {
    const group = selectedCases.filter((item) => item.site === site);
    if (!group.length) continue;
    const first = group[0];
    const started = Date.now();
    try {
      const response = await fetch(server.url + "/api/info", {
        method: "POST",
        headers: { Origin: server.url, "Content-Type": "application/json" },
        body: JSON.stringify({ url: first.url }),
        signal: AbortSignal.timeout(40000),
      });
      const value = await response.json();
      previews.push({
        site,
        url: first.url,
        status: response.status,
        title: value.title,
        error: value.error,
        ms: Date.now() - started,
      });
    } catch (error) {
      previews.push({
        site,
        url: first.url,
        error: String(error),
        ms: Date.now() - started,
      });
    }
    console.log(JSON.stringify({ preview: previews.at(-1) }));
    await page
      .getByLabel("Video links", { exact: true })
      .fill(group.map((item) => item.url).join("\n"));
    await page
      .getByLabel("Maximum video resolution", { exact: true })
      .selectOption(site === "YouTube" ? "480" : "best");
    await page
      .getByRole("button", { name: "Capture links", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLTextAreaElement>("#video-links")?.value ===
        "",
    );
    const jobs = app.queue.jobs.filter((job) =>
      group.some((item) => item.url === job.url),
    );
    if (jobs.length !== group.length)
      throw new Error(
        `Expected ${group.length} ${site} jobs, got ${jobs.length}`,
      );
    const pending = new Set(jobs.map((job) => job.id));
    const deadline = Date.now() + 180000;
    while (pending.size && Date.now() < deadline) {
      for (const id of [...pending]) {
        const job = app.queue.get(id);
        if (!["completed", "failed", "cancelled"].includes(job.status))
          continue;
        const result: Record<string, unknown> = {
          site,
          url: job.url,
          status: job.status,
          title: job.title,
          error: job.error,
          files: [],
          logs: job.logs,
        };
        const files: Record<string, unknown>[] = [];
        for (const [index, file] of job.files.entries()) {
          const probe = spawnSync(
            toolPaths.ffprobe!,
            [
              "-v",
              "error",
              "-show_entries",
              "stream=codec_type,codec_name,width,height:format=duration",
              "-of",
              "json",
              file.path,
            ],
            { env: subprocessEnv(), encoding: "utf8", timeout: 15000 },
          );
          const info =
            probe.status === 0
              ? JSON.parse(probe.stdout)
              : { error: probe.stderr };
          const decode = spawnSync(
            toolPaths.ffmpeg!,
            [
              "-v",
              "error",
              "-xerror",
              "-i",
              file.path,
              "-map",
              "0:v?",
              "-map",
              "0:a?",
              "-f",
              "null",
              "-",
            ],
            { env: subprocessEnv(), encoding: "utf8", timeout: 60000 },
          );
          const response = await fetch(
            `${server.url}/api/jobs/${job.id}/files/${index}`,
          );
          const bytes = (await response.arrayBuffer()).byteLength;
          files.push({
            name: file.name,
            size: file.size,
            media: info,
            decodePassed: decode.status === 0,
            decodeError: decode.stderr || undefined,
            apiStatus: response.status,
            byteCountMatches: bytes === file.size,
            hasVideo: info.streams?.some(
              (s: { codec_type: string }) => s.codec_type === "video",
            ),
            hasAudio: info.streams?.some(
              (s: { codec_type: string }) => s.codec_type === "audio",
            ),
          });
        }
        let sourceIsSilent = false;
        if (files.length && files.some((file) => !file.hasAudio)) {
          const lines: string[] = [];
          const probe = runYtDlp(
            [
              ...commonArgs(job.options),
              "--no-playlist",
              "--skip-download",
              "--dump-single-json",
              "--",
              job.url,
            ],
            (line) => {
              if (line.startsWith("{")) lines.push(line);
            },
            40000,
          );
          const source = await probe.done;
          if (source.code === 0 && lines.length) {
            const info = JSON.parse(lines[0]);
            const formats = info.formats || [];
            sourceIsSilent =
              formats.length > 0 &&
              formats.every(
                (format: { acodec?: string }) => format.acodec === "none",
              );
            result.sourceAudioFormats = formats.map(
              (format: { format_id: string; acodec?: string }) => ({
                id: format.format_id,
                acodec: format.acodec,
              }),
            );
          }
        }
        result.sourceIsSilent = sourceIsSilent;
        result.files = files;
        result.passed =
          job.status === "completed" &&
          files.length > 0 &&
          files.every(
            (file) =>
              file.decodePassed &&
              file.hasVideo &&
              (file.hasAudio || sourceIsSilent) &&
              file.byteCountMatches &&
              file.apiStatus === 200,
          );
        const existing = results.findIndex((item) => item.url === job.url);
        if (existing >= 0) results.splice(existing, 1);
        results.push(result);
        pending.delete(id);
        console.log(JSON.stringify({ ...result, logs: undefined }));
      }
      await sleep(250);
    }
    for (const id of pending) {
      const job = app.queue.get(id);
      app.queue.cancel(id);
      results.push({
        site,
        url: job.url,
        status: "timeout",
        error: "Exceeded three-minute live-test limit",
        logs: job.logs,
        passed: false,
      });
    }
    await page.screenshot({
      path: join(reportDir, `${site.toLowerCase()}.png`),
      fullPage: true,
    });
  }
} finally {
  const report = {
    startedAt: previous?.startedAt || startedAt,
    finishedAt: new Date().toISOString(),
    cookies: "none",
    tools: toolPaths,
    previews: [...(previous?.previews || []), ...previews],
    results,
    browserErrors: [...(previous?.browserErrors || []), ...errors],
    mediaRetained: false,
  };
  writeFileSync(
    join(reportDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  const rows = results.map(
    (result) =>
      `| ${result.site} | [${String(result.title || result.url)
        .replaceAll("|", "/")
        .slice(
          0,
          70,
        )}](${result.url}) | ${result.passed ? "PASS" : "FAIL"} | ${result.error || (result.passed ? (result.sourceIsSilent ? "Video decoded; source confirmed silent; API bytes matched" : "Video/audio decoded; API file bytes matched") : "Media verification failed")} |`,
  );
  writeFileSync(
    join(reportDir, "report.md"),
    `# nixi live-site test\n\nStarted: ${previous?.startedAt || startedAt}\n\nCookies: none. Tests used the real web interface, queue, download engine and file API in an isolated temporary collection. Media was removed after verification.\n\n| Site | Video | Result | Detail |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n\nBrowser errors: ${errors.length}. Full metadata, engine errors and file checks: report.json.\n`,
  );
  await browser.close();
  server.stop();
  await app.shutdown();
  rmSync(media, { recursive: true, force: true });
  console.log(`Report: ${join(reportDir, "report.md")}`);
}
if (
  results.length !== cases.length ||
  results.some((result) => !result.passed) ||
  errors.length
)
  process.exitCode = 1;
