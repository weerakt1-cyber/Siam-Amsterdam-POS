export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getReport, setOpeningCash, addCashIn, removeCashIn, addExpense, removeExpense, getOrdersByDate } from '@/lib/store'

export async function GET(_: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const [report, orders] = await Promise.all([getReport(date), getOrdersByDate(date)])
  return NextResponse.json({ report, orders })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'opening') {
      const report = await setOpeningCash(date, Number(body.amount) || 0)
      return NextResponse.json({ report })
    }

    if (action === 'add-cash-in') {
      if (!body.amount || body.amount <= 0) return NextResponse.json({ error: 'amount required' }, { status: 400 })
      const report = await addCashIn(date, { amount: Number(body.amount), note: body.note ?? '' })
      return NextResponse.json({ report })
    }

    if (action === 'remove-cash-in') {
      const report = await removeCashIn(date, body.entryId)
      return NextResponse.json({ report })
    }

    if (action === 'add-expense') {
      if (!body.amount || body.amount <= 0) return NextResponse.json({ error: 'amount required' }, { status: 400 })
      const report = await addExpense(date, { amount: Number(body.amount), note: body.note ?? '', category: body.category ?? 'other' })
      return NextResponse.json({ report })
    }

    if (action === 'remove-expense') {
      const report = await removeExpense(date, body.entryId)
      return NextResponse.json({ report })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
