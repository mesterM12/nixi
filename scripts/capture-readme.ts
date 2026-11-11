import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { testServer } from "../tests/fixtures/server";
import { themes, type Theme } from "../src/lib/theme";
import type { Job } from "../src/types";

// Set isolated paths before loading app configuration. Never open the installed DB.
const root = resolve(import.meta.dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "nixi-readme-"));
process.env.NIXI_DATA_DIR = join(directory, "data");
process.env.NIXI_DOWNLOAD_DIR = join(directory, "downloads");
process.env.NIXI_BROWSER_HOME = join(directory, "home");
const { Store } = await import("../src/store");
const { createApp } = await import("../src/app");
const { dataDir, database } = await import("../src/config");
if (dataDir !== join(directory, "data") || !database.startsWith(dataDir + "/"))
  throw new Error("Documentation capture requires isolated temporary storage.");
const assets = join(root, "docs/assets");
mkdirSync(assets, { recursive: true });
const inner = (file: string) =>
  readFileSync(join(root, file), "utf8")
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 420" fill="none" role="img" aria-labelledby="title desc">
<title id="title">nixi — Capture what moves.</title><desc id="desc">Phosphor mint on pure black. Nixi's crossed signal glyph, lowercase wordmark and capture tagline.</desc>
<rect width="1440" height="420" rx="24" fill="#000000"/>
<rect x="1" y="1" width="1438" height="418" rx="23" stroke="#303a46"/>
<g transform="translate(60 44) scale(.66)">${inner("public/wordmark.svg")}</g>
<text x="60" y="142" fill="#a9f5df" font-family="ui-monospace,monospace" font-size="12" letter-spacing="2.5">VIDEO / AUDIO / YOURS TO KEEP</text>
<text x="56" y="219" fill="#edf1f4" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="62" font-weight="600" letter-spacing="-2.5">Capture what moves.</text>
<text x="60" y="265" fill="#8e9ba9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="20">A quiet little utility for keeping the internet close.</text>
<path d="M60 310h760" stroke="#303a46"/>
<text x="60" y="356" fill="#8e9ba9" font-family="ui-monospace,monospace" font-size="12" letter-spacing="1.5">LOCAL ON YOUR MAC</text>
<circle cx="284" cy="352" r="3" fill="#a9f5df"/>
<text x="304" y="356" fill="#8e9ba9" font-family="ui-monospace,monospace" font-size="12" letter-spacing="1.5">WEB + RAYCAST</text>
<g transform="translate(1030 58) scale(.58)">${inner("public/icon.svg")}</g>
${Array.from({ length: 22 }, (_, i) => `<rect x="${1030 + i * 13.5}" y="${369 - (i % 4) * 4}" width="7" height="${10 + (i % 4) * 4}" rx="2" fill="${i < 13 ? "#a9f5df" : "#181d25"}"/>`).join("")}
</svg>`;
writeFileSync(join(assets, "banner.svg"), banner + "\n");

const thumbnail = (index: number) => {
  const accents = ["#a9f5df", "#c4b0ff", "#ffada7", "#f2ce8a"];
  const a = accents[index];
  const art = [
    `<circle cx="128" cy="26" r="11" fill="${a}" opacity=".8"/><path d="M0 86 35 62 56 74 91 37 160 80v20H0" fill="#1b3435"/><path d="M10 100 94 44 70 100" fill="${a}" opacity=".3"/>`,
    `<circle cx="80" cy="50" r="33" stroke="${a}" stroke-width="2"/><circle cx="80" cy="50" r="20" stroke="${a}" stroke-width="9" opacity=".35"/><path d="M18 50h124M80 8v84" stroke="${a}" opacity=".45"/>`,
    `<path d="M0 85 40 35l40 50 40-50 40 50" stroke="${a}" stroke-width="3"/><path d="M0 60 40 10l40 50 40-50 40 50" stroke="${a}" opacity=".3" stroke-width="3"/>`,
    Array.from(
      { length: 17 },
      (_, i) =>
        `<rect x="${14 + i * 8}" y="${50 - (8 + ((i * 13) % 25))}" width="3" height="${2 * (8 + ((i * 13) % 25))}" rx="1.5" fill="${a}" opacity="${0.4 + (i % 3) * 0.25}"/>`,
    ).join(""),
  ][index];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#0c1218"/>${art}</svg>`;
};
const store = new Store(":memory:");
store.saveSettings({
  ...store.settings(),
  downloadDir: "/Users/you/Downloads/Nixi",
  concurrency: 2,
});
let app: ReturnType<typeof createApp> | undefined;
const server = await testServer((request) => {
  const path = new URL(request.url).pathname;
  const match = /^\/__readme\/thumbnail-(\d)\.svg$/.exec(path);
  if (match)
    return new Response(thumbnail(Number(match[1])), {
      headers: { "Content-Type": "image/svg+xml" },
    });
  if (path === "/__readme/banner.svg")
    return new Response(banner, {
      headers: { "Content-Type": "image/svg+xml" },
    });
  return app ? app.fetch(request) : new Response("Starting", { status: 503 });
});
const samples = [
  {
    title: "Night walk / after the last train",
    site: "YouTube",
    format: "video",
    size: 65_431_552,
    count: 1,
  },
  {
    title: "Small scenes, saved for later",
    site: "Instagram",
    format: "original",
    size: 14_680_064,
    count: 2,
  },
  {
    title: "A loop worth keeping",
    site: "TikTok",
    format: "video",
    size: 7_969_177,
    count: 1,
  },
  {
    title: "Late-night radio / an hour offline",
    site: "Vimeo",
    format: "mp3",
    size: 26_214_400,
    count: 1,
  },
] as const;
for (const [index, sample] of samples.entries()) {
  const id = `demo-${index + 1}`;
  const directory = `/Users/you/Downloads/Nixi/2026-11-10_00${index + 1}`;
  const ext =
    sample.format === "mp3"
      ? "mp3"
      : sample.format === "original"
        ? "webm"
        : "mp4";
  const files: Job["files"] = [
    {
      path: join(directory, `capture.${ext}`),
      name: `capture.${ext}`,
      size: sample.size,
    },
  ];
  if (sample.count === 2)
    files.push({
      path: join(directory, "capture.mac.mp4"),
      name: "capture.mac.mp4",
      size: 20_971_520,
    });
  store.save({
    id,
    url: `https://example.com/nixi-demo/${index + 1}`,
    title: sample.title,
    site: sample.site,
    thumbnail: `${server.url}/__readme/thumbnail-${index}.svg`,
    status: "completed",
    options: {
      format: sample.format,
      quality: "best",
      cookiesBrowser: "none",
      playlist: false,
      subtitles: false,
    },
    directory,
    progress: 100,
    speed: null,
    eta: null,
    files,
    error: null,
    logs: "Documentation sample collection.",
    queuedAt: 4 - index,
    createdAt: `2026-11-10T${String(18 - index).padStart(2, "0")}:00:00.000Z`,
    updatedAt: `2026-11-10T${String(18 - index).padStart(2, "0")}:00:00.000Z`,
  } satisfies Job);
}
app = createApp(store);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1360, height: 1040 },
  deviceScaleFactor: 1,
});
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const screenshot = async (file: string, fullPage = true) => {
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(
        images.map((image) =>
          (image as HTMLImageElement).decode().catch(() => {}),
        ),
      ),
    );
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: join(assets, file),
    fullPage,
    animations: "disabled",
  });
};
try {
  await page.goto(server.url);
  await page.getByText("nixi is online", { exact: true }).waitFor();
  await page.getByTestId("download-row").nth(3).waitFor();
  for (const theme of Object.keys(themes) as Theme[]) {
    await page
      .getByRole("button", { name: "Preferences", exact: true })
      .click();
    await page.getByLabel("Visual deck", { exact: true }).selectOption(theme);
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      (value) => document.documentElement.dataset.deck === value,
      theme,
    );
    await screenshot(`workspace-${theme}.png`);
  }
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Visual deck", { exact: true })
    .selectOption("phosphor");
  await page
    .getByLabel("Default browser cookies", { exact: true })
    .selectOption("zen");
  await page.getByRole("heading", { name: "Preferences", exact: true }).click();
  await screenshot("preferences.png", false);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 393, height: 1020 });
  await screenshot("workspace-mobile.png");
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    join(assets, "README.md"),
    `# Documentation images\n\nReal interface screenshots captured with headless Playwright against an isolated in-memory collection. Sample titles, artwork and media metadata are illustrative; no personal downloads or browser cookies are used. The banner and sample thumbnails are original SVG artwork generated from Nixi's existing mark, wordmark and theme colors.\n\nRegenerate from the project root:\n\n\`\`\`sh\nmise exec -- pnpm run docs:screenshots\n\`\`\`\n\nThe capture script refuses to load app storage outside its temporary directory and closes its temporary service/browser when finished. It does not open the desktop browser, Raycast, Finder or System Settings.\n`,
  );
  console.log(
    `Captured ${Object.keys(themes).length} themes, preferences and mobile in ${assets}`,
  );
} finally {
  await browser.close();
  server.stop();
  await app.shutdown();
  rmSync(directory, { recursive: true, force: true });
}
