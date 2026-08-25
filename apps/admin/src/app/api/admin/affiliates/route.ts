export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@baze/db'
import { listAffiliates, createAffiliate, affiliateEarnings } from '@baze/db'

// GET — all affiliates + their earnings summary (super-admin).
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  const [affiliates, earnings] = await Promise.all([listAffiliates(), affiliateEarnings()])
  return NextResponse.json({ affiliates, earnings })
}

// POST — create an affiliate (auto-generates a referral code if none given).
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  try {
    const b = await req.json()
    const name = String(b.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const rate = b.commissionRate != null ? Number(b.commissionRate) : undefined
    if (rate != null && (!(rate >= 0) || rate > 1)) {
      return NextResponse.json({ error: 'commissionRate must be a fraction 0–1 (e.g. 0.2 = 20%)' }, { status: 400 })
    }
    const affiliate = await createAffiliate({
      name,
      contact:      b.contact ? String(b.contact) : null,
      commissionRate: rate,
      payoutInfo:   b.payoutInfo ? String(b.payoutInfo) : null,
      referralCode: b.referralCode ? String(b.referralCode).trim() : undefined,
    })
    return NextResponse.json({ affiliate }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
