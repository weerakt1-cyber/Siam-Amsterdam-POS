// ESC/POS thermal printer — multi-transport
// Bluetooth: Capacitor native plugin (Android APK only)
// LAN/Wi-Fi: TCP port 9100 via /api/printer/send (browser + Android APK)

import type { PluginListenerHandle } from '@capacitor/core'
import { authedFetch } from '@/lib/supabase-browser'

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
  openTime?:              string    // shop opening time "HH:MM" — bounds reservation start-time slots
  closeTime?:             string    // shop closing time "HH:MM" — bounds reservation end time
  businessDayCutoff?:     string    // "HH:MM" sales-day reset — orders before this count as the previous day (for past-midnight trading); "00:00" = calendar day
  targetFoodCostPct?:     number    // target COGS as a % of sale price (e.g. 30). Drives the "suggested price" hint in Items when a recipe's cost is known.
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
  openTime:               '10:00',
  closeTime:              '23:00',
  businessDayCutoff:      '00:00',
  targetFoodCostPct:      30,
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
  // Box the proxy. Returning it bare from an async function makes the promise
  // machinery read `.then` on the Capacitor proxy to test if it's a thenable —
  // the proxy treats that as a native `then()` call and throws
  // "CapacitorThermalPrinter.then() is not implemented on android", which breaks
  // scan/connect/print entirely. Wrapping in a plain object avoids the thenable
  // check. Same gotcha is documented for Preferences below.
  return { plugin: CapacitorThermalPrinter }
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
  const { plugin: printer } = await getPlugin()

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
  const { plugin: printer } = await getPlugin()
  const device  = await printer.connect({ address })
  if (!device) throw new Error(`เชื่อมต่อ ${address} ล้มเหลว — ตรวจสอบว่าเปิด Bluetooth และอยู่ใกล้ปริ้นเตอร์`)
  return device.name ?? address
}

export async function disconnectPrinter(): Promise<void> {
  if (!isNativePlatform()) return
  const { plugin: printer } = await getPlugin()
  await printer.disconnect().catch(() => {})
}

export async function checkPrinterConnected(): Promise<boolean> {
  if (!isNativePlatform()) return false
  const { plugin: printer } = await getPlugin()
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
  DRAWER:   [ESC, 0x70, 0x00, 0x19, 0xFA],  // ESC p 0 25ms 250ms — kick cash drawer (pin 2)
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
// Render a Google-review QR (plus caption) to a monochrome bitmap and return it
// as ESC/POS raster bytes. We draw the QR ourselves from the qrcode module
// matrix — the printer firmware ignores the native GS ( k QR command, so a
// raster is the only thing that actually prints here.
async function buildQRRaster(url: string, cfg: BarSettings): Promise<Uint8Array> {
  const QRCode = (await import('qrcode')).default as unknown as {
    create(text: string, opts?: { errorCorrectionLevel?: string }): { modules: { size: number; data: Uint8Array | number[] } }
  }
  const qr    = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const count = qr.modules.size
  const bits  = qr.modules.data

  const W     = cfg.width === 48 ? 576 : 384
  const scale = W / 384
  const Sc    = (n: number) => Math.round(n * scale)

  // Size the QR to ~60% of paper width, snapped to a whole module pixel size.
  const mod   = Math.max(2, Math.floor((W * 0.6) / count))
  const qrPx  = mod * count
  const quiet = mod * 3                        // quiet zone around the code
  const capH  = Sc(30)                          // caption band height

  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = capH + quiet + qrPx + quiet
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, canvas.height)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'; ctx.textAlign = 'center'
  ctx.font = `${Sc(22)}px 'Noto Sans Thai','Sarabun',sans-serif`
  ctx.fillText(RECEIPT_T[receiptLang()].qrCaption, W / 2, Sc(2))

  const x0 = Math.floor((W - qrPx) / 2)
  const y0 = capH + quiet
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (bits[r * count + c]) ctx.fillRect(x0 + c * mod, y0 + r * mod, mod, mod)
    }
  }
  return canvasToRasterBytes(canvas)
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

