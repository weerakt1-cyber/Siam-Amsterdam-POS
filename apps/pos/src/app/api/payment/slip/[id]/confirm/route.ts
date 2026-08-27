export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, resolveStaffStoreId } from '@/lib/api-auth'
import { getPaymentSlip, resolvePaymentSlip } from '@/lib/store'
import { markOrderPaid } from '@/lib/order-payment'

// POST /api/payment/slip/[id]/confirm — staff confirms a pending (manual) slip.
// Stamps verified_by, marks the order paid. 409 if the slip is no longer pending.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const { id } = await params

  const existing = await getPaymentSlip(id, storeId)
  if (!existing) return NextResponse.json({ error: 'Slip not found' }, { status: 404 })

  const slip = await resolvePaymentSlip(id, 'verified', gate.profile.id, storeId)
  if (!slip) return NextResponse.json({ error: 'Slip is no longer pending' }, { status: 409 })

  await markOrderPaid(slip.orderId, 'transfer', storeId)
  return NextResponse.json({ ok: true, slip })
}
