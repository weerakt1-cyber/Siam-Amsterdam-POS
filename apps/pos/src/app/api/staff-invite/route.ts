export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireRole } from '@/lib/api-auth'
import { getStaffInviteToken, setStaffInviteToken } from '@/lib/store'

// GET — the store's current staff-invite token (admin/manager). null if none yet.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ['admin', 'manager'])
  if (!gate.ok) return gate.res
  if (!gate.profile.store_id) return NextResponse.json({ token: null })
  const token = await getStaffInviteToken(gate.profile.store_id)
  return NextResponse.json({ token })
}

// POST — (re)generate the token. Regenerating revokes every previously shared
// link at once. Admin only.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ['admin'])
  if (!gate.ok) return gate.res
  if (!gate.profile.store_id) return NextResponse.json({ error: 'ยังไม่มีร้าน' }, { status: 400 })
  const token = randomUUID()
  await setStaffInviteToken(gate.profile.store_id, token)
  return NextResponse.json({ token })
}
