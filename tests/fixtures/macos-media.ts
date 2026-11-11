import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { root } from "../../src/config";
export type NativeMediaResult = {
  playable: boolean;
  completed: boolean;
  videoSamples: number;
  audioSamples: number;
  error?: string;
};
export function macosMediaChecker(directory: string) {
  const executable = join(directory, "nixi-native-media");
  const compile = spawnSync(
    "/usr/bin/swiftc",
    [
      "-suppress-warnings",
      "-parse-as-library",
      join(root, "tests/fixtures/macos-media.swift"),
      "-o",
      executable,
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  if (compile.status !== 0)
    throw new Error(
      `Native media test needs Apple's Swift compiler: ${compile.stderr}`,
    );
  return (file: string): NativeMediaResult => {
    const result = spawnSync(executable, [file], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.status !== 0)
      throw new Error(result.stderr || "Native media checker stopped");
    return JSON.parse(result.stdout);
  };
}
