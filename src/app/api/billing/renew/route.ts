export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { requireRole } from '@/lib/api-auth'
import { getStoreSubscription, hasConfirmedPayment, createStorePayment } from '@/lib/store'
import { buildPromptPayQR } from '@/lib/promptpay'
import { isPlanId, renewalAmount, type BillingCycle } from '@/lib/plans'

// POST — the owner starts a renewal: pick { plan, cycle }. We compute the amount
// (locked price / promo), open a 'pending' payment, and return a PromptPay QR to
// the platform's PromptPay ID. The owner then pays and uploads the slip.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ['admin'])
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  const promptpayId = process.env.PLATFORM_PROMPTPAY_ID
  if (!promptpayId) return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า PromptPay ของผู้ให้บริการ' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const plan = body.plan
  const cycle: BillingCycle = body.cycle === 'yearly' ? 'yearly' : 'monthly'
  if (!isPlanId(plan) || plan === 'free') {
    return NextResponse.json({ error: 'plan must be a paid plan' }, { status: 400 })
  }

  const sub = await getStoreSubscription(storeId)
  const firstPayment = !(await hasConfirmedPayment(storeId))
  const { amount, months } = renewalAmount({ plan, cycle, lockedPrice: sub?.lockedPrice ?? null, firstPayment })

  if (amount <= 0) return NextResponse.json({ error: 'จำนวนเงินไม่ถูกต้อง' }, { status: 400 })

  const payment = await createStorePayment({ storeId, plan, cycle, amount, months })

  const payload = buildPromptPayQR(promptpayId, amount, 'BAZE POS')
  const svg = await QRCode.toString(payload, { type: 'svg', width: 280, margin: 1 })
  const qrDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  return NextResponse.json({ payment, amount, months, qrDataUrl, promptpayId }, { status: 201 })
}
