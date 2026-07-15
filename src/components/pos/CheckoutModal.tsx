'use client'

import { useState, useEffect, useRef } from 'react'
import {
  loadBarSettings, loadPrinterDevice,
  printReceipt, openCashDrawer, DEFAULT_BAR_SETTINGS,
  type BarSettings, type ReceiptData,
} from '@/lib/printer'
import { getTierByName, computePointsEarned, TIERS } from '@/lib/loyalty'
import OmisePaymentModal, { type OmisePayType } from './OmisePaymentModal'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CartItem    = { menuId: string; name: string; qty: number; price: number }
export type PaymentMethod = 'cash' | 'card' | 'promptpay' | 'credit_card' | 'promptpay_qr' | 'wechat_pay'
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
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CheckoutModal({
  cart, table, note, discount, memberName, memberTier, onConfirm, onClose, onComplete,
}: Props) {
  const [step, setStep]                 = useState<1 | 2 | 3>(1)
  const [payment, setPayment]           = useState<PaymentMethod>('cash')
  const [received, setReceived]         = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [orderRef, setOrderRef]             = useState('DRAFT')

  const [showOmise, setShowOmise]   = useState(false)
  const [omiseType, setOmiseType]   = useState<OmisePayType>('credit_card')

  // PromptPay static QR
  const [ppQr,      setPpQr]      = useState<string | null>(null)
  const [ppLoading, setPpLoading] = useState(false)

  const [btStatus, setBtStatus] = useState<'idle' | 'connecting' | 'printing' | 'done' | 'error'>('idle')
  const [btError,  setBtError]  = useState('')
  const [btName,   setBtName]   = useState('')

  const [cfg, setCfg]             = useState<BarSettings | null>(null)
  const [staffName, setStaffName] = useState('')

  useEffect(() => {
    setCfg(loadBarSettings())
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
    fetch(`/api/payment/promptpay?phone=${encodeURIComponent(phone)}&amount=${total}${barNameParam}`)
      .then(r => r.json())
      .then(d => { if (d.dataUrl) setPpQr(d.dataUrl) })
      .catch(() => {})
      .finally(() => setPpLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, cfg])

  // Auto-print when payment confirmed (step 3) — Bluetooth or LAN
  const autoPrintedRef = useRef(false)
  useEffect(() => {
    if (step !== 3 || autoPrintedRef.current) return
    autoPrintedRef.current = true
    const s = loadBarSettings()
    if ((s.printerConnectionType ?? 'bluetooth') === 'lan') {
      if (s.printerLanIp) setTimeout(() => handleBTPrint(), 800)
    } else {
      loadPrinterDevice()
        .then(saved => { if (saved) setTimeout(() => handleBTPrint(), 800) })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const subtotal    = cart.reduce((s, c) => s + c.price * c.qty, 0)
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
      items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price })),
      subtotal, discountAmount: discount.amount, total, vatIncluded,
      paymentMethod: payment,
      received:  payment === 'cash' ? receivedNum : undefined,
      change:    payment === 'cash' ? change       : undefined,
      note:      note || undefined,
    }
    try {
      // printReceipt / openCashDrawer reconnect to the saved printer via the
      // native plugin themselves before writing, so we no longer pre-connect or
      // trust the (stale) isConnected flag here.
      setBtStatus('printing')
      await printReceipt(data, cfg)
      if (payment === 'cash') await openCashDrawer(cfg).catch(() => {})
      setBtStatus('done')
    } catch (err) {
      setBtStatus('error')
      setBtError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
  }

  // receivedOverride ใช้เมื่อกดปุ่มแบงค์ (ไม่ต้องรอ state update)
  async function handleConfirm(receivedOverride?: number) {
    const amt = receivedOverride ?? receivedNum
    if (payment === 'cash' && amt < total) return
    setIsConfirming(true)
    try {
      const id = await onConfirm(payment, payment === 'cash' ? amt : undefined)
      if (receivedOverride != null) setReceived(String(receivedOverride))
      setOrderRef(id.slice(-8).toUpperCase())
      setStep(3)
      setBtStatus('idle')
    } catch { /* parent shows toast */ } finally {
      setIsConfirming(false)
    }
  }

  const isLan = (cfg?.printerConnectionType ?? 'bluetooth') === 'lan'
  const btLabel = (() => {
    if (btStatus === 'connecting') return '🔵 Connecting...'
    if (btStatus === 'printing')   return '⏳ Printing...'
    if (btStatus === 'done')       return '✓ Printed!'
    if (btStatus === 'error')      return isLan ? '⚠ Retry LAN Print' : '⚠ Retry Bluetooth'
    if (btName)                    return isLan ? `🌐 Print (${btName})` : `📡 Print (${btName})`
    return isLan ? '🌐 Print via LAN' : '📡 Print via Bluetooth'
  })()

  const btDisabled = btStatus === 'connecting' || btStatus === 'printing'

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-[#FAF8F4] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col border border-stone-200"
        style={{ maxHeight: '90vh' }}
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
                <h2 className="font-bold text-lg text-stone-900">Order Review</h2>
                <span className="text-amber-600 font-bold text-sm bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                  Table {table}
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
                    </div>
                    <span className="text-sm font-bold text-stone-900 shrink-0 ml-3">{baht(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-stone-100 px-4 py-3 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400">Subtotal</span>
                  <span className="text-stone-600 font-medium">{baht(subtotal)}</span>
                </div>
                {discount.amount > 0 && (
                  <div className="flex justify-between text-sm font-medium text-emerald-600">
                    <span>
                      Discount
                      {discount.couponCode
                        ? ` [${discount.couponCode}]`
                        : discount.type === 'percent' ? ` (${discount.value}%)` : ' (fixed)'}
                    </span>
                    <span>-{baht(discount.amount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline border-t border-stone-100 pt-2.5 mt-0.5">
                  <span className="font-bold text-stone-700">Total</span>
                  <span className="font-black text-2xl text-stone-900">{baht(total)}</span>
                </div>
                <div className="flex justify-between text-xs text-stone-300">
                  <span>VAT 7% (included)</span><span>{baht(vatIncluded)}</span>
                </div>
              </div>

              {(memberName || staffName || note) && (
                <div className="mt-3 flex flex-col gap-1 text-xs text-stone-400 pb-2">
                  {memberName && (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>👤 Member: <span className="text-stone-600 font-medium">{memberName}</span></span>
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
                            +{pts} pts earned ({t.label} {multLabel})
                          </span>
                        )
                      })()}
                    </div>
                  )}
                  {staffName && <span>🧑 Staff: <span className="text-stone-600 font-medium">{staffName}</span></span>}
                  {note      && <span>📝 <span className="text-stone-500">{note}</span></span>}
                </div>
              )}
            </div>

            <div className="px-5 pt-4 pb-2 border-t border-stone-100 bg-white">
              <button
                onClick={() => setStep(2)}
                className="w-full py-3 rounded-xl bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold text-sm transition"
              >
                Payment →
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 text-xs text-stone-300 hover:text-stone-500 transition bg-white"
            >
              ← Back to order
            </button>
          </div>
        )}

        {/* ── STEP 2: Payment ── */}
        {step === 2 && (
          <div className="flex flex-col overflow-hidden">
            <div className="px-5 pt-5 pb-4 overflow-y-auto flex-1">

              {/* Amount due */}
              <div className="text-center mb-5 bg-white rounded-2xl border border-stone-100 py-4 shadow-sm">
                <p className="text-stone-400 text-xs font-semibold uppercase tracking-wide">Amount Due</p>
                <p className="text-5xl font-black text-stone-900 mt-1">{baht(total)}</p>
                <p className="text-xs text-stone-300 mt-1">Table {table}</p>
              </div>

              {/* Payment method selector — row 1: local */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                {([
                  { id: 'cash',      icon: '💵', label: 'Cash'    },
                  { id: 'card',      icon: '💳', label: 'EDC Card' },
                  { id: 'promptpay', icon: '📱', label: 'QR Pay'  },
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
                    <span className="text-xl">{pm.icon}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${payment === pm.id ? 'text-white' : 'text-stone-500'}`}>
                      {pm.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Row 2: online (Omise) — Card + PromptPay */}
              <p className="text-[9px] font-bold text-stone-300 uppercase tracking-widest text-center mb-1.5">Online Payment · Powered by Omise</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {([
                  { id: 'credit_card'  as OmisePayType, icon: '💳', label: 'Credit / Debit Card', accent: 'border-blue-400 bg-blue-50 text-blue-700'     },
                  { id: 'promptpay_qr' as OmisePayType, icon: '📱', label: 'PromptPay QR',         accent: 'border-violet-400 bg-violet-50 text-violet-700' },
                ]).map((pm) => (
                  <button
                    key={pm.id}
                    onClick={() => { setPayment(pm.id); setReceived(''); setOmiseType(pm.id); setShowOmise(true) }}
                    className={`py-3 rounded-xl flex flex-col items-center gap-1 transition active:scale-95 border-2 ${
                      payment === pm.id ? pm.accent : 'bg-white text-stone-400 border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <span className="text-xl">{pm.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide leading-tight text-center">{pm.label}</span>
                  </button>
                ))}
              </div>

              {/* Cash panel — 3 preset banknote buttons */}
              {payment === 'cash' && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-stone-400 font-semibold uppercase tracking-wide text-center">Cash Received</p>
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
                            {changeAmt === 0 ? 'Exact' : `Change ${baht(changeAmt)}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {isConfirming && (
                    <p className="text-xs text-stone-400 text-center animate-pulse">Processing...</p>
                  )}
                </div>
              )}

              {/* Card panel */}
              {payment === 'card' && (
                <div className="bg-white border border-stone-100 rounded-xl p-5 text-center flex flex-col gap-2">
                  <span className="text-5xl">💳</span>
                  <p className="text-sm font-semibold text-stone-500">Process on card terminal</p>
                  <p className="text-2xl font-black text-stone-900">{baht(total)}</p>
                </div>
              )}

              {/* PromptPay QR panel */}
              {payment === 'promptpay' && (
                <div className="bg-white border border-stone-100 rounded-xl p-4 flex flex-col items-center gap-3">
                  {ppLoading ? (
                    <div className="py-8 flex flex-col items-center gap-2">
                      <div className="w-7 h-7 border-2 border-stone-200 border-t-purple-500 rounded-full animate-spin" />
                      <p className="text-xs text-stone-400">Generating QR...</p>
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
                      <span className="text-4xl">📱</span>
                      <p className="text-sm font-bold text-stone-900">{baht(total)}</p>
                      <p className="text-xs text-stone-400">ตั้งค่าเบอร์ PromptPay ใน Settings</p>
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
                ← Back
              </button>
              {(payment === 'card' || payment === 'promptpay') && (
                <button
                  onClick={() => handleConfirm()}
                  disabled={isConfirming}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition active:scale-95 ${
                    !isConfirming
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-200/60'
                      : 'bg-stone-100 text-stone-300 cursor-not-allowed'
                  }`}
                >
                  {isConfirming ? 'Processing...' : '✓ Confirm Payment'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === 3 && (
          <div className="flex flex-col items-center px-6 py-8 gap-4 overflow-y-auto">

            <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-4xl">
              ✅
            </div>

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

      {/* Omise payment modal — overlays on top of CheckoutModal */}
      {showOmise && (
        <OmisePaymentModal
          paymentType={omiseType}
          total={total}
          onSuccess={async () => {
            setIsConfirming(true)
            try {
              const id = await onConfirm(omiseType)
              setOrderRef(id.slice(-8).toUpperCase())
              setStep(3)
              setBtStatus('idle')
            } catch { /* parent shows toast */ } finally {
              setIsConfirming(false)
              setShowOmise(false)
            }
          }}
          onClose={() => { setShowOmise(false); setPayment('cash') }}
        />
      )}
    </div>
  )
}
