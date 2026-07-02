export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getAnalyticsData, getMomAnalyticsData } from '@/lib/store'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') ?? '7d'
  const validPeriods = ['7d', '30d', 'all', 'mom']
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }
  const data = period === 'mom'
    ? await getMomAnalyticsData()
    : await getAnalyticsData(period as '7d' | '30d' | 'all')
  return NextResponse.json(data)
}
