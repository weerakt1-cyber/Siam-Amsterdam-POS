import { NextResponse } from 'next/server'
import { getLatestChatId } from '@/lib/telegram'

// GET — ดึง Chat ID จากข้อความล่าสุดที่ส่งมาหา Bot
// วิธีใช้: ส่งข้อความอะไรก็ได้ไปที่ Bot แล้วเรียก endpoint นี้
export async function GET() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN' },
      { status: 400 }
    )
  }
  const result = await getLatestChatId()
  if (!result.chatId) {
    return NextResponse.json(
      { ok: false, error: 'ยังไม่มีข้อความ — ส่งข้อความอะไรก็ได้ไปหา Bot ก่อน แล้วกด Detect อีกครั้ง' },
      { status: 404 }
    )
  }
  return NextResponse.json({ ok: true, chatId: result.chatId, from: result.from })
}
