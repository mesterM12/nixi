import { mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { write } from "../src/platform";
import { root, findTool } from "../src/config";
import { themes } from "../src/lib/theme";
const svg = (view: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" fill="none">${body}</svg>\n`;
const glyph = (accent: string, muted: string) =>
  `<path d="M130 130 382 382M382 130 130 382" stroke="${accent}" stroke-width="32" stroke-linecap="round"/><path d="M94 256h57m210 0h57" stroke="${muted}" stroke-width="11"/>`;
const wordmark = (color: string) =>
  `<g fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"><path d="M8 50V18m0 12c0-18 28-18 28 0v20M58 21v29m18-29 24 29m0-29L76 50m44-29v29"/></g><g fill="${color}"><circle cx="58" cy="7" r="4"/><circle cx="120" cy="7" r="4"/></g>`;
mkdirSync(join(root, "raycast/assets"), { recursive: true });
for (const [name, theme] of Object.entries(themes)) {
  const icon = svg(
    "0 0 512 512",
    `<rect width="512" height="512" rx="88" fill="${theme.tile}"/>${glyph(theme.accent, theme.muted)}`,
  );
  await write(join(root, `public/icon-${name}.svg`), icon);
  const empty = svg(
    "0 0 160 120",
    `<rect x="36" y="13" width="88" height="88" rx="19" fill="${theme.tile}"/><g transform="translate(44 21) scale(.14)">${glyph(theme.accent, theme.muted)}</g><path d="M12 58h14m108 0h14M80 107v7" stroke="${theme.border}" stroke-width="2"/>`,
  );
  await write(join(root, `public/empty-art-${name}.svg`), empty);
  const card = svg(
    "0 0 1200 630",
    `<rect width="1200" height="630" fill="${theme.canvas}"/><rect x="44" y="44" width="1112" height="542" rx="32" fill="${theme.surface}" stroke="${theme.border}"/><g transform="translate(92 100) scale(.32)"><rect width="512" height="512" rx="88" fill="${theme.tile}"/>${glyph(theme.accent, theme.muted)}</g><g transform="translate(302 105) scale(1.3)">${wordmark(theme.light ? "#18251f" : "#edf1f4")}</g><text x="304" y="224" fill="${theme.accent}" font-family="sans-serif" font-size="20" letter-spacing="2">CAPTURE WHAT MOVES.</text><text x="92" y="335" fill="${theme.muted}" font-family="sans-serif" font-size="25">A quiet little utility for keeping the internet close.</text><path d="M92 388h1016" stroke="${theme.border}"/><text x="92" y="435" fill="${theme.muted}" font-family="monospace" font-size="14" letter-spacing="2">VIDEO / AUDIO / YOURS TO KEEP</text>${Array.from({ length: 28 }, (_, i) => `<rect x="${92 + i * 37}" y="474" width="28" height="${22 + ((i * 13) % 40)}" rx="6" fill="${i < 15 ? theme.accent : theme.tile}"/>`).join("")}`,
  );
  await write(join(root, `public/brand-card-${name}.svg`), card);
  if (name === "phosphor") {
    await write(join(root, "public/icon.svg"), icon);
    await write(join(root, "raycast/assets/nixi.svg"), icon);
    await write(join(root, "public/empty-art.svg"), empty);
    await write(join(root, "public/brand-card.svg"), card);
    await write(
      join(root, "public/wordmark.svg"),
      svg("0 0 132 58", wordmark("#edf1f4")),
    );
  }
}
const resvg = findTool("resvg"),
  magick = findTool("magick");
if (!resvg || !magick)
  throw new Error("Run mise install to install the asset tools.");
function render(source: string, target: string, size: number) {
  const result = spawnSync(
    resvg!,
    ["--width", String(size), "--height", String(size), source, target],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
}
for (const [name, size] of [
  ["favicon-16.png", 16],
  ["favicon-32.png", 32],
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
] as const)
  render(join(root, "public/icon.svg"), join(root, "public", name), size);
for (const name of Object.keys(themes))
  render(
    join(root, `public/icon-${name}.svg`),
    join(root, `public/favicon-32-${name}.png`),
    32,
  );
await write(
  join(root, "raycast/assets/nixi.png"),
  readFileSync(join(root, "public/icon-512.png")),
);
const ico = spawnSync(
  magick,
  [
    join(root, "public/favicon-16.png"),
    join(root, "public/favicon-32.png"),
    join(root, "public/favicon.ico"),
  ],
  { encoding: "utf8" },
);
if (ico.status !== 0) throw new Error(ico.stderr);
await write(
  join(root, "public/manifest.webmanifest"),
  JSON.stringify(
    {
      name: "nixi",
      short_name: "nixi",
      description:
        "Capture what moves. A quiet little utility for keeping the internet close.",
      start_url: "/",
      display: "standalone",
      background_color: "#000000",
      theme_color: "#a9f5df",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    null,
    2,
  ) + "\n",
);
// Remove assets from the previous identity after their replacements exist.
for (const file of readdirSync(join(root, "public")))
  if (
    /^(hero-art.*\.svg|(icon|empty-art)-(overdrive|moonwire|riot|ghost)\.svg|favicon-32-(overdrive|moonwire|riot|ghost)\.png)$/.test(
      file,
    )
  )
    unlinkSync(join(root, "public", file));
console.log(
  "Generated nixi glyph, wordmark, five theme asset sets, brand cards, Raycast icon, favicons, touch icon and manifest.",
);
for (const file of ["icon.png", "icon.svg"]) {
  const legacy = join(root, "raycast/assets", file);
  if (readdirSync(join(root, "raycast/assets")).includes(file))
    unlinkSync(legacy);
}
