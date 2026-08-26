import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@baze/db", "@baze/config"],
  // Monorepo: pin the workspace root (two levels up) so Next resolves the
  // hoisted packages instead of mis-inferring the root from apps/admin.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
