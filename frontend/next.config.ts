import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  experimental: {
    memoryBasedWorkersCount: true,
  },
};

export default nextConfig;
