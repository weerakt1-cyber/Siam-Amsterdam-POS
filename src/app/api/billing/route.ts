export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { getStoreSubscription, listStorePayments, refreshAiCredit } from '@/lib/store'
import { PLANS, PLAN_IDS, AI_ADDON, AI_TOPUP_MIN } from '@/lib/plans'

// GET — the owner's billing view: current subscription, plan catalogue, payment
// history, and whether PromptPay is configured. Admin (owner) only.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ['admin'])
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  const [sub, payments, ai] = await Promise.all([
    getStoreSubscription(storeId),
    listStorePayments(storeId),
    refreshAiCredit(storeId),
  ])

  return NextResponse.json({
    subscription: sub,
    plans: PLAN_IDS.map(id => PLANS[id]),
    payments,
    ai,
    aiAddon: { monthly: AI_ADDON.monthly, yearly: AI_ADDON.yearly, topupMin: AI_TOPUP_MIN },
    promptpayConfigured: !!process.env.PLATFORM_PROMPTPAY_ID,
  })
}
