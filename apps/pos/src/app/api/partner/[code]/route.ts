export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAffiliateByCode, listCommissions } from '@/lib/store'

// Public, code-gated affiliate earnings (M3b-lite). The referral code is the
// access token — no login. Read-only, and only non-sensitive fields are
// returned (never payout_info / contact / note).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const aff = await getAffiliateByCode(code)
  if (!aff || aff.status !== 'active') {
    return NextResponse.json({ error: 'ไม่พบนายหน้า หรือถูกปิดการใช้งาน' }, { status: 404 })
  }

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
