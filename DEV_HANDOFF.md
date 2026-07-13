# 📋 Baze POS — Dev Handoff Brief
> Copy-paste ส่งให้ dev ได้เลย (Line / Slack / Discord / Notion)

---

## 🏗️ Project Overview

**ชื่อ:** Baze POS (`com.baze.pos`)  
**เป้าหมาย:** POS + Business Management all-in-one สำหรับร้านอาหาร/คาเฟ่ไทย SME  
**Concept:** One-App-Business — ดูได้ทุกอย่างจากแอปเดียว, มี AI ช่วยวิเคราะห์ธุรกิจ, จำกัดสิทธิ์ตามตำแหน่ง

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Mobile | Capacitor — APK wraps web จาก Vercel (ไม่ใช่ static bundle) |
| Backend / DB | Supabase (PostgreSQL + Realtime) |
| Hosting | Vercel (web) + Railway (optional services) |
| AI | Claude API (Haiku สำหรับ query เร็ว, Sonnet สำหรับวิเคราะห์ลึก) |
| Hardware | Xprinter XP58 thermal printer via `capacitor-thermal-printer` v0.2.5 |
| Notifications | LINE Notify, Telegram Bot, Gmail (API routes อยู่แล้ว) |

**App URL:** https://siam-amsterdam-pos.vercel.app  
**Android load URL:** `server.url` ใน `capacitor.config.ts` ชี้ไปที่ Vercel production

---

## 📁 Structure ที่สำคัญ

```
src/
  app/
    pos/                    # หน้าหลักทั้งหมด (floor, items, cash, analytics, settings, ...)
    api/                    # API routes (orders, menu, inventory, ai, line, telegram, printer, ...)
    auth/                   # Login flow (Google OAuth + LINE Login)
    order/[tableNo]/        # Self-order QR page
    kitchen/                # Kitchen display
  components/pos/           # Shared UI components (CheckoutModal, AIChatPanel, Sidebar, ...)
  lib/
    printer.ts              # ESC/POS, connectPrinter, printReceipt, openCashDrawer
    bluetooth-manager.ts    # ★ ใหม่ — BluetoothManager state machine + useBluetooth() hook
    bluetooth-permission.ts # ★ ใหม่ — Capacitor bridge สำหรับ runtime permissions
    store.ts                # Zustand global state
    supabase.ts             # Supabase client
    types.ts                # shared TypeScript types
android/
  app/src/main/java/com/baze/pos/
    MainActivity.java       # ★ แก้แล้ว — registerPlugin(BluetoothPermissionPlugin.class)
    BluetoothPermissionPlugin.kt  # ★ ใหม่ — Kotlin plugin ขอ runtime BT permissions
```

---

## ✅ งานที่ทำเสร็จแล้ว

### Core Features (พร้อม deploy)
- [x] POS หลัก — รับออเดอร์, table floor plan, checkout, split bill
- [x] Menu management + categories + ingredients
- [x] Inventory management + low-stock alerts
- [x] Cash drawer control (ESC/POS byte: 0x1B, 0x70)
- [x] Thermal printer (Xprinter XP58) — print receipt via BT + LAN/WiFi
- [x] Payment — PromptPay QR + Omise card
- [x] Members / Loyalty points
- [x] Coupons & discounts
- [x] Analytics dashboard (ยอดขาย, รายวัน, รายเดือน)
- [x] AI Chat Panel (Claude API) — วิเคราะห์เมนู, ให้คำแนะนำธุรกิจ
- [x] LINE Notify + Telegram Bot — ส่งรายงานอัตโนมัติ
- [x] Google Sheets export
- [x] Role-based auth (PIN lock ตามตำแหน่ง)
- [x] Kitchen display screen
- [x] Self-order QR (ลูกค้าสั่งเองผ่าน URL `/order/[tableNo]`)
- [x] Public API v1 (webhooks, menu, orders, analytics)

### Bluetooth Stability (เพิ่งเพิ่ม — รอ integrate)
- [x] `BluetoothManager` class พร้อม state machine ครบ
- [x] Auto-reconnect exponential backoff (3s → 7s → 15s)
- [x] BLE scan restart อัตโนมัติทุก 25 วิ (Android หยุด scan ที่ 30 วิ)
- [x] Health check ทุก 8 วิ — detect การหลุด + reconnect อัตโนมัติ
- [x] `BluetoothPermissionPlugin.kt` — runtime permissions Android 6–15
- [x] `useBluetooth()` React hook พร้อมใช้ใน component

---

## 🔴 งานที่ยังต้องทำ (Dev ต้องทำต่อ)

