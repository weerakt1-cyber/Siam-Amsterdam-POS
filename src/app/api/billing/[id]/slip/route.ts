export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { getStorePayment, uploadPaymentSlip, setPaymentSlip } from '@/lib/store'

export const runtime = 'nodejs'

// POST — the owner uploads the transfer slip for a pending payment (multipart,
// field "slip"). Scoped to the caller's own store + payment.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, ['admin'])
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const { id } = await params

  const payment = await getStorePayment(id)
  if (!payment || payment.storeId !== storeId) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('slip')
  if (!(file instanceof File)) return NextResponse.json({ error: 'slip file required' }, { status: 400 })
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 8MB' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const contentType = file.type || 'image/jpeg'
  try {
    const path = await uploadPaymentSlip(storeId, id, bytes, contentType)
    await setPaymentSlip(id, storeId, path)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[billing/slip]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'อัปโหลดสลิปไม่สำเร็จ' }, { status: 500 })
  }
}
