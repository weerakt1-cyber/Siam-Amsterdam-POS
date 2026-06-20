import { NextRequest, NextResponse } from 'next/server'
import { getAnalyticsData } from '@/lib/store'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const period = (searchParams.get('period') ?? '7d') as '7d' | '30d' | 'all'
  const validPeriods = ['7d', '30d', 'all']
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }
  const data = await getAnalyticsData(period)
  return NextResponse.json(data)
}
