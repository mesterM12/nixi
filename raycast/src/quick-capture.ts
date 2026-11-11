import { Clipboard, showHUD, showToast, Toast } from "@raycast/api";
import { api, getStatus, parseLinks } from "./nixi";
export default async function Command() {
  try {
    const urls = parseLinks((await Clipboard.readText()) || "");
    const state = await getStatus();
    const result = await api<{ jobs: unknown[] }>("/api/jobs", "POST", {
      urls,
      ...state.settings,
    });
    await showHUD(
      result.jobs.length
        ? `nixi: ${result.jobs.length} links queued`
        : "nixi: already in the queue",
    );
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not capture links",
      message: (error as Error).message,
    });
  }
}
