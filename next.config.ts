import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `STATIC_EXPORT=1 npm run build` writes plain files to out/ for static
  // hosts such as Azure Static Web Apps; the app has no server code.
  output: process.env.STATIC_EXPORT ? "export" : undefined,
  // The floating dev badge sits on top of the sidebar account block.
  devIndicators: false,
  // Static export can't do partial prerendering, which both of these turn on.
  cacheComponents: !process.env.STATIC_EXPORT,
  partialPrefetching: !process.env.STATIC_EXPORT,
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
