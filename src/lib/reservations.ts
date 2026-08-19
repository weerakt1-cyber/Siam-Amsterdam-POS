// ─── Reservations data access ─────────────────────────────────────────────────
// Table bookings / event reservations. The public /reserve/{store} link creates
// them (status 'pending'); the POS approves/rejects. Store-scoped like the rest
// of the app — every function takes an explicit storeId (resolved from the
// caller by the API layer). Runs on the service_role client (bypasses RLS; the
// RLS policy in migration 016 is a defense-in-depth backup only).

import { supabase } from './supabase'
import { getStore, getSoleStoreId } from './store'

const now = () => new Date().toISOString()

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReservationStatus =
  | 'pending' | 'approved' | 'rejected'
  | 'seated' | 'completed' | 'no_show' | 'cancelled'

export type Reservation = {
  id: string
  refCode: string
  storeId: string
  memberId?: string
  customerName: string
  phone?: string
  zone?: string
  tableNo?: string
  partySize: number
  reservedDate: string   // YYYY-MM-DD
  startTime: string      // HH:MM
  endTime: string        // HH:MM
  eventName?: string
  requirements?: string
  status: ReservationStatus
  staffReply?: string
  reminderSentAt?: string
  createdAt: string
  updatedAt: string
}

export type NewReservation = {
  memberId?: string
  customerName: string
  phone?: string
  zone?: string
  tableNo?: string
  partySize: number
  reservedDate: string
  startTime: string
  endTime: string
  eventName?: string
  requirements?: string
}

// Statuses that still hold a table (block the slot / show in availability).
export const ACTIVE_STATUSES: ReservationStatus[] = ['pending', 'approved', 'seated']

// ─── Mapper (snake_case DB → camelCase TS) ────────────────────────────────────

function map(row: Record<string, unknown>): Reservation {
  return {
    id:             row.id as string,
    refCode:        row.ref_code as string,
    storeId:        row.store_id as string,
    memberId:       (row.member_id as string | null) ?? undefined,
    customerName:   row.customer_name as string,
    phone:          (row.phone as string | null) ?? undefined,
    zone:           (row.zone as string | null) ?? undefined,
    tableNo:        (row.table_no as string | null) ?? undefined,
    partySize:      Number(row.party_size ?? 1),
    reservedDate:   String(row.reserved_date),
    startTime:      String(row.start_time).slice(0, 5),
    endTime:        String(row.end_time).slice(0, 5),
    eventName:      (row.event_name as string | null) ?? undefined,
    requirements:   (row.requirements as string | null) ?? undefined,
    status:         (row.status as ReservationStatus) ?? 'pending',
    staffReply:     (row.staff_reply as string | null) ?? undefined,
    reminderSentAt: (row.reminder_sent_at as string | null) ?? undefined,
    createdAt:      row.created_at as string,
    updatedAt:      row.updated_at as string,
  }
}

// ─── Booking reference ────────────────────────────────────────────────────────
// A short human-quotable code (e.g. "SA-4F9K"), unique per store. Prefix from
// the store slug's initials; body from an unambiguous alphabet (no 0/O/1/I).
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomRef(): string {
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)]
  }
  return s
}

async function makeRefCode(storeId: string): Promise<string> {
  const store = await getStore(storeId)
  const prefix = (store?.slug || 'R')
    .replace(/[^a-z]/gi, '')
    .slice(0, 2)
    .toUpperCase() || 'R'
  // Retry a few times on the (very unlikely) unique-index collision.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `${prefix}-${randomRef()}`
    const { data } = await supabase
      .from('reservations')
      .select('id')
      .eq('store_id', storeId)
      .eq('ref_code', code)
      .maybeSingle()
    if (!data) return code
  }
  // Fall back to a longer code that's effectively collision-proof.
  return `${prefix}-${randomRef()}${randomRef()}`
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getReservation(id: string, storeId: string): Promise<Reservation | undefined> {
  const { data, error } = await supabase
    .from('reservations').select('*')
    .eq('id', id).eq('store_id', storeId).maybeSingle()
  if (error || !data) return undefined
  return map(data)
}

