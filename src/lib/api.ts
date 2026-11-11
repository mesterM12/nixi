export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal || AbortSignal.timeout(path === "/api/info" ? 95000 : 12000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "nixi could not complete that request.");
  return data;
}
