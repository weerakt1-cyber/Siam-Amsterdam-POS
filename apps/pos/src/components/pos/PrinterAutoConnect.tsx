'use client'

import { useEffect } from 'react'
import { bluetoothManager } from '@/lib/bluetooth-manager'

/**
 * PrinterAutoConnect — เชื่อมต่อเครื่องพิมพ์ที่บันทึกไว้อัตโนมัติเมื่อเปิด POS
 * และ "ปลุก" การเชื่อมต่อใหม่ทุกครั้งที่กลับมาหน้าจอหลังพักไว้สักพัก.
 *
 * แยกเป็น client component เพราะ pos/layout.tsx เป็น server component
 * (มี export const metadata). ตัวนี้ไม่ render อะไร แค่ trigger ให้ manager
 * reconnect + เริ่ม health-check. บน browser มัน no-op.
 *
 * ทำไมต้องมี resume handler: Android ตัด Bluetooth socket ทิ้งตอนแอปพักอยู่
 * background และ health-check timer ถูก throttle จนไม่รู้ว่าหลุด — พอกลับมา
 * state ยังบอกว่า connected แต่ socket ตายแล้ว เลยปริ้นไม่ออกจนต้องปิดแอปเปิดใหม่.
 * เมื่อกลับมา foreground เราเรียก ensureConnected() ให้เช็ค socket จริงแล้ว
 * reconnect ทันทีถ้าตาย.
 */
export default function PrinterAutoConnect() {
  useEffect(() => {
    bluetoothManager.autoConnectOnStartup().catch(() => {})

    let debounce: ReturnType<typeof setTimeout> | null = null
    const wake = () => {
      if (debounce) clearTimeout(debounce)
      // Small delay so the WebView/BT stack has settled after resume.
      debounce = setTimeout(() => { bluetoothManager.ensureConnected().catch(() => {}) }, 400)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') wake() }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', wake)
    return () => {
      if (debounce) clearTimeout(debounce)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', wake)
    }
  }, [])
  return null
}
