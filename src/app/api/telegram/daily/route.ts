export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'
import { getOrdersByDate, getReport } from '@/lib/store'
import { isTelegramConfigured, sendDailySummary, type EndOfDayData } from '@/lib/telegram'

export async function POST() {
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not configured' },
      { status: 400 }
    )
  }

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)

  // Fetch orders and cash report in parallel
  let orders, report
  try {
    ;[orders, report] = await Promise.all([
      getOrdersByDate(today),
      getReport(today),
    ])
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to fetch data' }, { status: 500 })
  }

  if (orders.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No orders today â€” nothing to summarise' },
      { status: 404 }
    )
  }

  // â”€â”€ Sales totals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const totalRevenue  = orders.reduce((s, o) => s + (o.total    ?? 0), 0)
  const totalSubtotal = orders.reduce((s, o) => s + (o.subtotal ?? 0), 0)
  const totalDiscount = Math.max(0, totalSubtotal - totalRevenue)
  const avgOrder      = orders.length > 0 ? totalRevenue / orders.length : 0

  // â”€â”€ Payment breakdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const paymentBreakdown: Record<string, { orders: number; revenue: number }> = {}
  for (const o of orders) {
    const m = o.paymentMethod ?? 'cash'
    if (!paymentBreakdown[m]) paymentBreakdown[m] = { orders: 0, revenue: 0 }
    paymentBreakdown[m].orders  += 1
    paymentBreakdown[m].revenue += o.total ?? 0
  }

  // â”€â”€ Top items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const itemMap: Record<string, { qty: number; revenue: number }> = {}
  for (const order of orders) {
    for (const item of order.items ?? []) {
      if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, revenue: 0 }
      itemMap[item.name].qty     += item.qty
      itemMap[item.name].revenue += item.price * item.qty
    }
  }
  const topItems = Object.entries(itemMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)

  // â”€â”€ Cash drawer reconciliation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const cashSales = paymentBreakdown['cash']?.revenue ?? 0
  const cashIns   = report.cashIns.reduce((s, e) => s + e.amount, 0)
  const expenses  = report.expenses.reduce((s, e) => s + e.amount, 0)
  const expectedCash = report.openingCash + cashSales + cashIns - expenses

  // â”€â”€ Other stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const memberOrders = orders.filter(o => o.memberName).length

  // â”€â”€ Build date label â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const payload: EndOfDayData = {
    date: dateLabel,
    totalOrders: orders.length,
    totalRevenue,
    totalDiscount,
    avgOrder,
    paymentBreakdown,
    topItems,
    openingCash:  report.openingCash,
    cashSales,
    cashIns,
    expenses,
    expectedCash,
    memberOrders,
  }

  const ok = await sendDailySummary(payload)

  if (!ok) {
    return NextResponse.json(
      { ok: false, error: 'Failed to send message â€” check token and chat ID' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    orders: orders.length,
    revenue: totalRevenue,
    expectedCash,
  })
}
