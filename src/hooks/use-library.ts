"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Library, LibraryQuery } from "@/lib/library";
export function useLibrary(query: LibraryQuery) {
  const [data, setData] = useState<Library>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const queryString = new URLSearchParams({
    filter: query.filter,
    search: query.search,
    offset: String(query.offset),
    limit: String(query.limit),
  }).toString();
  const cache = useRef<
    { key: string; etag: string | null; data: Library } | undefined
  >(undefined);
  const current = useRef(queryString);
  current.current = queryString;
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const serial = useRef(0);
  const refresh = useCallback(async () => {
    const key = current.current,
      id = ++serial.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch(`/api/library?${key}`, {
        headers:
          cache.current?.key === key && cache.current.etag
            ? { "If-None-Match": cache.current.etag }
            : {},
        signal: abort.signal,
      });
      if (response.status === 304) {
        setError(undefined);
        return;
      }
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "Unable to read downloads.");
      if (id !== serial.current) return;
      cache.current = { key, etag: response.headers.get("etag"), data: value };
      revision.current = value.revision;
      setData(value);
      setError(undefined);
    } catch (error) {
      if (!abort.signal.aborted)
        setError(error instanceof Error ? error.message : "Cannot reach nixi.");
    } finally {
      if (id === serial.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    void refresh();
    return () => controller.current?.abort();
  }, [queryString, refresh]);
  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      source?.close();
      source = null;
      if (document.hidden) return;
      source = new EventSource("/api/events");
      source.addEventListener("revision", (event) => {
        if (Number((event as MessageEvent).data) !== revision.current) {
          clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 100);
        }
      });
      source.onopen = () => void refresh();
      source.onerror = () => setError("Cannot reach nixi. Reconnecting…");
    };
    const onVisibility = () => {
      if (document.hidden) {
        source?.close();
        source = null;
        clearTimeout(timer);
        controller.current?.abort();
      } else {
        connect();
        void refresh();
      }
    };
    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      source?.close();
      clearTimeout(timer);
      controller.current?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);
  return { data, error, loading, refresh };
}
