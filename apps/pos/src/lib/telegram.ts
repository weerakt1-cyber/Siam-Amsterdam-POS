// Telegram Bot helper — send notifications via Telegram Bot API
// No SDK needed — uses fetch directly (free, no rate limit for regular bots)

const getBase = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN
  return token ? `https://api.telegram.org/bot${token}` : null
}

export function isTelegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
}

// ─── Raw send ─────────────────────────────────────────────────────────────────

async function sendMessage(text: string): Promise<boolean> {
  const base   = getBase()
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!base || !chatId) return false
  try {
    const res = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    return res.ok
  } catch { return false }
}

// ─── Order alert ──────────────────────────────────────────────────────────────

export type OrderNotifyData = {
  orderId:        string
  tableNo:        string
  staffName?:     string
  memberName?:    string
  customerName?:  string
  items:          { name: string; qty: number; price: number; variantLabel?: string }[]
  subtotal:       number
  discountAmount: number
  total:          number
  paymentMethod:  string
  received?:      number
  change?:        number
  couponCode?:    string
  note?:          string
}

// Escape user-supplied free text for Telegram's HTML parse mode.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function sendOrderAlert(data: OrderNotifyData): Promise<boolean> {
  const shortId   = data.orderId.slice(-8).toUpperCase()
  const itemLines = data.items
    .map(i => `  • ${esc(i.name)}${i.variantLabel ? ` (${esc(i.variantLabel)})` : ''} ×${i.qty} — ฿${(i.price * i.qty).toLocaleString()}`)
    .join('\n')

  const discountLine = data.discountAmount > 0
    ? `\n🏷 Discount${data.couponCode ? ` [${data.couponCode}]` : ''}: -฿${data.discountAmount.toLocaleString()}`
    : ''

  const staffLine    = data.staffName    ? `\n👤 Staff: ${esc(data.staffName)}`      : ''
  const memberLine   = data.memberName   ? `\n⭐ Member: ${esc(data.memberName)}`    : ''
  const customerLine = data.customerName ? `\n🙋 Customer: ${esc(data.customerName)}` : ''
  const noteLine     = data.note?.trim() ? `\n📝 <b>Note:</b> ${esc(data.note.trim())}` : ''

  // No "Paid" line here — orders (especially QR self-orders) aren't
  // necessarily settled yet when this alert fires. Ends at Subtotal.
  const text = [
    `🍹 <b>New Order</b> — PLOEN POS`,
    `━━━━━━━━━━━━━━━━`,
    `🪑 Table: <b>${esc(data.tableNo)}</b>  |  #${shortId}${staffLine}${memberLine}${customerLine}${noteLine}`,
    ``,
    `🛒 <b>Items:</b>`,
    itemLines,
    ``,
    `💰 Subtotal: ฿${data.subtotal.toLocaleString()}${discountLine}`,
  ].join('\n')

  return sendMessage(text)
}

// ─── Reservation alerts ─────────────────────────────────────────────────────

export type ReservationNotify = {
  refCode:       string
  customerName:  string
  isMember?:     boolean
  phone?:        string
  reservedDate:  string   // YYYY-MM-DD
  startTime:     string   // HH:MM
  endTime:       string   // HH:MM
  partySize:     number
  zone?:         string
  tableNo?:      string
  eventName?:    string
  requirements?: string
}

// Friendly date like "Thu, 20 Aug 2026" (falls back to the raw string).
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

// Shared body lines for one reservation (used by request + decision alerts).
function reservationLines(r: ReservationNotify): string {
  const who   = `🙋 <b>${esc(r.customerName)}</b>${r.isMember ? ' ⭐' : ''}`
  const phone = r.phone ? `\n📞 ${esc(r.phone)}` : ''
  const table = r.tableNo ? `Table <b>${esc(r.tableNo)}</b>` : (r.zone ? `${esc(r.zone)} (any table)` : 'venue assigns')
  const event = r.eventName ? `\n🎉 ${esc(r.eventName)}` : ''
  const req   = r.requirements ? `\n📝 <b>Needs:</b> ${esc(r.requirements)}` : ''
  return [
    `${who}${phone}`,
    `🗓 ${fmtDate(r.reservedDate)}  <b>${r.startTime}–${r.endTime}</b>`,
    `👥 ${r.partySize} pax  ·  ${table}${event}${req}`,
  ].join('\n')
}

