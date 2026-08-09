export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getStaff, createStaffMember } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const users = await getStaff(storeId)
  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
    const body = await req.json()
    const { name, role, pin, color } = body
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    if (!pin || !/^\d{4}$/.test(String(pin))) return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
    if (!['admin', 'manager', 'bartender', 'staff'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    const user = await createStaffMember({ name: String(name).trim(), role, pin: String(pin), color: color ?? '#10b981' }, storeId)
    return NextResponse.json({ user }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
