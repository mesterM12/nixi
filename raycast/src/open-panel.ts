import { open, showToast, Toast } from "@raycast/api";
import { baseUrl } from "./nixi";
export default async function Command() {
  try {
    await open(baseUrl());
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not open nixi",
      message: (error as Error).message,
    });
  }
}
