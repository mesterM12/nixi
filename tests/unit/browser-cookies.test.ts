import { afterEach, expect, test, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cookieBrowserSpec, cookieError } from "../../src/browser-cookies";
import { options } from "../../src/validation";
import { browserChoices } from "../../src/lib/choices";
import { browsers } from "../../src/types";
const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0))
    rmSync(home, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
function home() {
  const value = mkdtempSync(join(tmpdir(), "nixi-browser-unit-"));
  homes.push(value);
  return value;
}
test("Zen uses its own profile root through the Firefox cookie reader", () => {
  const directory = home();
  const profile = join(directory, "Library/Application Support/zen");
  mkdirSync(profile, { recursive: true });
  expect(cookieBrowserSpec("zen", directory)).toBe(`firefox:${profile}`);
  expect(cookieBrowserSpec("none", directory)).toBeNull();
  expect(cookieBrowserSpec("chrome", directory)).toBe("chrome");
});
test("Zen detects title-case installations and gives actionable missing-profile guidance", () => {
  const directory = home();
  expect(() => cookieBrowserSpec("zen", directory)).toThrow(
    /Open Zen.*sign in/,
  );
  const profile = join(directory, "Library/Application Support/Zen");
  mkdirSync(profile, { recursive: true });
  expect(
    statSync(cookieBrowserSpec("zen", directory)!.slice("firefox:".length)).ino,
  ).toBe(statSync(profile).ino);
});
test("Safari supports the current container and the legacy cookie location", () => {
  const directory = home();
  expect(cookieBrowserSpec("safari", directory)).toBe(
    `safari:${join(directory, "Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies")}`,
  );
});
test("permission errors explain Safari Full Disk Access instead of suggesting the same browser again", () => {
  const result = cookieError(
    "ERROR: [Errno 1] Operation not permitted: '/Library/Cookies/Cookies.binarycookies'",
    "safari",
  );
  expect(result).toContain("Full Disk Access");
  expect(result).toContain("Safari");
  expect(result).not.toContain("choosing your signed-in browser");
  expect(
    cookieError("ERROR: Permission denied: cookies.sqlite", "zen"),
  ).toContain("Zen");
  expect(
    cookieError("ERROR: could not find firefox cookies database", "zen"),
  ).toContain("Open Zen");
  expect(
    cookieError("ERROR: could not find safari cookies database", "safari"),
  ).toContain("Open Safari");
  expect(cookieError("HTTP Error 404", "none")).toBeNull();
  expect(
    cookieError("ERROR: Permission denied: '/Downloads/clip.mp4'", "safari"),
  ).toBeNull();
});
test("Zen is accepted consistently by validation and the web browser selector", () => {
  const defaults = {
    format: "video",
    quality: "best",
    cookiesBrowser: "none",
    playlist: false,
    subtitles: false,
  } as const;
  expect(options({ cookiesBrowser: "zen" }, defaults).cookiesBrowser).toBe(
    "zen",
  );
  expect(browserChoices.map(([browser]) => browser)).toEqual(browsers);
  expect(() =>
    options({ cookiesBrowser: "firefox:/arbitrary/profile" }, defaults),
  ).toThrow("Invalid cookiesBrowser");
});
test("every Raycast command names the new nixi icon and the generated asset exists", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../raycast/package.json", import.meta.url),
      "utf8",
    ),
  );
  expect(manifest.icon).toBe("nixi.png");
  expect(
    manifest.commands.map((command: { name: string }) => command.name),
  ).toEqual([
    "capture",
    "quick-capture",
    "extract-audio",
    "queue",
    "open-panel",
  ]);
  expect(
    manifest.commands.map((command: { title: string }) => command.title),
  ).toEqual([
    "Nixi: Capture",
    "Nixi: Quick Capture",
    "Nixi: Extract Audio",
    "Nixi: Queue",
    "Nixi: Open Panel",
  ]);
  for (const command of manifest.commands)
    expect(command.icon).toBe("nixi.png");
  expect(
    existsSync(new URL("../../raycast/assets/nixi.png", import.meta.url)),
  ).toBe(true);
});
