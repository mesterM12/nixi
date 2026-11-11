import { spawnSync } from "node:child_process";
import { toolPaths, subprocessEnv } from "../../src/config";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
const origin = "http://127.0.0.1:43274";
const source = "http://127.0.0.1:43275";
const headers = { Origin: origin };
async function clean(request: APIRequestContext) {
  let status = await (await request.get("/api/status")).json();
  for (const job of status.jobs)
    if (
      ["queued", "extracting", "downloading", "processing"].includes(job.status)
    )
      await request.post(`/api/jobs/${job.id}/cancel`, { headers });
  await expect
    .poll(async () => {
      const s = await (await request.get("/api/status")).json();
      return s.system.active;
    })
    .toBe(0);
  await request.post("/api/history/clear", { headers });
  await request.put("/api/settings", {
    headers,
    data: {
      format: "video",
      quality: "best",
      cookiesBrowser: "none",
      playlist: false,
      subtitles: false,
      concurrency: 2,
    },
  });
}
async function grab(page: Page, url: string) {
  await page.getByLabel("Video links", { exact: true }).fill(url);
  await page
    .getByRole("button", { name: "Capture links", exact: true })
    .click();
}
test.beforeEach(async ({ request, page }) => {
  await clean(request);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Capture links", exact: true }),
  ).toBeEnabled();
});
test("single workspace is accessible, pure black, responsive and quiet while idle", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("heading", { name: "Capture what moves." }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Filter downloads" }),
  ).toBeVisible();
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(0, 0, 0)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/library")) requests++;
  });
  await page.waitForTimeout(2400);
  expect(requests).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/nixi-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