export async function getReservationByRef(refCode: string, storeId: string): Promise<Reservation | undefined> {
  const { data, error } = await supabase
    .from('reservations').select('*')
    .eq('ref_code', refCode.trim().toUpperCase()).eq('store_id', storeId).maybeSingle()
  if (error || !data) return undefined
  return map(data)
}

// All reservations for a given calendar date — used for availability checks and
// the POS day view. Ordered by start time.
export async function getReservationsByDate(date: string, storeId: string): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from('reservations').select('*')
    .eq('store_id', storeId).eq('reserved_date', date)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data ?? []).map(map)
}

// Staff inbox: recent + upcoming reservations. `fromDate` (YYYY-MM-DD) limits to
// bookings on/after that date so the list doesn't grow unbounded.
export async function listReservations(
  storeId: string,
  opts: { fromDate?: string; statuses?: ReservationStatus[] } = {},
): Promise<Reservation[]> {
  let q = supabase.from('reservations').select('*').eq('store_id', storeId)
  if (opts.fromDate) q = q.gte('reserved_date', opts.fromDate)
  if (opts.statuses?.length) q = q.in('status', opts.statuses)
  const { data, error } = await q
    .order('reserved_date', { ascending: true })
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data ?? []).map(map)
}

// ─── Availability ─────────────────────────────────────────────────────────────
// Two time ranges overlap when each starts before the other ends. We only count
// reservations that still hold a table (ACTIVE_STATUSES). Returns the set of
// table numbers that are unavailable for the given date + window.
export async function takenTables(
  date: string, startTime: string, endTime: string, storeId: string,
): Promise<string[]> {
  const dayList = await getReservationsByDate(date, storeId)
  const taken = new Set<string>()
  for (const r of dayList) {
    if (!r.tableNo) continue
    if (!ACTIVE_STATUSES.includes(r.status)) continue
    const overlaps = r.startTime < endTime && r.endTime > startTime
    if (overlaps) taken.add(r.tableNo)
  }
  return Array.from(taken)
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createReservation(input: NewReservation, storeId: string): Promise<Reservation> {
  const sid = storeId || (await getSoleStoreId())
  if (!sid) throw new Error('storeId is required')
  const refCode = await makeRefCode(sid)
  const id = crypto.randomUUID()
  const { data, error } = await supabase.from('reservations').insert({
    id,
    store_id:      sid,
    ref_code:      refCode,
    member_id:     input.memberId ?? null,
    customer_name: input.customerName,
    phone:         input.phone ?? null,
    zone:          input.zone ?? null,
    table_no:      input.tableNo ?? null,
    party_size:    Math.max(1, input.partySize || 1),
    reserved_date: input.reservedDate,
    start_time:    input.startTime,
    end_time:      input.endTime,
    event_name:    input.eventName ?? null,
    requirements:  input.requirements ?? null,
    status:        'pending',
    created_at:    now(),
    updated_at:    now(),
  }).select().single()
  if (error) throw error
  return map(data)
}

export async function updateReservation(
  id: string,
  patch: Partial<Pick<Reservation, 'status' | 'staffReply' | 'tableNo' | 'zone' | 'reminderSentAt'>>,
  storeId: string,
): Promise<Reservation | null> {
  const row: Record<string, unknown> = {}
  if (patch.status         !== undefined) row.status           = patch.status
  if (patch.staffReply     !== undefined) row.staff_reply      = patch.staffReply
  if (patch.tableNo        !== undefined) row.table_no         = patch.tableNo
  if (patch.zone           !== undefined) row.zone             = patch.zone
  if (patch.reminderSentAt !== undefined) row.reminder_sent_at = patch.reminderSentAt
  if (Object.keys(row).length === 0) return getReservation(id, storeId).then(r => r ?? null)

  const { data, error } = await supabase
    .from('reservations').update(row)
    .eq('id', id).eq('store_id', storeId)
    .select().maybeSingle()
  if (error) throw error
  return data ? map(data) : null
}