// Receipt label translations — follow the POS language setting (localStorage
// 'pos_lang'), so a Thai venue prints a Thai bill and an English venue English.
// The footer text itself is venue-entered (cfg.footer) and printed as-is.
type ReceiptLang = 'th' | 'en'
function receiptLang(): ReceiptLang {
  try { return localStorage.getItem('pos_lang') === 'th' ? 'th' : 'en' } catch { return 'en' }
}
const RECEIPT_T: Record<ReceiptLang, {
  date: string; table: string; staff: string; member: string; subtotal: string
  discount: string; total: string; vat: string; payment: string; received: string
  change: string; note: string; tel: string; tax: string; qrCaption: string
  pay: Record<string, string>
}> = {
  en: {
    date: 'Date', table: 'Table', staff: 'Staff', member: 'Member', subtotal: 'Subtotal',
    discount: 'Discount', total: 'TOTAL', vat: 'VAT 7% (incl.)', payment: 'Payment',
    received: 'Received', change: 'Change', note: 'Note', tel: 'Tel:', tax: 'Tax:',
    qrCaption: 'Scan to review us on Google',
    pay: { cash: 'Cash', card: 'Card', credit_card: 'Card', promptpay: 'QR PromptPay', promptpay_qr: 'QR PromptPay' },
  },
  th: {
    date: 'วันที่', table: 'โต๊ะ', staff: 'พนักงาน', member: 'สมาชิก', subtotal: 'ยอดรวม',
    discount: 'ส่วนลด', total: 'รวมสุทธิ', vat: 'ภาษีมูลค่าเพิ่ม 7% (รวมแล้ว)', payment: 'ชำระโดย',
    received: 'รับเงิน', change: 'เงินทอน', note: 'หมายเหตุ', tel: 'โทร.', tax: 'เลขภาษี',
    qrCaption: 'สแกนรีวิวเราบน Google',
    pay: { cash: 'เงินสด', card: 'บัตร', credit_card: 'บัตร', promptpay: 'พร้อมเพย์', promptpay_qr: 'พร้อมเพย์' },
  },
}

// Drop emoji / pictographs so 1-bit thresholding doesn't leave grey blobs.
function stripEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Merge identical receipt lines (same name + same unit price) into one line with
// the quantities summed — so ordering the same item several times separately
// prints as "Beer x3", not three "Beer x1" lines. First-seen order is preserved;
// lines with a different unit price (e.g. an item-level discount) stay separate.
function consolidateReceiptItems(
  items: { name: string; qty: number; price: number }[],
): { name: string; qty: number; price: number }[] {
  const out: { name: string; qty: number; price: number }[] = []
  const seen = new Map<string, number>()
  for (const it of items) {
    const key = `${it.name}::${it.price}`
    const at = seen.get(key)
    if (at === undefined) { seen.set(key, out.length); out.push({ ...it }) }
    else out[at].qty += it.qty
  }
  return out
}

