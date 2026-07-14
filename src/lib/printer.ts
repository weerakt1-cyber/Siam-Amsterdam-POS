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

// ─── Raster receipt rendering ────────────────────────────────────────────────
// Thermal printers can't print Thai from raw text bytes — they'd need a matching
// TIS-620 code page the hardware often lacks, and even then the built-in Thai
// font is crude. So instead we render the ENTIRE receipt to a monochrome bitmap
// with a real Thai-capable font in the WebView, then ship it as an ESC/POS
// raster image (GS v 0). This prints identically and beautifully on virtually
// any ESC/POS printer regardless of its language support, and lets each of the
// three templates have its own distinct, good-looking layout.

const PAY_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', promptpay: 'QR PromptPay' }

// Drop emoji / pictographs so 1-bit thresholding doesn't leave grey blobs.
function stripEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Lay the receipt out on a canvas 2d context. Runs twice: once to measure
// (draw=false) to compute total height, once to actually paint. y-advances must
// be identical in both passes, so every y increment lives outside `if (draw)`.
function layoutReceipt(ctx: CanvasRenderingContext2D, W: number, d: ReceiptData, cfg: BarSettings, draw: boolean): number {
  const t     = cfg.receiptTemplate ?? 'classic'
  const scale = W / 384                          // 1 @58mm, 1.5 @80mm
  const S     = (n: number) => Math.round(n * scale)
  const pad   = S(12)
  const innerW = W - pad * 2

  const sansFamily = "'Noto Sans Thai','Sarabun','Prompt',sans-serif"
  const monoFamily = "'Noto Sans Thai Mono','Sarabun',monospace"
  const bodyFamily = t === 'classic' ? monoFamily : sansFamily

  let y = S(6)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  const setFont = (size: number, bold: boolean, family = bodyFamily) => {
    ctx.font = `${bold ? 'bold ' : ''}${S(size)}px ${family}`
  }
  const lh = (size: number) => S(size) + S(7)

  function center(text: string, size: number, bold: boolean, family = bodyFamily) {
    const s = stripEmoji(text); if (!s) return
    setFont(size, bold, family)
    if (draw) { ctx.textAlign = 'center'; ctx.fillText(s, W / 2, y) }
    y += lh(size)
  }
  function left(text: string, size: number, bold = false) {
    const s = stripEmoji(text); if (!s) return
    setFont(size, bold)
    if (draw) { ctx.textAlign = 'left'; ctx.fillText(s, pad, y) }
    y += lh(size)
  }
  function row(l: string, r: string, size: number, bold = false) {
    setFont(size, bold)
    if (draw) {
      ctx.textAlign = 'left';  ctx.fillText(stripEmoji(l), pad, y)
      ctx.textAlign = 'right'; ctx.fillText(stripEmoji(r), W - pad, y)
    }
    y += lh(size)
  }
  function itemRow(name: string, qtyPrice: string, size: number) {
    setFont(size, false)
    const rightW  = ctx.measureText(qtyPrice).width
    const maxNmW  = innerW - rightW - S(10)
    const full    = stripEmoji(name)
    let nm = full
    if (ctx.measureText(nm).width > maxNmW) {
      while (nm.length > 1 && ctx.measureText(nm + '…').width > maxNmW) nm = nm.slice(0, -1)
      nm += '…'
    }
    if (draw) {
      ctx.textAlign = 'left';  ctx.fillText(nm, pad, y)
      ctx.textAlign = 'right'; ctx.fillText(qtyPrice, W - pad, y)
    }
    y += lh(size)
  }
  function hr(dashed = false) {
    y += S(5)
    if (draw) {
      ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, S(1))
      ctx.setLineDash(dashed ? [S(4), S(3)] : [])
      ctx.beginPath(); ctx.moveTo(pad, y + 0.5); ctx.lineTo(W - pad, y + 0.5); ctx.stroke()
      ctx.setLineDash([])
    }
    y += S(9)
  }
  const gap = (px: number) => { y += S(px) }

  // ── Header ──
  if (t === 'modern') {
    const barH = S(46)
    if (draw) {
      ctx.fillStyle = '#000'; ctx.fillRect(pad, y, innerW, barH)
      ctx.fillStyle = '#fff'
      setFont(24, true, sansFamily)
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(stripEmoji(cfg.barName) || 'RECEIPT', W / 2, y + barH / 2 + S(1))
      ctx.textBaseline = 'top'; ctx.fillStyle = '#000'
    }
    y += barH + S(8)
    if (cfg.address) center(cfg.address, 15, false, sansFamily)
    if (cfg.phone)   center('Tel: ' + cfg.phone, 14, false, sansFamily)
  } else if (t === 'minimal') {
    left(cfg.barName || 'Receipt', 26, true)
    if (cfg.address) left(cfg.address, 14)
  } else { // classic
    center(cfg.barName || 'RECEIPT', 30, true)
    if (cfg.address) center(cfg.address, 15, false)
    if (cfg.phone)   center('Tel: ' + cfg.phone, 14, false)
    if (cfg.taxId)   center('Tax: ' + cfg.taxId, 14, false)
  }

  const dashed = t === 'classic'
  hr(dashed)

  // ── Meta ──
  const dt      = new Date(d.createdAt)
  const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const shortId = d.orderId.slice(-8).toUpperCase()
  row('Date: ' + dateStr, timeStr, 15)
  row('Table: ' + d.tableNo, '#' + shortId, 15)
  if (d.staffName)  row('Staff', d.staffName, 15)
  if (d.memberName) row('Member', d.memberName, 15, true)
  hr(dashed)

  // ── Items ──
  for (const item of d.items) {
    itemRow(item.name, 'x' + item.qty + '  ฿' + (item.price * item.qty).toLocaleString(), 16)
  }
  hr(dashed)

  // ── Totals ──
  row('Subtotal', '฿' + d.subtotal.toLocaleString(), 15)
  if (d.discountAmount > 0) {
    row('Discount' + (d.couponCode ? ' [' + d.couponCode + ']' : ''), '-฿' + d.discountAmount.toLocaleString(), 15)
  }

  if (t === 'modern') {
    gap(4)
    const boxH = S(42)
    if (draw) {
      ctx.fillStyle = '#000'; ctx.fillRect(pad, y, innerW, boxH)
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'
      setFont(22, true, sansFamily)
      ctx.textAlign = 'left';  ctx.fillText('TOTAL', pad + S(10), y + boxH / 2)
      ctx.textAlign = 'right'; ctx.fillText('฿' + d.total.toLocaleString(), W - pad - S(10), y + boxH / 2)
      ctx.textBaseline = 'top'; ctx.fillStyle = '#000'
    }
    y += boxH + S(4)
  } else {
    if (t === 'classic') hr(false) // solid rule above total
    row('TOTAL', '฿' + d.total.toLocaleString(), 22, true)
  }
  row('VAT 7% (incl.)', '฿' + d.vatIncluded.toLocaleString(), 13)

  // ── Payment ──
  if (d.paymentMethod) {
    hr(dashed)
    row('Payment', PAY_LABEL[d.paymentMethod] ?? d.paymentMethod, 15)
    if (d.paymentMethod === 'cash' && d.received != null) {
      row('Received', '฿' + d.received.toLocaleString(), 15)
      row('Change', '฿' + (d.change ?? 0).toLocaleString(), 15)
    }
  }

  // ── Note ──
  if (d.note) {
    hr(dashed)
    left('Note: ' + d.note, 14)
  }

  // ── Footer ──
  const footerLines = cfg.footer.split(/\\n|\n/).map(s => s.trim()).filter(Boolean)
  if (footerLines.length) {
    hr(dashed)
    for (const line of footerLines) center(line, 15, false)
  }

  gap(6)
  return y
}