test("all five decks update logo and favicon and persist across reloads", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  for (const theme of [
    "phosphor",
    "ultraviolet",
    "infrared",
    "amber",
    "daylight",
  ]) {
    await page.getByLabel("Visual deck", { exact: true }).selectOption(theme);
    await expect(page.locator("#brand-icon")).toHaveAttribute(
      "src",
      `/icon-${theme}.svg`,
    );
    await expect(
      page.locator('link[rel="icon"][type="image/svg+xml"]'),
    ).toHaveAttribute("href", `/icon-${theme}.svg`);
    expect(await page.locator("html").getAttribute("data-deck")).toBe(theme);
    for (const asset of [
      `/icon-${theme}.svg`,
      `/favicon-32-${theme}.png`,
      `/empty-art-${theme}.svg`,
    ]) {
      expect((await page.request.get(asset)).ok()).toBe(true);
    }
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-deck", theme);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `test-results/nixi-${theme}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Preferences", exact: true })
      .click();
    await page.screenshot({
      path: `test-results/nixi-${theme}-preferences-${test.info().project.name}.png`,
      fullPage: true,
    });
  }
  await page
    .getByLabel("Visual deck", { exact: true })
    .selectOption("daylight");
  expect(
    await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).colorScheme),
  ).toBe("light");
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(242, 244, 241)");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `test-results/nixi-daylight-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Visual deck", { exact: true })
    .selectOption("ultraviolet");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("#brand-icon")).toHaveAttribute(
    "src",
    "/icon-ultraviolet.svg",
  );
});
test("preview, real MP4 download, file retrieval and history preservation", async ({
  page,
  request,
}) => {
  await page
    .getByLabel("Video links", { exact: true })
    .fill(source + "/one.mp4");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".preview-card")).toBeVisible();
  await page
    .getByRole("button", { name: "Capture links", exact: true })
    .click();
  const row = page.getByTestId("download-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Saved");
  await row.locator(".job-title").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const link = page.getByRole("link", { name: /Download .*\.mp4/ });
  const response = await request.get((await link.getAttribute("href"))!);
  expect(response.ok()).toBe(true);
  expect((await response.body()).byteLength).toBeGreaterThan(1000);
  const path = (await (await request.get("/api/status")).json()).jobs[0]
    .files[0].path;
  const probe = spawnSync(
    toolPaths.ffprobe!,
    ["-v", "error", "-show_streams", "-of", "json", path],
    { env: subprocessEnv(), encoding: "utf8" },
  );
  expect(probe.status).toBe(0);
  const streams = JSON.parse(probe.stdout).streams;
  expect(
    streams.find((s: { codec_type: string }) => s.codec_type === "video"),
  ).toMatchObject({
    codec_name: "h264",
    pix_fmt: "yuv420p",
    codec_tag_string: "avc1",
  });
  expect(
    streams.find((s: { codec_type: string }) => s.codec_type === "audio"),
  ).toMatchObject({ codec_name: "aac", profile: "LC" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear finished" }).click();
  await expect(row).toHaveCount(0);
  const { existsSync } = await import("node:fs");
  expect(existsSync(path)).toBe(true);
});
test("batch MP3 conversion, duplicate links, search and collection filters", async ({
  page,
}) => {
  await page.getByLabel("Download format", { exact: true }).selectOption("mp3");
  await expect(page.getByLabel("Maximum video resolution")).toBeDisabled();
  await grab(page, `${source}/one.mp4\n${source}/two.mp4\n${source}/one.mp4`);
  const rows = page.getByTestId("download-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Saved" })).toHaveCount(2);
  await page.getByRole("button", { name: /^Completed 2/ }).click();
  await expect(rows).toHaveCount(2);
  await page.getByLabel("Search downloads").fill("two");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("two");
  await page.getByLabel("Search downloads").fill("");
  await page.getByRole("button", { name: /^In progress 0/ }).click();
  await expect(
    page.getByText("All quiet on the download front."),
  ).toBeVisible();
});
test("multi-video posts retain both media files", async ({ page }) => {
  await grab(page, source + "/multi");
  const row = page.getByTestId("download-row");
  await expect(row).toContainText("Saved");
  await expect(row).toContainText("2 files");
  await row.locator(".job-title").click();
  await expect(page.getByRole("dialog").locator(".file-row")).toHaveCount(2);
});
test("errors are actionable; cancel and retry use the real queue", async ({
  page,
}) => {
  await grab(page, source + "/missing");
  const failed = page.getByTestId("download-row");
  await expect(failed).toContainText("Failed");
  await expect(failed).toContainText("404");
  await failed.getByRole("button", { name: "Retry download" }).click();
  await expect(failed).toContainText("Failed");
  await grab(page, source + "/slow.mp4");
  const slow = page.getByTestId("download-row").filter({ hasText: "slow" });
  await slow.getByRole("button", { name: "Cancel download" }).click();
  await expect(slow).toContainText("Cancelled");
  await page.getByRole("button", { name: /^Needs attention 2/ }).click();
  await expect(page.getByTestId("download-row")).toHaveCount(2);
});
test("preferences persist and become the next grab's defaults", async ({
  page,
  request,
}) => {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Default format", { exact: true }).selectOption("m4a");
  await page.getByLabel("Default quality", { exact: true }).selectOption("720");
  await page
    .getByLabel("Simultaneous downloads", { exact: true })
    .selectOption("1");
  await page
    .getByLabel("Default browser cookies", { exact: true })
    .selectOption("firefox");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Download format", { exact: true })).toHaveValue(
    "m4a",
  );
  const state = await (await request.get("/api/status")).json();
  expect(state.settings).toMatchObject({
    format: "m4a",
    quality: "720",
    concurrency: 1,
    cookiesBrowser: "firefox",
  });
  await page.reload();
  await expect(page.getByLabel("Download format", { exact: true })).toHaveValue(
    "m4a",
  );
});
test("keyboard submit and invalid input retain focus and protect the API", async ({
  page,
}) => {
  await grab(page, "file:///etc/passwd");
  await expect(page.locator(".form-error")).toContainText("http or https");
  await page
    .getByLabel("Video links", { exact: true })
    .fill(source + "/one.mp4");
  await page.keyboard.press("Meta+Enter");
  await expect(page.getByTestId("download-row")).toContainText("Saved");
});
test("disconnects retain links and report a useful offline state", async ({
  page,
}) => {
  await page
    .getByLabel("Video links", { exact: true })
    .fill(source + "/one.mp4");
  await page.route("**/api/jobs", (route) => route.abort());
  await page
    .getByRole("button", { name: "Capture links", exact: true })
    .click();
  await expect(page.locator(".form-error")).toBeVisible();
  await expect(page.getByLabel("Video links", { exact: true })).toHaveValue(
    source + "/one.mp4",
  );
});
test("Zen cookies authenticate preview and capture and persist as the default", async ({
  page,
  request,
}) => {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Default browser cookies", { exact: true })
    .selectOption("zen");
  await page
    .getByRole("button", { name: "Check cookie access", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Cookie access works. 1 cookies loaded.",
  );
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.reload();
  await page.locator(".advanced > summary").click();
  await expect(page.getByLabel("Cookies from", { exact: true })).toHaveValue(
    "zen",
  );
  await page
    .getByLabel("Video links", { exact: true })
    .fill(source + "/auth.mp4");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".preview-card")).toBeVisible();
  await page
    .getByRole("button", { name: "Capture links", exact: true })
    .click();
  await expect(page.getByTestId("download-row")).toContainText("Saved");
  const job = (await (await request.get("/api/status")).json()).jobs[0];
  expect(job.options.cookiesBrowser).toBe("zen");
  expect(job.logs).not.toContain("fixture-only-cookie-token");
  expect((await request.get(`/api/jobs/${job.id}/files/0`)).ok()).toBe(true);
});
test("Safari permission guidance leads to an authenticated retry after access is restored", async ({
  page,
  request,
}) => {
  await request.post(source + "/__fixtures/safari?locked=true");
  try {
    await page.locator(".advanced > summary").click();
    await page
      .getByLabel("Cookies from", { exact: true })
      .selectOption("safari");
    await page
      .getByRole("button", { name: "Check cookie access", exact: true })
      .click();
    await expect(page.locator(".cookie-access")).toContainText(
      "Full Disk Access",
    );
    await expect(
      page.getByRole("button", { name: "Open Full Disk Access" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reveal download tool" }),
    ).toBeVisible();
    await page
      .getByLabel("Video links", { exact: true })
      .fill(source + "/auth.mp4");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".composer > .form-error")).toContainText(
      "Full Disk Access",
    );
    await page
      .getByRole("button", { name: "Capture links", exact: true })
      .click();
    await expect(page.getByTestId("download-row")).toContainText(
      "Full Disk Access",
    );
    await request.post(source + "/__fixtures/safari?locked=false");
    await page
      .getByRole("button", { name: "Check cookie access", exact: true })
      .click();
    await expect(page.locator(".cookie-access")).toContainText(
      "Cookie access works. 1 cookies loaded.",
    );
    await page.getByRole("button", { name: "Retry download" }).click();
    await expect(page.getByTestId("download-row")).toContainText("Saved");
    await page
      .getByLabel("Video links", { exact: true })
      .fill(source + "/auth.mp4");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".preview-card")).toBeVisible();
  } finally {
    await request.post(source + "/__fixtures/safari?locked=false");
  }
});
