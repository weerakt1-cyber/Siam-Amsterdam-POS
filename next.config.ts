import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ลด bundle ที่ส่งไป client — เร็วขึ้นทุก page load
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
  // อนุญาตให้มือถือ/อุปกรณ์อื่นในวง LAN เข้าถึง dev server ได้ (เช่น สแกน QR ทดสอบ /order/[tableNo])
  // Next.js บล็อก cross-origin request ไป dev assets โดย default — ถ้าไม่เพิ่ม IP ตรงนี้ หน้าเว็บจะค้าง
  // ที่ loading เพราะ JS bundle โหลดไม่ขึ้น ถ้า IP เครื่องเปลี่ยน (DHCP) ให้เช็คใหม่ด้วย `ipconfig` แล้วแก้ตรงนี้
  allowedDevOrigins: ['192.168.1.169'],
};

export default nextConfig;
