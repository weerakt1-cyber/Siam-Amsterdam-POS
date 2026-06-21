export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'
import { getLatestChatId } from '@/lib/telegram'

// GET â€” à¸”à¸¶à¸‡ Chat ID à¸ˆà¸²à¸à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸—à¸µà¹ˆà¸ªà¹ˆà¸‡à¸¡à¸²à¸«à¸² Bot
// à¸§à¸´à¸˜à¸µà¹ƒà¸Šà¹‰: à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸­à¸°à¹„à¸£à¸à¹‡à¹„à¸”à¹‰à¹„à¸›à¸—à¸µà¹ˆ Bot à¹à¸¥à¹‰à¸§à¹€à¸£à¸µà¸¢à¸ endpoint à¸™à¸µà¹‰
export async function GET() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸² TELEGRAM_BOT_TOKEN' },
      { status: 400 }
    )
  }
  const result = await getLatestChatId()
  if (!result.chatId) {
    return NextResponse.json(
      { ok: false, error: 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡ â€” à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸­à¸°à¹„à¸£à¸à¹‡à¹„à¸”à¹‰à¹„à¸›à¸«à¸² Bot à¸à¹ˆà¸­à¸™ à¹à¸¥à¹‰à¸§à¸à¸” Detect à¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡' },
      { status: 404 }
    )
  }
  return NextResponse.json({ ok: true, chatId: result.chatId, from: result.from })
}
