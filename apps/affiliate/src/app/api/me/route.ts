export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAffiliate, listCommissions } from '@baze/db'

// GET — the logged-in affiliate's own earnings (requireAffiliate maps the JWT
// email → their affiliate record). Read-only, only their own commissions.
export async function GET(req: NextRequest) {
  const gate = await requireAffiliate(req)
  if (!gate.ok) return gate.res
  const aff = gate.affiliate

  const commissions = await listCommissions(aff.id)
  const pending = commissions.filter(c => c.status !== 'paid').reduce((s, c) => s + c.amount, 0)
  const paid    = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount, 0)

  return NextResponse.json({
    affiliate: { name: aff.name, referralCode: aff.referralCode, commissionRate: aff.commissionRate },
    pending, paid, total: pending + paid,
    commissions: commissions.map(c => ({
      storeName: c.storeName ?? 'ร้าน', amount: c.amount, status: c.status, createdAt: c.createdAt,
    })),
  })
}
