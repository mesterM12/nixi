import type { Job, Options, Snapshot } from "../types";
export type Filter = "all" | "active" | "completed" | "failed";
export type LibraryQuery = {
  filter: Filter;
  search: string;
  offset: number;
  limit: number;
};
export type JobSummary = Omit<Job, "logs">;
export type Library = Omit<Snapshot, "jobs"> & {
  jobs: JobSummary[];
  counts: Record<Filter, number>;
  total: number;
  revision: number;
};
export const isActive = (job: Pick<Job, "status">) =>
  ["queued", "extracting", "downloading", "processing"].includes(job.status);
export function parseLibraryQuery(params: URLSearchParams): LibraryQuery {
  const filter = params.get("filter") || "all";
  if (!["all", "active", "completed", "failed"].includes(filter))
    throw new Error("Invalid collection filter.");
  const offset = Number(params.get("offset") || 0),
    limit = Number(params.get("limit") || 50);
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error("Use a valid page size between 1 and 100.");
  return {
    filter: filter as Filter,
    search: (params.get("search") || "").slice(0, 500).toLowerCase(),
    offset,
    limit,
  };
}
export function libraryView(jobs: Job[], query: LibraryQuery) {
  const counts = { all: jobs.length, active: 0, completed: 0, failed: 0 };
  const matches: Job[] = [];
  for (const job of jobs) {
    const active = isActive(job),
      failed = job.status === "failed" || job.status === "cancelled";
    if (active) counts.active++;
    if (failed) counts.failed++;
    if (job.status === "completed") counts.completed++;
    if (
      query.filter !== "all" &&
      !(query.filter === "active"
        ? active
        : query.filter === "failed"
          ? failed
          : job.status === query.filter)
    )
      continue;
    if (
      query.search &&
      !`${job.title} ${job.site} ${job.url}`
        .toLowerCase()
        .includes(query.search)
    )
      continue;
    matches.push(job);
  }
  return {
    jobs: matches
      .slice(query.offset, query.offset + query.limit)
      .map(({ logs, ...job }) => job),
    total: matches.length,
    counts,
  };
}
export const optionsKey = (url: string, options: Options) =>
  JSON.stringify([
    url,
    options.format,
    options.quality,
    options.cookiesBrowser,
    options.playlist,
    options.subtitles,
  ]);
