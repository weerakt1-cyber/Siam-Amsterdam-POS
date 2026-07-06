// ESC/POS thermal printer — multi-transport
// Bluetooth: Capacitor native plugin (Android APK only)
// LAN/Wi-Fi: TCP port 9100 via /api/printer/send (browser + Android APK)

import type { PluginListenerHandle } from '@capacitor/core'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReceiptTemplate = 'classic' | 'modern' | 'minimal'

export type PrinterConnectionType = 'bluetooth' | 'lan'

export type BarSettings = {
  barName:                string
  address:                string
  phone:                  string
  taxId:                  string
  footer:                 string
  width:                  32 | 48   // 32 = 58mm, 48 = 80mm
  promptpayNumber:        string    // e.g. 0637317929
  receiptTemplate:        ReceiptTemplate
  logoDataUrl?:           string    // base64 data URL for custom logo
  printerConnectionType?: PrinterConnectionType
  printerLanIp?:          string    // e.g. 192.168.1.105
  printerLanPort?:        number    // default 9100
  autoLockMinutes?:       number    // minutes of inactivity before re-requiring PIN; 0 = disabled
  dailyRevenueTarget?:    number    // ฿ target for notification alerts; 0 = disabled
  weeklyRevenueTarget?:   number
  monthlyRevenueTarget?:  number
  googleReviewUrl?:       string    // Google Maps review link printed on receipts; '' = omit the block
}

export type PrinterDevice = {
  name:    string
  address: string
}

export const DEFAULT_BAR_SETTINGS: BarSettings = {
  barName:                '🍹 BAR',
  address:                'Bangkok, Thailand',
  phone:                  '',
  taxId:                  '',
  footer:                 'ขอบคุณที่ใช้บริการ\nThank you! Come again 🙏',
  promptpayNumber:        '',
  width:                  32,
  receiptTemplate:        'classic',
  printerConnectionType:  'bluetooth',
  printerLanIp:           '',
  printerLanPort:         9100,
  autoLockMinutes:        10,
  dailyRevenueTarget:     0,
  weeklyRevenueTarget:    0,
  monthlyRevenueTarget:   0,
  googleReviewUrl:        '',
}

const LS_KEY = 'pos_bar_settings'

// ─── Bar settings (localStorage) ──────────────────────────────────────────────

export function loadBarSettings(): BarSettings {
  if (typeof window === 'undefined') return DEFAULT_BAR_SETTINGS
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULT_BAR_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_BAR_SETTINGS
}

export function saveBarSettings(s: BarSettings): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

// ─── Native platform detection ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cap = (): any => (typeof window !== 'undefined' ? (window as any).Capacitor : null)

export function isNativePlatform(): boolean {
  return cap()?.isNativePlatform?.() === true
}

// ─── Lazy imports (หลีกเลี่ยง SSR error และ browser import error) ──────────────

async function getPlugin() {
  const { CapacitorThermalPrinter } = await import('capacitor-thermal-printer')
  return CapacitorThermalPrinter
}

// ─── Prefs helpers — localStorage บน web, Capacitor Preferences บน native ────
// หมายเหตุ: ไม่ return Preferences object โดยตรง เพราะ Capacitor proxy intercept
// .then ทำให้ await เข้าใจว่าเป็น Promise แล้ว throw "not implemented on web"

async function prefsGet(key: string): Promise<string | null> {
  if (!isNativePlatform()) {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null
  }
  const mod = await import('@capacitor/preferences')
  const { value } = await mod.Preferences.get({ key })
  return value
}

async function prefsSet(key: string, value: string): Promise<void> {
  if (!isNativePlatform()) {
    if (typeof window !== 'undefined') localStorage.setItem(key, value)
    return
  }
  const mod = await import('@capacitor/preferences')
  await mod.Preferences.set({ key, value })
}

async function prefsRemove(key: string): Promise<void> {
  if (!isNativePlatform()) {
    if (typeof window !== 'undefined') localStorage.removeItem(key)
    return
  }
  const mod = await import('@capacitor/preferences')
  await mod.Preferences.remove({ key })
}

// ─── Printer MAC address (เก็บต่อเครื่อง ผ่าน Capacitor Preferences / localStorage) ──

export async function savePrinterDevice(mac: string, name: string): Promise<void> {
  await prefsSet('printer_mac', mac)
  await prefsSet('printer_name', name)
}

export async function loadPrinterDevice(): Promise<PrinterDevice | null> {
  const mac  = await prefsGet('printer_mac')
  const name = await prefsGet('printer_name')
  if (!mac) return null
  return { address: mac, name: name ?? mac }
}

export async function clearPrinterDevice(): Promise<void> {
  await prefsRemove('printer_mac')
  await prefsRemove('printer_name')
}

// ─── Scan for Bluetooth printers ──────────────────────────────────────────────

