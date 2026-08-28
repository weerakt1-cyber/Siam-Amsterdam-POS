export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { requireRole } from '@/lib/api-auth'
import { getStoreSubscription, hasConfirmedPayment, createStorePayment } from '@/lib/store'
import { buildPromptPayQR } from '@/lib/promptpay'
import { isPlanId, renewalAmount, AI_ADDON, AI_TOPUP_MIN, type BillingCycle } from '@/lib/plans'

// POST — the owner starts a payment. Three kinds:
//   kind 'subscription' (default) — { plan, cycle } → locked/promo price
//   kind 'ai'                     — { cycle } → AI add-on monthly/yearly
//   kind 'ai_topup'               — { amount } → custom AI credit top-up
// Opens a 'pending' payment and returns a PromptPay QR to the platform's ID.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ['admin'])
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  const promptpayId = process.env.PLATFORM_PROMPTPAY_ID
  if (!promptpayId) return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า PromptPay ของผู้ให้บริการ' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const kind: 'subscription' | 'ai' | 'ai_topup' =
    body.kind === 'ai' ? 'ai' : body.kind === 'ai_topup' ? 'ai_topup' : 'subscription'
  const cycle: BillingCycle = body.cycle === 'yearly' ? 'yearly' : 'monthly'

  let plan = 'pro', amount = 0, months = 0

  if (kind === 'subscription') {
    const rawPlan: unknown = body.plan
    if (!isPlanId(rawPlan) || rawPlan === 'free') {
      return NextResponse.json({ error: 'plan must be a paid plan' }, { status: 400 })
    }
    plan = rawPlan
    const sub = await getStoreSubscription(storeId)
    const firstPayment = !(await hasConfirmedPayment(storeId))
    ;({ amount, months } = renewalAmount({ plan: rawPlan, cycle, lockedPrice: sub?.lockedPrice ?? null, firstPayment }))
  } else if (kind === 'ai') {
    plan = 'ai'
    amount = cycle === 'yearly' ? AI_ADDON.yearly : AI_ADDON.monthly
    months = cycle === 'yearly' ? 12 : 1
  } else { // ai_topup
    plan = 'ai'
    amount = Math.round(Number(body.amount) || 0)
    if (amount < AI_TOPUP_MIN) return NextResponse.json({ error: `เติมขั้นต่ำ ฿${AI_TOPUP_MIN}` }, { status: 400 })
  }

  if (amount <= 0) return NextResponse.json({ error: 'จำนวนเงินไม่ถูกต้อง' }, { status: 400 })

  const payment = await createStorePayment({ storeId, kind, plan, cycle: kind === 'ai_topup' ? 'topup' : cycle, amount, months })

  const payload = buildPromptPayQR(promptpayId, amount, 'PLOEN POS')
  const svg = await QRCode.toString(payload, { type: 'svg', width: 280, margin: 1 })
  const qrDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  return NextResponse.json({ payment, amount, months, qrDataUrl, promptpayId }, { status: 201 })
}
