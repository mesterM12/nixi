export const themes = {
  phosphor: {
    label: "Phosphor",
    description: "Mint / Dark",
    accent: "#a9f5df",
    focus: "#a9f5df",
    canvas: "#000000",
    surface: "#090b0e",
    tile: "#181d25",
    muted: "#8e9ba9",
    border: "#303a46",
    light: false,
  },
  ultraviolet: {
    label: "Ultraviolet",
    description: "Orchid / Dark",
    accent: "#c4b0ff",
    focus: "#b9a2ff",
    canvas: "#000000",
    surface: "#0c0a10",
    tile: "#201b2a",
    muted: "#a098ae",
    border: "#3c3449",
    light: false,
  },
  infrared: {
    label: "Infrared",
    description: "Coral / Dark",
    accent: "#ffada7",
    focus: "#ffada7",
    canvas: "#000000",
    surface: "#100b0d",
    tile: "#291d21",
    muted: "#ac969c",
    border: "#49353d",
    light: false,
  },
  amber: {
    label: "Amber",
    description: "Warm signal / Dark",
    accent: "#f2ce8a",
    focus: "#f2ce8a",
    canvas: "#000000",
    surface: "#100d09",
    tile: "#282218",
    muted: "#aa9e8d",
    border: "#443c2d",
    light: false,
  },
  daylight: {
    label: "Daylight",
    description: "Jade / Light",
    accent: "#13634f",
    focus: "#13634f",
    canvas: "#f2f4f1",
    surface: "#ffffff",
    tile: "#e4ebe6",
    muted: "#56665e",
    border: "#c7d3cc",
    light: true,
  },
} as const;
export type Theme = keyof typeof themes;
export const defaultTheme: Theme = "phosphor";
export function isTheme(value: string | null): value is Theme {
  return Boolean(value && Object.hasOwn(themes, value));
}
export function resolveTheme(value: string | null): Theme {
  if (isTheme(value)) return value;
  return (
    (
      {
        overdrive: "amber",
        moonwire: "ultraviolet",
        riot: "phosphor",
        ghost: "infrared",
      } as Record<string, Theme>
    )[value || ""] || defaultTheme
  );
}
