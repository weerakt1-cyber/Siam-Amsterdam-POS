'use client'

import { useState, useEffect } from 'react'
import { loadBarSettings } from '@/lib/printer'

declare global {
  interface Window {
    Omise: {
      setPublicKey: (key: string) => void
      createToken: (
        type: string,
        data: object,
        cb: (status: number, res: { id?: string; message?: string }) => void,
      ) => void
    }
  }
}

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('en').format(Math.round(n))
}

export type OmisePayType = 'credit_card' | 'promptpay_qr' | 'wechat_pay'
type Step = 'idle' | 'loading' | 'qr' | 'error'

type Props = {
  paymentType: OmisePayType
  total: number
  onSuccess: () => Promise<void>
  onClose: () => void
}

const META: Record<OmisePayType, { title: string; accent: string; badge: string }> = {
  credit_card:  { title: '💳 Credit / Debit Card',   accent: 'bg-blue-600 hover:bg-blue-500',   badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  promptpay_qr: { title: '📱 PromptPay QR',           accent: 'bg-violet-600 hover:bg-violet-500', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  wechat_pay:   { title: '🟢 WeChat Pay / Alipay',   accent: 'bg-green-600 hover:bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-200' },
}

export default function OmisePaymentModal({ paymentType, total, onSuccess, onClose }: Props) {
  const [step, setStep]         = useState<Step>('idle')
  const [error, setError]       = useState('')
  const [chargeId, setChargeId] = useState<string | null>(null)
  const [qrSrc, setQrSrc]       = useState<string | null>(null)
  const [omiseReady, setOmiseReady] = useState(false)
  const [completing, setCompleting] = useState(false)

  // Card form state
  const [cardName,   setCardName]   = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv,    setCardCvv]    = useState('')

  const meta = META[paymentType]

  // Load Omise.js CDN for card tokenization. The publishable key comes from
  // Settings → Payment (via /api/payment/config), falling back to the env var
  // server-side, so no NEXT_PUBLIC_ env var is required to make cards work.
  useEffect(() => {
    if (paymentType !== 'credit_card') return
    let cancelled = false
    ;(async () => {
      let pk = ''
      try {
        const r = await fetch('/api/payment/config')
        if (r.ok) pk = (await r.json()).publicKey ?? ''
      } catch { /* fall through — modal shows an error on submit if empty */ }
      if (cancelled) return
      if (typeof window !== 'undefined' && window.Omise) {
        window.Omise.setPublicKey(pk); setOmiseReady(true); return
      }
      const script = document.createElement('script')
      script.src = 'https://cdn.omise.co/omise.js'
      script.onload = () => { window.Omise.setPublicKey(pk); setOmiseReady(true) }
      document.body.appendChild(script)
    })()
    return () => { cancelled = true }
  }, [paymentType])

  // Auto-start QR flow for non-card types
  useEffect(() => {
    if (paymentType !== 'credit_card') startQR()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll charge status while QR is displayed
  useEffect(() => {
    if (step !== 'qr' || !chargeId) return
    let stopped = false
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`/api/payment/omise/${chargeId}`)
        const data = await res.json()
        if (!stopped && (data.paid || data.status === 'successful')) {
          stopped = true
          clearInterval(interval)
          await completePayment()
        } else if (!stopped && (data.status === 'failed' || data.status === 'expired')) {
          stopped = true
          clearInterval(interval)
          setStep('error')
          setError('Payment was declined or expired. Please try again.')
        }
      } catch { /* ignore transient network errors */ }
    }, 3000)
    return () => { stopped = true; clearInterval(interval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, chargeId])

  async function completePayment() {
    setCompleting(true)
    try { await onSuccess() } finally { setCompleting(false) }
  }

  async function startQR() {
    setStep('loading')
    setError('')
    try {
      const apiType = paymentType === 'promptpay_qr' ? 'promptpay' : 'wechat_pay'
      const res  = await fetch('/api/payment/omise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: apiType, amount: total }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create payment')
      setChargeId(data.chargeId)
      setQrSrc(data.qrImage ?? data.qrDataUrl ?? null)
      setStep('qr')
    } catch (err) {
      setStep('error')
      setError(err instanceof Error ? err.message : 'Error creating payment')
    }
  }

  async function submitCard() {
    if (!omiseReady) return
    setStep('loading')
    setError('')
    const [expMonthStr, expYearShort] = cardExpiry.split('/')
    window.Omise.createToken('card', {
      name:               cardName,
      number:             cardNumber.replace(/\s/g, ''),
      expiration_month:   parseInt(expMonthStr),
      expiration_year:    parseInt('20' + expYearShort),
      security_code:      cardCvv,
    }, async (statusCode, response) => {
      if (statusCode !== 200) {
        setStep('error')
        setError(response.message ?? 'Card verification failed')
        return
      }
      try {
        const res  = await fetch('/api/payment/omise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'credit_card', token: response.id, amount: total, description: loadBarSettings().barName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Payment error')
        if (data.status === 'failed') throw new Error(data.failureMessage ?? 'Card declined')
        if (data.paid || data.status === 'successful') {
          await completePayment()
        } else {
          setStep('error')
          setError('3D Secure required — please use a different card or contact staff.')
        }
      } catch (err) {
        setStep('error')
        setError(err instanceof Error ? err.message : 'Payment failed')
      }
    })
  }

  const cardValid =
    cardName.trim().length > 0 &&
    cardNumber.replace(/\s/g, '').length >= 15 &&
    cardExpiry.length === 5 &&
    cardCvv.length >= 3

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-stone-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <h2 className="font-bold text-stone-900 text-sm">{meta.title}</h2>
            <p className="text-xs text-stone-400 mt-0.5">Amount: {baht(total)}</p>
          </div>
          {!completing && step !== 'loading' && (
            <button
              onClick={onClose}
              className="text-stone-300 hover:text-stone-600 text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-xl hover:bg-stone-50 transition"
            >×</button>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* ── Error banner ── */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <span className="text-red-400 shrink-0">⚠</span>
              <div className="flex-1 text-xs text-red-600 leading-relaxed">{error}</div>
              <button onClick={() => { setError(''); setStep('idle') }} className="text-red-300 hover:text-red-500 text-lg leading-none shrink-0">×</button>
            </div>
          )}

          {/* ── Loading ── */}
          {step === 'loading' && (
            <div className="py-12 text-center">
              <div className="inline-block w-8 h-8 border-2 border-stone-200 border-t-stone-600 rounded-full animate-spin mb-3" />
              <p className="text-sm text-stone-400">
                {paymentType === 'credit_card' ? 'Processing payment...' : 'Generating QR code...'}
              </p>
            </div>
          )}

          {/* ── Completing ── */}
          {completing && (
            <div className="py-8 text-center flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-3xl">✅</div>
              <p className="text-sm text-emerald-600 font-semibold">Payment verified!</p>
              <p className="text-xs text-stone-400 animate-pulse">Saving order...</p>
            </div>
          )}

          {/* ── Credit Card Form ── */}
          {paymentType === 'credit_card' && step === 'idle' && !completing && (
            <>
              <div className="flex flex-col gap-2.5">
                <input
                  value={cardName}
                  onChange={e => setCardName(e.target.value)}
                  placeholder="Cardholder Name"
                  autoComplete="cc-name"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-stone-400 transition placeholder-stone-300"
                />
                <div className="relative">
                  <input
                    value={cardNumber}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 16)
                      setCardNumber(v.replace(/(.{4})/g, '$1 ').trim())
                    }}
                    placeholder="1234  5678  9012  3456"
                    maxLength={19}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest outline-none focus:border-stone-400 transition placeholder-stone-300"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg">💳</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={cardExpiry}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                      setCardExpiry(v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v)
                    }}
                    placeholder="MM / YY"
                    maxLength={5}
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-stone-400 transition placeholder-stone-300"
                  />
                  <input
                    value={cardCvv}
                    onChange={e => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="CVV"
                    maxLength={4}
                    inputMode="numeric"
                    type="password"
                    autoComplete="cc-csc"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-stone-400 transition placeholder-stone-300"
                  />
                </div>
              </div>

              <button
                onClick={submitCard}
                disabled={!omiseReady || !cardValid}
                className={`w-full py-3.5 rounded-xl text-white font-bold text-sm transition active:scale-95 shadow-md disabled:opacity-40 disabled:cursor-not-allowed ${meta.accent}`}
              >
                {!omiseReady ? 'Loading secure form...' : `Charge ${baht(total)}`}
              </button>

              <div className="flex items-center justify-center gap-2 text-[10px] text-stone-300">
                <span>🔒</span>
                <span>Secured by Omise · PCI DSS Level 1 Certified</span>
              </div>

              {/* Accepted cards */}
              <div className="flex items-center justify-center gap-3 pt-1">
                {['VISA', 'MC', 'JCB', 'AMEX'].map(c => (
                  <span key={c} className={`text-[9px] font-black px-2 py-0.5 rounded border ${meta.badge}`}>{c}</span>
                ))}
              </div>
            </>
          )}

          {/* ── QR Display (PromptPay / WeChat) ── */}
          {paymentType !== 'credit_card' && step === 'qr' && !completing && (
            <div className="flex flex-col items-center gap-3">
              {qrSrc ? (
                <div className="p-3 bg-white border-2 border-stone-100 rounded-2xl shadow-sm">
                  <img src={qrSrc} alt="Payment QR Code" className="w-52 h-52 object-contain" />
                </div>
              ) : (
                <div className="w-52 h-52 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-center">
                  <span className="text-stone-300 text-xs">QR unavailable</span>
                </div>
              )}

              <p className="text-3xl font-black text-stone-900">{baht(total)}</p>

              <div className="flex items-center gap-2 text-xs text-stone-400">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                Waiting for payment...
              </div>

              <p className="text-[10px] text-stone-300 text-center">
                {paymentType === 'promptpay_qr'
                  ? 'Scan with any Thai banking app (K Plus, SCB Easy, etc.)'
                  : 'Scan with WeChat Pay or Alipay'}
              </p>
            </div>
          )}

          {/* ── Error retry (QR types) ── */}
          {paymentType !== 'credit_card' && step === 'error' && !completing && (
            <div className="flex flex-col items-center gap-3 py-2">
              <button
                onClick={startQR}
                className={`px-6 py-2.5 rounded-xl text-white font-bold text-sm transition active:scale-95 ${meta.accent}`}
              >
                Try Again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
