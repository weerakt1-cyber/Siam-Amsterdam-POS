export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getStoreSubscription } from '@/lib/store'
import { requireStaff, resolveStaffStoreId } from '@/lib/api-auth'

// Staff-only: the POS reads this to show a soft renewal banner. Billing status
// is not customer-facing, so it never rides the public store hint.
export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id ?? (await resolveStaffStoreId(req))
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  const sub = await getStoreSubscription(storeId)
  if (!sub) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  // Whole days from Bangkok "today" to the expiry date (negative = past due).
  let daysLeft: number | null = null
  if (sub.until) {
    const bkkToday = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    daysLeft = Math.round((Date.parse(sub.until) - Date.parse(bkkToday)) / 86400000)
  }

  return NextResponse.json({ ...sub, daysLeft })
}
