export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getAnalyticsData, getMomAnalyticsData } from '@/lib/store'
import { requireStaff, resolveStaffStoreId } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id ?? (await resolveStaffStoreId(req))
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') ?? '7d'
  const validPeriods = ['7d', '30d', 'all', 'mom']
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }
  const data = period === 'mom'
    ? await getMomAnalyticsData(storeId)
    : await getAnalyticsData(period as '7d' | '30d' | 'all', storeId)
  return NextResponse.json(data)
}
