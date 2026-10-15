import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Vercel restores .next/cache between builds, and a warm Turbopack cache shipped
    // Tailwind output compiled from an old globals.css (new utilities, old theme).
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
