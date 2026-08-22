export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getStaffMember, updateStaffMember, deleteStaffMember } from '@/lib/store'
import { resolveStaffStoreId } from '@/lib/api-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const user = await getStaffMember(id, storeId)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pin: _pin, ...pub } = user
  return NextResponse.json({ user: pub })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const storeId = await resolveStaffStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const body = await req.json()
    if (body.pin !== undefined && !/^\d{4}$/.test(String(body.pin))) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
    }
    if (body.pin) body.pin = String(body.pin)
    const updated = await updateStaffMember(id, body, storeId)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ user: updated })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const ok = await deleteStaffMember(id, storeId)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
