export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getMembers, createMember } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const members = await getMembers(storeId)
  return NextResponse.json({ members })
}

export async function POST(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

    const body = await req.json()
    const { name, phone, contact, birthday, notes } = body

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const member = await createMember({
      name:           name.trim(),
      phone:          phone ? String(phone).trim() : undefined,
      contact:        contact ? String(contact).trim() : undefined,
      birthday:       birthday ? String(birthday) : undefined,
      notes:          notes ? String(notes).trim() : undefined,
      points:         0,
      lifetimePoints: 0,
      tier:           'bronze',
      stamps:         0,
      stampsEarned:   0,
    }, storeId)

    return NextResponse.json({ member }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
