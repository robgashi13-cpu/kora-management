import type { NextConfig } from "next";

process.env.BROWSERSLIST_IGNORE_OLD_DATA = "true";
process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA = "true";

const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const basePath = isGithubActions && repoName ? `/${repoName}` : "";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  basePath,
  assetPrefix: basePath,
};

export default nextConfig;
