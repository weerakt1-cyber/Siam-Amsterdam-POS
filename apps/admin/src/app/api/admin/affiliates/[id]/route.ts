export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@baze/db'
import { updateAffiliate, markAffiliatePaid } from '@baze/db'

// PATCH — update an affiliate (rate/status/contact/…), or run a payout:
//   body { action: 'mark_paid' } → marks all pending commissions paid.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  const { id } = await params
  const b = await req.json().catch(() => ({}))

  if (b.action === 'mark_paid') {
    const markedPaid = await markAffiliatePaid(id)
    return NextResponse.json({ ok: true, markedPaid })
  }

  const patch: Parameters<typeof updateAffiliate>[1] = {}
  if (b.name           !== undefined) patch.name           = String(b.name)
  if (b.contact        !== undefined) patch.contact        = b.contact ? String(b.contact) : null
  if (b.commissionRate !== undefined) patch.commissionRate = Number(b.commissionRate)
  if (b.status         !== undefined) patch.status         = String(b.status)
  if (b.payoutInfo     !== undefined) patch.payoutInfo     = b.payoutInfo ? String(b.payoutInfo) : null

  const affiliate = await updateAffiliate(id, patch)
  if (!affiliate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ affiliate })
}