// Returns a cleanup function ที่ stops scan + removes listeners
export async function startScanPrinters(
  onDevices: (devices: PrinterDevice[]) => void,
  onFinish:  () => void,
): Promise<() => void> {
  if (!isNativePlatform()) {
    throw new Error('การสแกน Bluetooth ต้องใช้ผ่าน Android/iOS app — ไม่สามารถใช้งานใน browser')
  }
  const printer = await getPlugin()

  const handles: PluginListenerHandle[] = []
  handles.push(await printer.addListener('discoverDevices', ({ devices }) => onDevices(devices)))
  handles.push(await printer.addListener('discoveryFinish', onFinish))

  await printer.startScan()

  return async () => {
    await printer.stopScan().catch(() => {})
    handles.forEach(h => h.remove())
  }
}

// ─── Connect / Disconnect ─────────────────────────────────────────────────────

export async function connectPrinter(address: string): Promise<string> {
  const printer = await getPlugin()
  const device  = await printer.connect({ address })
  if (!device) throw new Error(`เชื่อมต่อ ${address} ล้มเหลว — ตรวจสอบว่าเปิด Bluetooth และอยู่ใกล้ปริ้นเตอร์`)
  return device.name ?? address
}

export async function disconnectPrinter(): Promise<void> {
  if (!isNativePlatform()) return
  const printer = await getPlugin()
  await printer.disconnect().catch(() => {})
}

export async function checkPrinterConnected(): Promise<boolean> {
  if (!isNativePlatform()) return false
  const printer = await getPlugin()
  return printer.isConnected()
}

// ─── ESC/POS constants ────────────────────────────────────────────────────────

const ESC = 0x1b
const GS  = 0x1d