function renderReceiptCanvas(d: ReceiptData, cfg: BarSettings): HTMLCanvasElement {
  const W = cfg.width === 48 ? 576 : 384
  const measure = document.createElement('canvas')
  measure.width = W; measure.height = 8
  const h = Math.ceil(layoutReceipt(measure.getContext('2d')!, W, d, cfg, false))

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = h + S1(cfg, 4)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, canvas.height)
  layoutReceipt(ctx, W, d, cfg, true)
  return canvas
}

// scale-1 helper for the bottom margin (kept tiny; layout owns everything else)
function S1(cfg: BarSettings, n: number): number {
  return Math.round(n * ((cfg.width === 48 ? 576 : 384) / 384))
}

// Pack a black/white canvas into ESC/POS GS v 0 raster commands, banded so no
// single command exceeds a printer's image buffer.
function canvasToRasterBytes(canvas: HTMLCanvasElement): Uint8Array {
  const W = canvas.width, H = canvas.height
  const img = canvas.getContext('2d')!.getImageData(0, 0, W, H).data
  const bytesPerRow = W >> 3
  const BAND = 128
  const out: number[] = []
  for (let y0 = 0; y0 < H; y0 += BAND) {
    const rows = Math.min(BAND, H - y0)
    out.push(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff)
    for (let yy = 0; yy < rows; yy++) {
      const rowBase = (y0 + yy) * W
      for (let xb = 0; xb < bytesPerRow; xb++) {
        let byte = 0
        for (let bit = 0; bit < 8; bit++) {
          const i = (rowBase + xb * 8 + bit) * 4
          const lum = img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114
          if (img[i + 3] > 128 && lum < 128) byte |= 0x80 >> bit
        }
        out.push(byte)
      }
    }
  }
  return new Uint8Array(out)
}

