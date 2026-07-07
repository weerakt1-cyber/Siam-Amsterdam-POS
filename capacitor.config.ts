import type { CapacitorConfig } from '@capacitor/cli'

// กำหนดค่า Capacitor สำหรับ wrapping Next.js เป็น Android APK
const config: CapacitorConfig = {
  appId:   'com.baze.pos',
  appName: 'Baze POS',
  webDir:  'out',

  // The APK is a thin native shell that loads the live web app from Vercel
  // (not a static bundle — this app has server-side API routes + Supabase).
  // This is required for the Bluetooth thermal printer, which needs the native
  // Capacitor layer that only exists inside the installed app.
  //
  // For on-device DEV against your own machine instead, temporarily swap the
  // url to 'http://<your-computer-LAN-ip>:3000' and add `cleartext: true`,
  // then `npx cap sync`. Change it back to the production URL before shipping.
  server: {
    url: 'https://siam-amsterdam-pos.vercel.app',
  },

  plugins: {
    SplashScreen: { launchShowDuration: 0 },
  },
}

export default config
