import type { CapacitorConfig } from '@capacitor/cli'

// กำหนดค่า Capacitor สำหรับ wrapping Next.js เป็น Android APK
const config: CapacitorConfig = {
  appId:   'com.siamamsterdam.pos',
  appName: 'Siam Amsterdam POS',
  webDir:  'out',

  // โหลด web app จาก Next.js server (ไม่ใช่ static bundle เพราะมี API routes)
  // — dev:  ชี้ไป localhost ของเครื่อง dev
  // — prod: เปลี่ยนเป็น URL Vercel ก่อน `npx cap sync`
  server: {
    url:       'http://localhost:3000',
    cleartext: true,           // ต้องการสำหรับ HTTP (ไม่ใช่ HTTPS) บน Android
  },

  plugins: {
    SplashScreen: { launchShowDuration: 0 },
  },
}

export default config