### 1. Sync Capacitor (บังคับ — ทำก่อนเลย)
```bash
npx cap sync android
```
> หลังจาก sync แล้ว BluetoothPermissionPlugin.kt จะถูก register กับ Capacitor bridge

---

### 2. Integrate `useBluetooth()` เข้ากับ Settings Page

ไฟล์เป้าหมาย: `src/app/pos/settings/page.tsx`  
(หรือ component ที่ handle printer settings อยู่ในนั้น)

```tsx
import { useBluetooth } from '@/lib/bluetooth-manager'
import { useEffect } from 'react'
import { bluetoothManager } from '@/lib/bluetooth-manager'

export default function SettingsPage() {
  const {
    state,            // 'idle' | 'scanning' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
    connectedDevice,  // { address: string, name: string } | null
    scannedDevices,   // PrinterDevice[]
    isConnected,
    isScanning,
    scan,
    connect,
    disconnect,
  } = useBluetooth()

  // Auto-connect เมื่อ app เปิด (ใส่ไว้ใน root layout หรือ settings)
  useEffect(() => {
    bluetoothManager.autoConnectOnStartup()
  }, [])

  return (
    <div>
      {/* สถานะ */}
      <p>Printer: {isConnected ? connectedDevice?.name : state}</p>

      {/* ปุ่ม Scan */}
      {!isConnected && (
        <button onClick={() => scan(() => {})}>
          {isScanning ? 'กำลังสแกน...' : 'สแกนหาเครื่องพิมพ์'}
        </button>
      )}

      {/* รายการ devices ที่สแกนเจอ */}
      {scannedDevices.map(device => (
        <button key={device.address} onClick={() => connect(device)}>
          {device.name || device.address}
        </button>
      ))}

      {/* ปุ่ม Disconnect */}
      {isConnected && (
        <button onClick={disconnect}>ยกเลิกการเชื่อมต่อ</button>
      )}
    </div>
  )
}
```

---

### 3. เรียก `autoConnectOnStartup()` ใน Root Layout

ไฟล์: `src/app/layout.tsx` หรือ `src/app/pos/layout.tsx`

```tsx
'use client'
import { useEffect } from 'react'
import { bluetoothManager } from '@/lib/bluetooth-manager'

export default function RootLayout({ children }) {
  useEffect(() => {
    bluetoothManager.autoConnectOnStartup()
  }, [])

  return <>{children}</>
}
```

---

### 4. Build & Test APK

```bash
# 1. Build Next.js (static output ถ้าใช้ static mode)
npm run build

# 2. Sync Capacitor
npx cap sync android

# 3. เปิด Android Studio
npx cap open android

# 4. Run บน device / emulator
#    หรือ build APK: Build > Generate Signed Bundle/APK
```

**ทดสอบ Bluetooth:**
1. เปิดแอปบน Android device จริง (ไม่ใช่ emulator)
2. เปิด Bluetooth + ให้สิทธิ์ Location เมื่อระบบถาม
3. กด Scan → เลือก Xprinter XP58
4. ทดสอบ print receipt
5. ปิด Bluetooth 30 วิ → เปิดใหม่ → ตรวจสอบว่า reconnect อัตโนมัติ

---

## ⚠️ สิ่งที่ต้องระวัง

| เรื่อง | หมายเหตุ |
|---|---|
| Bluetooth scan บน emulator | ไม่ได้ผล — ต้องใช้ Android device จริงเท่านั้น |
| Android 12+ (API 31+) | ต้องได้รับ BLUETOOTH_SCAN + BLUETOOTH_CONNECT runtime — BluetoothPermissionPlugin จัดการให้แล้ว |
| Location permission | capacitor-thermal-printer v0.2.5 ต้องการ ACCESS_FINE_LOCATION เสมอ (ทุก Android version) |
| Capacitor server URL | `capacitor.config.ts` → `server.url` ชี้ที่ Vercel production — ถ้า dev บนเครื่องตัวเองให้ชั่วคราวเปลี่ยนเป็น `http://<LAN-IP>:3000` |
| Core Bluetooth | เป็นของ Apple/iOS เท่านั้น — โปรเจคนี้ใช้ Android Bluetooth ผ่าน Capacitor plugin |

---

## 📞 ติดต่อ / Context

- **Owner:** Weerapat (weerakt1@gmail.com)
- **App ID:** `com.baze.pos`
- **Supabase project:** ดูใน `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`)
- **Vercel project:** siam-amsterdam-pos
- **Play Store:** ยังไม่ได้ submit (ต้องสมัคร Google Play Developer ก่อน $25 ครั้งเดียว)

> ถ้าติดปัญหา Bluetooth ให้ดู `src/lib/bluetooth-manager.ts` — มี comment อธิบายทุก step
