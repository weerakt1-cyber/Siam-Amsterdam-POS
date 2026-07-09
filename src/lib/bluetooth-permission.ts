/**
 * bluetooth-permission.ts
 * TypeScript bridge สำหรับ BluetoothPermissionPlugin (Kotlin)
 *
 * ใช้ Capacitor registerPlugin เพื่อสร้าง type-safe bridge ไปยัง native layer
 */

import { registerPlugin } from '@capacitor/core'

export interface BluetoothPermissionStatus {
  bluetooth:        'granted' | 'denied' | 'prompt'
  bluetoothScan:    'granted' | 'denied' | 'prompt'
  bluetoothConnect: 'granted' | 'denied' | 'prompt'
  location:         'granted' | 'denied' | 'prompt'
  allGranted:       boolean
}

export interface BluetoothPermissionPlugin {
  checkPermissions():   Promise<BluetoothPermissionStatus>
  requestPermissions(): Promise<BluetoothPermissionStatus>
}

/**
 * BluetoothPermission — Capacitor bridge ไปยัง BluetoothPermissionPlugin.kt
 *
 * ใช้งาน:
 *   import { BluetoothPermission } from '@/lib/bluetooth-permission'
 *
 *   const status = await BluetoothPermission.requestPermissions()
 *   if (!status.allGranted) { alert('กรุณาให้สิทธิ์ Bluetooth ในการตั้งค่า') }
 */
export const BluetoothPermission = registerPlugin<BluetoothPermissionPlugin>(
  'BluetoothPermission',
  {
    // web fallback — บน browser ถือว่า granted เสมอ (ไม่ใช้ BT จริง)
    web: {
      checkPermissions:   async () => fullGranted(),
      requestPermissions: async () => fullGranted(),
    },
  }
)

function fullGranted(): BluetoothPermissionStatus {
  return {
    bluetooth:        'granted',
    bluetoothScan:    'granted',
    bluetoothConnect: 'granted',
    location:         'granted',
    allGranted:       true,
  }
}
