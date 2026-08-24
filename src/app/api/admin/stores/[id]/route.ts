export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { updateStoreBilling } from '@/lib/store'

// PATCH — update a store's subscription/billing (super-admin only). Any subset
// of { plan, status, until, cycle, lockedPrice }. Extending is just a new `until`.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  const { id } = await params
  const b = await req.json().catch(() => ({}))

  const patch: Parameters<typeof updateStoreBilling>[1] = {}
  if (b.plan        !== undefined) patch.plan        = String(b.plan)
  if (b.status      !== undefined) patch.status      = String(b.status)
  if (b.until       !== undefined) patch.until       = b.until ? String(b.until) : null
  if (b.cycle       !== undefined) patch.cycle       = b.cycle ? String(b.cycle) : null
  if (b.lockedPrice !== undefined) patch.lockedPrice = b.lockedPrice != null ? Number(b.lockedPrice) : null

  const store = await updateStoreBilling(id, patch)
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  return NextResponse.json({ store })
}
