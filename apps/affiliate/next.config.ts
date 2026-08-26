import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@baze/db", "@baze/config"],
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
