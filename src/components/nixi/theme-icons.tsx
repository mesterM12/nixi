"use client";
import { useTheme } from "@/hooks/use-theme";

export function ThemeIcons() {
  const [theme] = useTheme();
  return (
    <>
      <link rel="icon" type="image/svg+xml" href={`/icon-${theme}.svg`} />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href={`/favicon-32-${theme}.png`}
      />
    </>
  );
}