// ─── Build ESC/POS bytes for the full receipt (raster image + optional QR) ────

export async function buildReceiptBytes(d: ReceiptData, cfg: BarSettings): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    throw new Error('Receipt rendering requires a browser context')
  }
  const raster = canvasToRasterBytes(renderReceiptCanvas(d, cfg))

  const parts: Uint8Array[] = [b(C.INIT), b(C.CENTER), raster]
  if (cfg.googleReviewUrl) {
    parts.push(b('\n', C.CENTER, 'Scan to rate us on Google!\n'), buildQRBytes(cfg.googleReviewUrl, 6), b('\n'))
  }
  parts.push(b(C.LEFT, '\n\n\n'), b(C.CUT))

  const total  = parts.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(total)
  let offset   = 0
  for (const p of parts) { result.set(p, offset); offset += p.length }
  return result
}

// ─── Bluetooth: print + cash drawer ──────────────────────────────────────────

// Two problems with printing at checkout, both fixed here:
//  1. The printer drops its Bluetooth SPP link after a short idle, yet the plugin
//     keeps reporting isConnected() === true (stale flag) — writing to that dead
//     socket silently "succeeds" and nothing prints. So we always reconnect to
//     the saved printer immediately before writing.
//  2. The npm builder (printer.begin().raw().write()) is a Proxy that hits the
//     Capacitor "then() is not implemented on android" thenable trap, so the
//     await rejects and nothing prints. We therefore talk to the RAW native
//     plugin directly with the exact connect → begin → raw{data} → write
//     sequence that is proven to print.
interface NativeThermalPrinter {
  connect(opts: { address: string }): Promise<{ name?: string; address: string } | null>
  begin(opts?: Record<string, never>): Promise<void>
  raw(opts: { data: string }): Promise<void>
  write(opts?: Record<string, never>): Promise<void>
}

// IMPORTANT: grab the native plugin SYNCHRONOUSLY off window.Capacitor.Plugins.
// Returning the plugin proxy from an async function makes the Promise machinery
// probe its `.then`, which triggers the Capacitor "then() is not implemented"
// trap and hangs forever. So never `return`/`await` the proxy object itself.
function getNativePrinter(): NativeThermalPrinter | null {
  return (cap()?.Plugins?.CapacitorThermalPrinter ?? null) as NativeThermalPrinter | null
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

// Reconnect to the saved printer, then write raw ESC/POS bytes via the native
// plugin. Reconnecting a live link is cheap (~1s) and makes printing reliable
// no matter how long the app has been idle.
async function reconnectAndWrite(bytes: Uint8Array): Promise<void> {
  const native = getNativePrinter()
  if (!native) throw new Error('เครื่องพิมพ์ใช้ได้เฉพาะใน Android app')
  const saved = await loadPrinterDevice()
  if (!saved) throw new Error('ยังไม่ได้ตั้งค่าปริ้นเตอร์ — ไปที่ Settings → Printer')
  const device = await native.connect({ address: saved.address })
  if (!device) throw new Error('เชื่อมต่อปริ้นเตอร์ไม่สำเร็จ — ตรวจสอบว่าเปิดเครื่องพิมพ์และอยู่ใกล้')
  await native.begin({})
  await native.raw({ data: bytesToBase64(bytes) })
  await native.write({})
}

export async function printReceiptBluetooth(d: ReceiptData, cfg: BarSettings): Promise<void> {
  await reconnectAndWrite(await buildReceiptBytes(d, cfg))
}

export async function openCashDrawerBluetooth(): Promise<void> {
  // ESC p 0 25ms 250ms — kick cash drawer via RJ11/RJ12
  await reconnectAndWrite(new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]))
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
  const bytes = await buildReceiptBytes(d, cfg)
  if ((cfg.printerConnectionType ?? 'bluetooth') === 'lan') {
    if (!cfg.printerLanIp) throw new Error('ยังไม่ได้ตั้งค่า IP ปริ้นเตอร์ — ไปที่ Settings → Printer')
    await sendBytesViaLan(bytes, cfg.printerLanIp, cfg.printerLanPort ?? 9100)
  } else {
    await printReceiptBluetooth(d, cfg)
  }
}

export async function openCashDrawer(cfg: BarSettings): Promise<void> {
  // ESC p 0 25ms 250ms
  const drawerBytes = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA])
  if ((cfg.printerConnectionType ?? 'bluetooth') === 'lan') {
    if (!cfg.printerLanIp) return
    await sendBytesViaLan(drawerBytes, cfg.printerLanIp, cfg.printerLanPort ?? 9100)
  } else {
    await openCashDrawerBluetooth()
  }
}
