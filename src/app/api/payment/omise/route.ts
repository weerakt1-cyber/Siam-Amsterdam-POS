export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OmiseLib = require('omise')

function getOmise() {
  return OmiseLib({
    secretKey:  process.env.OMISE_SECRET_KEY  ?? '',
    publicKey:  process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY ?? '',
  })
}

export async function POST(req: NextRequest) {
  try {
    const { type, token, amount } = await req.json()
    const amountSatang = Math.round(Number(amount) * 100)

    if (!amountSatang || amountSatang < 2000) {
      return NextResponse.json({ error: 'Minimum charge is ฿20' }, { status: 400 })
    }

    const omise = getOmise()

    // ── Credit Card ──────────────────────────────────────────
    if (type === 'credit_card') {
      if (!token) return NextResponse.json({ error: 'Card token required' }, { status: 400 })
      const charge = await omise.charges.create({
        amount:      amountSatang,
        currency:    'thb',
        card:        token,
        capture:     true,
        description: 'SIAM AMSTERDAM POS',
      })
      return NextResponse.json({
        chargeId:       charge.id,
        status:         charge.status,
        paid:           charge.paid,
        failureMessage: charge.failure_message ?? null,
      })
    }

    // ── PromptPay QR ─────────────────────────────────────────
    if (type === 'promptpay') {
      const source = await omise.sources.create({ type: 'promptpay', amount: amountSatang, currency: 'thb' })
      const charge = await omise.charges.create({ amount: amountSatang, currency: 'thb', source: source.id })
      // Omise returns a ready-made QR image URL for PromptPay
      const qrImage = charge?.source?.scannable_code?.image?.download_uri ?? null
      return NextResponse.json({ chargeId: charge.id, status: charge.status, qrImage })
    }

    // ── WeChat Pay / Alipay ──────────────────────────────────
    if (type === 'wechat_pay') {
      const source = await omise.sources.create({ type: 'wechat_pay', amount: amountSatang, currency: 'thb' })
      const charge = await omise.charges.create({ amount: amountSatang, currency: 'thb', source: source.id })
      // Generate QR code from the authorize_uri so customer can scan with WeChat/Alipay
      const authorizeUri = charge?.authorize_uri ?? ''
      const qrSvg = authorizeUri
        ? await QRCode.toString(authorizeUri, { type: 'svg', width: 280, margin: 1 })
        : null
      const qrDataUrl = qrSvg
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`
        : null
      return NextResponse.json({ chargeId: charge.id, status: charge.status, qrDataUrl })
    }

    return NextResponse.json({ error: 'Unknown payment type' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payment gateway error'
    console.error('[Omise]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
