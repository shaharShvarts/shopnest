import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE ?? 0),
    },
  },
};
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
