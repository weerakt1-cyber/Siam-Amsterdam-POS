export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { buildPromptPayQR } from '@/lib/promptpay'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const phone  = searchParams.get('phone') ?? ''
  const amount = parseFloat(searchParams.get('amount') ?? '') || undefined

  if (!phone) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 })
  }

  try {
    const payload = buildPromptPayQR(phone, amount)
    const svg     = await QRCode.toString(payload, { type: 'svg', width: 300, margin: 1 })
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    return NextResponse.json({ dataUrl, payload })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'QR error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
