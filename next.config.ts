import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the panel and ends up in design
  // screenshots; the route overlay stays available via the terminal.
  devIndicators: false,
  /* A production build writes over whatever a running dev server is using and
     kills it. Point the verification build somewhere else instead:
       NEXT_DIST_DIR=.next-prod npm run build */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  /* config options here */
};

export default nextConfig;
