import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: [
        "src/queue.ts",
        "src/validation.ts",
        "src/store.ts",
        "src/engine.ts",
        "src/media.ts",
        "src/folders.ts",
        "src/browser-cookies.ts",
        "src/app.ts",
        "src/lib/library.ts",
        "src/lib/format.ts",
        "src/lib/identity.ts",
        "src/lib/theme.ts",
        "src/lib/links.ts",
        "src/lib/api.ts",
        "src/hooks/*.ts",
        "raycast/src/nixi.ts",
        "src/components/nixi/*.tsx",
      ],
      exclude: ["src/components/ui/**"],
      thresholds: { statements: 85, branches: 80, functions: 80, lines: 85 },
    },
    projects: [
      {
        test: {
          name: "unit",
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/unit/**/*.test.ts", "raycast/tests/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 60000,
          hookTimeout: 15000,
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          include: ["tests/components/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts", "./tests/components/setup.ts"],
        },
      },
    ],
  },
});