// Lay the receipt out on a canvas 2d context. Runs twice: once to measure
// (draw=false) to compute total height, once to actually paint. y-advances must
// be identical in both passes, so every y increment lives outside `if (draw)`.
function layoutReceipt(ctx: CanvasRenderingContext2D, W: number, d: ReceiptData, cfg: BarSettings, draw: boolean): number {
  const t     = cfg.receiptTemplate ?? 'classic'
  const scale = W / 384                          // 1 @58mm, 1.5 @80mm
  const S     = (n: number) => Math.round(n * scale)
  const pad   = S(1)   // hard against the printable edge — minimal side margin
  const innerW = W - pad * 2

  const sansFamily = "'Noto Sans Thai','Sarabun','Prompt',sans-serif"
  const monoFamily = "'Noto Sans Thai Mono','Sarabun',monospace"
  const bodyFamily = t === 'classic' ? monoFamily : sansFamily
  const L = RECEIPT_T[receiptLang()]   // receipt labels in the configured language

  let y = S(6)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  // Fonts printed too small to read. Enlarge every glyph by FONT_BOOST for
  // near-standard receipt legibility; line-height scales with it so lines never
  // overlap. Combined with the smaller `pad` above, the layout runs close to the
  // paper edge and uses the full width.
  const FONT_BOOST = 1.6
  const setFont = (size: number, bold: boolean, family = bodyFamily) => {
    ctx.font = `${bold ? 'bold ' : ''}${S(size * FONT_BOOST)}px ${family}`
  }
  const lh = (size: number) => S(size * FONT_BOOST) + S(9)  // roomier line spacing

  function center(text: string, size: number, bold: boolean, family = bodyFamily) {
    const s = stripEmoji(text); if (!s) return
    setFont(size, bold, family)
    if (draw) { ctx.textAlign = 'center'; ctx.fillText(s, W / 2, y) }
    y += lh(size)
  }
  // Centered text that wraps to as many lines as needed to fit innerW — first by
  // words, then by characters for scripts without spaces (e.g. Thai addresses),
  // so long shop names / addresses print in full instead of running off the edge.
  function centerWrap(text: string, size: number, bold = false, family = bodyFamily) {
    const s = stripEmoji(text); if (!s) return
    setFont(size, bold, family)
    const fit = (str: string) => ctx.measureText(str).width <= innerW
    const lines: string[] = []
    for (const word of s.split(/\s+/).filter(Boolean)) {
      const cur = lines.length ? lines[lines.length - 1] : ''
      const merged = cur ? cur + ' ' + word : word
      if (cur && fit(merged)) { lines[lines.length - 1] = merged; continue }
      // start the word on a new line; hard-break it if it alone is too wide
      let chunk = ''
      for (const ch of word) {
        if (chunk && !fit(chunk + ch)) { lines.push(chunk); chunk = ch }
        else chunk += ch
      }
      if (chunk) lines.push(chunk)
    }
    for (const ln of lines) {
      if (draw) { ctx.textAlign = 'center'; ctx.fillText(ln, W / 2, y) }
      y += lh(size)
    }
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
    const rightW = ctx.measureText(qtyPrice).width
    const maxNmW = innerW - rightW - S(10)   // leave room for the qty/price column
    const full   = stripEmoji(name)
    const fit    = (s: string) => ctx.measureText(s).width <= maxNmW

    // Wrap the item name onto as many lines as needed so nothing is cut off —
    // by words first, then hard-break a single token too wide to fit (long
    // option labels like "(Large, Less Ice)", or Thai text without spaces).
    const lines: string[] = []
    for (const word of full.split(/\s+/).filter(Boolean)) {
      const cur    = lines.length ? lines[lines.length - 1] : ''
      const merged = cur ? cur + ' ' + word : word
      if (cur && fit(merged)) { lines[lines.length - 1] = merged; continue }
      let chunk = ''
      for (const ch of word) {
        if (chunk && !fit(chunk + ch)) { lines.push(chunk); chunk = ch }
        else chunk += ch
      }
      if (chunk) lines.push(chunk)
    }
    if (lines.length === 0) lines.push(full)

    if (draw) {
      // First line carries the qty/price on the right; wrapped lines are the
      // name only, slightly indented so they read as a continuation.
      ctx.textAlign = 'left';  ctx.fillText(lines[0], pad, y)
      ctx.textAlign = 'right'; ctx.fillText(qtyPrice, W - pad, y)
      for (let i = 1; i < lines.length; i++) {
        ctx.textAlign = 'left'; ctx.fillText(lines[i], pad + S(6), y + lh(size) * i)
      }
    }
    y += lh(size) * lines.length
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
    if (cfg.address) centerWrap(cfg.address, 13, false, sansFamily)
    if (cfg.phone)   center(L.tel + ' ' + cfg.phone, 14, false, sansFamily)
  } else if (t === 'minimal') {
    centerWrap(cfg.barName || 'Receipt', 24, true)
    if (cfg.address) centerWrap(cfg.address, 13)
  } else { // classic
    centerWrap(cfg.barName || 'RECEIPT', 26, true)  // smaller + wraps long names
    if (cfg.address) centerWrap(cfg.address, 13, false)  // smaller + wraps to fit fully
    if (cfg.phone)   center(L.tel + ' ' + cfg.phone, 14, false)
    if (cfg.taxId)   center(L.tax + ' ' + cfg.taxId, 14, false)
  }

  const dashed = t === 'classic'
  hr(dashed)

  // ── Meta ──
  const dt      = new Date(d.createdAt)
  const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const shortId = d.orderId.slice(-8).toUpperCase()
  row(L.date + ': ' + dateStr, timeStr, 15)
  row(L.table + ': ' + d.tableNo, '#' + shortId, 15)
  if (d.staffName)  row(L.staff, d.staffName, 15)
  if (d.memberName) row(L.member, d.memberName, 15, true)
  hr(dashed)

  // ── Items (identical lines merged, quantities summed) ──
  for (const item of consolidateReceiptItems(d.items)) {
    itemRow(item.name, 'x' + item.qty + '  ฿' + (item.price * item.qty).toLocaleString(), 16)
  }
  hr(dashed)

  // ── Totals ──
  row(L.subtotal, '฿' + d.subtotal.toLocaleString(), 15)
  if (d.discountAmount > 0) {
    row(L.discount + (d.couponCode ? ' [' + d.couponCode + ']' : ''), '-฿' + d.discountAmount.toLocaleString(), 15)
  }

  if (t === 'modern') {
    gap(4)
    const boxH = S(42)
    if (draw) {
      ctx.fillStyle = '#000'; ctx.fillRect(pad, y, innerW, boxH)
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'
      setFont(22, true, sansFamily)
      ctx.textAlign = 'left';  ctx.fillText(L.total, pad + S(10), y + boxH / 2)
      ctx.textAlign = 'right'; ctx.fillText('฿' + d.total.toLocaleString(), W - pad - S(10), y + boxH / 2)
      ctx.textBaseline = 'top'; ctx.fillStyle = '#000'
    }
    y += boxH + S(4)
  } else {
    if (t === 'classic') hr(false) // solid rule above total
    row(L.total, '฿' + d.total.toLocaleString(), 22, true)
  }
  row(L.vat, '฿' + d.vatIncluded.toLocaleString(), 13)

  // ── Payment ──
  if (d.paymentMethod) {
    hr(dashed)
    row(L.payment, L.pay[d.paymentMethod] ?? d.paymentMethod, 15)
    if (d.paymentMethod === 'cash' && d.received != null) {
      row(L.received, '฿' + d.received.toLocaleString(), 15)
      row(L.change, '฿' + (d.change ?? 0).toLocaleString(), 15)
    }
  }

  // ── Note ──
  if (d.note) {
    hr(dashed)
    left(L.note + ': ' + d.note, 14)
  }

  // ── Footer ──
  const footerLines = cfg.footer.split(/\\n|\n/).map(s => s.trim()).filter(Boolean)
  if (footerLines.length) {
    hr(dashed)
    for (const line of footerLines) center(line, 15, false)
  }

  gap(2)   // minimal bottom whitespace — keep the tail short
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

export async function buildReceiptBytes(
  d: ReceiptData, cfg: BarSettings, opts?: { openDrawer?: boolean; reviewQR?: boolean },
): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    throw new Error('Receipt rendering requires a browser context')
  }
  const raster = canvasToRasterBytes(renderReceiptCanvas(d, cfg))

  const parts: Uint8Array[] = [b(C.INIT)]
  // Kick the cash drawer as the FIRST command of the SAME print job. Sending it
  // as a separate connection right after the receipt raced with the printer
  // still being busy feeding the long bill, and the drawer usually didn't fire
  // even though the 22 bytes flushed. Bundling it into one job makes it reliable
  // and pops the till the moment printing starts.
  if (opts?.openDrawer) parts.push(b(C.DRAWER))
  parts.push(b(C.CENTER), raster)
  if (cfg.googleReviewUrl && opts?.reviewQR) {
    // Only the real customer bill (checkout + print-bill) carries the Google-
    // review QR — reprints and test prints skip it to save paper. Render as a
    // raster image (same proven path as the receipt); the native ESC/POS QR
    // command (GS ( k) is silently ignored by this RT/Rongta firmware.
    parts.push(await buildQRRaster(cfg.googleReviewUrl, cfg))
  }
  // Minimal feed before the cut — 1 blank line plus the cut command's own feed.
  // Keeps the tail short; still clears the last printed line past the cutter.
  parts.push(b(C.LEFT, '\n'), b(C.CUT))

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
  disconnect(): Promise<void>
  begin(opts?: Record<string, never>): Promise<void>
  raw(opts: { data: string }): Promise<void>
  openDrawer(opts?: Record<string, never>): Promise<void>   // native drawer kick, no paper feed
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
  // Drop any existing socket BEFORE connecting. Calling connect() while an SPP
  // link is already open makes Android RFCOMM fail with "already at opened
  // state" and — critically — tears down the live socket, so the drawer/print
  // works exactly once and then every following attempt dies. A clean
  // disconnect → (settle) → connect yields a fresh socket on every write.
  await native.disconnect().catch(() => {})
  await new Promise(res => setTimeout(res, 350)) // let RFCOMM release the DLCI
  const device = await native.connect({ address: saved.address })
  if (!device) throw new Error('เชื่อมต่อปริ้นเตอร์ไม่สำเร็จ — ตรวจสอบว่าเปิดเครื่องพิมพ์และอยู่ใกล้')
  await native.begin({})
  await native.raw({ data: bytesToBase64(bytes) })
  await native.write({})
}

