"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Browser, CookieAccess as Result } from "@/types";

export function CookieAccess({ browser }: { browser: Browser }) {
  const [result, setResult] = useState<Result>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(undefined);
    setError("");
    setChecking(false);
    return () => controller.current?.abort();
  }, [browser]);
  if (browser === "none") return null;
  async function check() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setChecking(true);
    setError("");
    setResult(undefined);
    try {
      const value = await api<Result>(
        "/api/cookies/check",
        "POST",
        { cookiesBrowser: browser },
        AbortSignal.any([current.signal, AbortSignal.timeout(12000)]),
      );
      if (!current.signal.aborted) setResult(value);
    } catch (error) {
      if (!current.signal.aborted) setError((error as Error).message);
    } finally {
      if (!current.signal.aborted) setChecking(false);
    }
  }
  async function open(action: "permissions" | "reveal-tool") {
    try {
      await api(`/api/cookies/${action}`, "POST");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <div className="cookie-access">
      <p>
        {browser === "zen"
          ? "Uses your most recently active Zen profile, including its containers."
          : browser === "safari"
            ? "Safari cookies may require Full Disk Access for nixi’s download tool."
            : "Uses your existing browser sign-in. Your Mac may ask for Keychain access."}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() => void check()}
        disabled={checking}
      >
        {checking ? "Checking cookie access…" : "Check cookie access"}
      </Button>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "cookie-success" : "form-error"}
        >
          {result.message}
        </p>
      )}
      {result?.permissionRequired && (
        <div className="cookie-permissions">
          <p>
            Add the revealed download tool to Full Disk Access, then check
            again. macOS requires you to approve this setting.
          </p>
          <div className="cookie-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => void open("permissions")}
            >
              Open Full Disk Access
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void open("reveal-tool")}
            >
              Reveal download tool
            </Button>
          </div>
          <details>
            <summary>Permission details</summary>
            <p>
              Download tool: <code>{result.toolPath}</code>
            </p>
            <p>
              If access is still blocked, also allow this service runtime and
              restart nixi: <code>{result.runtimePath}</code>
            </p>
          </details>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
