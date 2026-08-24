export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreId } from '@/lib/api-auth'
import { takenTables } from '@/lib/reservations'

const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

// GET — public: which tables are already taken for a date + time window, so the
// reservation picker can disable them. Store-scoped via x-store-id.
//   /api/reservations/availability?date=2026-08-20&start=18:00&end=20:00
export async function GET(req: NextRequest) {
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  const sp = req.nextUrl.searchParams
  const date = sp.get('date')
  const start = sp.get('start')
  const end = sp.get('end')

  if (!isDate(date) || !isTime(start) || !isTime(end) || end <= start) {
    return NextResponse.json({ error: 'Valid date, start and end are required' }, { status: 400 })
  }

  try {
    const taken = await takenTables(date, start, end, storeId)
    return NextResponse.json({ taken })
  } catch (err) {
    console.error('[reservations/availability] GET', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
  }
}
