"use client";
import { memo } from "react";
import {
  Check,
  Copy,
  Download,
  FolderOpen,
  LoaderCircle,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isActive, type Filter, type JobSummary } from "@/lib/library";
import { bytes } from "@/lib/format";
import type { Theme } from "@/lib/theme";
export const stateNames = {
  queued: "Queued",
  extracting: "Reading link",
  downloading: "Downloading",
  processing: "Processing",
  completed: "Saved",
  failed: "Failed",
  cancelled: "Cancelled",
};
export function CollectionFilters({
  value,
  counts,
  onChange,
}: {
  value: Filter;
  counts: Record<Filter, number>;
  onChange: (value: Filter) => void;
}) {
  return (
    <div className="filter-selector" role="group" aria-label="Filter downloads">
      {(
        [
          ["all", "All downloads"],
          ["active", "In progress"],
          ["completed", "Completed"],
          ["failed", "Needs attention"],
        ] as const
      ).map(([key, title]) => (
        <Button
          key={key}
          variant="ghost"
          aria-pressed={key === value}
          onClick={() => onChange(key)}
        >
          {title} <span>{counts[key]}</span>
        </Button>
      ))}
    </div>
  );
}
function IconAction({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
const DownloadRow = memo(function DownloadRow({
  job,
  onAction,
  onDetails,
}: {
  job: JobSummary;
  onAction: (id: string, action: string) => void;
  onDetails: (id: string) => void;
}) {
  const running = isActive(job);
  return (
    <TableRow data-testid="download-row">
      <TableCell className="media-cell">
        <div className="media-info">
          {job.thumbnail ? (
            <img
              src={job.thumbnail}
              alt=""
              width={80}
              height={50}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="media-placeholder">
              <Download />
            </div>
          )}
          <div className="media-copy">
            <button className="job-title" onClick={() => onDetails(job.id)}>
              {job.title}
            </button>
            <p>
              {job.site}
              <Badge variant="outline">
                {job.options.format === "video"
                  ? "MP4"
                  : job.options.format.toUpperCase()}
              </Badge>
              {job.options.playlist && (
                <Badge variant="outline">Playlist</Badge>
              )}
            </p>
            {job.error && <p className="job-error">{job.error}</p>}
            {running && (
              <Progress
                value={job.progress}
                aria-label={`${stateNames[job.status]} progress`}
                className={!job.progress ? "indeterminate" : ""}
              />
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className={`state-cell state-${job.status}`}>
        <span>
          {job.status === "completed" ? (
            <Check />
          ) : running ? (
            <LoaderCircle className="spin" />
          ) : null}
          {stateNames[job.status]}
          {job.status === "downloading" && job.progress > 0
            ? ` ${Math.round(job.progress)}%`
            : ""}
        </span>
        <small>
          {job.speed
            ? `${bytes(job.speed)}/s`
            : job.files.length
              ? `${job.files.length} ${job.files.length === 1 ? "file" : "files"} · ${bytes(job.files.reduce((n, file) => n + file.size, 0))}`
              : ""}
        </small>
      </TableCell>
      <TableCell className="actions-cell">
        <div className="row-actions">
          {running ? (
            <IconAction
              label="Cancel download"
              onClick={() => onAction(job.id, "cancel")}
            >
              <X />
            </IconAction>
          ) : ["failed", "cancelled"].includes(job.status) ? (
            <IconAction
              label="Retry download"
              onClick={() => onAction(job.id, "retry")}
            >
              <RotateCw />
            </IconAction>
          ) : null}
          {job.files.length > 0 && (
            <IconAction
              label="Show in Finder"
              onClick={() => onAction(job.id, "reveal")}
            >
              <FolderOpen />
            </IconAction>
          )}
          <IconAction
            label="Copy source link"
            onClick={() => onAction(job.id, "copy")}
          >
            <Copy />
          </IconAction>
          {!running && (
            <IconAction
              label="Remove from history"
              onClick={() => onAction(job.id, "remove")}
            >
              <Trash2 />
            </IconAction>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});
export function Collection({
  jobs,
  theme,
  filter,
  search,
  onAction,
  onDetails,
}: {
  jobs: JobSummary[];
  theme: Theme;
  filter: Filter;
  search: string;
  onAction: (id: string, action: string) => void;
  onDetails: (id: string) => void;
}) {
  if (!jobs.length) {
    const title = search
      ? "No matching downloads."
      : filter === "failed"
        ? "Clear signal. No interruptions."
        : filter === "active"
          ? "All quiet on the download front."
          : "Nothing saved. Yet.";
    return (
      <div className="empty">
        <img src={`/empty-art-${theme}.svg`} width={135} height={101} alt="" />
        <h3>{title}</h3>
        <p>
          {search
            ? "Try another title, site, or link."
            : "Paste a link above. Keep something worth coming back to."}
        </p>
        <span>// AWAITING INPUT</span>
      </div>
    );
  }
  return (
    <Table aria-label="Downloads">
      <TableHeader>
        <TableRow>
          <TableHead>MEDIA / SOURCE</TableHead>
          <TableHead>STATUS</TableHead>
          <TableHead className="text-right">ACTIONS</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <DownloadRow
            key={job.id}
            job={job}
            onAction={onAction}
            onDetails={onDetails}
          />
        ))}
      </TableBody>
    </Table>
  );
}
