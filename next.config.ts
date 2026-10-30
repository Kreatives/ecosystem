import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Browser-packages niet in de serverbundle stoppen (zwaar + native).
  serverExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium'],
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
