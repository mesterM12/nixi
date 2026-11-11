# Developing nixi

[← Back to Nixi](../README.md)

Nixi has one local service and two clients. The browser and Raycast extension share a queue, preferences and SQLite history. Downloads belong to the service and continue independently of either interface.

## Stack

| Layer             | Implementation                                                                 |
| ----------------- | ------------------------------------------------------------------------------ |
| Web               | React 19, Next.js 16 App Router, TypeScript, Tailwind 4, shadcn/ui and Radix   |
| Service           | Node 26, standard Fetch handlers through `@hono/node-server`, built-in SQLite  |
| Process lifecycle | Effect 4 scoped previews, timeout, cancellation and cleanup                    |
| Download engine   | yt-dlp, ffmpeg and ffprobe                                                     |
| Raycast           | TypeScript, React and the Raycast API                                          |
| Tests             | Vitest, Testing Library, V8 coverage and Playwright Chromium                   |
| Toolchain         | pnpm workspace dependencies; mise for runtimes, download tools and asset tools |

Next exports static files to `out/`; the download service serves them alongside the API. Production runs as one process. Effect stays on the server and out of the browser bundle.

## Run locally

After [installing dependencies](../README.md#get-started):

```sh
mise exec -- pnpm run dev
```

| Process                        | Address                  | Storage                    |
| ------------------------------ | ------------------------ | -------------------------- |
| Next development interface     | `http://127.0.0.1:3000`  | Browser preferences        |
| Development API and downloader | `http://127.0.0.1:43175` | `.nixi-dev/`               |
| Installed service              | `http://127.0.0.1:43174` | The user's app-data folder |

The development service isolates its history and downloads from the installed app. To serve a production export manually, run `mise exec -- pnpm run build`, then `mise exec -- pnpm start`. Stop the installed service first, or select another `NIXI_PORT`.

For Raycast development:

```sh
mise exec -- pnpm --dir raycast run dev
```

The internal extension package remains named `grabby` to update existing installations without creating a duplicate. User-visible identity and all five commands are Nixi. Do not change that package ID as part of a cosmetic rename.

## Project map

| Path                     | Responsibility                                                  |
| ------------------------ | --------------------------------------------------------------- |
| `app/`                   | Next entry point, layout and visual styles                      |
| `src/components/nixi/`   | Capture composer, collection, preferences and details           |
| `src/app.ts`             | Local API, static export and media-file responses               |
| `src/queue.ts`           | Queue ordering, deduplication, state and cancellation           |
| `src/engine.ts`          | yt-dlp arguments, output parsing and process groups             |
| `src/media.ts`           | Codec checks, MP4 normalization and Original companions         |
| `src/folders.ts`         | Daily folder indexes and legacy-folder migration helper         |
| `src/store.ts`           | SQLite history and preferences                                  |
| `src/browser-cookies.ts` | Browser profiles and actionable access errors                   |
| `raycast/`               | Capture, Quick Capture, Extract Audio, Queue and Open Panel     |
| `tests/`                 | Unit, component, integration, native-decoder and browser checks |

## Testing

```sh
mise exec -- pnpm run test:all
```

The full check runs TypeScript, the production build, unit/component/integration coverage, Playwright, and Raycast type checks, lint and build. Coverage gates require **85% lines/statements** and **80% branches/functions** overall.

| Command                     | Scope                                                                     |
| --------------------------- | ------------------------------------------------------------------------- |
| `pnpm run test:unit`        | Validation, arguments, queue races, folders, formatting and Raycast logic |
| `pnpm run test:components`  | Forms, preferences, themes, collection actions and hooks                  |
| `pnpm run test:integration` | Real tools, API, files, events, cookies and media conversion              |
| `pnpm run test:e2e`         | Desktop and mobile browser workflows through Playwright                   |
| `pnpm run test:macos`       | The format matrix with Apple AVFoundation decoding on macOS               |
| `pnpm run test:coverage`    | Vitest suites and coverage thresholds                                     |

Run these with `mise exec --` unless mise is already active in the shell.

The deterministic suites generate short media fixtures and use real yt-dlp, ffmpeg and ffprobe. The format matrix covers both video modes at every quality setting, all five audio formats, VP9/Opus sources, unknown dimensions, 4K downscaling and byte-for-byte Original preservation. On macOS, a small Swift checker uses Apple AVFoundation to decode video and PCM audio samples without opening a native app. Apple's command line developer tools are required for that check. Broader codec support on the current Mac does not imply identical support on older macOS versions.

Cookie tests build synthetic Zen SQLite and Safari binary-cookie stores, then serve media requiring their fixture session. They check authenticated previews/downloads, missing profiles, permission errors and retry recovery. Real cookie values and personal collections are not test inputs.

**Isolation is mandatory.** Vitest establishes temporary app-data and download defaults before importing app modules. Playwright refuses to start if its configured database is outside its temporary folder. Documentation captures use temporary paths and an in-memory store. Keep configuration imports behind that setup when extending fixtures.

Reports:

- `coverage/index.html` — coverage details.
- `playwright-report/index.html` — browser results.
- `test-results/playwright/` — failure screenshots, traces and videos.
- `test-results/macos-formats.json` — format and native-decoder results.

### Optional live-site checks

```sh
mise exec -- pnpm run test:live
mise exec -- node --import tsx scripts/smoke-youtube.ts
```

The first command exercises public YouTube, TikTok and Instagram links through the web interface and service. It checks previews, fully decodes downloads and verifies file-response bytes. A silent source passes only after confirming that yt-dlp exposes no audio formats. The second command checks a short public YouTube clip.

These runs use no browser cookies, remove temporary media and report site/IP restrictions separately from successful media checks. Live-site output goes under `test-results/live-sites/`. External availability is why these checks are separate from `test:all`.

## Capture README screenshots

```sh
mise exec -- pnpm run docs:screenshots
```

This builds the current interface, launches headless Playwright against an isolated sample collection, and writes the banner, five themes, preferences and mobile screenshots to `docs/assets/`. Sample thumbnails and banner art are generated SVGs based on Nixi's palette and existing mark. No image-generation service, desktop automation or external artwork is required. Details: [documentation images](assets/README.md).

## Update tools and assets

Tool versions live in [`mise.toml`](../mise.toml). Edit the desired version, run `mise install`, then reinstall the service so its recorded executable paths stay current:

```sh
mise exec -- pnpm run install:agent
```

To regenerate the app and Raycast identity assets:

```sh
mise exec -- pnpm run assets
```

The generator produces the original glyph/wordmark, five themed artwork sets, SVG/PNG favicons, ICO, touch icon, web manifest and Raycast icon with mise-managed resvg and ImageMagick. See [DESIGN.md](../DESIGN.md).

## Runtime behavior

The web interface receives revision events over SSE. Collection responses are filtered, searched, paginated and stripped of logs; ETags avoid unnecessary transfers. Logs load in details. Search is debounced, stale requests abort and hidden tabs release event connections. Dialogs load on demand and media streams from disk.

SQLite uses WAL and prepared statements. Queue indexes protect duplicate suppression and FIFO retries. Hashed static assets receive immutable caching. Raycast uses conditional requests, avoids overlapping refreshes and slows refreshes while idle.

Processes use argument arrays without a shell. yt-dlp ignores unrelated user configuration. Host/origin checks reject foreign browser requests; file responses recheck real paths against the capture folder. Cancellation and shutdown terminate the process group, including ffmpeg. Conversion writes to a temporary file, probes the result and replaces or adds media only after verification.

## Environment overrides

| Variable                       | Purpose                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| `NIXI_PORT`                    | Local service port                                                       |
| `NIXI_DATA_DIR`                | App-data and database directory                                          |
| `NIXI_DOWNLOAD_DIR`            | Initial download destination; existing saved preferences take precedence |
| `NIXI_YTDLP`                   | yt-dlp executable                                                        |
| `NIXI_FFMPEG` / `NIXI_FFPROBE` | Media tools                                                              |
| `NIXI_NODE`                    | Node runtime used by yt-dlp                                              |
| `NIXI_BROWSER_HOME`            | Browser-profile home for isolated tests or custom profiles               |

Corresponding `GRABBY_` names remain supported; `NIXI_` takes precedence. Set overrides before starting the process. The installer records app-data, port and resolved executable paths; `NIXI_BROWSER_HOME` is a runtime/testing override rather than a persisted installer setting. Reinstall after moving the checkout or changing tool paths.
