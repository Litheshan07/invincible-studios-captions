import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large video uploads (up to 500 MB) via Server Actions
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
