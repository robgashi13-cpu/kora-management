import type { NextConfig } from "next";

process.env.BROWSERSLIST_IGNORE_OLD_DATA = "true";
process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA = "true";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',
  images: {
    unoptimized: true
  },
  allowedDevOrigins: ['127.0.0.1', 'localhost']
};

export default nextConfig;
