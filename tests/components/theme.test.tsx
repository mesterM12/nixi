import { expect, test, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { initializeTheme, setTheme, useTheme } from "@/hooks/use-theme";
import { ThemeIcons } from "@/components/nixi/theme-icons";
test("theme store updates subscriptions and both favicon formats", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  render(<ThemeIcons />);
  const { result, unmount } = renderHook(() => useTheme());
  act(() => setTheme("phosphor"));
  expect(result.current[0]).toBe("phosphor");
  expect(document.documentElement.dataset.deck).toBe("phosphor");
  expect(document.querySelector('link[type="image/png"]')).toHaveAttribute(
    "href",
    "/favicon-32-phosphor.png",
  );
  expect(document.querySelector('link[type="image/svg+xml"]')).toHaveAttribute(
    "href",
    "/icon-phosphor.svg",
  );
  expect(localStorage.getItem("nixi-theme")).toBe("phosphor");
  localStorage.setItem("nixi-theme", "invalid");
  act(initializeTheme);
  expect(result.current[0]).toBe("phosphor");
  localStorage.setItem("nixi-theme", "ultraviolet");
  act(initializeTheme);
  expect(result.current[0]).toBe("ultraviolet");
  expect(
    document.querySelectorAll('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveLength(1);
  expect(document.querySelector('link[type="image/svg+xml"]')).toHaveAttribute(
    "href",
    "/icon-ultraviolet.svg",
  );
  unmount();
  setTheme("amber");
  vi.unstubAllGlobals();
});
test("Daylight switches color scheme and Radix styling back and forth", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  setTheme("daylight");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(document.documentElement.style.colorScheme).toBe("light");
  setTheme("phosphor");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(document.documentElement.style.colorScheme).toBe("dark");
  vi.unstubAllGlobals();
});
test("previous palette preferences migrate to nixi themes", () => {
  const values = new Map([["grabby-theme", "moonwire"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  initializeTheme();
  expect(document.documentElement.dataset.deck).toBe("ultraviolet");
  expect(values.get("nixi-theme")).toBe("ultraviolet");
  setTheme("phosphor");
  vi.unstubAllGlobals();
});
