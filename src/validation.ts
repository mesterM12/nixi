import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import {
  browsers,
  formats,
  qualities,
  type Options,
  type Settings,
} from "./types";

export { videoUrl, parseUrls } from "./lib/links";
export function options(value: unknown, defaults: Options): Options {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid download options.");
  const v = value as Record<string, unknown>;
  const result: Options = {
    format: defaults.format,
    quality: defaults.quality,
    cookiesBrowser: defaults.cookiesBrowser,
    playlist: defaults.playlist,
    subtitles: defaults.subtitles,
  };
  for (const [key, allowed] of [
    ["format", formats],
    ["quality", qualities],
    ["cookiesBrowser", browsers],
  ] as const) {
    if (v[key] !== undefined) {
      if (
        typeof v[key] !== "string" ||
        !(allowed as readonly string[]).includes(v[key] as string)
      )
        throw new Error(`Invalid ${key}.`);
      Object.assign(result, { [key]: v[key] });
    }
  }
  for (const key of ["playlist", "subtitles"] as const) {
    if (v[key] !== undefined) {
      if (typeof v[key] !== "boolean") throw new Error(`Invalid ${key}.`);
      result[key] = v[key];
    }
  }
  return result;
}
export function settings(value: unknown, defaults: Settings): Settings {
  const result = { ...defaults, ...options(value, defaults) };
  const v = value as Record<string, unknown>;
  if (v.downloadDir !== undefined) {
    if (
      typeof v.downloadDir !== "string" ||
      !v.downloadDir.trim() ||
      /[\x00-\x1f]/.test(v.downloadDir)
    )
      throw new Error("Choose an absolute download folder.");
    const path = v.downloadDir.replace(/^~(?=\/|$)/, homedir());
    if (!isAbsolute(path))
      throw new Error("The download folder must start with / or ~/.");
    result.downloadDir = resolve(path);
  }
  if (v.concurrency !== undefined) {
    if (
      !Number.isInteger(v.concurrency) ||
      Number(v.concurrency) < 1 ||
      Number(v.concurrency) > 4
    )
      throw new Error("Run between 1 and 4 downloads at once.");
    result.concurrency = Number(v.concurrency);
  }
  return result;
}
