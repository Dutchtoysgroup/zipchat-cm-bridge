import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained bundle voor Azure App Service (`node server.js`).
  output: "standalone",
  // Anders pakt Next een lockfile hogerop in de thuismap als root, en belandt
  // server.js in een submap van .next/standalone.
  outputFileTracingRoot: __dirname,
  // De bridge-endpoints mogen nooit gecached worden.
  async headers() {
    return [
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
