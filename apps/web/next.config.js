const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the desktop shell (apps/desktop).
  // `next build` then emits .next/standalone/apps/web/server.js + traced node_modules.
  output: "standalone",
  // Monorepo: trace files from the repo root so workspace packages are included.
  // On Next 14 this lives under `experimental` (top-level only in Next 15+).
  experimental: { outputFileTracingRoot: path.join(__dirname, "../../") },
  transpilePackages: [
    "@vibestudio/database",
    "@vibestudio/config",
    "@vibestudio/logging",
    "@vibestudio/utils",
    "@vibestudio/dev-portal",
  ],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100") + "/api/v1/:path*",
      },
    ];
  },
};
module.exports = nextConfig;
