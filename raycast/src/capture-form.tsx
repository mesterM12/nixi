import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  open,
  showToast,
  Toast,
  showHUD,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  api,
  captureFormat,
  baseUrl,
  browserOptions,
  formatOptions,
  getStatus,
  Options,
  parseLinks,
  qualityOptions,
  Snapshot,
} from "./nixi";
import Queue from "./queue";
export function CaptureForm({
  url,
  audioOnly = false,
}: {
  url?: string;
  audioOnly?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<Snapshot>();
  const [urls, setUrls] = useState(url || "");
  const [error, setError] = useState<string>();
  const [format, setFormat] = useState(audioOnly ? "mp3" : "video");
  const [cookiesBrowser, setCookiesBrowser] = useState("none");
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const status = await getStatus();
        if (!mounted) return;
        setState(status);
        setFormat(captureFormat(status.settings.format, audioOnly));
        setCookiesBrowser(status.settings.cookiesBrowser);
        if (!url) {
          const text = await Clipboard.readText();
          if (text && mounted) {
            try {
              setUrls(parseLinks(text).join("\n"));
            } catch {
              /* Leave unrelated clipboard text alone. */
            }
          }
        }
      } catch (error) {
        if (mounted) setError((error as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  async function submit(values: Options & { urls: string }) {
    if (!state?.system.ready) {
      await showToast({
        style: Toast.Style.Failure,
        title: "nixi is not ready",
        message: error || "Finish setup and reopen this command.",
      });
      return;
    }
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Adding to nixi",
    });
    setLoading(true);
    try {
      const result = await api<{ jobs: unknown[]; skipped: number }>(
        "/api/jobs",
        "POST",
        { ...values, urls: parseLinks(values.urls) },
      );
      toast.style = Toast.Style.Success;
      toast.title = result.jobs.length
        ? `${result.jobs.length} captures queued`
        : "Already in the queue";
      toast.message = "Downloads continue in the background.";
      toast.hide();
      await showHUD(
        `Nixi: ${result.jobs.length ? `${result.jobs.length} captures queued` : "already in the queue"}`,
      );
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not queue downloads";
      toast.message = (error as Error).message;
    } finally {
      setLoading(false);
    }
  }
  return (
    <Form
      isLoading={loading}
      navigationTitle={audioOnly ? "Nixi: Extract Audio" : "Nixi: Capture"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={audioOnly ? "Extract Audio" : "Capture"}
            icon={Icon.Download}
            onSubmit={submit}
          />
          <Action.Push title="Show Queue" icon={Icon.List} target={<Queue />} />
          <Action
            title="Check Cookie Access"
            icon={Icon.Lock}
            onAction={async () => {
              const toast = await showToast({
                style: Toast.Style.Animated,
                title: "Checking cookie access",
              });
              try {
                const result = await api<{ ok: boolean; message: string }>(
                  "/api/cookies/check",
                  "POST",
                  { cookiesBrowser },
                );
                toast.style = result.ok
                  ? Toast.Style.Success
                  : Toast.Style.Failure;
                toast.title = result.ok
                  ? "Cookie access works"
                  : "Cookie access needs attention";
                toast.message = result.message;
                if (!result.ok)
                  toast.primaryAction = {
                    title: "Open Permission Help",
                    onAction: () => open(baseUrl()),
                  };
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Could not check cookies";
                toast.message = (error as Error).message;
              }
            }}
          />
          <Action
            title="Open Web Interface"
            icon={Icon.Globe}
            onAction={() => open(baseUrl())}
          />
        </ActionPanel>
      }
    >
      {error && <Form.Description title="nixi is offline" text={error} />}
      <Form.TextArea
        id="urls"
        title="Media Links"
        placeholder="https://… (one link per line)"
        value={urls}
        onChange={setUrls}
      />
      <Form.Separator />
      <Form.Dropdown
        id="format"
        title="Format"
        value={format}
        onChange={setFormat}
      >
        {formatOptions
          .filter(
            ([value]) => !audioOnly || !["video", "original"].includes(value),
          )
          .map(([value, title]) => (
            <Form.Dropdown.Item key={value} value={value} title={title} />
          ))}
      </Form.Dropdown>
      {format === "original" && (
        <Form.Description text="The original stays untouched. A playable MP4 is added when needed." />
      )}
      {["video", "original"].includes(format) && (
        <Form.Dropdown
          id="quality"
          title="Maximum Resolution"
          key={state?.settings.quality || "best"}
          defaultValue={state?.settings.quality || "best"}
        >
          {qualityOptions.map(([value, title]) => (
            <Form.Dropdown.Item key={value} value={value} title={title} />
          ))}
        </Form.Dropdown>
      )}
      <Form.Dropdown
        id="cookiesBrowser"
        title="Browser Cookies"
        value={cookiesBrowser}
        onChange={setCookiesBrowser}
        info="Zen uses its own Firefox-compatible profile. Safari requires Full Disk Access for the download tool. Use Check Cookie Access in the action menu."
      >
        {browserOptions.map(([value, title]) => (
          <Form.Dropdown.Item key={value} value={value} title={title} />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="playlist"
        label="Include entire playlist"
        key={`p-${state?.settings.playlist}`}
        defaultValue={state?.settings.playlist || false}
      />
      <Form.Checkbox
        id="subtitles"
        label="Save English subtitles when available"
        key={`s-${state?.settings.subtitles}`}
        defaultValue={state?.settings.subtitles || false}
      />
      <Form.Description
        title="Saved locally"
        text={
          state
            ? `Downloads go to ${state.settings.downloadDir}. Raycast and the web app share one queue.`
            : "Connecting to nixi…"
        }
      />
    </Form>
  );
}
