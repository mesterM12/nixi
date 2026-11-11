import { expect, test } from "vitest";
import { compatibilityPlan } from "../../src/media";

test("MP4 compatibility checks codecs and pixel format, regardless of the file extension", () => {
  expect(
    compatibilityPlan([
      { codec_type: "video", codec_name: "vp9", pix_fmt: "yuv420p" },
      { codec_type: "audio", codec_name: "aac", profile: "LC" },
    ]),
  ).toEqual({ video: true, audio: false });
  expect(
    compatibilityPlan([
      { codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p" },
      { codec_type: "audio", codec_name: "opus" },
    ]),
  ).toEqual({ video: false, audio: true });
  expect(
    compatibilityPlan([
      { codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p10le" },
      { codec_type: "audio", codec_name: "aac", profile: "HE-AAC" },
    ]),
  ).toEqual({ video: true, audio: true });
  expect(
    compatibilityPlan([
      { codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p" },
    ]),
  ).toEqual({ video: false, audio: false });
  expect(() =>
    compatibilityPlan([{ codec_type: "audio", codec_name: "aac" }]),
  ).toThrow("no video");
});

test("known dimensions above a resolution limit require resizing", () => {
  const stream = [
    {
      codec_type: "video",
      codec_name: "h264",
      pix_fmt: "yuv420p",
      height: 2160,
    },
  ];
  expect(compatibilityPlan(stream, 720).video).toBe(true);
  expect(compatibilityPlan(stream, 2160).video).toBe(false);
});
