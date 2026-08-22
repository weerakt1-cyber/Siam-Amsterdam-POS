export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getReport, setOpeningCash, addCashIn, removeCashIn, addExpense, removeExpense, getOrdersByDate } from '@/lib/store'
import { resolveStaffStoreId } from '@/lib/api-auth'

// Daily cash report + orders — staff-only (a public store hint must not unlock it).
export async function GET(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const [report, orders] = await Promise.all([getReport(date, storeId), getOrdersByDate(date, storeId)])
  return NextResponse.json({ report, orders })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'opening') {
      const report = await setOpeningCash(date, Number(body.amount) || 0, storeId)
      return NextResponse.json({ report })
    }

    if (action === 'add-cash-in') {
      if (!body.amount || body.amount <= 0) return NextResponse.json({ error: 'amount required' }, { status: 400 })
      const report = await addCashIn(date, { amount: Number(body.amount), note: body.note ?? '' }, storeId)
      return NextResponse.json({ report })
    }

    if (action === 'remove-cash-in') {
      const report = await removeCashIn(date, body.entryId, storeId)
      return NextResponse.json({ report })
    }

    if (action === 'add-expense') {
      if (!body.amount || body.amount <= 0) return NextResponse.json({ error: 'amount required' }, { status: 400 })
      const report = await addExpense(date, { amount: Number(body.amount), note: body.note ?? '', category: body.category ?? 'other' }, storeId)
      return NextResponse.json({ report })
    }

    if (action === 'remove-expense') {
      const report = await removeExpense(date, body.entryId, storeId)
      return NextResponse.json({ report })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
