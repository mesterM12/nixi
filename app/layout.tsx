import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "nixi — Capture what moves.",
  description:
    "A quiet little utility for keeping the internet close. Save video and audio with one queue for the web and Raycast.",
  icons: {
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="dark"
      data-deck="phosphor"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
