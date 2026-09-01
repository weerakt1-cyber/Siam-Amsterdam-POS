'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { buildPromptPayQR } from '@/lib/promptpay'
import type { PosLang } from '@/lib/pos-i18n'

// Bank-transfer / PromptPay-slip payment panel, shared by the POS CheckoutModal
// (staff) and the customer self-order page. Shows the store's PromptPay QR for
// the exact order amount, lets the payer upload/scan their transfer slip, decodes
// the slip QR locally (jsqr), and POSTs it to /api/payment/slip/verify. The
// caller supplies `post` so this works with either a staff Bearer token or the
// public store hint.

type VerifyResp = {
  status?: 'verified' | 'pending' | 'rejected'
  reason?: string | null
  slip?: { id: string; amount: number; senderName: string | null } | null
  error?: string
}

type Props = {
  amount: number
  orderId: string
  promptpayId: string
  accountName?: string
  merchantName?: string
  isStaff?: boolean
  // POS UI language. Defaults to 'th' because this panel also renders on the
  // customer self-order page (outside the POS language provider) where Thai is
  // the right default; the staff CheckoutModal passes the selected POS language.
  lang?: PosLang
  post: (path: string, body: unknown) => Promise<Response>
  onVerified?: () => void
}

const REASONS: Record<string, { en: string; th: string }> = {
  RECEIVER_MISMATCH: { en: 'The receiving account does not match the store', th: 'บัญชีผู้รับไม่ตรงกับร้าน' },
  AMOUNT_MISMATCH:   { en: 'The slip amount does not match the bill', th: 'ยอดเงินในสลิปไม่ตรงกับบิล' },
  SLIP_TOO_OLD:      { en: 'Slip expired (over 30 minutes) — transfer again and retry', th: 'สลิปหมดอายุ (เกิน 30 นาที) — โอนใหม่แล้วลองอีกครั้ง' },
  SLIP_ALREADY_USED: { en: 'This slip has already been used for payment', th: 'สลิปนี้ถูกใช้ชำระไปแล้ว' },
  INVALID_SLIP:      { en: 'Could not read the slip — take a clear photo and try again', th: 'อ่านสลิปไม่สำเร็จ กรุณาถ่ายรูปสลิปให้ชัดแล้วลองใหม่' },
}

async function decodeSlipImage(file: File): Promise<{ qr: string | null; dataUrl: string }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = rej
    r.readAsDataURL(file)
  })
  let qr: string | null = null
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0)
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      qr = jsQR(img.data, img.width, img.height)?.data ?? null
    }
  } catch { /* undecodable image — leave qr null, server will handle */ }
  return { qr, dataUrl }
}

export default function SlipTransferPanel({
  amount, orderId, promptpayId, accountName, merchantName, isStaff, lang = 'th', post, onVerified,
}: Props) {
  const L = (en: string, th: string) => (lang === 'en' ? en : th)
  const [qrImg, setQrImg] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'verifying' | 'verified' | 'pending' | 'rejected'>('idle')
  const [reason, setReason] = useState<string | null>(null)
  const [slipId, setSlipId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Build the PromptPay QR for this exact amount (client-side, no secret needed).
  useEffect(() => {
    if (!promptpayId) return
    try {
      const payload = buildPromptPayQR(promptpayId, amount, merchantName || 'ร้านค้า')
      QRCode.toDataURL(payload, { width: 240, margin: 1 }).then(setQrImg).catch(() => setQrImg(null))
    } catch { setQrImg(null) }
  }, [promptpayId, amount, merchantName])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setState('verifying'); setReason(null); setSlipId(null)
    const { qr, dataUrl } = await decodeSlipImage(file)
    try {
      const res = await post('/api/payment/slip/verify', { orderId, qrPayload: qr ?? '', image: dataUrl })
      const data = (await res.json().catch(() => ({}))) as VerifyResp
      if (!res.ok) {
        setState('rejected'); setReason(data.error ?? L('Something went wrong', 'เกิดข้อผิดพลาด'))
      } else if (data.status === 'verified') {
        setState('verified'); onVerified?.()
      } else if (data.status === 'pending') {
        setState('pending'); setSlipId(data.slip?.id ?? null)
      } else {
        const r = data.reason ? REASONS[data.reason] : null
        setState('rejected'); setReason(r ? L(r.en, r.th) : (data.reason ?? null))
      }
    } catch {
      setState('rejected'); setReason(L('Connection failed', 'เชื่อมต่อไม่สำเร็จ'))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function confirmManually() {
    if (!slipId) return
    setConfirming(true)
    try {
      const res = await post(`/api/payment/slip/${slipId}/confirm`, {})
      if (res.ok) { setState('verified'); onVerified?.() }
    } finally { setConfirming(false) }
  }

  if (!promptpayId) {
    return (
      <div className="text-center text-sm text-stone-400 py-6">
        {L('No receiving account set up yet — configure it in Settings → Payments', 'ยังไม่ได้ตั้งค่าบัญชีรับโอน — ตั้งค่าที่หน้า Settings → การชำระเงิน')}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* PromptPay QR */}
      <div className="bg-white rounded-2xl p-3 border border-stone-200">
        {qrImg
          ? <img src={qrImg} alt="PromptPay QR" className="w-48 h-48 object-contain" />
          : <div className="w-48 h-48 flex items-center justify-center text-stone-300 text-sm">{L('Generating QR…', 'กำลังสร้าง QR…')}</div>}
      </div>
      <div className="text-center">
        <p className="text-2xl font-black text-stone-900">฿{amount.toLocaleString()}</p>
        {accountName && <p className="text-sm text-stone-500">{accountName}</p>}
        <p className="text-xs text-stone-400">PromptPay: {promptpayId}</p>
      </div>

      {/* Slip upload / states */}
      {state === 'verified' ? (
        <div className="w-full text-center bg-emerald-50 text-emerald-700 rounded-2xl py-4 font-bold">
          {L('✓ Payment confirmed', '✓ ยืนยันการชำระเงินสำเร็จ')}
        </div>
      ) : state === 'pending' ? (
        <div className="w-full text-center bg-amber-50 text-amber-700 rounded-2xl py-4 px-3 flex flex-col gap-2">
          <span className="font-bold">{L('⏳ Awaiting staff confirmation', '⏳ รอพนักงานยืนยัน')}</span>
          <span className="text-xs text-amber-600">{L('Slip received — staff will review and confirm', 'ได้รับสลิปแล้ว พนักงานจะตรวจสอบและยืนยัน')}</span>
          {isStaff && slipId && (
            <button
              onClick={confirmManually}
              disabled={confirming}
              className="mt-1 mx-auto px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition active:scale-95 disabled:opacity-50"
            >
              {confirming ? L('Confirming…', 'กำลังยืนยัน…') : L('✓ Confirm received', '✓ ยืนยันรับเงิน')}
            </button>
          )}
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={state === 'verifying'}
            className="w-full py-3 rounded-2xl bg-stone-900 text-white font-bold text-sm transition active:scale-95 disabled:opacity-50"
          >
            {state === 'verifying' ? L('Verifying slip…', 'กำลังตรวจสอบสลิป…') : L('📷 Upload / photograph the transfer slip', '📷 อัปโหลด / ถ่ายรูปสลิปโอนเงิน')}
          </button>
          {state === 'rejected' && (
            <p className="text-sm text-red-500 text-center">✗ {reason ?? L('Slip verification failed', 'ตรวจสอบสลิปไม่สำเร็จ')}</p>
          )}
        </>
      )}
    </div>
  )
}
