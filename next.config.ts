import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE ?? 0),
    },
  },
  i18n: {
    locales: ["en", "he"],
    defaultLocale: "en",
  },
};

export default nextConfig;
