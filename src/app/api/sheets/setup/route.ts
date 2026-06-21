export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'
import { isConfigured, setupSheetHeaders } from '@/lib/sheets'

// GET â€” à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸§à¹ˆà¸² env vars à¸–à¸¹à¸ set à¹„à¸§à¹‰à¸«à¸£à¸·à¸­à¹„à¸¡à¹ˆ
export async function GET() {
  return NextResponse.json({
    configured: isConfigured(),
    sheetId: process.env.GOOGLE_SHEET_ID ?? null,
  })
}

// POST â€” à¸ªà¸£à¹‰à¸²à¸‡ header row à¸šà¸™ spreadsheet (à¹€à¸£à¸µà¸¢à¸à¹„à¸”à¹‰à¸«à¸¥à¸²à¸¢à¸„à¸£à¸±à¹‰à¸‡, idempotent)
export async function POST() {
  const result = await setupSheetHeaders()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
