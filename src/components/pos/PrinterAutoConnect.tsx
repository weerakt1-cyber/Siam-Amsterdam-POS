'use client'

import { useEffect } from 'react'
import { bluetoothManager } from '@/lib/bluetooth-manager'

/**
 * PrinterAutoConnect — เชื่อมต่อเครื่องพิมพ์ที่บันทึกไว้อัตโนมัติเมื่อเปิด POS
 *
 * แยกเป็น client component เพราะ pos/layout.tsx เป็น server component
 * (มี export const metadata). ตัวนี้ไม่ render อะไร แค่ trigger ให้ manager
 * reconnect + เริ่ม health-check เมื่อ dashboard โหลด. บน browser มัน no-op.
 */
export default function PrinterAutoConnect() {
  useEffect(() => {
    bluetoothManager.autoConnectOnStartup().catch(() => {})
  }, [])
  return null
}
