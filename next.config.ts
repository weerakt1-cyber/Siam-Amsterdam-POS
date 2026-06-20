import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ลด bundle ที่ส่งไป client — เร็วขึ้นทุก page load
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
};

export default nextConfig;
