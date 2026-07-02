// LINE Messaging API — order alerts & daily summary
// Env vars: LINE_CHANNEL_ACCESS_TOKEN, LINE_TARGET_ID (userId / groupId / roomId)
// API: POST https://api.line.me/v2/bot/message/push (JSON, Bearer auth)

import type { OrderNotifyData, EndOfDayData } from '@/lib/telegram'
export type { OrderNotifyData, EndOfDayData }

// ─── Config ───────────────────────────────────────────────────────────────────

export function isLineConfigured(): boolean {
  return !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_TARGET_ID)
}

export function getTokenPreview(): string | null {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!t) return null
  return t.slice(0, 6) + '…' + t.slice(-4)
}

// ─── Raw send ─────────────────────────────────────────────────────────────────

export async function sendLineMessage(text: string): Promise<boolean> {
  const token    = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const targetId = process.env.LINE_TARGET_ID
  if (!token || !targetId) return false
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to:       targetId,
        messages: [{ type: 'text', text }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string }
      console.error('[LINE] API error:', err.message ?? res.status)
    }
    return res.ok
  } catch (e) {
    console.error('[LINE] fetch error:', e)
    return false
  }
}

// ─── Order alert ──────────────────────────────────────────────────────────────

function formatOrderAlert(data: OrderNotifyData): string {
  const PAY: Record<string, string> = {
    cash: '💵 Cash', card: '💳 Card', promptpay: '📱 QR PromptPay',
  }

  const shortId   = data.orderId.slice(-8).toUpperCase()
  const itemLines = data.items
    .map(i => `  • ${i.name} x${i.qty}  ฿${(i.price * i.qty).toLocaleString()}`)
    .join('\n')

  const discountLine = data.discountAmount > 0
    ? `\n🏷 Discount${data.couponCode ? ` [${data.couponCode}]` : ''}: -฿${data.discountAmount.toLocaleString()}`
    : ''

  const cashLine = data.paymentMethod === 'cash' && data.received != null
    ? `\n💵 Received ฿${data.received.toLocaleString()}  |  Change ฿${(data.change ?? 0).toLocaleString()}`
    : ''

  const staffLine    = data.staffName    ? `\n👤 Staff: ${data.staffName}`       : ''
  const memberLine   = data.memberName   ? `\n⭐ Member: ${data.memberName}`     : ''
  const customerLine = data.customerName ? `\n🙋 Customer: ${data.customerName}` : ''

  return [
    `🍹 New Order — Siam Amsterdam POS`,
    `━━━━━━━━━━━━`,
    `🪑 Table: ${data.tableNo}  |  #${shortId}${staffLine}${memberLine}${customerLine}`,
    ``,
    `🛒 Items:`,
    itemLines,
    ``,
    `💰 Subtotal: ฿${data.subtotal.toLocaleString()}${discountLine}`,
    `━━━━━━━━━━━━`,
    `✅ Paid ฿${data.total.toLocaleString()}  |  ${PAY[data.paymentMethod] ?? data.paymentMethod}${cashLine}`,
  ].join('\n')
}

export async function sendLineOrderAlert(data: OrderNotifyData): Promise<boolean> {
  if (!isLineConfigured()) return false
  return sendLineMessage(formatOrderAlert(data))
}

// ─── Daily summary ────────────────────────────────────────────────────────────

function formatDailySummary(data: EndOfDayData): string {
  const fmt = (n: number) => `฿${Math.round(n).toLocaleString()}`
  const PAY: Record<string, string> = {
    cash: '💵 Cash', card: '💳 Card', promptpay: '📱 QR Pay',
  }

  const payLines = Object.entries(data.paymentBreakdown)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([m, v]) => `  ${PAY[m] ?? m}: ${v.orders} orders  ${fmt(v.revenue)}`)
    .join('\n') || '  No data'

  const topLines = data.topItems.slice(0, 5)
    .map((i, n) => `  ${n + 1}. ${i.name}  (${i.qty} pcs)  ${fmt(i.revenue)}`)
    .join('\n') || '  No data'

  const drawerLines = [
    `  Opening:    ${fmt(data.openingCash)}`,
    `  + Sales:    ${fmt(data.cashSales)}`,
    data.cashIns  > 0 ? `  + Cash in:  ${fmt(data.cashIns)}`  : null,
    data.expenses > 0 ? `  - Expenses: ${fmt(data.expenses)}` : null,
    `  ─────────────────────`,
    `  Expected:   ${fmt(data.expectedCash)}`,
  ].filter(Boolean).join('\n')

  const discountLine = data.totalDiscount > 0
    ? `\n🏷 Total discounts: -${fmt(data.totalDiscount)}`
    : ''

  const memberLine = data.memberOrders > 0
    ? `\n⭐ Member orders: ${data.memberOrders}`
    : ''

  return [
    `📊 End of Day — Siam Amsterdam POS`,
    `📅 ${data.date}`,
    `━━━━━━━━━━━━`,
    `🧾 SALES`,
    `  Orders: ${data.totalOrders}   Revenue: ${fmt(data.totalRevenue)}`,
    `  Avg: ${fmt(data.avgOrder)}${discountLine}${memberLine}`,
    ``,
    `💳 PAYMENT`,
    payLines,
    ``,
    `🏆 TOP ITEMS`,
    topLines,
    ``,
    `━━━━━━━━━━━━`,
    `💰 CASH DRAWER`,
    drawerLines,
    `━━━━━━━━━━━━`,
    `🍹 Siam Amsterdam POS`,
  ].join('\n')
}

export async function sendLineDailySummary(data: EndOfDayData): Promise<boolean> {
  if (!isLineConfigured()) return false
  return sendLineMessage(formatDailySummary(data))
}
