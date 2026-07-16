/**
 * BluetoothManager — Stable Bluetooth for Baze POS (Android / Capacitor)
 *
 * NOTE ON "CORE BLUETOOTH":
 *   Core Bluetooth คือ framework ของ Apple/iOS เท่านั้น
 *   โปรเจคนี้ใช้ Android Bluetooth API ผ่าน Capacitor plugin
 *   ถ้าต้องการ iOS ในอนาคต → `npx cap add ios` แล้วเขียน Swift plugin แยก
 *
 * ปัญหา Bluetooth ที่ไม่ stable บน Android และวิธีแก้ในไฟล์นี้:
 *   1. BLE scan หยุดเองทุก 30 วินาที (Android OS จำกัด) → restart scan อัตโนมัติ
 *   2. Connection หลุดไม่มี reconnect → exponential-backoff auto-reconnect
 *   3. ไม่รู้สถานะว่า connected จริงไหม → state machine ชัดเจน
 *   4. Runtime permissions ไม่ถูก request → requestBluetoothPermissions()
 *   5. ผู้ใช้กด pair แล้ว MAC หายเมื่อ restart → persist ใน Capacitor Preferences
 */

import { isNativePlatform, startScanPrinters, connectPrinter,
         disconnectPrinter, checkPrinterConnected,
         loadPrinterDevice, savePrinterDevice,
         type PrinterDevice } from './printer'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BTState =
  | 'idle'           // ยังไม่เริ่มทำอะไร
  | 'scanning'       // กำลังสแกนหาเครื่อง
  | 'connecting'     // กำลัง connect ครั้งแรก
  | 'connected'      // เชื่อมต่อแล้ว พร้อมพิมพ์
  | 'reconnecting'   // หลุดแล้วกำลัง reconnect อัตโนมัติ
  | 'failed'         // reconnect ครบ 3 ครั้งแล้วยังไม่ได้

export type BTEvent =
  | { type: 'stateChange';  state: BTState }
  | { type: 'devicesFound'; devices: PrinterDevice[] }
  | { type: 'connected';    device: PrinterDevice }
  | { type: 'disconnected' }
  | { type: 'error';        message: string }

type Listener = (event: BTEvent) => void

// ─── Constants ─────────────────────────────────────────────────────────────────

// Android จะหยุด BLE scan เองที่ 30 วิ → restart ที่ 25 วิเพื่อความปลอดภัย
const SCAN_RESTART_MS   = 25_000

// reconnect backoff: 3s, 7s, 15s แล้วหยุด
const RECONNECT_DELAYS  = [3_000, 7_000, 15_000]

// poll checkPrinterConnected ทุกกี่ ms เพื่อตรวจจับว่าหลุด
const HEALTH_CHECK_MS   = 8_000

// connect() ต้องไม่ค้างตลอดกาล — ถ้าเกินเวลานี้ถือว่า fail (กัน UI ล็อกที่ "...")
const CONNECT_TIMEOUT_MS = 12_000

// ─── Manager ────────────────────────────────────────────────────────────────────

class BluetoothManager {
  private state: BTState = 'idle'
  private listeners: Set<Listener> = new Set()
  private connectedDevice: PrinterDevice | null = null

  private scanStopFn:       (() => void) | null = null
  private scanRestartTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer:   ReturnType<typeof setTimeout> | null = null
  private healthTimer:      ReturnType<typeof setInterval> | null = null
  private reconnectAttempt  = 0

