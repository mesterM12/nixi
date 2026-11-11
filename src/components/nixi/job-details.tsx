"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { bytes } from "@/lib/format";
import type { Job } from "@/types";
export default function JobDetails({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [job, setJob] = useState<Job>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<Job>(`/api/jobs/${id}`, "GET", undefined, controller.signal)
      .then(setJob)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [id]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download details</DialogTitle>
          <DialogDescription>
            Saved files and diagnostic information for this capture.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert">{error}</p>
        ) : !job ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="job-details">
            <h3>{job.title}</h3>
            <a href={job.url} target="_blank" rel="noreferrer">
              {job.url}
            </a>
            <p>
              {job.status.toUpperCase()} ·{" "}
              {new Date(job.createdAt).toLocaleString()}
            </p>
            <p>Folder: {job.directory}</p>
            {job.error && <p className="form-error">{job.error}</p>}
            {job.files.map((file, index) => (
              <div className="file-row" key={file.path}>
                <span>
                  {file.name}
                  <small>{bytes(file.size)}</small>
                </span>
                <Button variant="outline" size="icon" asChild>
                  <a
                    href={`/api/jobs/${job.id}/files/${index}`}
                    aria-label={`Download ${file.name}`}
                  >
                    <Download />
                  </a>
                </Button>
              </div>
            ))}
            {job.logs && (
              <details>
                <summary>Download log</summary>
                <pre>{job.logs}</pre>
              </details>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
