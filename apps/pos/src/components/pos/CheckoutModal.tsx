'use client'

import { authedFetch } from "@/lib/supabase-browser"
import SlipTransferPanel from "@/components/pos/SlipTransferPanel"
import { useState, useEffect, useRef } from 'react'
import {
  loadBarSettings, loadPrinterDevice,
  printReceiptWarm, warmBluetoothSocket, openCashDrawer, DEFAULT_BAR_SETTINGS,
  type BarSettings, type ReceiptData,
} from '@/lib/printer'
import { getTierByName, computePointsEarned, TIERS } from '@/lib/loyalty'
import { usePosLang } from '@/lib/pos-i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CartItem    = { menuId: string; name: string; qty: number; price: number; itemDiscount?: number }

// Unit price after the per-item % discount (rounds the unit, matching the POS
// cart and the stored order). Without this the checkout ignored line discounts.
function effUnit(c: CartItem): number {
  return c.itemDiscount && c.itemDiscount > 0
    ? Math.round(c.price * (1 - c.itemDiscount / 100))
    : c.price
}
export type PaymentMethod = 'cash' | 'card' | 'promptpay' | 'credit_card' | 'promptpay_qr' | 'wechat_pay' | 'transfer'
export type DiscountInfo  = { type: 'percent' | 'fixed'; value: number; amount: number; couponCode?: string }

type Props = {
  cart: CartItem[]
  table: string
  note: string
  discount: DiscountInfo
  memberName: string
  memberTier?: 'bronze' | 'silver' | 'gold'
  onConfirm: (method: PaymentMethod, received?: number) => Promise<string>
  onClose: () => void
  onComplete?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('en').format(Math.round(n))
}

// คำนวณ 3 จำนวนเงินที่ลูกค้ามีโอกาสจ่ายมากที่สุด ตามธนบัตรไทย
function cashOptions(total: number): number[] {
  const t = Math.ceil(total)
  const opts = new Set<number>()
  // ถ้ายอดหารด้วย 50 ลงตัว = จ่ายพอดีได้จริง
  if (t % 50 === 0) opts.add(t)
  // ปัดขึ้นตามแต่ละธนบัตรหลัก
  for (const note of [50, 100, 500, 1000, 2000]) {
    opts.add(Math.ceil(t / note) * note)
  }
  // เรียงจากน้อยไปมาก เอา 3 ตัวแรก
  return [...opts].sort((a, b) => a - b).slice(0, 3)
}

// ─── HTML receipt (unused: printing goes through the Bluetooth/LAN device only,
// never a browser tab) ────────────────────────────────────────────────────────

