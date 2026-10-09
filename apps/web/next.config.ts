import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@naija/engine", "@naija/online"],
  cacheComponents: true,
  partialPrefetching: true,
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