export async function printReceiptBluetooth(d: ReceiptData, cfg: BarSettings): Promise<void> {
  await reconnectAndWrite(await buildReceiptBytes(d, cfg))
}

// ─── Fast-checkout two-phase print ───────────────────────────────────────────
// The slow part of a Bluetooth receipt is opening the SPP socket (disconnect →
// settle → connect ≈ 1.5 s), NOT pushing the bytes. Splitting it lets the socket
// open IN PARALLEL with the server order-save, so the two costs overlap instead
// of stacking. The paper still only feeds in phase 2 — after the sale is saved —
// so nothing prints for an order that failed to persist.

// Phase 1: open the socket. Returns true if the link is live. Safe to call
// speculatively; on failure phase 2 falls back to the full atomic reconnect.
export async function warmBluetoothSocket(): Promise<boolean> {
  const native = getNativePrinter()
  if (!native) return false
  const saved = await loadPrinterDevice()
  if (!saved) return false
  await native.disconnect().catch(() => {})
  await new Promise(res => setTimeout(res, 350)) // let RFCOMM release the DLCI
  const device = await native.connect({ address: saved.address })
  return !!device
}

// Phase 2 helper: write to an ALREADY-OPEN socket. No connect() here — a second
// connect on a live SPP link is exactly what wedges Android RFCOMM, so this must
// only run after warmBluetoothSocket() returned true.
async function writeToOpenSocket(bytes: Uint8Array): Promise<void> {
  const native = getNativePrinter()
  if (!native) throw new Error('เครื่องพิมพ์ใช้ได้เฉพาะใน Android app')
  await native.begin({})
  await native.raw({ data: bytesToBase64(bytes) })
  await native.write({})
}