function buildReceiptHtml({
  cart, table, note, discount, memberName,
  subtotal, total, vatIncluded,
  payment, received, change,
  orderRef, isDraft, dateStr, timeStr,
  staffName, cfg,
}: {
  cart: CartItem[]
  table: string
  note: string
  discount: DiscountInfo
  memberName: string
  subtotal: number
  total: number
  vatIncluded: number
  payment?: string
  received?: number
  change?: number
  orderRef: string
  isDraft: boolean
  dateStr: string
  timeStr: string
  staffName: string
  cfg: BarSettings
}) {
  const items = cart
    .map(i => `
      <div class="row">
        <span class="item-name">${i.name}<span class="qty"> ×${i.qty}</span></span>
        <span>${baht(i.price * i.qty)}</span>
      </div>`)
    .join('')

  const PAY_ICON: Record<string, string>  = { cash: '💵', card: '💳', promptpay: '📱', credit_card: '🌐', promptpay_qr: '📱', wechat_pay: '🟢' }
  const PAY_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', promptpay: 'QR PromptPay', credit_card: 'Credit Card', promptpay_qr: 'PromptPay QR', wechat_pay: 'WeChat/Alipay' }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Courier New',Courier,monospace; font-size:12px; width:280px; margin:0 auto; padding:14px 10px; color:#111; background:#fff; }
  .center { text-align:center; } .right { text-align:right; }
  .bold { font-weight:bold; } .large { font-size:17px; } .xlarge { font-size:20px; letter-spacing:1px; }
  .row { display:flex; justify-content:space-between; padding:2px 0; }
  .item-name { flex:1; } .qty { color:#666; }
  .sep { border-top:1px dashed #aaa; margin:7px 0; } .sep2 { border-top:2px solid #333; margin:7px 0; }
  .small { font-size:10px; color:#777; } .green { color:#1a7a1a; } .gray { color:#555; }
  .draft-banner { text-align:center; border:2px dashed #ccc; padding:4px; color:#aaa; font-size:10px; margin-bottom:8px; letter-spacing:1px; }
  .total-row { font-size:16px; font-weight:bold; padding:4px 0; }
  .payment-box { background:#f5f5f5; border-radius:4px; padding:6px 8px; margin:6px 0; }
  .footer { margin-top:10px; text-align:center; font-size:11px; color:#555; }
  .order-ref { font-size:10px; color:#aaa; letter-spacing:1px; }
  @media print { .no-print { display:none; } body { padding:0; } }
</style></head>
<body>
${isDraft ? '<div class="draft-banner">── DRAFT · NOT FINAL ──</div>' : ''}
<div class="center" style="margin-bottom:10px">
  <p class="bold xlarge">${cfg.barName}</p>
  ${cfg.address ? `<p class="small" style="margin-top:3px">${cfg.address}</p>` : ''}
  ${cfg.phone   ? `<p class="small">Tel: ${cfg.phone}</p>` : ''}
  ${cfg.taxId   ? `<p class="small">Tax ID: ${cfg.taxId}</p>` : ''}
</div>
<div class="sep"></div>
<div class="row"><span>Date: ${dateStr}</span><span>${timeStr}</span></div>
<div class="row"><span>Table: <strong>${table}</strong></span><span class="order-ref">#${orderRef}</span></div>
${staffName  ? `<div class="row small"><span>Staff: ${staffName}</span></div>` : ''}
${memberName ? `<div class="row"><span>👤 Member: <strong>${memberName}</strong></span></div>` : ''}
<div class="sep"></div>
${items}
<div class="sep"></div>
<div class="row gray"><span>Subtotal</span><span>${baht(subtotal)}</span></div>
${discount.amount > 0 ? `
  <div class="row green">
    <span>Discount${discount.couponCode ? ` <strong>[${discount.couponCode}]</strong>` : discount.type === 'percent' ? ` (${discount.value}%)` : ' (fixed)'}</span>
    <span>-${baht(discount.amount)}</span>
  </div>` : ''}
<div class="sep2"></div>
<div class="row total-row"><span>TOTAL</span><span>${baht(total)}</span></div>
<div class="row small"><span>VAT 7% (incl.)</span><span>${baht(vatIncluded)}</span></div>
${!isDraft && payment ? `
<div class="payment-box">
  <div class="row bold">
    <span>${PAY_ICON[payment] ?? ''} ${PAY_LABEL[payment] ?? payment.toUpperCase()}</span>
    <span>${baht(total)}</span>
  </div>
  ${payment === 'cash' && received != null ? `
    <div class="row small"><span>Received</span><span>${baht(received)}</span></div>
    <div class="row small bold"><span>Change</span><span>${baht(change ?? 0)}</span></div>
  ` : ''}
</div>` : ''}
${note ? `<div class="sep"></div><div class="small">Note: ${note}</div>` : ''}
<div class="sep"></div>
<div class="footer">
  ${isDraft
    ? '── Please verify your order ──<br><span style="font-size:10px;color:#bbb">── DRAFT · NOT FINAL ──</span>'
    : cfg.footer.replace(/\\n|\n/g, '<br>')}
</div>
</body></html>`
}

const PAY_LABEL_MAP: Record<string, string> = {
  cash: 'Cash', card: 'Card', promptpay: 'QR PromptPay',
  credit_card: 'Credit Card', promptpay_qr: 'PromptPay QR', wechat_pay: 'WeChat/Alipay',
  transfer: 'Bank Transfer',
}

// Payment-step icons, served from /public/pos-icons. Rendered in the POS
// item-price amber (#f59e0b) via a CSS mask, matching the rest of the app.
const PAY_ICONS = {
  cash:    '/pos-icons/cash.png',
  card:    '/pos-icons/credit-card.png',
  scan:    '/pos-icons/scan.png',
  member:  '/pos-icons/member.png',
  staff:   '/pos-icons/staff.png',
  printBt: '/pos-icons/print-bt.png',
  success: '/pos-icons/success.png',
} as const
const ICON_AMBER = '#f59e0b'
function PIcon({ src, color = ICON_AMBER, className = 'w-5 h-5' }: { src: string; color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CheckoutModal({
  cart, table, note, discount, memberName, memberTier, onConfirm, onClose, onComplete,
}: Props) {
  const { t: tr } = usePosLang()
  const [step, setStep]                 = useState<1 | 2 | 3>(1)
  const [payment, setPayment]           = useState<PaymentMethod>('cash')
  const [received, setReceived]         = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [orderRef, setOrderRef]             = useState('DRAFT')


  // PromptPay static QR
  const [ppQr,      setPpQr]      = useState<string | null>(null)
  const [ppLoading, setPpLoading] = useState(false)

  // Bank-transfer (PromptPay slip) config — enabled/promptpayId/accountName from
  // the store's payment config. When enabled, a "โอนเงิน" method is offered.
  const [transferCfg, setTransferCfg] = useState<{
    enabled: boolean; mode: 'auto' | 'manual'; promptpayId: string; accountName: string
  } | null>(null)

  const [btStatus, setBtStatus] = useState<'idle' | 'connecting' | 'printing' | 'done' | 'error'>('idle')
  const [btError,  setBtError]  = useState('')
  const [btName,   setBtName]   = useState('')

  const [cfg, setCfg]             = useState<BarSettings | null>(null)
  const [staffName, setStaffName] = useState('')

  useEffect(() => {
    setCfg(loadBarSettings())
    // Pre-warm the order lambda now (modal open) so confirming payment isn't
    // stalled by a serverless cold start on the first sale after a lull.
    authedFetch('/api/orders?warm=1').catch(() => {})
    // Load transfer-payment config so we know whether to offer "โอนเงิน".
    authedFetch('/api/payment/config')
      .then(r => r.json())
      .then(d => { if (d?.transfer) setTransferCfg(d.transfer) })
      .catch(() => {})
    try {
      const u = sessionStorage.getItem('pos_active_user')
      if (u) setStaffName(JSON.parse(u).name ?? '')
    } catch { /* ignore */ }
    const s = loadBarSettings()
    if ((s.printerConnectionType ?? 'bluetooth') === 'lan') {
      if (s.printerLanIp) setBtName(s.printerLanIp)
    } else {
      loadPrinterDevice().then(d => { if (d) setBtName(d.name ?? d.address) }).catch(() => {})
    }
  }, [])

  // Fetch real PromptPay QR when "QR Pay" is selected
  useEffect(() => {
    if (payment !== 'promptpay' || ppQr) return
    setPpLoading(true)
    const phone = cfg?.promptpayNumber ?? ''
    if (!phone) { setPpLoading(false); return }
    const barNameParam = cfg?.barName ? `&barName=${encodeURIComponent(cfg.barName)}` : ''
    authedFetch(`/api/payment/promptpay?phone=${encodeURIComponent(phone)}&amount=${total}${barNameParam}`)
      .then(r => r.json())
      .then(d => { if (d.dataUrl) setPpQr(d.dataUrl) })
      .catch(() => {})
      .finally(() => setPpLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, cfg])

  // Fetch the transfer PromptPay QR (uses the store's transfer promptpayId, which
  // may differ from the POS static-QR number) when "โอนเงิน" is selected.
  useEffect(() => {
    if (payment !== 'transfer' || ppQr) return
    const phone = transferCfg?.promptpayId ?? ''
    if (!phone) return
    setPpLoading(true)
    const barNameParam = cfg?.barName ? `&barName=${encodeURIComponent(cfg.barName)}` : ''
    authedFetch(`/api/payment/promptpay?phone=${encodeURIComponent(phone)}&amount=${total}${barNameParam}`)
      .then(r => r.json())
      .then(d => { if (d.dataUrl) setPpQr(d.dataUrl) })
      .catch(() => {})
      .finally(() => setPpLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, transferCfg, cfg])

  // Auto-print when payment confirmed (step 3) — Bluetooth or LAN
  const autoPrintedRef = useRef(false)
  // Synchronous re-entry lock — blocks a fast double-tap before the disabled
  // state re-renders, so payment/order creation can never fire twice.
  const confirmingRef = useRef(false)
  // Bluetooth socket opened up front (in parallel with the server order-save) so
  // the ~1.5 s connect overlaps the save instead of following it. Holds the
  // in-flight warm-up promise; the print step awaits it, then just transmits.
  const warmupRef = useRef<Promise<boolean> | null>(null)
  useEffect(() => {
    if (step !== 3 || autoPrintedRef.current) return
    autoPrintedRef.current = true
    const s = loadBarSettings()
    // Fire the print the instant the "Payment Complete" screen renders. A cash
    // sale keeps the cashier here counting change, but a QR sale has nothing to
    // count — they tap "Done" immediately, so any delay here races the modal
    // closing and the receipt silently never prints. No delay = job in flight
    // before it can be cut off. printReceipt reconnects to the printer itself.
    if ((s.printerConnectionType ?? 'bluetooth') === 'lan') {
      if (s.printerLanIp) handleBTPrint()
    } else {
      loadPrinterDevice()
        .then(saved => { if (saved) handleBTPrint() })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const subtotal    = cart.reduce((s, c) => s + effUnit(c) * c.qty, 0)
  const total       = Math.max(0, subtotal - discount.amount)
  const vatIncluded = Math.round(total * 7 / 107)
  const receivedNum = parseFloat(received) || 0
  const change      = Math.max(0, receivedNum - total)
  const canPay      = payment !== 'cash' || receivedNum >= total

  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-GB')
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  async function handleBTPrint() {
    if (!cfg) return
    setBtError('')
    const data: ReceiptData = {
      orderId: orderRef, tableNo: table, createdAt: new Date().toISOString(),
      staffName: staffName || undefined, memberName: memberName || undefined,
      couponCode: discount.couponCode,
      items: cart.map(c => ({ name: c.name, qty: c.qty, price: effUnit(c) })),
      subtotal, discountAmount: discount.amount, total, vatIncluded,
      paymentMethod: payment,
      received:  payment === 'cash' ? receivedNum : undefined,
      change:    payment === 'cash' ? change       : undefined,
      note:      note || undefined,
    }
    // printReceipt / openCashDrawer reconnect to the saved printer via the
    // native plugin themselves before writing, so we no longer pre-connect or
    // trust the (stale) isConnected flag here.
    setBtStatus('printing')
    let printed = false
    try {
      // Bundle the cash-drawer kick INTO the print job (openDrawer flag) rather
      // than firing it as a separate connection afterwards — that separate kick
      // raced with the printer still feeding the bill and usually didn't open
      // the till even though the bytes flushed. One job = reliable.
      //
      // If the socket was warmed up front during the order-save, printReceiptWarm
      // transmits straight onto it; otherwise (retry, or warm-up failed) it falls
      // back to the full atomic reconnect. Consume the warm-up either way.
      const warmed = warmupRef.current ? await warmupRef.current.catch(() => false) : false
      warmupRef.current = null
      await printReceiptWarm(data, cfg, warmed, { openDrawer: payment === 'cash', reviewQR: true })
      printed = true
    } catch (err) {
      setBtError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
    // Fallback: if the whole print job failed to connect on a cash sale, still
    // try a standalone drawer kick so the till can open.
    if (!printed && payment === 'cash') await openCashDrawer(cfg).catch(() => {})
    setBtStatus(printed ? 'done' : 'error')
  }

  // receivedOverride ใช้เมื่อกดปุ่มแบงค์ (ไม่ต้องรอ state update)
  async function handleConfirm(receivedOverride?: number) {
    const amt = receivedOverride ?? receivedNum
    if (payment === 'cash' && amt < total) return
    if (confirmingRef.current) return          // already processing — ignore the extra tap
    confirmingRef.current = true
    setIsConfirming(true)
    // Open the Bluetooth socket NOW, concurrently with the server order-save, so
    // the slow connect overlaps the save. The print step (step 3) awaits this and
    // only then pushes the bytes — so the paper still feeds after the sale is
    // saved, just without paying for the connect twice. LAN needs no warm-up.
    if (cfg && (cfg.printerConnectionType ?? 'bluetooth') !== 'lan') {
      warmupRef.current = warmBluetoothSocket().catch(() => false)
    }
    try {
      const id = await onConfirm(payment, payment === 'cash' ? amt : undefined)
      if (receivedOverride != null) setReceived(String(receivedOverride))
      setOrderRef(id.slice(-8).toUpperCase())
      setStep(3)
      setBtStatus('idle')
    } catch {
      // Save failed — we never reach step 3, so drop the warmed socket. The next
      // print starts with a fresh disconnect/connect regardless, so leaving the
      // link open is harmless; just clear the ref so nothing awaits a stale one.
      warmupRef.current = null
      /* parent shows toast */
    } finally {
      confirmingRef.current = false
      setIsConfirming(false)
    }
  }

  const isLan = (cfg?.printerConnectionType ?? 'bluetooth') === 'lan'
  const btLabel = (() => {
    if (btStatus === 'connecting') return 'Connecting...'
    if (btStatus === 'printing')   return 'Printing...'
    if (btStatus === 'done')       return 'Printed!'
    if (btStatus === 'error')      return isLan ? 'Retry LAN Print' : 'Retry Bluetooth'
    if (btName)                    return `Print (${btName})`
    return isLan ? 'Print via LAN' : 'Print via Bluetooth'
  })()

  const btDisabled = btStatus === 'connecting' || btStatus === 'printing'

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="bg-[#FAF8F4] rounded-t-3xl sm:rounded-2xl w-full max-w-none sm:max-w-md shadow-2xl overflow-hidden flex flex-col border border-stone-200 max-h-[94vh] sm:max-h-[90vh]"
      >
        {/* Step bar */}
        <div className="flex border-b border-stone-200 shrink-0 bg-white">
          {(['Review', 'Payment', 'Done'] as const).map((label, i) => {
            const s = (i + 1) as 1 | 2 | 3
            const active = step === s
            const done   = step > s
            return (
              <div
                key={label}
                className={`flex-1 py-3 text-center text-xs font-bold transition select-none ${
                  active ? 'text-amber-600 border-b-2 border-amber-500 bg-amber-50/60'
                : done   ? 'text-emerald-600 bg-white'
                :          'text-stone-300 bg-white'
                }`}
              >
                {done ? '✓ ' : `${s}. `}{label}
              </div>
            )
          })}
        </div>

        {/* ── STEP 1: Review ── */}
        {step === 1 && (
          <div className="flex flex-col overflow-hidden">
            <div className="px-5 pt-5 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg text-stone-900">{tr('coOrderReview')}</h2>
                <span className="text-amber-600 font-bold text-sm bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                  {tr('coTable')} {table}
                </span>
              </div>

              <div className="flex flex-col gap-0 mb-4">
                {cart.map((item, idx) => (
                  <div key={`${item.menuId}-${idx}`} className="flex items-center justify-between py-2.5 border-b border-stone-100 last:border-0">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="shrink-0 w-7 h-7 rounded-lg bg-stone-200 text-stone-600 text-xs font-black flex items-center justify-center">
                        {item.qty}
                      </span>
                      <span className="text-sm text-stone-700 truncate">{item.name}</span>
                      {item.itemDiscount && item.itemDiscount > 0 ? (
                        <span className="shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded px-1">-{item.itemDiscount}%</span>
                      ) : null}
                    </div>
                    <span className="text-sm font-bold text-stone-900 shrink-0 ml-3 text-right">
                      {item.itemDiscount && item.itemDiscount > 0 ? (
                        <>
                          <span className="text-[11px] text-stone-300 line-through mr-1">{baht(item.price * item.qty)}</span>
                          {baht(effUnit(item) * item.qty)}
                        </>
                      ) : baht(item.price * item.qty)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-stone-100 px-4 py-3 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400">{tr('coSubtotal')}</span>
                  <span className="text-stone-600 font-medium">{baht(subtotal)}</span>
                </div>
                {discount.amount > 0 && (
                  <div className="flex justify-between text-sm font-medium text-emerald-600">
                    <span>
                      {tr('coDiscount')}
                      {discount.couponCode
                        ? ` [${discount.couponCode}]`
                        : discount.type === 'percent' ? ` (${discount.value}%)` : ' (fixed)'}
                    </span>
                    <span>-{baht(discount.amount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline border-t border-stone-100 pt-2.5 mt-0.5">
                  <span className="font-bold text-stone-700">{tr('coTotal')}</span>
                  <span className="font-black text-2xl text-stone-900">{baht(total)}</span>
                </div>
                <div className="flex justify-between text-xs text-stone-300">
                  <span>{tr('coVatIncluded')}</span><span>{baht(vatIncluded)}</span>
                </div>
              </div>

              {(memberName || staffName || note) && (
                <div className="mt-3 flex flex-col gap-1 text-xs text-stone-400 pb-2">
                  {memberName && (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1"><PIcon src={PAY_ICONS.member} className="w-3.5 h-3.5" /> {tr('coMember')}: <span className="text-stone-600 font-medium">{memberName}</span></span>
                        {memberTier && (() => {
                          const t = getTierByName(memberTier)
                          return (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.pillClass}`}>
                              {t.badge} {t.label}
                            </span>
                          )
                        })()}
                      </div>
                      {memberTier && (() => {
                        const t    = getTierByName(memberTier)
                        const pts  = computePointsEarned(total, t)
                        const mult = TIERS.findIndex(x => x.name === memberTier)
                        const multLabel = mult === 2 ? '2×' : mult === 1 ? '1.5×' : '1×'
                        return (
                          <span className="text-emerald-500 font-semibold">
                            +{pts} {tr('coPtsEarned')} ({t.label} {multLabel})
                          </span>
                        )
                      })()}
                    </div>
                  )}
                  {staffName && <span className="inline-flex items-center gap-1"><PIcon src={PAY_ICONS.staff} className="w-3.5 h-3.5" /> {tr('coStaff')}: <span className="text-stone-600 font-medium">{staffName}</span></span>}
                  {note      && <span className="text-stone-500">{note}</span>}
                </div>
              )}
            </div>

            <div className="px-5 pt-4 pb-2 border-t border-stone-100 bg-white">
              <button
                onClick={() => setStep(2)}
                className="w-full py-3 rounded-xl bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold text-sm transition"
              >
                {tr('coPayment')} →
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 text-xs text-stone-300 hover:text-stone-500 transition bg-white"
            >
              ← {tr('coBackToOrder')}
            </button>
          </div>
        )}

        {/* ── STEP 2: Payment ── */}
        {step === 2 && (
          <div className="flex flex-col overflow-hidden">
            <div className="px-5 pt-5 pb-4 overflow-y-auto flex-1">

              {/* Amount due */}
              <div className="text-center mb-5 bg-white rounded-2xl border border-stone-100 py-4 shadow-sm">
                <p className="text-stone-400 text-xs font-semibold uppercase tracking-wide">{tr('coAmountDue')}</p>
                <p className="text-5xl font-black text-stone-900 mt-1">{baht(total)}</p>
                <p className="text-xs text-stone-300 mt-1">{tr('coTable')} {table}</p>
              </div>

              {/* Payment method selector — Cash + one QR option. When transfer
                  (slip verification) is enabled it replaces the plain PromptPay
                  QR, since both are "scan the QR and pay" to the same account. */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {([
                  { id: 'cash', icon: PAY_ICONS.cash, label: tr('coCash') },
                  transferCfg?.enabled
                    ? { id: 'transfer' as const,  icon: PAY_ICONS.scan, label: 'QR / โอนเงิน' }
                    : { id: 'promptpay' as const, icon: PAY_ICONS.scan, label: tr('coQrPay') },
                ] as const).map((pm) => (
                  <button
                    key={pm.id}
                    onClick={() => { setPayment(pm.id); setReceived('') }}
                    className={`py-3 rounded-xl flex flex-col items-center gap-1 transition active:scale-95 border-2 ${
                      payment === pm.id
                        ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                        : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400 hover:text-stone-700'
                    }`}
                  >
                    <PIcon src={pm.icon} className="w-6 h-6" />
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${payment === pm.id ? 'text-white' : 'text-stone-500'}`}>
                      {pm.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Cash panel — 3 preset banknote buttons */}
              {payment === 'cash' && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-stone-400 font-semibold uppercase tracking-wide text-center">{tr('coCashReceived')}</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {cashOptions(total).map((amount, i) => {
                      const changeAmt = amount - total
                      return (
                        <button
                          key={amount}
                          onClick={() => handleConfirm(amount)}
                          disabled={isConfirming}
                          className={`flex flex-col items-center justify-center gap-1 py-5 rounded-2xl border-2 transition active:scale-95 disabled:opacity-50 ${
                            i === 0
                              ? 'bg-stone-900 border-stone-900 text-white shadow-md'
                              : i === 1
                              ? 'bg-white border-stone-300 text-stone-800 hover:border-stone-500 hover:bg-stone-50'
                              : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400 hover:bg-stone-50'
                          }`}
                        >
                          <span className="text-xl font-black leading-none">{baht(amount)}</span>
                          <span className={`text-[11px] font-semibold leading-none ${
                            i === 0 ? 'text-stone-300' : 'text-stone-400'
                          }`}>
                            {changeAmt === 0 ? tr('coExact') : `${tr('coChange')} ${baht(changeAmt)}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {isConfirming && (
                    <p className="text-xs text-stone-400 text-center animate-pulse">{tr('coProcessing')}</p>
                  )}
                </div>
              )}

              {/* PromptPay QR panel */}
              {payment === 'promptpay' && (
                <div className="bg-white border border-stone-100 rounded-xl p-4 flex flex-col items-center gap-3">
                  {ppLoading ? (
                    <div className="py-8 flex flex-col items-center gap-2">
                      <div className="w-7 h-7 border-2 border-stone-200 border-t-purple-500 rounded-full animate-spin" />
                      <p className="text-xs text-stone-400">{tr('coGeneratingQr')}</p>
                    </div>
                  ) : ppQr ? (
                    <>
                      <div className="p-2 bg-white border-2 border-purple-100 rounded-xl">
                        <img src={ppQr} alt="PromptPay QR" className="w-48 h-48 object-contain" />
                      </div>
                      <p className="text-2xl font-black text-stone-900">{baht(total)}</p>
                      <p className="text-[10px] text-stone-400 text-center">
                        สแกนด้วยแอปธนาคารใดก็ได้ · Scan with any Thai banking app
                      </p>
                    </>
                  ) : (
                    <div className="py-6 text-center flex flex-col items-center gap-2">
                      <PIcon src={PAY_ICONS.scan} className="w-12 h-12" />
                      <p className="text-sm font-bold text-stone-900">{baht(total)}</p>
                      <p className="text-xs text-stone-400">ตั้งค่าเบอร์ PromptPay ใน Settings</p>
                    </div>
                  )}
                </div>
              )}

              {/* Bank-transfer panel — show the transfer QR; the slip is scanned
                  after the sale is recorded (step 3) so it attaches to the order. */}
              {payment === 'transfer' && (
                <div className="bg-white border border-stone-100 rounded-xl p-4 flex flex-col items-center gap-3">
                  {ppLoading ? (
                    <div className="py-8 flex flex-col items-center gap-2">
                      <div className="w-7 h-7 border-2 border-stone-200 border-t-emerald-500 rounded-full animate-spin" />
                      <p className="text-xs text-stone-400">{tr('coGeneratingQr')}</p>
                    </div>
                  ) : ppQr ? (
                    <>
                      <div className="p-2 bg-white border-2 border-emerald-100 rounded-xl">
                        <img src={ppQr} alt="Transfer QR" className="w-48 h-48 object-contain" />
                      </div>
                      <p className="text-2xl font-black text-stone-900">{baht(total)}</p>
                      {transferCfg?.accountName && <p className="text-sm text-stone-500">{transferCfg.accountName}</p>}
                      <p className="text-[10px] text-stone-400 text-center">
                        ลูกค้าสแกนโอน แล้วกด &ldquo;{tr('coConfirmPayment')}&rdquo; เพื่อแนบสลิป
                      </p>
                    </>
                  ) : (
                    <div className="py-6 text-center flex flex-col items-center gap-2">
                      <PIcon src={PAY_ICONS.scan} className="w-12 h-12" />
                      <p className="text-sm font-bold text-stone-900">{baht(total)}</p>
                      <p className="text-xs text-stone-400">ตั้งค่าบัญชีรับโอนใน Settings</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-stone-100 flex gap-3 bg-white">
              <button
                onClick={() => setStep(1)}
                className="px-5 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100 hover:text-stone-700 text-sm font-semibold transition active:scale-95"
              >
                ← {tr('coBack')}
              </button>
              {(payment === 'promptpay' || payment === 'transfer') && (
                <button
                  onClick={() => handleConfirm()}
                  disabled={isConfirming}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition active:scale-95 ${
                    !isConfirming
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-200/60'
                      : 'bg-stone-100 text-stone-300 cursor-not-allowed'
                  }`}
                >
                  {isConfirming ? tr('coProcessing') : tr('coConfirmPayment')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === 3 && (
          <div className="flex flex-col items-center px-6 py-8 gap-4 overflow-y-auto">

            <PIcon src={PAY_ICONS.success} className="w-24 h-24" />

            <div className="text-center">
              <p className="text-2xl font-black text-stone-900">Payment Complete!</p>
              <p className="text-stone-400 mt-1 text-sm">
                {baht(total)} · {PAY_LABEL_MAP[payment] ?? payment.toUpperCase()} · Table {table}
              </p>
              {payment === 'cash' && change > 0 && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  <span className="text-emerald-700 font-bold text-lg">Change: {baht(change)}</span>
                </div>
              )}
              <p className="text-xs text-stone-300 mt-2 font-mono">Order #{orderRef}</p>
              {staffName && <p className="text-xs text-stone-300 mt-0.5">Staff: {staffName}</p>}
            </div>

            {/* Transfer slip — verify/attach the customer's slip against the order.
                Auto mode marks it verified; manual mode records it pending for a
                staff confirm. Only once a real order id exists. */}
            {payment === 'transfer' && orderRef !== 'DRAFT' && transferCfg?.promptpayId && (
              <div className="w-full bg-stone-50 border border-stone-100 rounded-2xl p-4">
                <SlipTransferPanel
                  amount={total}
                  orderId={orderRef}
                  promptpayId={transferCfg.promptpayId}
                  accountName={transferCfg.accountName}
                  merchantName={cfg?.barName}
                  isStaff
                  post={(path, body) => authedFetch(path, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  })}
                />
              </div>
            )}

            {/* Print — device connection only (no browser tab) */}
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={handleBTPrint}
                disabled={btDisabled}
                className={`w-full py-3 rounded-xl font-semibold transition active:scale-95 flex items-center justify-center gap-2 text-sm border ${
                  btStatus === 'done'  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : btStatus === 'error' ? 'bg-red-50 border-red-300 text-red-600'
                : btDisabled          ? 'bg-stone-100 border-stone-200 text-stone-300 cursor-not-allowed'
                : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300'
                }`}
              >
                <PIcon src={PAY_ICONS.printBt} className="w-4 h-4" />
                {btLabel}
              </button>

              {btError && (
                <p className="text-xs text-red-500 text-center px-2 leading-snug">{btError}</p>
              )}

              {btStatus === 'idle' && !btName && (
                <p className="text-[10px] text-stone-300 text-center">
                  ต้องตั้งค่าใน Settings → Bluetooth Printer ก่อน (Android app เท่านั้น)
                </p>
              )}
            </div>

            <button
              onClick={() => onComplete ? onComplete() : onClose()}
              className="w-full py-4 rounded-2xl bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold text-base transition"
            >
              New Order →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
