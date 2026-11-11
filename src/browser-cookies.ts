import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { environmentValue } from "./lib/identity";
import type { Browser } from "./types";

// Zen uses Firefox's cookie schema, but never Firefox's profile directory.
export function cookieBrowserSpec(
  browser: Browser,
  home = environmentValue("BROWSER_HOME") || homedir(),
): string | null {
  if (browser === "none") return null;
  if (browser === "zen") {
    const roots = ["zen", "Zen"].map((name) =>
      join(home, "Library/Application Support", name),
    );
    const root = roots.find((path) => existsSync(path));
    if (!root)
      throw new Error(
        "No Zen profile was found. Open Zen, sign in to the video site, then check cookie access again.",
      );
    return `firefox:${root}`;
  }
  if (browser === "safari") {
    const legacy = join(home, "Library/Cookies/Cookies.binarycookies");
    const path = existsSync(legacy)
      ? legacy
      : join(
          home,
          "Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies",
        );
    return `safari:${path}`;
  }
  return browser;
}

export function cookieError(stderr: string, browser?: Browser): string | null {
  const permission =
    /Operation not permitted|Permission denied|EACCES|EPERM/i.test(stderr);
  const safari = /safari|Cookies\.binarycookies/i.test(stderr);
  if (permission && safari)
    return "macOS blocked access to Safari cookies. In System Settings → Privacy & Security → Full Disk Access, allow nixi's download tool (yt-dlp). Use Check cookie access to reveal the exact tool and test again. You can also choose Zen instead.";
  const label =
    browser === "zen"
      ? "Zen"
      : browser === "firefox"
        ? "Firefox"
        : "your browser";
  if (permission && /cookies|keychain|firefox|zen/i.test(stderr))
    return `macOS blocked access to ${label} cookies. Check cookie access for permission guidance, then try again.`;
  if (
    /could not find.*cookies|cookies database.*not found|safari cookies database/i.test(
      stderr,
    )
  )
    return `No ${safari ? "Safari" : label} cookie store was found. Open ${safari ? "Safari" : label}, sign in to the video site, then check cookie access again.`;
  if (/keychain|decrypt.*cookie|cookie.*decrypt/i.test(stderr))
    return `Could not unlock ${label} cookies. Allow the browser's Keychain prompt, then check cookie access again.`;
  return null;
}
