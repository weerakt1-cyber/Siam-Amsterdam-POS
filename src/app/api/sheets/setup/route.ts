import { NextResponse } from 'next/server'
import { isConfigured, setupSheetHeaders } from '@/lib/sheets'

// GET — ตรวจสอบว่า env vars ถูก set ไว้หรือไม่
export async function GET() {
  return NextResponse.json({
    configured: isConfigured(),
    sheetId: process.env.GOOGLE_SHEET_ID ?? null,
  })
}

// POST — สร้าง header row บน spreadsheet (เรียกได้หลายครั้ง, idempotent)
export async function POST() {
  const result = await setupSheetHeaders()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
