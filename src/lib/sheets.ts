import { google } from 'googleapis'
import type { Order } from './types'

// ─── Column layout for Orders sheet ───────────────────────────────────────────

const HEADER_ROW = [
  'Date', 'Time', 'Order ID', 'Table', 'Member',
  'Item', 'Qty', 'Unit ฿', 'Line ฿', 'Discount ฿', 'Total ฿',
  'Payment', 'Source', 'Note',
]

// ─── Internal client helper ────────────────────────────────────────────────────

// คืน Sheets client + sheetId ถ้า env vars ครบ
async function getClient() {
  const rawJson = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!rawJson || !sheetId) return null
  try {
    const credentials = JSON.parse(rawJson)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    return { sheets: google.sheets({ version: 'v4', auth }), sheetId }
  } catch {
    return null
  }
}

// ─── Public helpers ────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT && process.env.GOOGLE_SHEET_ID)
}

// สร้าง header row ถ้า sheet ว่างอยู่ — เรียกครั้งแรกก่อนเริ่ม export
export async function setupSheetHeaders(): Promise<{ ok: boolean; message: string }> {
  const client = await getClient()
  if (!client) {
    return { ok: false, message: 'Missing env vars GOOGLE_SHEETS_SERVICE_ACCOUNT or GOOGLE_SHEET_ID' }
  }
  const { sheets, sheetId } = client
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A1:Z1',
    })
    if (existing.data.values && existing.data.values.length > 0) {
      return { ok: true, message: 'Headers already exist — sheet is ready' }
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADER_ROW] },
    })
    return { ok: true, message: `Headers created (${HEADER_ROW.length} columns)` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: msg }
  }
}

// ส่งข้อมูลออเดอร์ไปยัง Google Sheets (server-side only, non-blocking)
export async function appendOrderToSheet(order: Order): Promise<void> {
  const client = await getClient()
  if (!client) {
    console.warn('[Sheets] Missing env vars GOOGLE_SHEETS_SERVICE_ACCOUNT or GOOGLE_SHEET_ID — skipping')
    return
  }
  const { sheets, sheetId } = client
  try {
    const dt = new Date(order.createdAt)
    const dateStr = dt.toLocaleDateString('en-GB')   // dd/mm/yyyy
    const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

    // กระจาย discount เฉลี่ยต่อ line item (สำหรับ analytics ใน Sheets)
    const discountPerItem =
      order.discount && order.items.length > 0
        ? Math.round(order.discount.amount / order.items.length)
        : 0

    const rows = order.items.map((item) => [
      dateStr,
      timeStr,
      order.id,
      order.tableNo,
      order.memberName ?? '',
      item.name,
      item.qty,
      item.price,
      item.qty * item.price,
      discountPerItem || '',
      order.total,
      order.paymentMethod ?? 'N/A',
      order.source,
      order.note ?? '',
    ])

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    })

    console.log(`[Sheets] ✓ Appended ${rows.length} rows for order ${order.id} (${order.tableNo})`)
  } catch (err) {
    console.error('[Sheets] Failed to append order:', err instanceof Error ? err.message : err)
  }
}
