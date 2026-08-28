import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // De bridge-endpoints mogen nooit gecached worden.
  async headers() {
    return [
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
