"use client";
import { useSyncExternalStore } from "react";
import { resolveTheme, themes, type Theme } from "@/lib/theme";
const listeners = new Set<() => void>();
let current: Theme = "phosphor";
const getServer = () => "phosphor" as Theme;
function getSnapshot() {
  return current;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setTheme(theme: Theme) {
  current = theme;
  document.documentElement.dataset.deck = theme;
  document.documentElement.classList.toggle("dark", !themes[theme].light);
  document.documentElement.style.colorScheme = themes[theme].light
    ? "light"
    : "dark";
  try {
    localStorage.setItem("nixi-theme", theme);
  } catch {}
  for (const listener of listeners) listener();
}
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServer);
  return [theme, setTheme] as const;
}
export function initializeTheme() {
  let value: string | null = null;
  try {
    value =
      localStorage.getItem("nixi-theme") ||
      localStorage.getItem("grabby-theme");
  } catch {}
  setTheme(resolveTheme(value));
}
