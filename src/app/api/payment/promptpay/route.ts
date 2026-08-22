export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { buildPromptPayQR } from '@/lib/promptpay'
import { requireStaff } from '@/lib/api-auth'

// Staff-only: the static-QR path is the POS checkout (CheckoutModal via
// authedFetch). The customer QR self-order flow pays through /api/payment/omise,
// not this route, so it does not need to be public.
export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const phone   = searchParams.get('phone') ?? ''
  const amount  = parseFloat(searchParams.get('amount') ?? '') || undefined
  const barName = searchParams.get('barName') ?? undefined

  if (!phone) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 })
  }

  try {
    const payload = barName
      ? buildPromptPayQR(phone, amount, barName)
      : buildPromptPayQR(phone, amount)
    const svg     = await QRCode.toString(payload, { type: 'svg', width: 300, margin: 1 })
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    return NextResponse.json({ dataUrl, payload })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'QR error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
