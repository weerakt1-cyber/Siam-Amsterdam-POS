export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { getActiveShifts } from '@/lib/store'

// GET — everyone currently on shift for the caller's store (manager oversight).
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ['admin', 'manager'])
  if (!gate.ok) return gate.res
  if (!gate.profile.store_id) return NextResponse.json({ shifts: [] })
  return NextResponse.json({ shifts: await getActiveShifts(gate.profile.store_id) })
}
