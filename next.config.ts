import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the panel and ends up in design
  // screenshots; the route overlay stays available via the terminal.
  devIndicators: false,
  /* config options here */
};

export default nextConfig;
