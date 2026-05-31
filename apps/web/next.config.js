/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