// New booking request → alert the shop so they can approve/reject.
export async function sendReservationRequest(r: ReservationNotify): Promise<boolean> {
  const text = [
    `📅 <b>New Booking Request</b> — <code>${esc(r.refCode)}</code>`,
    `━━━━━━━━━━━━━━━━`,
    reservationLines(r),
  ].join('\n')
  return sendMessage(text)
}

// Approve/reject confirmation → logged to the shop chat (the customer sees it
// on their tracking page; this keeps the shop's own record in Telegram).
export async function sendReservationDecision(
  r: ReservationNotify, approved: boolean, staffReply?: string,
): Promise<boolean> {
  const head = approved ? '✅ <b>Booking Confirmed</b>' : '❌ <b>Booking Rejected</b>'
  const reply = staffReply?.trim() ? `\n💬 ${esc(staffReply.trim())}` : ''
  const text = [
    `${head} — <code>${esc(r.refCode)}</code>`,
    `${esc(r.customerName)} · ${fmtDate(r.reservedDate)} ${r.startTime}–${r.endTime} · ${r.partySize} pax`,
    r.tableNo ? `Table ${esc(r.tableNo)}` : '',
    reply,
  ].filter(Boolean).join('\n')
  return sendMessage(text)
}

// Day-before reminder digest → one message listing tomorrow's bookings.
export async function sendReservationReminder(dateISO: string, rows: ReservationNotify[]): Promise<boolean> {
  if (rows.length === 0) return false
  const lines = rows
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map(r => {
      const table = r.tableNo ? `🍽 ${esc(r.tableNo)}` : (r.zone ? `🍽 ${esc(r.zone)}` : '')
      const event = r.eventName ? ` — ${esc(r.eventName)}` : ''
      return `• <b>${r.startTime}–${r.endTime}</b>  ${esc(r.customerName)} (${r.partySize}p) ${table}${event}`
    })
    .join('\n')
  const text = [
    `⏰ <b>Tomorrow's Bookings</b> — ${fmtDate(dateISO)}`,
    `━━━━━━━━━━━━━━━━`,
    lines,
    ``,
    `${rows.length} booking${rows.length > 1 ? 's' : ''} confirmed.`,
  ].join('\n')
  return sendMessage(text)
}

// ─── End-of-day summary (Z-Report) ──────────────────────────────────────────

export type EndOfDayData = {
  date:             string   // e.g. "Friday, 20 June 2026"
  // Sales
  totalOrders:      number
  totalRevenue:     number
  totalDiscount:    number
  avgOrder:         number
  // Payment breakdown: method → { orders, revenue }
  paymentBreakdown: Record<string, { orders: number; revenue: number }>
  // Top items
  topItems:         { name: string; qty: number; revenue: number }[]
  // Cash drawer reconciliation
  openingCash:      number
  cashSales:        number   // sum of cash-payment order totals
  cashIns:          number   // additional cash added to drawer
  expenses:         number   // cash paid out
  expectedCash:     number   // openingCash + cashSales + cashIns - expenses
  // Extra
  memberOrders:     number   // orders with a member attached
}

