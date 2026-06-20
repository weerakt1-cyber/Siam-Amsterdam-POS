import { NextRequest, NextResponse } from 'next/server'
import { verifyStaffPin, getStaffMember } from '@/lib/store'

export async function POST(req: NextRequest) {
  try {
    const { id, pin } = await req.json()
    if (!id || !pin) return NextResponse.json({ error: 'id and pin required' }, { status: 400 })
    const valid = await verifyStaffPin(String(id), String(pin))
    if (!valid) return NextResponse.json({ valid: false })
    // คืน public profile เมื่อ PIN ถูกต้อง
    const user = await getStaffMember(String(id))
    if (!user) return NextResponse.json({ valid: false })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pin: _p, ...pub } = user
    return NextResponse.json({ valid: true, user: pub })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
