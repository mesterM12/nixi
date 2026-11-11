# Documentation images

Real interface screenshots captured with headless Playwright against an isolated in-memory collection. Sample titles, artwork and media metadata are illustrative; no personal downloads or browser cookies are used. The banner and sample thumbnails are original SVG artwork generated from Nixi's existing mark, wordmark and theme colors.

Regenerate from the project root:

```sh
mise exec -- pnpm run docs:screenshots
```

The capture script refuses to load app storage outside its temporary directory and closes its temporary service/browser when finished. It does not open the desktop browser, Raycast, Finder or System Settings.
