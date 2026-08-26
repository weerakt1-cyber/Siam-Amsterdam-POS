export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@baze/db'
import { updateStoreBilling, setStoreAffiliate, listStoresAdmin, adminRenewStore } from '@baze/db'

// PATCH — update a store's subscription/billing (super-admin only). Any subset
// of { plan, status, until, cycle, lockedPrice, affiliateId }. Extending is just
// a new `until`; affiliateId (or null) attaches/detaches the store's referrer.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  const { id } = await params
  const b = await req.json().catch(() => ({}))

  // Paid renewal (+1 month / +1 year): extends the sub AND records a confirmed
  // payment so the referrer earns commission.
  if (b.action === 'renew') {
    const cycle = b.cycle === 'yearly' ? 'yearly' : 'monthly'
    const store = await adminRenewStore(id, cycle, gate.email)
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    return NextResponse.json({ store })
  }

  // Referrer assignment is a separate concern from billing fields.
  if (b.affiliateId !== undefined) {
    await setStoreAffiliate(id, b.affiliateId ? String(b.affiliateId) : null)
  }

  const patch: Parameters<typeof updateStoreBilling>[1] = {}
  if (b.plan        !== undefined) patch.plan        = String(b.plan)
  if (b.status      !== undefined) patch.status      = String(b.status)
  if (b.until       !== undefined) patch.until       = b.until ? String(b.until) : null
  if (b.cycle       !== undefined) patch.cycle       = b.cycle ? String(b.cycle) : null
  if (b.lockedPrice !== undefined) patch.lockedPrice = b.lockedPrice != null ? Number(b.lockedPrice) : null

  // Billing-only change → update + return the row; affiliate-only → just re-list.
  const store = Object.keys(patch).length > 0
    ? await updateStoreBilling(id, patch)
    : (await listStoresAdmin()).find(s => s.id === id) ?? null
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  return NextResponse.json({ store })
}