export async function sendDailySummary(data: EndOfDayData): Promise<boolean> {
  const fmt = (n: number) => `฿${Math.round(n).toLocaleString()}`
  const PAY: Record<string, string> = {
    cash: '💵 Cash', card: '💳 Card', promptpay: '📱 QR Pay',
  }

  // Payment breakdown rows
  const payLines = Object.entries(data.paymentBreakdown)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([m, v]) => `  ${PAY[m] ?? m}   <b>${v.orders} orders</b>  ${fmt(v.revenue)}`)
    .join('\n') || '  No data'

  // Top 5 items
  const topLines = data.topItems.slice(0, 5)
    .map((i, n) => `  ${n + 1}. ${i.name}  (${i.qty} pcs)  ${fmt(i.revenue)}`)
    .join('\n') || '  No data'

  // Cash drawer rows
  const drawerLines = [
    `  Opening cash:   ${fmt(data.openingCash)}`,
    `  + Cash sales:   ${fmt(data.cashSales)}`,
    data.cashIns  > 0 ? `  + Cash in:      ${fmt(data.cashIns)}`  : null,
    data.expenses > 0 ? `  - Expenses:     ${fmt(data.expenses)}` : null,
    `  ─────────────────────────`,
    `  Expected:       <b>${fmt(data.expectedCash)}</b>`,
  ].filter(Boolean).join('\n')

  const discountLine = data.totalDiscount > 0
    ? `\n🏷 Total discounts: -${fmt(data.totalDiscount)}`
    : ''

  const memberLine = data.memberOrders > 0
    ? `\n⭐ Member orders: ${data.memberOrders}`
    : ''

  const text = [
    `📊 <b>End of Day Report</b> — PLOEN POS`,
    `📅 ${data.date}`,
    `━━━━━━━━━━━━━━━━`,
    `🧾 <b>SALES</b>`,
    `  Orders: <b>${data.totalOrders}</b>   Revenue: <b>${fmt(data.totalRevenue)}</b>`,
    `  Avg. order: ${fmt(data.avgOrder)}${discountLine}${memberLine}`,
    ``,
    `💳 <b>PAYMENT BREAKDOWN</b>`,
    payLines,
    ``,
    `🏆 <b>TOP ITEMS</b>`,
    topLines,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `💰 <b>CASH DRAWER</b>`,
    drawerLines,
    `━━━━━━━━━━━━━━━━`,
    `🍹 PLOEN POS`,
  ].join('\n')

  return sendMessage(text)
}

// ─── Tier upgrade notification ───────────────────────────────────────────────

const TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇' }

export async function sendTierUpgrade(memberName: string, tier: string): Promise<boolean> {
  const emoji = TIER_EMOJI[tier] ?? '⭐'
  const label = tier.charAt(0).toUpperCase() + tier.slice(1)
  return sendMessage(`${emoji} <b>${memberName}</b> just reached <b>${label}</b> tier! Congratulations! 🎉`)
}

// ─── Bot info (verify token) ──────────────────────────────────────────────────

export async function getBotInfo(): Promise<{
  ok: boolean; name?: string; username?: string
}> {
  const base = getBase()
  if (!base) return { ok: false }
  try {
    const res  = await fetch(`${base}/getMe`)
    const data = await res.json() as { ok: boolean; result?: { first_name: string; username: string } }
    if (!data.ok) return { ok: false }
    return { ok: true, name: data.result?.first_name, username: data.result?.username }
  } catch { return { ok: false } }
}

// ─── Find chat ID (used during initial setup) ─────────────────────────────────
// Send any message to the Bot first, then call this API to detect the Chat ID

export async function getLatestChatId(): Promise<{
  chatId: string | null; from?: string
}> {
  const base = getBase()
  if (!base) return { chatId: null }
  try {
    const res  = await fetch(`${base}/getUpdates?limit=10`)
    const data = await res.json() as {
      ok: boolean
      result: Array<{
        message?:      { chat: { id: number; title?: string }; from?: { username?: string } }
        channel_post?: { chat: { id: number; title?: string } }
      }>
    }
    if (!data.ok || !data.result?.length) return { chatId: null }
    const latest = data.result[data.result.length - 1]
    const msg    = latest.message ?? latest.channel_post
    if (!msg) return { chatId: null }
    const chatId = String(msg.chat.id)
    const from   = latest.message?.from?.username
      ? `@${latest.message.from.username}`
      : msg.chat.title ?? ''
    return { chatId, from }
  } catch { return { chatId: null } }
}
