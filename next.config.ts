import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { MAX_IMAGE_UPLOAD_BYTES } from "./src/lib/images/upload-limits.mjs";
import createNextIntlPlugin from "next-intl/plugin";

// Allow multipart/form fields in addition to the separately enforced file limit.
const bodySizeLimit = `${Math.ceil(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)) + 1}mb` as const;

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
