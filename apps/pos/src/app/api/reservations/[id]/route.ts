export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreId } from '@/lib/api-auth'
import { getReservation, updateReservation, TableTakenError, type ReservationStatus } from '@/lib/reservations'
import { sendReservationDecision } from '@/lib/telegram'

const VALID_STATUSES: ReservationStatus[] = [
  'pending', 'approved', 'rejected', 'seated', 'completed', 'no_show', 'cancelled',
]

// GET — the customer's tracking screen polls this to watch the status flip from
// 'pending' to 'approved'/'rejected' (mirrors how the QR order tracker polls).
// The id is an unguessable uuid, so it's public like /api/orders/[id].
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const reservation = await getReservation(id, storeId)
  if (!reservation) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  return NextResponse.json({ reservation })
}

// PATCH — status changes. Two callers, both store-scoped (same trust model as
// /api/orders/[id]): the POS approves/rejects (with a staff reply + optional
// table assignment); the customer cancels their own pending booking.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const patch: Parameters<typeof updateReservation>[1] = {}

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }
    patch.status = body.status
  }
  if (typeof body.staffReply === 'string')   patch.staffReply   = body.staffReply.trim()
  if (typeof body.cancelReason === 'string') patch.cancelReason = body.cancelReason.trim() || undefined
  if (typeof body.tableNo === 'string')      patch.tableNo      = body.tableNo.trim() || undefined
  if (typeof body.zone === 'string')         patch.zone         = body.zone.trim() || undefined
  // Staff force-approving onto an already-held table: exempts this row from the
  // DB no-overlap constraint (see migration 016).
  if (typeof body.override === 'boolean')  patch.override   = body.override

  try {
    // Prior status, so we only alert on a real transition (not a repeat click).
    const prev = await getReservation(id, storeId)
    if (!prev) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })

    const updated = await updateReservation(id, patch, storeId)
    if (!updated) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })

    // On an approve/reject decision, log it to the shop's Telegram (the customer
    // sees it on their tracking page). Non-blocking. Only when the status
    // actually changes, so a repeated Approve tap doesn't spam duplicate alerts.
    // Cancellations by the customer don't alert (the shop confirmed nothing).
    if ((patch.status === 'approved' || patch.status === 'rejected') && patch.status !== prev.status) {
      sendReservationDecision(
        {
          refCode: updated.refCode, customerName: updated.customerName,
          reservedDate: updated.reservedDate, startTime: updated.startTime,
          endTime: updated.endTime, partySize: updated.partySize, tableNo: updated.tableNo,
        },
        patch.status === 'approved',
        updated.staffReply,
      ).catch(err => console.error('[reservations] decision alert failed:', err))
    }

    return NextResponse.json({ reservation: updated })
  } catch (err) {
    // Approving/assigning onto a table already held for an overlapping window,
    // without override. Staff can retry with override:true to force it.
    if (err instanceof TableTakenError) {
      return NextResponse.json(
        { error: 'table_taken', message: 'That table is already reserved for this time. Enable override to force it.' },
        { status: 409 })
    }
    console.error('[reservations/[id]] PATCH', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 })
  }
}
