export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@baze/db'
import { confirmStorePayment, rejectStorePayment } from '@baze/db'

// POST — super-admin confirms or rejects a pending payment.
//   body: { action: 'confirm' | 'reject' }
// Confirm extends the store's subscription by the payment's months.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  if (body.action === 'confirm') {
    const p = await confirmStorePayment(id, gate.email)
    if (!p) return NextResponse.json({ error: 'ไม่พบรายการ pending' }, { status: 404 })
    return NextResponse.json({ payment: p })
  }
  if (body.action === 'reject') {
    const p = await rejectStorePayment(id, gate.email)
    if (!p) return NextResponse.json({ error: 'ไม่พบรายการ pending' }, { status: 404 })
    return NextResponse.json({ payment: p })
  }
  return NextResponse.json({ error: "action must be 'confirm' or 'reject'" }, { status: 400 })
}
