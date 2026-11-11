import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { formatCases } from "../fixtures/format-media";
import { macosMediaChecker } from "../fixtures/macos-media";
import type { Job } from "../../src/types";
let directory: string;
let native: ReturnType<typeof macosMediaChecker> | undefined;
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "nixi-formats-e2e-"));
  if (process.platform === "darwin") native = macosMediaChecker(directory);
});
test.afterAll(() => rmSync(directory, { recursive: true, force: true }));
for (const entry of formatCases)
  test(`capture format: ${entry.name}`, async ({ page, request }) => {
    const headers = { Origin: "http://127.0.0.1:43274" };
    await request.post("/api/history/clear", { headers });
    await request.put("/api/settings", {
      headers,
      data: { cookiesBrowser: "none", format: "video", quality: "best" },
    });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Capture links", exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel("Download format", { exact: true })
      .selectOption(entry.format);
    const quality = page.getByLabel("Maximum video resolution", {
      exact: true,
    });
    if (["video", "original"].includes(entry.format))
      await quality.selectOption(entry.quality);
    else await expect(quality).toBeDisabled();
    if (entry.format === "original")
      await expect(
        page.getByText(
          "The original stays untouched. A playable MP4 is added when needed.",
        ),
      ).toBeVisible();
    await page
      .getByLabel("Video links", { exact: true })
      .fill(`http://127.0.0.1:43275/formats${entry.source}`);
    await page
      .getByRole("button", { name: "Capture links", exact: true })
      .click();
    const row = page.getByTestId("download-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Saved");
    const job = (await (await request.get("/api/status")).json())
      .jobs[0] as Job;
    expect(job.options).toMatchObject({
      format: entry.format,
      quality: entry.quality,
    });
    expect(basename(job.directory)).toMatch(/^\d{4}-\d{2}-\d{2}_\d{3,}$/);
    expect(job.files).toHaveLength(entry.companion ? 2 : 1);
    const index = entry.companion ? 1 : 0;
    const file = await request.get(`/api/jobs/${job.id}/files/${index}`);
    expect(file.ok()).toBe(true);
    expect((await file.body()).byteLength).toBe(job.files[index].size);
    if (native) {
      const result = native(job.files[index].path);
      expect(result.error, JSON.stringify(result)).toBeUndefined();
      expect(result).toMatchObject({ playable: true, completed: true });
      expect(result.audioSamples).toBeGreaterThan(0);
      if (entry.height) expect(result.videoSamples).toBeGreaterThan(0);
    }
  });
