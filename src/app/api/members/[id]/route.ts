export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getMember, updateMember, deleteMember } from '@/lib/store'
import { getTier } from '@/lib/loyalty'
import { sendTierUpgrade } from '@/lib/telegram'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const member = await getMember(id)
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ member })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const updated = await updateMember(id, body)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ member: updated })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PATCH — award / deduct redeemable points; only pointsDelta > 0 grows lifetimePoints
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const { pointsDelta } = body as { pointsDelta?: number }
    if (typeof pointsDelta !== 'number') {
      return NextResponse.json({ error: 'pointsDelta (number) is required' }, { status: 400 })
    }

    const member = await getMember(id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const prevTier      = member.tier
    const newPoints     = Math.max(0, member.points + pointsDelta)
    const newLifetime   = pointsDelta > 0
      ? member.lifetimePoints + pointsDelta
      : member.lifetimePoints
    const newTier       = getTier(newLifetime).name

    const updated = await updateMember(id, {
      points:         newPoints,
      lifetimePoints: newLifetime,
      tier:           newTier,
    })
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (newTier !== prevTier) {
      sendTierUpgrade(member.name, newTier).catch(() => {})
    }

    return NextResponse.json({ member: updated, tierChanged: newTier !== prevTier, newTier })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = await deleteMember(id)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
