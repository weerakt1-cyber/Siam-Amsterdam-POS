export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'
import { isTelegramConfigured, getBotInfo, sendOrderAlert } from '@/lib/telegram'

// GET â€” à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š config + bot status
export async function GET() {
  const configured = isTelegramConfigured()
  if (!configured) {
    return NextResponse.json({
      configured: false,
      hasToken:   !!process.env.TELEGRAM_BOT_TOKEN,
      hasChatId:  !!process.env.TELEGRAM_CHAT_ID,
    })
  }
  const info = await getBotInfo()
  return NextResponse.json({
    configured: true,
    tokenOk:    info.ok,
    botName:    info.name    ?? null,
    botUsername:info.username ?? null,
    chatId:     process.env.TELEGRAM_CHAT_ID ?? null,
  })
}

// POST â€” à¸ªà¹ˆà¸‡ test message
export async function POST() {
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸² TELEGRAM_BOT_TOKEN à¹à¸¥à¸° TELEGRAM_CHAT_ID' },
      { status: 400 }
    )
  }
  const ok = await sendOrderAlert({
    orderId:        'test00012345678',
    tableNo:        'T3',
    staffName:      'Admin',
    memberName:     'Test Member',
    couponCode:     'HAPPY10',
    items: [
      { name: 'Mojito à¹‚à¸¡à¸®à¸´à¹‚à¸•à¹‰',       qty: 2, price: 200 },
      { name: 'Heineken à¹„à¸®à¹€à¸™à¹€à¸à¹‰à¸™',    qty: 1, price: 80  },
    ],
    subtotal:       480,
    discountAmount: 48,
    total:          432,
    paymentMethod:  'cash',
    received:       500,
    change:         68,
  })
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: 'à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸¥à¹‰à¸¡à¹€à¸«à¸¥à¸§ â€” à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š token à¹à¸¥à¸° chat ID' },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true })
}
