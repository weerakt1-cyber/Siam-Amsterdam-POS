import { NextRequest, NextResponse } from 'next/server'
import { adjustStock, getAdjustments } from '@/lib/store'
import type { AdjustReason } from '@/lib/types'

const VALID_REASONS: AdjustReason[] = ['restock', 'usage', 'manual', 'waste']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const { delta, reason, note } = body

    if (typeof delta !== 'number' || delta === 0)
      return NextResponse.json({ error: 'delta must be a non-zero number' }, { status: 400 })
    if (!VALID_REASONS.includes(reason))
      return NextResponse.json({ error: 'invalid reason' }, { status: 400 })

    const updated = await adjustStock(id, delta, reason, note)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ item: updated, adjustments: await getAdjustments(id) })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json({ adjustments: await getAdjustments(id) })
}
