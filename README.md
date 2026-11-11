# nixi

A local macOS video and audio downloader with a Next.js web interface and a Raycast extension. One Node service owns the queue, history and files; both interfaces use it.

Open [nixi](http://127.0.0.1:43174). New installs save downloads in `~/Downloads/Nixi/YYYY-MM-DD_NNN/` by default. Upgrades keep your existing download folder.

## Features

- Any HTTP/HTTPS URL supported by the installed yt-dlp, including YouTube, Instagram, TikTok, Vimeo and its other extractors. There is no site whitelist.
- QuickTime-compatible MP4 video (H.264 / AAC), original container, or MP3, M4A, Opus, FLAC and WAV audio; best quality or maximum video resolutions from 480p to 4K.
- Up to 100 links per submission, duplicate protection, 1–4 concurrent downloads, optional entire playlists and multi-video posts with all their media files.
- Optional signed-in browser cookies and English subtitles. Preview metadata before downloading, or queue directly.
- Persistent progress/history, cancel, retry using partial files, file downloads, Finder reveal and source copying. Clearing history preserves files.
- Five switchable visual decks: Phosphor (mint), Ultraviolet (orchid), Infrared (coral), Amber and Daylight (jade/light). Dark decks retain pure-black canvases. The nixi glyph, favicon, surfaces and artwork follow your choice in Preferences → Visual deck, which is remembered locally. Collection filters sit above the table.

Site availability, account requirements, geography and DRM still affect individual links. Cookie access is opt-in and may need macOS Keychain or Full Disk Access permission. nixi uses yt-dlp's supported behavior and does not bypass DRM. Converting lossy audio to a lossless container does not improve its source quality.

## Stack

| Layer             | Implementation                                                                  |
| ----------------- | ------------------------------------------------------------------------------- |
| Web               | React 19, Next.js 16 App Router, TypeScript, Tailwind 4, shadcn/ui and Radix    |
| Service           | Node 26, standard Fetch handlers through `@hono/node-server`, built-in SQLite   |
| Process lifecycle | Effect 4 scoped preview execution, timeout, cancellation and guaranteed cleanup |
| Download engine   | yt-dlp, ffmpeg and ffprobe                                                      |
| Raycast           | TypeScript/React and the Raycast API                                            |
| Testing           | Vitest, Testing Library, V8 coverage and Playwright Chromium desktop/mobile     |
| Tools             | pnpm workspace packages; mise for Node, pnpm, yt-dlp, ffmpeg and asset tools    |

Next exports a static interface served by the download service. Production needs one local process, with no separate Next server or cloud account. Effect stays on the server and out of the browser bundle.

The web interface receives small revision events over SSE instead of polling full history. Collection queries are filtered, searched and paginated, omit logs, and support ETags. Logs load only in details. Search is debounced, hidden tabs close event connections, stale requests abort, dialogs load on demand, and media streams from disk. SQLite uses WAL and cached statements. Queue indexes protect deduplication and FIFO ordering. Hashed static assets receive immutable cache headers. Raycast uses conditional requests, avoids overlapping refreshes, and refreshes less often while idle.

## Install

Install [mise](https://mise.jdx.dev/) first. All non-package tools are declared in `mise.toml`.

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm run setup
mise exec -- pnpm run install:agent
```

`setup` runs `mise install` and checks executable discovery. `install:agent` builds the static interface and registers `com.local.nixi` as your login service, recording resolved Node and download-tool paths. Keep the checkout in place while installed. No administrator access is required. Upgrading from Grabby replaces its login service and reuses its SQLite history, preferences and existing media paths.

```sh
mise exec -- pnpm run uninstall:agent
```

This removes the login service while preserving history, downloads and Raycast.

### Raycast

From the project root:

```sh
mise exec -- pnpm --dir raycast run dev
```

Raycast imports the local extension. After import, the built extension remains available when the development watcher stops.

| Command             | Action                                                                              | Search keyword |
| ------------------- | ----------------------------------------------------------------------------------- | -------------- |
| Nixi: Capture       | Typed or prefilled clipboard links, with batch, playlist and video/audio options    | nx             |
| Nixi: Quick Capture | Immediately queue clipboard links with saved defaults                               | nq             |
| Nixi: Extract Audio | Typed or clipboard links, with audio formats only                                   | na             |
| Nixi: Queue         | Active downloads and history, details/logs, Finder, cancel, retry and clear actions | nqueue         |
| Nixi: Open Panel    | Open the web interface                                                              | nixi           |

These replace the original four commands. The internal package stays stable so Raycast updates the installed extension rather than creating a duplicate. Removed commands are no longer registered. Search keywords are included; aliases and keyboard shortcuts can be assigned in Raycast Settings → Extensions.

Capture and Extract Audio prefill valid clipboard links unless a URL argument is provided. Submitting queues the work and closes Raycast so you can return to what you were doing. Extract Audio defaults to MP3 when the saved default is video, and preserves any saved audio format. Quick Capture immediately queues valid clipboard links using saved defaults. Batch and playlist capture live inside Capture; previous downloads live inside Queue. The action menu in Capture also checks cookie access.

If the service port changes, update **nixi Address** in Raycast preferences. Both interfaces use one downloader and share browser-cookie support.

### Browser cookies

Choose a signed-in browser in **More options → Cookies from**, or set **Preferences → Default browser cookies**. Zen is supported through yt-dlp’s Firefox reader using Zen’s own profile directory (`~/Library/Application Support/zen`, with `Zen` as a fallback). yt-dlp chooses the most recently active cookie database and includes its containers. It never silently substitutes Firefox or proceeds without the requested cookies.

**Check cookie access** invokes yt-dlp’s real browser reader locally, with no network request and no cookie export. It reports only success/count or actionable failure; cookie values are never included in the response. Readable cookies do not guarantee that a particular site’s login is still valid.

Safari’s **Operation not permitted** means macOS privacy protection blocked its cookie store. nixi cannot grant Full Disk Access itself. Choose Safari, click **Check cookie access**, then **Reveal download tool** and **Open Full Disk Access**. Add the revealed yt-dlp executable under System Settings → Privacy & Security → Full Disk Access, and test again. If macOS still blocks the background service, Permission details shows its exact Node runtime to allow as well; restart nixi after changing runtime access. Updates that change executable paths may require reapproval. Zen is an alternative that does not normally need Safari’s protected-store permission. Chromium browsers may request Keychain access.

### Web workflow

Paste whitespace-separated links or drop links into the composer. Preview reads one link; Capture links queues the batch. Command-Enter submits; Command-K focuses the links field. More options contains cookies, playlists and subtitles. Preferences changes the visual deck, destination, concurrency and defaults for future downloads. The queue signal shows actual active/waiting jobs and their aggregate progress; idle bars remain unlit.

Existing jobs keep their captured options/destination. Queued work survives restart. Interrupted active downloads become retryable; retry reuses the job folder and partial files. Use Finder to delete saved media.

## Development

```sh
mise exec -- pnpm run dev
```

Next development runs at `http://127.0.0.1:3000`, with a separate development service on `127.0.0.1:43175`. Production remains on port 43174. The development service uses isolated app data and downloads in `.nixi-dev/`. To serve a production build manually, use `pnpm run build` then `pnpm start` with mise active; stop the installed service first or choose another `NIXI_PORT`.

## Tests

```sh
mise exec -- pnpm run test:all
```

`test:all` checks types, builds the production export, runs unit/component/integration coverage gates and Playwright, and checks/lints/builds Raycast. Coverage gates require 85% lines/statements and 80% branches/functions overall. Individual suites are `test:unit`, `test:components`, `test:integration`, and `test:e2e`.

Tests cover URL/options validation, origin security, SQLite persistence/recovery, safe command arguments, duplicate jobs, FIFO retries, cancellation races, scoped preview cleanup, bounded request bodies, ETags, event teardown, static CSP, file-path safety, preferences, details, collection actions, search and network failures. Queue regressions and service cleanup fixes were developed with failing tests first.

MP4 downloads prefer native H.264/AAC streams. Incompatible video, audio or pixel formats are converted before a download is marked saved; compatible streams are copied without recompression. Original keeps the source file untouched and adds a `.mac.mp4` companion when the source container, codecs or chosen resolution need conversion for native Mac playback. Use the companion in QuickTime; the original remains available for archival or other players. Opus and FLAC native playback depends on macOS version; use M4A, MP3 or WAV for wider compatibility. Conversion uses temporary files and supports queue cancellation and shutdown. Capture folders use the local date and a daily index (`2026-11-10_001`, `2026-11-10_002`), reserved when queued so batches and restarts cannot reuse an existing folder.

Integration and browser tests generate short media locally, include VP9-in-MP4 regression fixtures, verify H.264/AAC output and original codec preservation, use real yt-dlp/ffmpeg/ffprobe and isolate app data/downloads in temporary folders. Playwright checks desktop and mobile layouts, all theme assets, preview, MP4/MP3, batches, multi-video posts, cancellation, retry, persistence, keyboard submission and idle network activity. Chromium is installed through the direct pnpm dependency `@playwright/browser-chromium`. No personal browser cookies or real collection files are used by these tests. Cookie tests generate isolated Zen SQLite and Safari binary-cookie stores, serve media that rejects requests without their synthetic session cookie, and verify authenticated previews/downloads, permission errors, retry recovery, missing profiles and browser-default persistence. The cookie check never exports the stores. The real-engine integration test is skipped when engine tools are unavailable; install mise tools to run the full suite.

Coverage opens at `coverage/index.html`; Playwright's report is `playwright-report/index.html`, with traces, video and screenshots retained for failures. Generated output stays out of Git.

Optional live YouTube verification (downloads a short public clip, checks video/audio streams, then removes temporary files):

```sh
mise exec -- node --import tsx scripts/smoke-youtube.ts
```

To exercise public YouTube, TikTok and Instagram links through Playwright and the real download service:

```sh
mise exec -- pnpm run test:live
```

This optional network test submits batches through the web interface, checks previews, decodes each downloaded file completely and verifies file API byte counts. It uses no browser cookies, deletes its temporary media, and writes a detailed report under `test-results/live-sites/`. Site removals or IP restrictions cause a failing exit code and are recorded separately from successful media checks. A silent source is accepted only after confirming yt-dlp exposes no audio formats. It is separate from deterministic `test:all` checks because external sites can change.

## Local data

- Listener: `127.0.0.1:43174`, local only.
- Database on new installs: `~/Library/Application Support/Nixi/nixi.sqlite`.
- Service logs: `logs/` inside the selected app-data folder.
- Media on new installs: `~/Downloads/Nixi/YYYY-MM-DD_NNN/` unless changed in Preferences.
- Tools: mise-managed paths, recorded when installing the service.

When existing Grabby data is detected, nixi reuses `~/Library/Application Support/Grabby/grabby.sqlite` and its saved download folder. It does not move media. An explicit data-directory override selects an isolated installation; otherwise an existing Nixi database takes precedence over legacy data.

URLs and engine messages remain in local history/logs, including signed URL parameters. The app-data folder is created with owner-only permissions. Host/origin checks reject foreign browser requests. yt-dlp uses argument arrays without a shell, ignores unrelated user config, and validates all options. File access rechecks real paths against each job folder. Cancellation/shutdown terminates process groups, including ffmpeg.

Environment overrides: `NIXI_PORT`, `NIXI_DATA_DIR`, `NIXI_DOWNLOAD_DIR`, `NIXI_YTDLP`, `NIXI_FFMPEG`, `NIXI_FFPROBE`, `NIXI_NODE`. `NIXI_BROWSER_HOME` changes the browser-profile home for isolated testing or custom installations. The corresponding `GRABBY_` names remain supported, with `NIXI_` taking precedence. Set them before installing the service. Reinstall after moving the checkout or changing executable paths.

## Updating tools and assets

Update the desired version in `mise.toml`, run `mise install`, then reinstall the service. Keeping yt-dlp current often resolves extractor changes.

```sh
mise exec -- pnpm run assets
```

This regenerates the original SVG glyph/wordmark, five themed empty-state and brand-card sets, matching theme icons/favicons, PNG/ICO sizes, touch icon, web manifest and Raycast icon. resvg and ImageMagick are managed by mise. No image service, remote fonts, CDN or tracking scripts are needed. See [DESIGN.md](DESIGN.md).

## References

[ReClip](https://github.com/averygan/reclip) informed batch links, format choices and multi-entry posts; Raycast's [Video Downloader](https://github.com/raycast/extensions/tree/main/extensions/video-downloader) informed clipboard capture, cookies and recovery. Source and assets are independently implemented. The local DNS Control architecture informed the shared service. The user’s nixi reference directs the glyph, restrained cyberpunk styling and phosphor-mint default; pi-choom Blackwall remains a palette influence.

`pnpm run test:macos` runs the format matrix through the real download API and Apple AVFoundation on macOS. It covers both video modes at all six quality settings, all five audio formats, VP9/Opus fallback, unknown source dimensions, 4K downscaling and companion-file preservation. Apple’s existing command line developer tools are required to compile the native checker; no app or browser is opened. Results are saved to `test-results/macos-formats.json`. These cases also run through Playwright on desktop and mobile.