const C = {
  INIT:     [ESC, 0x40],
  LEFT:     [ESC, 0x61, 0x00],
  CENTER:   [ESC, 0x61, 0x01],
  BOLD_ON:  [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  BIG:      [GS,  0x21, 0x11],
  MEDIUM:   [GS,  0x21, 0x01],
  NORMAL:   [GS,  0x21, 0x00],
  CUT:      [GS,  0x56, 0x42, 0x10],
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

const enc = new TextEncoder()

function b(...parts: (number[] | string | Uint8Array)[]): Uint8Array {
  const all: number[] = []
  for (const p of parts) {
    if (typeof p === 'string')       all.push(...enc.encode(p))
    else if (p instanceof Uint8Array) all.push(...p)
    else                              all.push(...p)
  }
  return new Uint8Array(all)
}

function uLen(s: string): number { return [...s].length }

function padR(s: string, n: number): string {
  return s + ' '.repeat(Math.max(0, n - uLen(s)))
}

function col2(left: string, right: string, w: number): string {
  const sp = Math.max(1, w - uLen(left) - uLen(right))
  return left + ' '.repeat(sp) + right
}

function divider(w: number, c = '-'): string { return c.repeat(w) }

// Build ESC/POS QR code bytes (GS ( k commands, model 2, error correction L)
function buildQRBytes(url: string, moduleSize = 6): Uint8Array {
  const data = enc.encode(url)
  const storeLen = data.length + 3
  const pL = storeLen & 0xFF
  const pH = (storeLen >> 8) & 0xFF
  return b(
    [GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00],          // model 2
    [GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, moduleSize],            // module size
    [GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30],                  // error correction L
    [GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30], data,                // store data
    [GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30],                  // print
  )
}

// ─── Receipt data ─────────────────────────────────────────────────────────────

export type ReceiptData = {
  orderId:       string
  tableNo:       string
  createdAt:     string
  staffName?:    string
  memberName?:   string
  couponCode?:   string
  items:         { name: string; qty: number; price: number }[]
  subtotal:      number
  discountAmount: number
  total:         number
  vatIncluded:   number
  paymentMethod?: string
  received?:     number
  change?:       number
  note?:         string
}

// ─── Build ESC/POS bytes (ใช้กับทุก connection type) ─────────────────────────

export function buildReceiptBytes(d: ReceiptData, cfg: BarSettings): Uint8Array {
  const W = cfg.width
  const dt = new Date(d.createdAt)
  const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const shortId = d.orderId.slice(-8).toUpperCase()

  const PAY: Record<string, string> = {
    cash: 'Cash', card: 'Card', promptpay: 'QR PromptPay',
  }

  const footerLines = cfg.footer.split(/\\n|\n/).filter(Boolean)

  const parts: Uint8Array[] = [
    b(C.INIT),
    b(C.CENTER, C.BOLD_ON, C.BIG, cfg.barName + '\n', C.NORMAL, C.BOLD_OFF),
    cfg.address ? b(C.CENTER, cfg.address + '\n') : new Uint8Array(0),
    cfg.phone   ? b(C.CENTER, 'Tel: ' + cfg.phone + '\n') : new Uint8Array(0),
    cfg.taxId   ? b(C.CENTER, 'Tax: ' + cfg.taxId + '\n') : new Uint8Array(0),
    b(C.LEFT, divider(W) + '\n'),
    b(col2('Date: ' + dateStr, timeStr, W) + '\n'),
    b(col2('Table: ' + d.tableNo, '#' + shortId, W) + '\n'),
    d.staffName  ? b(col2('Staff:', d.staffName, W) + '\n') : new Uint8Array(0),
    d.memberName ? b(C.BOLD_ON, col2('Member:', d.memberName, W) + '\n', C.BOLD_OFF) : new Uint8Array(0),
    b(divider(W) + '\n'),
    ...d.items.map(item => {
      const price  = '฿' + (item.price * item.qty).toLocaleString()
      const qty    = 'x' + item.qty
      const maxNm  = W - uLen(qty) - uLen(price) - 2
      return b(padR(item.name.slice(0, maxNm), maxNm) + ' ' + qty + ' ' + price + '\n')
    }),
    b(divider(W) + '\n'),
    b(col2('Subtotal:', '฿' + d.subtotal.toLocaleString(), W) + '\n'),
    d.discountAmount > 0 ? b(
      col2('Discount' + (d.couponCode ? ' [' + d.couponCode + ']' : '') + ':',
           '-฿' + d.discountAmount.toLocaleString(), W) + '\n'
    ) : new Uint8Array(0),
    b(divider(W, '=') + '\n'),
    b(C.BOLD_ON, C.MEDIUM, col2('TOTAL:', '฿' + d.total.toLocaleString(), W) + '\n', C.NORMAL, C.BOLD_OFF),
    b(col2('VAT 7% (incl.):', '฿' + d.vatIncluded.toLocaleString(), W) + '\n'),
    b(divider(W) + '\n'),
    d.paymentMethod ? b(col2('Payment:', PAY[d.paymentMethod] ?? d.paymentMethod, W) + '\n') : new Uint8Array(0),
    d.paymentMethod === 'cash' && d.received != null ? b(
      col2('Received:', '฿' + d.received.toLocaleString(), W) + '\n',
      col2('Change:',   '฿' + (d.change ?? 0).toLocaleString(), W) + '\n',
    ) : new Uint8Array(0),
    d.note ? b(divider(W) + '\nNote: ' + d.note + '\n') : new Uint8Array(0),
    b(divider(W) + '\n'),
    b(C.CENTER),
    b(divider(W) + '\n'),
    cfg.googleReviewUrl ? b('Rate us on Google Maps!\n') : new Uint8Array(0),
    cfg.googleReviewUrl ? buildQRBytes(cfg.googleReviewUrl, 6) : new Uint8Array(0),
    cfg.googleReviewUrl ? b('\n') : new Uint8Array(0),
    ...footerLines.map(line => b(line + '\n')),
    b(C.LEFT, '\n\n\n'),
    b(C.CUT),
  ]

  const total  = parts.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(total)
  let offset   = 0
  for (const p of parts) { result.set(p, offset); offset += p.length }
  return result
}

// ─── Bluetooth: print + cash drawer ──────────────────────────────────────────

export async function printReceiptBluetooth(d: ReceiptData, cfg: BarSettings): Promise<void> {
  const printer = await getPlugin()
  const bytes   = buildReceiptBytes(d, cfg)
  await printer.begin().raw(Array.from(bytes)).write()
}

export async function openCashDrawerBluetooth(): Promise<void> {
  const printer = await getPlugin()
  // ESC p 0 25ms 250ms — kick cash drawer via RJ11/RJ12
  await printer.begin().raw([0x1B, 0x70, 0x00, 0x19, 0xFA]).write()
}

// ─── LAN: send raw bytes via /api/printer/send (TCP proxy) ───────────────────

export async function sendBytesViaLan(bytes: Uint8Array, ip: string, port = 9100): Promise<void> {
  const res = await fetch('/api/printer/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ip, port, bytes: Array.from(bytes) }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `LAN print failed (HTTP ${res.status})`)
  }
}

// ─── Universal: route to Bluetooth or LAN based on cfg ───────────────────────

export async function printReceipt(d: ReceiptData, cfg: BarSettings): Promise<void> {
  const bytes = buildReceiptBytes(d, cfg)
  if ((cfg.printerConnectionType ?? 'bluetooth') === 'lan') {
    if (!cfg.printerLanIp) throw new Error('ยังไม่ได้ตั้งค่า IP ปริ้นเตอร์ — ไปที่ Settings → Printer')
    await sendBytesViaLan(bytes, cfg.printerLanIp, cfg.printerLanPort ?? 9100)
  } else {
    const printer = await getPlugin()
    await printer.begin().raw(Array.from(bytes)).write()
  }
}

export async function openCashDrawer(cfg: BarSettings): Promise<void> {
  // ESC p 0 25ms 250ms
  const drawerBytes = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA])
  if ((cfg.printerConnectionType ?? 'bluetooth') === 'lan') {
    if (!cfg.printerLanIp) return
    await sendBytesViaLan(drawerBytes, cfg.printerLanIp, cfg.printerLanPort ?? 9100)
  } else {
    const printer = await getPlugin()
    await printer.begin().raw(Array.from(drawerBytes)).write()
  }
}
