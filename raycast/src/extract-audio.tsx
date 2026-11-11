import type { LaunchProps } from "@raycast/api";
import { CaptureForm } from "./capture-form";
export default function Command(
  props: LaunchProps<{ arguments: { url?: string } }>,
) {
  return <CaptureForm url={props.arguments?.url} audioOnly />;
}
