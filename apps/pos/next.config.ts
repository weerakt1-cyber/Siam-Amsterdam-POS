import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Monorepo: pin the workspace root to the repo root (two levels up), where the
  // hoisted node_modules (incl. next) live. Without this Next mis-infers the root
  // from apps/pos and can't resolve the hoisted next package / file tracing.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  // ลด bundle ที่ส่งไป client — เร็วขึ้นทุก page load
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
  // อนุญาตให้มือถือ/อุปกรณ์อื่นในวง LAN เข้าถึง dev server ได้ (เช่น สแกน QR ทดสอบ /order/[tableNo])
  // Next.js บล็อก cross-origin request ไป dev assets โดย default — ถ้าไม่เพิ่ม IP ตรงนี้ หน้าเว็บจะค้าง
  // ที่ loading เพราะ JS bundle โหลดไม่ขึ้น ถ้า IP เครื่องเปลี่ยน (DHCP) ให้เช็คใหม่ด้วย `ipconfig` แล้วแก้ตรงนี้
  allowedDevOrigins: ['192.168.1.169'],

  // The Android APK's WebView loads this site live (see capacitor.config.ts) and
  // its HTTP cache can be more stubborn than a normal browser's about re-fetching
  // the HTML shell after a deploy. Force every page document to revalidate so a
  // tablet reopening the app always gets the latest build instead of a stale
  // cached page. Hashed /_next/static/* assets are untouched — those stay
  // long-cached since their filename changes whenever the content does.
  async headers() {
    return [
      {
        source: '/:path((?!_next/static|_next/image).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
};

export default nextConfig;
