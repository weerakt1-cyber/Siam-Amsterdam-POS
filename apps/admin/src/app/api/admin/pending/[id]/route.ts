export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, approvePendingProfile, rejectPendingProfile } from '@baze/db'

// PATCH — approve a pending app account into a chosen store with a role, or
// reject it. Super-admin only.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res

  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const action = String(b.action ?? '')

  if (action === 'approve') {
    const storeId = String(b.storeId ?? '')
    const role    = String(b.role ?? '')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    if (!role)    return NextResponse.json({ error: 'role required' }, { status: 400 })
    await approvePendingProfile(id, storeId, role)
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    await rejectPendingProfile(id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'invalid action' }, { status: 400 })
}
