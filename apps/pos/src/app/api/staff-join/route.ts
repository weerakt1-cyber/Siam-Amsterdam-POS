export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, findStoreByInviteToken, linkStaffProfile, getOwnerState, createStaffMember } from '@/lib/store'

// POST — the signed-in user (just registered via an invite link) joins the
// invite's store as approved staff. Provider-agnostic: needs a session + token.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const token = String(b.token ?? '')
  const name  = (String(b.name ?? '').trim()) || user.email
  const pin   = String(b.pin ?? '')

  const store = await findStoreByInviteToken(token)
  if (!store) return NextResponse.json({ error: 'ลิงก์เชิญไม่ถูกต้องหรือถูกยกเลิกแล้ว' }, { status: 400 })

  // If already an approved member of a store: joining THIS store again is a
  // no-op (don't demote an owner/admin of this same store to 'staff', and don't
  // create a duplicate PIN operator on a re-run); joining a DIFFERENT store is
  // refused (one account = one store).
  const existing = await getOwnerState(user.id)
  if (existing?.status === 'approved' && existing.storeId) {
    if (existing.storeId === store.id) return NextResponse.json({ ok: true, slug: store.slug })
    return NextResponse.json({ error: 'บัญชีนี้ผูกกับร้านอื่นอยู่แล้ว' }, { status: 409 })
  }

  await linkStaffProfile(user.id, name, store.id)

  // Also create their PIN operator so they can pick their name + PIN and start a
  // shift immediately (best-effort — the app-account link is what actually
  // matters; a PIN can always be set later in Users).
  let pinCreated = false
  if (/^\d{4}$/.test(pin)) {
    try {
      await createStaffMember({ name, role: 'staff', pin, color: '#10b981' }, store.id)
      pinCreated = true
    } catch (err) {
      console.error('[staff-join] PIN operator create failed:', err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ ok: true, slug: store.slug, pinCreated })
}
