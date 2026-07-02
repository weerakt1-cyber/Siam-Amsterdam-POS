export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { getOrdersByDate } from '@/lib/store'

export async function GET(req: NextRequest) {
  const key = await validateApiKey(req)
  if (!key) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const orders = await getOrdersByDate(date)
  const paid   = orders.filter(o => o.status === 'paid')

  const revenue     = paid.reduce((s, o) => s + o.total, 0)
  const orderCount  = paid.length
  const avgOrder    = orderCount > 0 ? revenue / orderCount : 0

  // Item-level breakdown
  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {}
  for (const o of paid) {
    for (const item of o.items) {
      if (!itemMap[item.menuId]) itemMap[item.menuId] = { name: item.name, qty: 0, revenue: 0 }
      itemMap[item.menuId].qty     += item.qty
      itemMap[item.menuId].revenue += item.price * item.qty
    }
  }
  const topItems = Object.entries(itemMap)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10)
    .map(([menuId, v]) => ({ menuId, ...v }))

  // Revenue by source
  const bySource: Record<string, number> = {}
  for (const o of paid) {
    bySource[o.source] = (bySource[o.source] ?? 0) + o.total
  }

  // Revenue by payment method
  const byPayment: Record<string, number> = {}
  for (const o of paid) {
    const method = o.paymentMethod ?? 'cash'
    byPayment[method] = (byPayment[method] ?? 0) + o.total
  }

  return NextResponse.json({
    date,
    revenue,
    orderCount,
    avgOrder:  Math.round(avgOrder * 100) / 100,
    topItems,
    bySource,
    byPayment,
  })
}
