import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: allow HMR / dev assets when opening the app via Cloudflare Quick Tunnel
  // (origin is *.trycloudflare.com, not localhost). Safe in production (ignored).
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
