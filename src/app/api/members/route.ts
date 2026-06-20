import { NextRequest, NextResponse } from 'next/server'
import { getMembers, createMember } from '@/lib/store'

export async function GET() {
  const members = await getMembers()
  return NextResponse.json({ members })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, phone, birthday, notes } = body

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const member = await createMember({
      name:         name.trim(),
      phone:        phone ? String(phone).trim() : undefined,
      birthday:     birthday ? String(birthday) : undefined,
      notes:        notes ? String(notes).trim() : undefined,
      points:       0,
      stamps:       0,
      stampsEarned: 0,
    })

    return NextResponse.json({ member }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
