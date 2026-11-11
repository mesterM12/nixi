import type { NextConfig } from "next";
const config: NextConfig = {
  ...(process.env.NODE_ENV === "development"
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:43175/api/:path*",
            },
          ];
        },
      }
    : { output: "export" as const }),
  poweredByHeader: false,
  images: { unoptimized: true },
  reactStrictMode: true,
  experimental: { optimizePackageImports: ["lucide-react"] },
  turbopack: { root: process.cwd() },
};
export default config;
