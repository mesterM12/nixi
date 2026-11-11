"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ClipboardPaste, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Choice } from "./choice";
import { CookieAccess } from "./cookie-access";
import { browserChoices, formatChoices, qualityChoices } from "@/lib/choices";
import { parseUrls } from "@/lib/links";
import { api } from "@/lib/api";
import { duration } from "@/lib/format";
import type { Options, Settings, VideoInfo } from "@/types";
export function Composer({
  settings,
  ready,
  onQueued,
}: {
  settings: Settings;
  ready: boolean;
  onQueued: (value: Options & { urls: string[] }) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<Options>(settings);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<VideoInfo>();
  const input = useRef<HTMLTextAreaElement>(null);
  const previewController = useRef<AbortController | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const locked = useRef(false);
  useEffect(() => {
    setOptions({
      format: settings.format,
      quality: settings.quality,
      cookiesBrowser: settings.cookiesBrowser,
      playlist: settings.playlist,
      subtitles: settings.subtitles,
    });
  }, [
    settings.format,
    settings.quality,
    settings.cookiesBrowser,
    settings.playlist,
    settings.subtitles,
  ]);
  useEffect(() => () => previewController.current?.abort(), []);
  async function submit() {
    if (locked.current || !ready) return;
    setError("");
    let urls: string[];
    try {
      urls = parseUrls(text);
    } catch (error) {
      setError((error as Error).message);
      input.current?.focus();
      return;
    }
    locked.current = true;
    setBusy(true);
    const original = text;
    try {
      await onQueued({ urls, ...options });
      if (textRef.current === original) setText("");
      previewController.current?.abort();
      setPreview(undefined);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "k") {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key === "Enter" && !document.querySelector('[role="dialog"]')) {
        event.preventDefault();
        void submitRef.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function updateText(value: string) {
    previewController.current?.abort();
    setText(value);
    setPreview(undefined);
    setError("");
  }
  async function inspect() {
    setError("");
    let urls;
    try {
      urls = parseUrls(text);
      if (urls.length !== 1)
        throw new Error(
          "Preview one link at a time. You can capture multiple links directly.",
        );
    } catch (error) {
      setError((error as Error).message);
      return;
    }
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    setPreviewing(true);
    try {
      setPreview(
        await api<VideoInfo>(
          "/api/info",
          "POST",
          { url: urls[0], ...options },
          controller.signal,
        ),
      );
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (previewController.current === controller) setPreviewing(false);
    }
  }
  return (
    <section
      className="composer"
      aria-label="New download"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const value =
          event.dataTransfer.getData("text/uri-list") ||
          event.dataTransfer.getData("text/plain");
        if (value)
          updateText(
            text +
              (text ? "\n" : "") +
              value
                .split("\n")
                .filter((line) => !line.startsWith("#"))
                .join("\n"),
          );
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="input-heading">
          <label htmlFor="video-links">
            <Link2 /> PASTE A LINK. KEEP THE MOMENT.
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                updateText(
                  text +
                    (text ? "\n" : "") +
                    (await navigator.clipboard.readText()),
                );
              } catch {
                input.current?.focus();
                setError("Press ⌘V to paste your links here.");
              }
            }}
          >
            <ClipboardPaste />
            Paste <kbd>⌘ V</kbd>
          </Button>
        </div>
        <Textarea
          id="video-links"
          aria-label="Video links"
          ref={input}
          value={text}
          onChange={(event) => updateText(event.target.value)}
          placeholder="Paste a video link here… or a few. One per line."
          className="link-input"
          spellCheck={false}
        />
        <div className="composer-toolbar">
          <div className="choices">
            <Choice
              id="format"
              label="Download format"
              value={options.format}
              onChange={(value) =>
                setOptions({ ...options, format: value as Options["format"] })
              }
              choices={formatChoices}
            />
            <Choice
              id="quality"
              label="Maximum video resolution"
              value={options.quality}
              onChange={(value) =>
                setOptions({ ...options, quality: value as Options["quality"] })
              }
              choices={qualityChoices}
              disabled={!["video", "original"].includes(options.format)}
            />
          </div>
          <div className="composer-actions">
            <Button
              type="button"
              variant="outline"
              disabled={previewing || !ready}
              onClick={() => void inspect()}
            >
              {previewing ? "Reading…" : "Preview"}
            </Button>
            <Button type="submit" disabled={busy || !ready}>
              {busy ? "Capturing…" : "Capture links"}
              <ArrowRight />
            </Button>
          </div>
        </div>
        {options.format === "original" && (
          <p className="format-note">
            The original stays untouched. A playable MP4 is added when needed.
          </p>
        )}
        <details className="advanced">
          <summary>
            More options{" "}
            <span>
              {options.playlist ? "Entire playlists" : "Individual videos"} ·{" "}
              {options.cookiesBrowser === "none"
                ? "no browser cookies"
                : `${options.cookiesBrowser} cookies`}
            </span>
          </summary>
          <div className="advanced-content">
            <Choice
              id="cookies"
              label="Cookies from"
              value={options.cookiesBrowser}
              onChange={(value) =>
                setOptions({
                  ...options,
                  cookiesBrowser: value as Options["cookiesBrowser"],
                })
              }
              choices={browserChoices}
            />
            <label className="check-label">
              <Checkbox
                checked={options.playlist}
                onCheckedChange={(value) =>
                  setOptions({ ...options, playlist: value === true })
                }
              />
              Include entire playlist
            </label>
            <label className="check-label">
              <Checkbox
                checked={options.subtitles}
                onCheckedChange={(value) =>
                  setOptions({ ...options, subtitles: value === true })
                }
              />
              Save English subtitles
            </label>
          </div>
          <CookieAccess browser={options.cookiesBrowser} />
        </details>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className="preview-card">
          {preview.thumbnail && /^https?:/.test(preview.thumbnail) && (
            <img
              src={preview.thumbnail}
              width={100}
              height={65}
              alt=""
              referrerPolicy="no-referrer"
            />
          )}
          <div>
            <strong>{preview.title}</strong>
            <p>
              {[preview.site, preview.uploader, duration(preview.duration)]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {preview.heights.length > 0 && (
              <p>
                Available:{" "}
                {preview.heights.map((height) => `${height}p`).join(" / ")}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
