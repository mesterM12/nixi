import { afterEach, expect, test, vi } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createApp } from "../../src/app";
import { Store } from "../../src/store";
import { subprocessEnv, toolPaths } from "../../src/config";
import { testServer } from "../fixtures/server";
import {
  browserCookieFixtures,
  cookieValue,
  hasFixtureCookie,
} from "../fixtures/browser-cookies";
afterEach(() => vi.unstubAllEnvs());
test("real Zen and Safari cookie readers authenticate previews and downloads, with permission recovery", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nixi-cookie-integration-"));
  const home = join(directory, "home");
  const fixture = browserCookieFixtures(home);
  vi.stubEnv("NIXI_BROWSER_HOME", home);
  const mediaPath = join(directory, "media.mp4");
  expect(
    spawnSync(
      toolPaths.ffmpeg!,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=160x90:r=10:d=1",
        "-c:v",
        "libx264",
        mediaPath,
      ],
      { env: subprocessEnv() },
    ).status,
  ).toBe(0);
  let authenticated = 0;
  const media = await testServer((request) => {
    if (!hasFixtureCookie(request))
      return new Response("Sign in required", { status: 401 });
    authenticated++;
    return new Response(new Uint8Array(readFileSync(mediaPath)), {
      headers: { "Content-Type": "video/mp4" },
    });
  });
  const app = createApp(new Store(":memory:"));
  app.queue.updateSettings({
    ...app.queue.settings,
    downloadDir: join(directory, "downloads"),
  });
  const service = await testServer(app.fetch);
  app.queue.start();
  const request = (path: string, body: unknown) =>
    fetch(service.url + path, {
      method: "POST",
      headers: { Origin: service.url, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  async function wait(id: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const job = app.queue.get(id);
      if (
        ["failed", "completed"].includes(job.status) &&
        app.queue.active === 0
      )
        return job;
      await sleep(50);
    }
    throw new Error("Cookie fixture timed out");
  }
  try {
    expect(
      (await request("/api/info", { url: media.url + "/auth.mp4" })).status,
    ).toBe(400);
    for (const browser of ["zen", "safari"]) {
      const check = await request("/api/cookies/check", {
        cookiesBrowser: browser,
      });
      expect(await check.json()).toMatchObject({ browser, ok: true, count: 1 });
      const preview = await request("/api/info", {
        url: media.url + "/auth.mp4",
        cookiesBrowser: browser,
      });
      expect(preview.status, await preview.text()).toBe(200);
      const queued = await request("/api/jobs", {
        url: media.url + "/auth.mp4",
        cookiesBrowser: browser,
      });
      const job = await wait((await queued.json()).jobs[0].id);
      expect(job.status, job.error || "").toBe("completed");
      expect(job.files).toHaveLength(1);
      expect(job.options.cookiesBrowser).toBe(browser);
      expect(job.logs).not.toContain(cookieValue);
      expect(
        (await fetch(service.url + `/api/jobs/${job.id}/files/0`)).status,
      ).toBe(200);
    }
    expect(authenticated).toBeGreaterThanOrEqual(4);
    chmodSync(fixture.safari, 0);
    const denied = await request("/api/cookies/check", {
      cookiesBrowser: "safari",
    });
    expect(await denied.json()).toMatchObject({
      ok: false,
      permissionRequired: true,
      message: expect.stringContaining("Full Disk Access"),
    });
    const deniedPreview = await request("/api/info", {
      url: media.url + "/auth.mp4",
      cookiesBrowser: "safari",
    });
    expect(deniedPreview.status).toBe(400);
    expect((await deniedPreview.json()).error).toContain("Full Disk Access");
    const queued = await request("/api/jobs", {
      url: media.url + "/auth.mp4",
      cookiesBrowser: "safari",
    });
    const failed = await wait((await queued.json()).jobs[0].id);
    expect(failed.error).toContain("Full Disk Access");
    chmodSync(fixture.safari, 0o600);
    expect(
      await (
        await request("/api/cookies/check", { cookiesBrowser: "safari" })
      ).json(),
    ).toMatchObject({ ok: true, count: 1 });
    expect((await request(`/api/jobs/${failed.id}/retry`, {})).status).toBe(
      200,
    );
    expect((await wait(failed.id)).status).toBe("completed");
    renameSync(
      join(home, "Library/Application Support/zen"),
      join(home, "Library/Application Support/zen-missing"),
    );
    expect(
      await (
        await request("/api/cookies/check", { cookiesBrowser: "zen" })
      ).json(),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("Open Zen"),
    });
    expect(
      (
        await request("/api/cookies/check", {
          cookiesBrowser: "firefox:/arbitrary",
        })
      ).status,
    ).toBe(400);
    for (const path of ["check", "permissions", "reveal-tool"]) {
      expect(
        (
          await fetch(service.url + `/api/cookies/${path}`, {
            method: "POST",
            headers: { Origin: "https://foreign.test" },
          })
        ).status,
      ).toBe(403);
    }
  } finally {
    chmodSync(fixture.safari, 0o600);
    service.stop();
    media.stop();
    await app.shutdown();
    rmSync(directory, { recursive: true, force: true });
  }
}, 60000);
