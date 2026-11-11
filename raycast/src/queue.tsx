import {
  Action,
  ActionPanel,
  Color,
  Clipboard,
  Detail,
  Icon,
  Keyboard,
  List,
  open,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { api, baseUrl, getStatus, isActive, Job, Snapshot } from "./nixi";
const names: Record<string, string> = {
  queued: "Queued",
  extracting: "Reading link",
  downloading: "Downloading",
  processing: "Processing",
  completed: "Saved",
  failed: "Failed",
  cancelled: "Cancelled",
};
const md = (v: string) => v.replace(/[\\`*_{}[\]()#+.!|>~-]/g, "\\$&");
export default function Command() {
  const [state, setState] = useState<Snapshot>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState("all");
  const { push } = useNavigation();
  const refreshing = useRef(false);
  const running = useRef(false);
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const value = await getStatus();
      running.current = Boolean(value.system.active || value.system.queued);
      setState(value);
      setError(undefined);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!stopped)
        timer = setTimeout(() => void poll(), running.current ? 1000 : 5000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  async function control(job: Job, action: string) {
    try {
      await api(
        `/api/jobs/${job.id}${action === "remove" ? "" : `/${action}`}`,
        action === "remove" ? "DELETE" : "POST",
      );
      await refresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Action failed",
        message: (error as Error).message,
      });
    }
  }
  const globals = (
    <ActionPanel.Section>
      <Action
        title="Open Web Interface"
        icon={Icon.Globe}
        onAction={() => open(baseUrl())}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={refresh}
      />
    </ActionPanel.Section>
  );
  const jobs =
    state?.jobs.filter(
      (j) =>
        filter === "all" ||
        (filter === "active"
          ? isActive(j)
          : filter === "failed"
            ? ["failed", "cancelled"].includes(j.status)
            : j.status === filter),
    ) || [];
  return (
    <List
      isLoading={loading}
      navigationTitle="Nixi: Queue"
      searchBarPlaceholder="Search your captures…"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter downloads"
          value={filter}
          onChange={setFilter}
        >
          <List.Dropdown.Item title="All Downloads" value="all" />
          <List.Dropdown.Item title="In Progress" value="active" />
          <List.Dropdown.Item title="Completed" value="completed" />
          <List.Dropdown.Item title="Needs Attention" value="failed" />
        </List.Dropdown>
      }
      actions={<ActionPanel>{globals}</ActionPanel>}
    >
      <List.EmptyView
        title={error ? "nixi is offline" : "Nothing to collect. Yet."}
        description={
          error || "Use “Nixi: Capture” or drop a link into the web app."
        }
        icon="nixi.png"
        actions={<ActionPanel>{globals}</ActionPanel>}
      />
      {error && state && (
        <List.Item
          title="Connection lost"
          subtitle={error}
          icon={Icon.Warning}
          actions={<ActionPanel>{globals}</ActionPanel>}
        />
      )}
      {jobs.map((job) => (
        <List.Item
          key={job.id}
          title={job.title}
          subtitle={job.site}
          keywords={[job.url, job.options.format, job.status]}
          icon={{
            source:
              job.status === "completed"
                ? Icon.CheckCircle
                : job.status === "failed"
                  ? Icon.Warning
                  : Icon.Download,
            tintColor:
              job.status === "completed"
                ? Color.Green
                : job.status === "failed"
                  ? Color.Red
                  : Color.Yellow,
          }}
          accessories={[
            {
              tag: {
                value:
                  job.options.format === "video"
                    ? "MP4"
                    : job.options.format.toUpperCase(),
                color: Color.SecondaryText,
              },
            },
            {
              text: `${names[job.status]}${job.status === "downloading" ? ` ${Math.round(job.progress)}%` : ""}`,
            },
            ...(job.files.length
              ? [{ text: `${job.files.length} files` }]
              : []),
          ]}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                {job.files.length > 0 && (
                  <Action
                    title="Show in Finder"
                    icon={Icon.Finder}
                    onAction={() => control(job, "reveal")}
                  />
                )}
                {["failed", "cancelled"].includes(job.status) && (
                  <Action
                    title="Retry Download"
                    icon={Icon.ArrowClockwise}
                    onAction={() => control(job, "retry")}
                  />
                )}
                <Action
                  title="Download Details"
                  icon={Icon.List}
                  onAction={async () => {
                    try {
                      const full = await api<Job>(`/api/jobs/${job.id}`);
                      push(
                        <Detail
                          navigationTitle={job.title}
                          markdown={`# ${md(job.title)}\n\n**Status:** ${md(names[job.status])}\n\n**Source:** ${md(job.url)}\n\n**Folder:** ${md(job.directory)}\n\n${job.error ? `**Error:** ${md(job.error)}\n\n` : ""}${job.files.map((f) => `- ${md(f.name)}`).join("\n")}\n\n## Download Log\n\n${md(full.logs || "No messages.")}`}
                        />,
                      );
                    } catch (error) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Cannot open details",
                        message: (error as Error).message,
                      });
                    }
                  }}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action.OpenInBrowser title="Open Source" url={job.url} />
                <Action.CopyToClipboard
                  title="Copy Source Link"
                  content={job.url}
                />
                <Action
                  title="Copy Download Log"
                  icon={Icon.Clipboard}
                  onAction={async () => {
                    try {
                      const full = await api<Job>(`/api/jobs/${job.id}`);
                      await Clipboard.copy(full.logs || "No messages.");
                      await showToast({
                        style: Toast.Style.Success,
                        title: "Download log copied",
                      });
                    } catch (error) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Cannot copy log",
                        message: (error as Error).message,
                      });
                    }
                  }}
                />
              </ActionPanel.Section>
              {globals}
              <ActionPanel.Section>
                {isActive(job) ? (
                  <Action
                    title="Cancel Download"
                    icon={Icon.XMarkCircle}
                    style={Action.Style.Destructive}
                    onAction={() => control(job, "cancel")}
                  />
                ) : (
                  <Action
                    title="Remove from History"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() => control(job, "remove")}
                  />
                )}
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
