import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE ?? 0),
    },
  },
};

export default nextConfig;
