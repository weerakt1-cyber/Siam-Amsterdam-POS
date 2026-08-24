export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { isLineConfigured, getTokenPreview, sendLineMessage } from '@/lib/line'
import { requireStaff } from '@/lib/api-auth'

// GET — config status
export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  return NextResponse.json({
    configured:   isLineConfigured(),
    hasToken:     !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
    hasTargetId:  !!process.env.LINE_TARGET_ID,
    tokenPreview: getTokenPreview(),
    targetId:     process.env.LINE_TARGET_ID ?? null,
  })
}

// POST — send test message
export async function POST(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
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
