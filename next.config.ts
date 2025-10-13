import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const maxSize = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE);
const bodySizeLimit = maxSize > 1 ? (`${maxSize}mb` as const) : "5mb";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit,
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      issuer: /\.[jt]sx?$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