export async function openCashDrawerBluetooth(): Promise<void> {
  // Standalone "Open Drawer" (no sale): use the plugin's native openDrawer()
  // content-action instead of writing raw ESC/POS bytes as a print job. Sending
  // the kick as a print job made the printer feed a short blank slip to the tear
  // bar when the job finalised (write()); the native drawer command pops the
  // till without any paper. (At checkout the kick is still bundled into the
  // receipt bytes — see buildReceiptBytes — so the till pops with the bill.)
  const native = getNativePrinter()
  if (!native) throw new Error('เครื่องพิมพ์ใช้ได้เฉพาะใน Android app')
  const saved = await loadPrinterDevice()
  if (!saved) throw new Error('ยังไม่ได้ตั้งค่าปริ้นเตอร์ — ไปที่ Settings → Printer')
  await native.disconnect().catch(() => {})
  await new Promise(res => setTimeout(res, 350)) // let RFCOMM release the DLCI
  const device = await native.connect({ address: saved.address })
  if (!device) throw new Error('เชื่อมต่อปริ้นเตอร์ไม่สำเร็จ — ตรวจสอบว่าเปิดเครื่องพิมพ์และอยู่ใกล้')
  await native.begin({})
  await native.openDrawer({})
  await native.write({})
}

// ─── LAN: send raw bytes via /api/printer/send (TCP proxy) ───────────────────

export async function sendBytesViaLan(bytes: Uint8Array, ip: string, port = 9100): Promise<void> {
  const res = await authedFetch('/api/printer/send', {
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

export async function printReceipt(
  d: ReceiptData, cfg: BarSettings, opts?: { openDrawer?: boolean; reviewQR?: boolean },
): Promise<void> {
  const bytes = await buildReceiptBytes(d, cfg, opts)
  if ((cfg.printerConnectionType ?? 'bluetooth') === 'lan') {
    if (!cfg.printerLanIp) throw new Error('ยังไม่ได้ตั้งค่า IP ปริ้นเตอร์ — ไปที่ Settings → Printer')
    await sendBytesViaLan(bytes, cfg.printerLanIp, cfg.printerLanPort ?? 9100)
  } else {
    await reconnectAndWrite(bytes) // single job: drawer kick (if any) + receipt
  }
}

// Like printReceipt, but for the fast checkout path: if the socket was warmed up
// front (warmedOk), just transmit onto it; otherwise — warm-up failed/skipped, or
// LAN — fall back to the proven single-shot path so behaviour is never worse than
// before. The drawer kick is still bundled into the bytes (openDrawer flag).
export async function printReceiptWarm(
  d: ReceiptData, cfg: BarSettings, warmedOk: boolean,
  opts?: { openDrawer?: boolean; reviewQR?: boolean },
): Promise<void> {
  const bytes = await buildReceiptBytes(d, cfg, opts)
  if ((cfg.printerConnectionType ?? 'bluetooth') === 'lan') {
    if (!cfg.printerLanIp) throw new Error('ยังไม่ได้ตั้งค่า IP ปริ้นเตอร์ — ไปที่ Settings → Printer')
    await sendBytesViaLan(bytes, cfg.printerLanIp, cfg.printerLanPort ?? 9100)
    return
  }
  if (warmedOk) {
    // Socket already open (overlapped the server save) — just push the bytes.
    try { await writeToOpenSocket(bytes); return } catch { /* socket went stale — reconnect below */ }
  }
  await reconnectAndWrite(bytes)
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