  // ─── Subscribe ──────────────────────────────────────────────────────────────

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    // ส่ง state ปัจจุบันทันทีที่ subscribe (ไม่ต้องรอ event ถัดไป)
    fn({ type: 'stateChange', state: this.state })
    return () => this.listeners.delete(fn)
  }

  private emit(event: BTEvent) {
    this.listeners.forEach(fn => fn(event))
  }

  private setState(s: BTState) {
    if (this.state === s) return
    this.state = s
    this.emit({ type: 'stateChange', state: s })
  }

  getState()           { return this.state }
  getConnectedDevice() { return this.connectedDevice }

  // ─── Runtime Permissions (Android 12+ requires BLUETOOTH_SCAN/CONNECT) ───────

  /**
   * ขอ runtime permissions สำหรับ Bluetooth
   * ต้องเรียกก่อน scan หรือ connect เสมอ
   * ถ้า plugin ไม่มี requestPermissions → ให้ native plugin handle เอง
   */
  async requestBluetoothPermissions(): Promise<boolean> {
    if (!isNativePlatform()) return true // browser ไม่ต้องขอ

    // ทางที่ 1 (ดีที่สุด): BluetoothPermissionPlugin.kt ของเราเอง — ขอ
    // BLUETOOTH_SCAN/CONNECT + FINE_LOCATION ครบตาม Android version.
    try {
      const { BluetoothPermission } = await import('./bluetooth-permission')
      const status = await BluetoothPermission.requestPermissions()
      if (status.allGranted) return true
      this.emit({ type: 'error', message: 'ไม่ได้รับสิทธิ์ Bluetooth/Location — ไปที่ Settings → Apps → Baze POS → Permissions' })
      return false
    } catch {
      // native plugin ยังไม่ถูก register (APK เก่าที่ยังไม่ cap sync) → ลองทางที่ 2
    }

    // ทางที่ 2 (fallback): ใช้ requestPermissions ของ capacitor-thermal-printer เอง
    try {
      const { CapacitorThermalPrinter } = await import('capacitor-thermal-printer')
      const plugin = CapacitorThermalPrinter as { requestPermissions?: () => Promise<Record<string, string>> }
      if (typeof plugin.requestPermissions === 'function') {
        const result = await plugin.requestPermissions()
        const granted = Object.values(result ?? {}).every(v => v === 'granted')
        if (!granted) {
          this.emit({ type: 'error', message: 'ไม่ได้รับสิทธิ์ Bluetooth — ไปที่ Settings → Apps → Baze POS → Permissions' })
        }
        return granted
      }
      // plugin เก่าไม่มี requestPermissions → ให้ startScan ทำเอง
      return true
    } catch {
      return true // ถ้า import ล้มเหลวให้ลองต่อไป
    }
  }

  // ─── Connect helper ────────────────────────────────────────────────────────

  /**
   * connectPrinter() ที่มี timeout — กัน state ค้างที่ 'connecting'/'reconnecting'
   * ตลอดกาลเวลา connect hang (เช่น เครื่องพิมพ์ปิดอยู่). หมายเหตุ: setTimeout ถูก
   * throttle ถ้า WebView อยู่ background ดังนั้น timeout จะทำงานแม่นเมื่ออยู่ foreground.
   */
  private connectWithTimeout(address: string, ms = CONNECT_TIMEOUT_MS): Promise<string> {
    return Promise.race([
      connectPrinter(address),
      new Promise<string>((_, rej) =>
        setTimeout(() => rej(new Error('เชื่อมต่อไม่สำเร็จ — ตรวจว่าเปิดเครื่องพิมพ์และเปิด Location')), ms)),
    ])
  }

  // ─── Scan ───────────────────────────────────────────────────────────────────

  /**
   * สแกนหา Bluetooth printers
   * - restart scan อัตโนมัติทุก 25 วิ (Android หยุด BLE scan ที่ 30 วิ)
   * - เรียก stopScan() เพื่อหยุด
   */
  async startScan(onDevices: (devices: PrinterDevice[]) => void): Promise<void> {
    if (!isNativePlatform()) {
      this.emit({ type: 'error', message: 'Bluetooth scan ต้องใช้ใน Android app เท่านั้น' })
      return
    }

    await this.stopScan()

    const ok = await this.requestBluetoothPermissions()
    if (!ok) return

    this.setState('scanning')
    await this._doScan(onDevices)
  }

  private async _doScan(onDevices: (d: PrinterDevice[]) => void) {
    const allDevices = new Map<string, PrinterDevice>()

    try {
      this.scanStopFn = await startScanPrinters(
        (devices) => {
          devices.forEach(d => allDevices.set(d.address, d))
          onDevices([...allDevices.values()])
          this.emit({ type: 'devicesFound', devices: [...allDevices.values()] })
        },
        () => {
          // onFinish callback — scan หมดเวลา plugin บอก
          if (this.state === 'scanning') this._scheduleScanRestart(onDevices)
        },
      )
    } catch (err) {
      this.emit({ type: 'error', message: `Scan ล้มเหลว: ${(err as Error).message}` })
      this.setState('idle')
      return
    }

    // restart ก่อน 30 วิ กันไว้ก่อนที่ Android จะหยุดเอง
    this._scheduleScanRestart(onDevices)
  }

  private _scheduleScanRestart(onDevices: (d: PrinterDevice[]) => void) {
    this.scanRestartTimer = setTimeout(async () => {
      if (this.state !== 'scanning') return
      if (this.scanStopFn) { this.scanStopFn(); this.scanStopFn = null }
      await this._doScan(onDevices)
    }, SCAN_RESTART_MS)
  }

  async stopScan(): Promise<void> {
    if (this.scanRestartTimer) { clearTimeout(this.scanRestartTimer); this.scanRestartTimer = null }
    if (this.scanStopFn) { this.scanStopFn(); this.scanStopFn = null }
    if (this.state === 'scanning') this.setState('idle')
  }

  // ─── Connect ────────────────────────────────────────────────────────────────

  /**
   * เชื่อมต่อ printer จาก scan result
   * - บันทึก MAC ไว้สำหรับ auto-reconnect
   * - เริ่ม health check loop
   */
  async connect(device: PrinterDevice): Promise<void> {
    await this.stopScan()
    await this.disconnect()

    this.setState('connecting')
    this.reconnectAttempt = 0

    try {
      const name = await this.connectWithTimeout(device.address)
      this.connectedDevice = { ...device, name }
      await savePrinterDevice(device.address, name)
      this.setState('connected')
      this.emit({ type: 'connected', device: this.connectedDevice })
      this._startHealthCheck()
    } catch (err) {
      this.setState('failed')
      this.emit({ type: 'error', message: `เชื่อมต่อล้มเหลว: ${(err as Error).message}` })
    }
  }

  // ─── Auto-reconnect ─────────────────────────────────────────────────────────

  /**
   * reconnect ด้วย MAC ที่บันทึกไว้ล่าสุด
   * ใช้ exponential backoff: 3s, 7s, 15s
   */
  async reconnectSaved(): Promise<void> {
    const saved = await loadPrinterDevice()
    if (!saved) return

    this._stopHealthCheck()
    this.setState('reconnecting')
    this._tryReconnect(saved)
  }

  private _tryReconnect(device: PrinterDevice) {
    if (this.reconnectAttempt >= RECONNECT_DELAYS.length) {
      this.setState('failed')
      this.emit({ type: 'error', message: `ไม่สามารถ reconnect ได้หลัง ${RECONNECT_DELAYS.length} ครั้ง — กด Scan ใหม่` })
      return
    }

    const delay = RECONNECT_DELAYS[this.reconnectAttempt]
    this.reconnectAttempt++

    this.reconnectTimer = setTimeout(async () => {
      try {
        const name = await this.connectWithTimeout(device.address)
        this.connectedDevice = { ...device, name }
        this.reconnectAttempt = 0
        this.setState('connected')
        this.emit({ type: 'connected', device: this.connectedDevice })
        this._startHealthCheck()
      } catch {
        // ยังไม่ได้ → รอ delay ถัดไป
        this._tryReconnect(device)
      }
    }, delay)
  }

  // ─── Health Check ────────────────────────────────────────────────────────────

  /**
   * ตรวจทุก 8 วิว่า printer ยังเชื่อมต่ออยู่ไหม
   * ถ้าหลุด → เริ่ม reconnect อัตโนมัติ
   */
  private _startHealthCheck() {
    this._stopHealthCheck()
    this.healthTimer = setInterval(async () => {
      if (this.state !== 'connected') { this._stopHealthCheck(); return }

      try {
        const ok = await checkPrinterConnected()
        if (!ok) {
          this.emit({ type: 'disconnected' })
          this._stopHealthCheck()
          await this.reconnectSaved()
        }
      } catch {
        // checkPrinterConnected throw → ถือว่าหลุด
        this.emit({ type: 'disconnected' })
        this._stopHealthCheck()
        await this.reconnectSaved()
      }
    }, HEALTH_CHECK_MS)
  }

  private _stopHealthCheck() {
    if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null }
  }

  // ─── Disconnect ──────────────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    this._stopHealthCheck()
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.connectedDevice = null
    await disconnectPrinter()
    this.setState('idle')
    this.emit({ type: 'disconnected' })
  }

  // ─── Auto-connect on app start ───────────────────────────────────────────────

  /**
   * เรียกเมื่อ app เปิดขึ้นมา
   * ถ้ามี printer ที่ pair ไว้ก่อนหน้า → connect อัตโนมัติ
   */
  async autoConnectOnStartup(): Promise<void> {
    if (!isNativePlatform()) return
    const saved = await loadPrinterDevice()
    if (!saved) return

    const ok = await this.requestBluetoothPermissions()
    if (!ok) return

    this.setState('connecting')
    try {
      const name = await this.connectWithTimeout(saved.address)
      this.connectedDevice = { ...saved, name }
      this.setState('connected')
      this.emit({ type: 'connected', device: this.connectedDevice })
      this._startHealthCheck()
    } catch {
      // ไม่ได้ → รอ user เปิด Bluetooth เอง หรือ scan ใหม่
      this.setState('idle')
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const bluetoothManager = new BluetoothManager()

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * useBluetooth() — React hook สำหรับ component ทุกตัวที่ต้องแสดงสถานะ BT
 *
 * Example:
 *   const { state, connectedDevice } = useBluetooth()
 *   if (state === 'connected') { ... }
 */
import { useState, useEffect } from 'react'

export function useBluetooth() {
  const [state, setState] = useState<BTState>(bluetoothManager.getState())
  const [device, setDevice] = useState<PrinterDevice | null>(bluetoothManager.getConnectedDevice())
  const [devices, setDevices] = useState<PrinterDevice[]>([])
  const [lastError, setLastError] = useState('')

  useEffect(() => {
    const unsub = bluetoothManager.subscribe(event => {
      if (event.type === 'stateChange')  setState(event.state)
      if (event.type === 'connected')  { setDevice(event.device); setLastError('') }
      if (event.type === 'disconnected') setDevice(null)
      if (event.type === 'devicesFound') setDevices(event.devices)
      if (event.type === 'error')        setLastError(event.message)
    })
    return unsub
  }, [])

  return {
    state,
    connectedDevice: device,
    scannedDevices:  devices,
    lastError,
    isConnected:     state === 'connected',
    isScanning:      state === 'scanning',
    isReconnecting:  state === 'reconnecting',
    isConnecting:    state === 'connecting' || state === 'reconnecting',
    scan:            (onDevices: (d: PrinterDevice[]) => void) =>
                       bluetoothManager.startScan(onDevices),
    stopScan:        () => bluetoothManager.stopScan(),
    connect:         (d: PrinterDevice) => bluetoothManager.connect(d),
    reconnectSaved:  () => bluetoothManager.reconnectSaved(),
    disconnect:      () => bluetoothManager.disconnect(),
    clearError:      () => setLastError(''),
  }
}
