import { NextResponse } from 'next/server'
import { isTelegramConfigured, getBotInfo, sendOrderAlert } from '@/lib/telegram'

// GET — ตรวจสอบ config + bot status
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

// POST — ส่ง test message
export async function POST() {
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN และ TELEGRAM_CHAT_ID' },
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
      { name: 'Mojito โมฮิโต้',       qty: 2, price: 200 },
      { name: 'Heineken ไฮเนเก้น',    qty: 1, price: 80  },
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
      { ok: false, error: 'ส่งข้อความล้มเหลว — ตรวจสอบ token และ chat ID' },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true })
}
