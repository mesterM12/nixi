"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Choice } from "./choice";
import { CookieAccess } from "./cookie-access";
import { browserChoices, formatChoices, qualityChoices } from "@/lib/choices";
import { themes, type Theme } from "@/lib/theme";
import type { Settings, SystemStatus } from "@/types";
export default function Preferences({
  open,
  onOpenChange,
  settings,
  system,
  theme,
  onTheme,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  settings: Settings;
  system: SystemStatus;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onSave: (settings: Settings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) {
          setDraft(settings);
          setError("");
        }
        onOpenChange(value);
      }}
    >
      <DialogContent className="preferences-dialog">
        <DialogHeader>
          <p className="eyebrow">MAKE YOURSELF AT HOME</p>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>
            Changes apply to new downloads. Existing files stay where they are.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError("");
            try {
              await onSave(draft);
              onOpenChange(false);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Choice
            id="visual-deck"
            label="Visual deck"
            value={theme}
            onChange={(value) => onTheme(value as Theme)}
            choices={Object.entries(themes).map(([key, value]) => [
              key,
              `${value.label} / ${value.description}`,
            ])}
          />
          <label className="field" htmlFor="download-dir">
            Download folder
            <Input
              id="download-dir"
              value={draft.downloadDir}
              onChange={(event) =>
                setDraft({ ...draft, downloadDir: event.target.value })
              }
              required
            />
            <small>Dated folders, numbered each day: 2026-11-10_001.</small>
          </label>
          <div className="field-row">
            <Choice
              id="concurrency"
              label="Simultaneous downloads"
              value={String(draft.concurrency)}
              onChange={(value) =>
                setDraft({ ...draft, concurrency: Number(value) })
              }
              choices={[1, 2, 3, 4].map((n) => [String(n), `${n} at a time`])}
            />
            <Choice
              id="default-format"
              label="Default format"
              value={draft.format}
              onChange={(value) =>
                setDraft({ ...draft, format: value as Settings["format"] })
              }
              choices={formatChoices}
            />
          </div>
          {draft.format === "original" && (
            <p className="format-note">
              The original stays untouched. A playable MP4 is added when needed.
            </p>
          )}
          <Choice
            id="default-quality"
            label="Default quality"
            value={draft.quality}
            onChange={(value) =>
              setDraft({ ...draft, quality: value as Settings["quality"] })
            }
            choices={qualityChoices}
          />
          <Choice
            id="default-cookies"
            label="Default browser cookies"
            value={draft.cookiesBrowser}
            onChange={(value) =>
              setDraft({
                ...draft,
                cookiesBrowser: value as Settings["cookiesBrowser"],
              })
            }
            choices={browserChoices}
          />
          <CookieAccess browser={draft.cookiesBrowser} />
          <label className="check-label">
            <Checkbox
              checked={draft.subtitles}
              onCheckedChange={(value) =>
                setDraft({ ...draft, subtitles: value === true })
              }
            />
            Save English subtitles by default
          </label>
          <label className="check-label">
            <Checkbox
              checked={draft.playlist}
              onCheckedChange={(value) =>
                setDraft({ ...draft, playlist: value === true })
              }
            />
            Include entire playlists by default
          </label>
          <details className="engine-details">
            <summary>Download engine</summary>
            {(["ytDlp", "ffmpeg", "ffprobe", "runtime"] as const).map((key) => (
              <p key={key}>
                <strong>{key === "ytDlp" ? "yt-dlp" : key}</strong> /{" "}
                {system[key].version || "Missing"}
                <br />
                <span>{system[key].path || "Not installed"}</span>
              </p>
            ))}
          </details>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save preferences"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
