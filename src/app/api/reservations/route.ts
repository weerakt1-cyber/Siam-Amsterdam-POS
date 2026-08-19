export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreId } from '@/lib/api-auth'
import { getMemberByPhone } from '@/lib/store'
import { createReservation, listReservations, takenTables, bangkokDate, TableTakenError, type NewReservation, type Reservation } from '@/lib/reservations'
import { sendReservationRequest, type ReservationNotify } from '@/lib/telegram'

// Map a stored reservation to the Telegram alert shape.
function toNotify(r: Reservation): ReservationNotify {
  return {
    refCode: r.refCode, customerName: r.customerName, isMember: !!r.memberId,
    phone: r.phone, reservedDate: r.reservedDate, startTime: r.startTime, endTime: r.endTime,
    partySize: r.partySize, zone: r.zone, tableNo: r.tableNo,
    eventName: r.eventName, requirements: r.requirements,
  }
}

// Basic HH:MM validator (00:00–23:59).
const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
// YYYY-MM-DD
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

// GET — staff inbox: upcoming + recent reservations for the caller's store.
// Store-scoped (same trust model as /api/orders). `?from=YYYY-MM-DD` limits the
// window; defaults to today so the list stays bounded.
export async function GET(req: NextRequest) {
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  try {
    const fromParam = req.nextUrl.searchParams.get('from')
    const fromDate = isDate(fromParam) ? fromParam : bangkokDate()
    const reservations = await listReservations(storeId, { fromDate })
    return NextResponse.json({ reservations })
  } catch (err) {
    console.error('[reservations] GET', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load reservations' }, { status: 500 })
  }
}

// POST — public: the customer submits a booking request (status 'pending').
// Carries the store via x-store-id (no session), same as the QR order flow.
export async function POST(req: NextRequest) {
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  try {
    const body = await req.json()

    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : ''
    if (!customerName) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!isDate(body.reservedDate)) return NextResponse.json({ error: 'Valid date is required' }, { status: 400 })
    if (!isTime(body.startTime) || !isTime(body.endTime)) {
      return NextResponse.json({ error: 'Valid start/end time is required' }, { status: 400 })
    }
    if (body.endTime <= body.startTime) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
    }
    // Don't accept bookings before the venue's local (Bangkok) day.
    const today = bangkokDate()
    if (body.reservedDate < today) {
      return NextResponse.json({ error: 'Cannot book a past date' }, { status: 400 })
    }

    // Member linkage: resolve the login phone to the member record server-side
    // (the phone is never trusted as an id), exactly like the QR order flow. A
    // matched member links the booking (member_id) and uses their registered name.
    let memberId: string | undefined
    let memberName: string | undefined
    const memberPhone = typeof body.memberPhone === 'string' ? body.memberPhone.trim() : ''
    if (memberPhone) {
      const m = await getMemberByPhone(memberPhone, storeId)
      if (m) { memberId = m.id; memberName = m.name }
    }

    const tableNo = typeof body.tableNo === 'string' && body.tableNo.trim() ? body.tableNo.trim() : undefined

    // Availability guard: a customer cannot book a table already held for an
    // overlapping window. Staff can still force an overlap from the POS (a
    // different code path — the POS PATCH, not this public create).
    if (tableNo) {
      const taken = await takenTables(body.reservedDate, body.startTime, body.endTime, storeId)
      if (taken.includes(tableNo)) {
        return NextResponse.json(
          { error: 'table_taken', message: 'That table is already reserved for this time.' },
          { status: 409 },
        )
      }
    }

    const input: NewReservation = {
      memberId,
      customerName: memberName ?? customerName,
      phone:        typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : (memberPhone || undefined),
      zone:         typeof body.zone === 'string' && body.zone.trim() ? body.zone.trim() : undefined,
      tableNo,
      partySize:    Math.max(1, parseInt(body.partySize) || 1),
      reservedDate: body.reservedDate,
      startTime:    body.startTime,
      endTime:      body.endTime,
      eventName:    typeof body.eventName === 'string' && body.eventName.trim() ? body.eventName.trim() : undefined,
      requirements: typeof body.requirements === 'string' && body.requirements.trim() ? body.requirements.trim() : undefined,
    }

    const reservation = await createReservation(input, storeId)
    // Alert the shop (non-blocking — a Telegram hiccup must not fail the booking).
    sendReservationRequest(toNotify(reservation)).catch(err =>
      console.error('[reservations] request alert failed:', err))
    return NextResponse.json({ reservation }, { status: 201 })
  } catch (err) {
    // The DB no-overlap constraint won the race even though the pre-check passed.
    if (err instanceof TableTakenError) {
      return NextResponse.json(
        { error: 'table_taken', message: 'That table is already reserved for this time.' },
        { status: 409 })
    }
    console.error('[reservations] POST', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 })
  }
}
