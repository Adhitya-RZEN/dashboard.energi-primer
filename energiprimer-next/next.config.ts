import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Allow the LAN URL used for browser testing to load Next.js dev chunks.
  // This only affects `next dev`; production assets are same-origin.
  allowedDevOrigins: ["192.168.1.6"],
};

export default nextConfig;
