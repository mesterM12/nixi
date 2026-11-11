# When a capture needs a hand

[← Back to Nixi](../README.md)

## Browser cookies

Choose **More options → Cookies from** for one capture, or **Preferences → Default browser cookies** for future captures. Use a browser where you are signed in to the source site.

**Check cookie access** runs yt-dlp's real browser reader locally, without a network request or cookie export. It reports a count or an actionable error; cookie values are never included in its response. Access to a readable cookie store does not guarantee that the site's login is still valid.

### Zen

Choose **Zen** directly. Nixi passes Zen's own Firefox-compatible profile root to yt-dlp: `~/Library/Application Support/zen`, with `Zen` as a case fallback. yt-dlp reads the most recently active cookie database, including containers. Nixi does not substitute an unrelated Firefox profile.

If no profile is found, open Zen, visit the source site and sign in, then check cookie access again.

### Safari: “Operation not permitted”

macOS privacy protection is blocking the cookie store. Nixi cannot grant Full Disk Access itself.

1. Choose Safari and click **Check cookie access**.
2. Click **Reveal download tool** to locate the exact yt-dlp executable.
3. Click **Open Full Disk Access** and add that executable in System Settings → Privacy & Security → Full Disk Access.
4. Check access again. If the background service is still blocked, expand **Permission details** for the exact Node runtime to allow too; restart Nixi after changing runtime access.

Updating tools can change executable paths and require renewed access. Zen is an alternative that does not normally need Safari's protected-store permission. Chromium-based browsers may request Keychain access.

## Playback

### An MP4 won't open in QuickTime

The `.mp4` extension describes a container; its video codec also matters. Nixi's **Video · MP4** output checks for H.264 video, a compatible pixel format and AAC audio before it marks a capture saved. It converts incompatible streams and copies compatible ones without recompression.

Older files downloaded before this behavior may still contain VP9 or another unsupported codec. Changing their extension will not fix that. Capture the link again with **Video · MP4** to generate a compatible file.

### An Original won't open

**Video · Original** preserves the source. If that source needs a different container, codecs or resolution for native Mac playback, Nixi saves a companion ending in **`.mac.mp4`**. Open the companion in QuickTime; keep the original for archival or a player supporting its source format.

Choosing a lower resolution can produce a resized companion while leaving the original dimensions unchanged. When a native-compatible MP4 already meets the chosen limit, an extra copy isn't needed.

### Which audio format should I choose?

**M4A**, **MP3** and **WAV** provide wider compatibility across macOS versions. Opus and FLAC also passed native decoding on the development Mac, but older system versions can differ. FLAC and WAV do not restore detail already lost in the source recording.

## Links, quality and interrupted downloads

**A site asks for login or rejects a link.** Choose the signed-in browser, check cookie access and retry. A removed post, expired session, region restriction or DRM can still prevent a download. Updating yt-dlp can resolve site extractor changes.

**A lower resolution isn't available.** Nixi prefers an available stream within the limit. If only a larger stream is available, it can resize the playable MP4 after download. Unknown source heights are inspected after download. Original sources remain untouched.

**A capture was interrupted.** Queued captures survive a restart. An interrupted active capture becomes retryable. Retry uses its existing folder and partial files; settings changes apply to new captures rather than rewriting existing options.

**The same link is already queued.** Duplicate protection suppresses an active capture with the same URL and options. Different formats can be queued independently.

**A multi-video post produced several files.** Nixi keeps each media item. Original companions can add more files; open capture details to see them all.

**Clear finished or remove from history.** These actions keep the downloaded files. Use Finder to delete media you no longer need.

## Service and installation

### The panel or Raycast says Nixi is offline

From the checkout:

```sh
mise exec -- pnpm run install:agent
```

This rebuilds the interface and registers the local login service. Open [127.0.0.1:43174](http://127.0.0.1:43174). If you changed the port, update **nixi Address** in Raycast preferences too.

Keep the checkout in place. If you rename or move it, reinstall the service from its new location. You do not need to delete history or downloads.

### A tool is missing

```sh
mise trust
mise install
mise exec -- pnpm run setup
mise exec -- pnpm run install:agent
```

Non-package tools are declared in `mise.toml`; JavaScript packages use pnpm. To update yt-dlp or ffmpeg, change its declared mise version and reinstall the service after installing the updated tool.

### Remove the login service

```sh
mise exec -- pnpm run uninstall:agent
```

This removes the login service while preserving history, downloads and the Raycast extension.

## Where things live

| Item                 | Default location                                 |
| -------------------- | ------------------------------------------------ |
| Captures             | `~/Downloads/Nixi/YYYY-MM-DD_NNN/`               |
| New-install database | `~/Library/Application Support/Nixi/nixi.sqlite` |
| Service logs         | `logs/` inside the selected app-data folder      |
| Login service        | `~/Library/LaunchAgents/com.local.nixi.plist`    |
| Development data     | `.nixi-dev/` in the checkout                     |

Folders use the Mac's local calendar date. The daily index is reserved when a capture is queued, so a canceled capture can leave an empty numbered folder; an existing index is not overwritten.

Upgrades from Grabby reuse `~/Library/Application Support/Grabby/grabby.sqlite`, its saved preferences and existing media paths. Renaming the app or checkout does not require renaming that legacy data directory. An existing Nixi database takes precedence unless a data-directory override is set.

History and logs can contain source URLs, including signed parameters. The data folder is created with owner-only permissions. Avoid sharing raw database files, browser cookies or unedited logs when reporting an issue.

For configuration variables and test reports, see the [development guide](DEVELOPMENT.md).
