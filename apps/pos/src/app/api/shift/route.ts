export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveStaffStoreId } from '@/lib/api-auth'
import {
  getOpenShift, shiftClockIn, shiftBreakStart, shiftBreakEnd, shiftClockOut, getStaffMember,
  type ShiftBreakType,
} from '@/lib/store'

// The POS operator is a PIN staff (picked at StaffGate), so the acting staffId
// is client-supplied — we validate it belongs to the caller's store.
async function ok(storeId: string, staffId: string) {
  return !!staffId && !!(await getStaffMember(staffId, storeId))
}

// GET ?staffId= → the staff's current open shift (null if none). Auto-closes a
// shift left open past its business-day cutoff.
export async function GET(req: NextRequest) {
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const staffId = req.nextUrl.searchParams.get('staffId') ?? ''
  if (!(await ok(storeId, staffId))) return NextResponse.json({ shift: null })
  return NextResponse.json({ shift: await getOpenShift(storeId, staffId) })
}

// POST { staffId, action, type? } — clock_in | break_start | break_end | clock_out.
export async function POST(req: NextRequest) {
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const staffId = String(b.staffId ?? '')
  const action  = String(b.action ?? '')
  if (!(await ok(storeId, staffId))) return NextResponse.json({ error: 'invalid staff' }, { status: 400 })

  switch (action) {
    case 'clock_in':
      return NextResponse.json({ shift: await shiftClockIn(storeId, staffId) })
    case 'break_start': {
      const t = (['meal', 'restroom', 'other'] as ShiftBreakType[]).includes(b.type) ? (b.type as ShiftBreakType) : 'other'
      return NextResponse.json({ shift: await shiftBreakStart(storeId, staffId, t) })
    }
    case 'break_end':
      return NextResponse.json({ shift: await shiftBreakEnd(storeId, staffId) })
    case 'clock_out':
      await shiftClockOut(storeId, staffId)
      return NextResponse.json({ shift: null })
    default:
      return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }
}
