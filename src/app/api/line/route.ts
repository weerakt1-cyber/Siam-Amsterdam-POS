export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { isLineConfigured, getTokenPreview, sendLineMessage } from '@/lib/line'

// GET — config status
export async function GET() {
  return NextResponse.json({
    configured:   isLineConfigured(),
    hasToken:     !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
    hasTargetId:  !!process.env.LINE_TARGET_ID,
    tokenPreview: getTokenPreview(),
    targetId:     process.env.LINE_TARGET_ID ?? null,
  })
}

// POST — send test message
export async function POST() {
  if (!isLineConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN and LINE_TARGET_ID are required' },
      { status: 400 }
    )
  }

  const ok = await sendLineMessage(
    '🍹 Test from Baze POS\nLINE Messaging API is connected and working!'
  )

  if (!ok) {
    return NextResponse.json(
      { ok: false, error: 'Failed to send — check LINE_CHANNEL_ACCESS_TOKEN and LINE_TARGET_ID' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
