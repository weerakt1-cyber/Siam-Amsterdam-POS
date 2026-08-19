export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAllStoreIds } from '@/lib/store'
import { getReservationsByDate, updateReservation } from '@/lib/reservations'
import { isTelegramConfigured, sendReservationReminder, type ReservationNotify } from '@/lib/telegram'

// Day-before reminder digest. Meant to be hit once a day by Vercel Cron (see
// vercel.json) — typically the evening before. For every store, it finds the
// next day's approved bookings that haven't been reminded yet, sends the shop a
// Telegram digest, and stamps reminder_sent_at so a re-run won't double-send.
//
// Customer reminders are on-page only (per the chosen setup — no SMS); this
// endpoint notifies the shop. Vercel Cron issues GET, so both verbs are handled.

// "Tomorrow" in the venue's timezone (bookings are local calendar dates).
function tomorrowBangkok(): string {
  const todayBkk = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) // YYYY-MM-DD
  const d = new Date(`${todayBkk}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function run(req: NextRequest) {
  // If a CRON_SECRET is set, require it (Vercel Cron sends it as a Bearer token).
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authz = req.headers.get('authorization') ?? ''
    if (authz !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: false, error: 'Telegram not configured' }, { status: 400 })
  }

  const date = tomorrowBangkok()
  const storeIds = await getAllStoreIds()
  let totalReminded = 0

  for (const storeId of storeIds) {
    let dayList
    try {
      dayList = await getReservationsByDate(date, storeId)
    } catch {
      continue
    }
    const due = dayList.filter(r => r.status === 'approved' && !r.reminderSentAt)
    if (due.length === 0) continue

    const rows: ReservationNotify[] = due.map(r => ({
      refCode: r.refCode, customerName: r.customerName,
      reservedDate: r.reservedDate, startTime: r.startTime, endTime: r.endTime,
      partySize: r.partySize, zone: r.zone, tableNo: r.tableNo, eventName: r.eventName,
    }))

    const sent = await sendReservationReminder(date, rows)
    if (sent) {
      const stamp = new Date().toISOString()
      await Promise.all(due.map(r =>
        updateReservation(r.id, { reminderSentAt: stamp }, storeId).catch(() => null)))
      totalReminded += due.length
    }
  }

  return NextResponse.json({ ok: true, date, reminded: totalReminded })
}

export async function GET(req: NextRequest)  { return run(req) }
export async function POST(req: NextRequest) { return run(req) }
