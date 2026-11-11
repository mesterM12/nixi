export const formatChoices = [
  ["video", "Video · MP4"],
  ["original", "Video · Original"],
  ["mp3", "Audio · MP3"],
  ["m4a", "Audio · M4A"],
  ["opus", "Audio · Opus"],
  ["flac", "Audio · FLAC"],
  ["wav", "Audio · WAV"],
] as const;
export const qualityChoices = [
  ["best", "Best available"],
  ["2160", "Up to 4K"],
  ["1440", "Up to 1440p"],
  ["1080", "Up to 1080p"],
  ["720", "Up to 720p"],
  ["480", "Up to 480p"],
] as const;
export const browserChoices = [
  ["none", "No browser"],
  ["chrome", "Chrome"],
  ["chromium", "Chromium"],
  ["firefox", "Firefox"],
  ["zen", "Zen"],
  ["safari", "Safari"],
  ["edge", "Edge"],
  ["brave", "Brave"],
  ["opera", "Opera"],
  ["vivaldi", "Vivaldi"],
  ["whale", "Whale"],
] as const;
