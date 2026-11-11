export function videoUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 8192)
    throw new Error("Paste a valid http or https video link.");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Paste a complete video link, starting with https://.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an http or https link without embedded credentials.");
  return url.href;
}
export function parseUrls(value: unknown): string[] {
  if (typeof value === "string") value = value.split(/\s+/).filter(Boolean);
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new Error("Add between 1 and 100 links at a time.");
  return [...new Set(value.map(videoUrl))];
}
