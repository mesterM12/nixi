"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  FolderOpen,
  Search,
  Settings2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueueSignal } from "./queue-signal";
import { ThemeIcons } from "./theme-icons";
import { Composer } from "./composer";
import { Collection, CollectionFilters } from "./collection";
import { useDebounced } from "@/hooks/use-debounced";
import { useLibrary } from "@/hooks/use-library";
import { initializeTheme, useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import type { Filter } from "@/lib/library";
import type { Job, Options, Settings } from "@/types";
const Preferences = dynamic(() => import("./preferences"));
const JobDetails = dynamic(() => import("./job-details"));
const defaults: Settings = {
  downloadDir: "~/Downloads/Nixi",
  concurrency: 2,
  format: "video",
  quality: "best",
  cookiesBrowser: "none",
  playlist: false,
  subtitles: false,
};
export function Workspace() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDebounced(search);
  const [offset, setOffset] = useState(0);
  const [preferences, setPreferences] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [theme, setTheme] = useTheme();
  const { data, error, loading, refresh } = useLibrary({
    filter,
    search: deferredSearch,
    offset,
    limit: 50,
  });
  useEffect(initializeTheme, []);
  useEffect(() => {
    if (data && !loading && offset > 0 && offset >= data.total)
      setOffset(Math.max(0, Math.ceil(data.total / 50) - 1) * 50);
  }, [data, loading, offset]);

  const onQueued = useCallback(
    async (value: Options & { urls: string[] }) => {
      const result = await api<{ jobs: Job[]; skipped: number }>(
        "/api/jobs",
        "POST",
        value,
      );
      toast.success(
        result.jobs.length
          ? `${result.jobs.length} ${result.jobs.length === 1 ? "link" : "links"} added to the queue.`
          : "Already in the queue.",
      );
      await refresh();
    },
    [refresh],
  );
  const onAction = useCallback(
    async (id: string, action: string) => {
      try {
        if (action === "copy") {
          const job = await api<Job>(`/api/jobs/${id}`);
          await navigator.clipboard.writeText(job.url);
          toast.success("Source link copied.");
          return;
        }
        await api(
          `/api/jobs/${id}${action === "remove" ? "" : `/${action}`}`,
          action === "remove" ? "DELETE" : "POST",
        );
        await refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    },
    [refresh],
  );
  const openFolder = async () => {
    try {
      await api("/api/open-folder", "POST");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <TooltipProvider>
      <ThemeIcons />
      <header className="app-header">
        <a href="/" className="brand" aria-label="nixi home">
          <img
            id="brand-icon"
            src={`/icon-${theme}.svg`}
            width={39}
            height={39}
            alt=""
          />
          <span>nixi</span>
        </a>
        <div className="header-controls">
          <span className={`service ${error ? "offline" : ""}`} role="status">
            <i />
            {error
              ? "nixi is offline"
              : data?.system.ready
                ? "nixi is online"
                : "Connecting"}
          </span>
          <Button
            variant="ghost"
            onClick={() => void openFolder()}
            aria-label="Open download folder"
          >
            <FolderOpen />
            <span>Downloads</span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => setPreferences(true)}
            aria-label="Preferences"
            disabled={!data}
          >
            <Settings2 />
            <span>Preferences</span>
          </Button>
        </div>
      </header>
      <main className="workspace">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">VIDEO / AUDIO / YOURS TO KEEP</p>
            <h1>Capture what moves.</h1>
            <p>A quiet little utility for keeping the internet close.</p>
          </div>
          <QueueSignal
            active={data?.system.active || 0}
            queued={data?.system.queued || 0}
            progress={data?.system.progress || 0}
            connected={Boolean(data)}
            ready={Boolean(data?.system.ready)}
            offline={Boolean(error)}
          />
        </section>
        {error && (
          <div className="banner" role="alert">
            Cannot reach nixi. Reconnecting automatically. Your links are still
            here.
          </div>
        )}
        {data && !data.system.ready && (
          <div className="banner" role="alert">
            Download tools are missing. Run pnpm run setup, then restart nixi.
          </div>
        )}
        <Composer
          settings={data?.settings || defaults}
          ready={Boolean(data?.system.ready && !error)}
          onQueued={onQueued}
        />
        <div className="support-line">
          <p>
            YouTube <span>·</span> Instagram <span>·</span> TikTok{" "}
            <span>·</span> Vimeo <span>·</span>{" "}
            <a
              href="https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md"
              target="_blank"
              rel="noreferrer"
            >
              and everything yt-dlp supports ↗
            </a>
          </p>
          <span>
            <kbd>⌘</kbd>
            <kbd>↵</kbd> to capture
          </span>
        </div>
        <section className="downloads" aria-labelledby="collection-title">
          <div className="collection-heading">
            <div>
              <h2 id="collection-title">Your collection</h2>
              <span>
                {data
                  ? `${data.total} ${data.total === 1 ? "capture" : "captures"}${data.system.active ? ` · ${data.system.active} running` : ""}`
                  : "Connecting to your archive"}
              </span>
            </div>
            <div className="collection-tools">
              <label className="search">
                <Search />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setOffset(0);
                  }}
                  placeholder="Search downloads"
                  aria-label="Search downloads"
                />
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await api("/api/history/clear", "POST");
                    await refresh();
                    toast.success(
                      "History cleared. Saved files are still on your Mac.",
                    );
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Clear finished
              </Button>
            </div>
          </div>
          <CollectionFilters
            value={filter}
            counts={
              data?.counts || { all: 0, active: 0, completed: 0, failed: 0 }
            }
            onChange={(value) => {
              setFilter(value);
              setOffset(0);
            }}
          />
          {loading && !data ? (
            <div aria-label="Loading downloads">
              <Skeleton className="h-40" />
            </div>
          ) : (
            <Collection
              jobs={data?.jobs || []}
              theme={theme}
              filter={filter}
              search={deferredSearch}
              onAction={onAction}
              onDetails={setDetailId}
            />
          )}
          {(data?.total || 0) > 50 && (
            <div className="pagination">
              <Button
                variant="outline"
                disabled={!offset}
                onClick={() => setOffset((value) => Math.max(0, value - 50))}
              >
                <ArrowLeft />
                Previous
              </Button>
              <span>
                {offset + 1}–{Math.min(offset + 50, data!.total)} of{" "}
                {data!.total}
              </span>
              <Button
                variant="outline"
                disabled={offset + 50 >= data!.total}
                onClick={() => setOffset((value) => value + 50)}
              >
                Next
                <ArrowRight />
              </Button>
            </div>
          )}
        </section>
        <footer>
          <span>nixi / CAPTURE WHAT MOVES.</span>
          <span>LOCAL FIRST / ALWAYS YOURS</span>
          <span>ON YOUR MAC / IN YOUR HANDS</span>
        </footer>
      </main>
      {preferences && data && (
        <Preferences
          key={data.settings.downloadDir}
          open
          onOpenChange={setPreferences}
          settings={data.settings}
          system={data.system}
          theme={theme}
          onTheme={setTheme}
          onSave={async (settings) => {
            await api("/api/settings", "PUT", settings);
            await refresh();
            toast.success("Preferences saved.");
          }}
        />
      )}
      {detailId && (
        <JobDetails id={detailId} onClose={() => setDetailId(undefined)} />
      )}
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
