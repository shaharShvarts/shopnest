import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";

const maxSize = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE);
const bodySizeLimit = maxSize > 1 ? (`${maxSize}mb` as const) : "5mb";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: {
    authInterrupts: true,
    serverActions: {
      bodySizeLimit,
    },
  },
  eslint: {
    ignoreDuringBuilds: false,
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

// A production build must not overwrite chunks used by a running dev server.
export default (phase: string) => withNextIntl({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});
