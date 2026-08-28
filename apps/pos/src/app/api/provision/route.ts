export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { provisionStoreForUser } from '@/lib/store'

// POST /api/provision — turn a fresh authenticated session into a usable store.
//
// Runs on first authenticated visit for a user who has no store yet. It reads
// the store name + segment from the request body, falling back to the values
// stashed in user_metadata at signup (so it still works when the router — not
// the signup form — triggers provisioning, e.g. after an OAuth round-trip).
//
// Idempotent + concurrency-safe (see provisionStoreForUser): a user who already
// has a store just gets it back; two parallel calls settle on one store. A user
// who has a non-store profile (a pending join/approval) is returned as `pending`
// and never given a store here — that keeps the invite/approval flow intact.
export async function POST(req: NextRequest) {
  const authz = req.headers.get('authorization') ?? ''
  const token = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  }
  const user = userData.user
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const storeName = String(body.storeName ?? body.name ?? meta.storeName ?? meta.store_name ?? '').trim()
  const segment   = body.segment ?? meta.segment ?? 'other'
  const ref       = String(body.ref ?? meta.ref ?? '').trim() || null
  const displayName = String(meta.name ?? meta.full_name ?? meta.display_name ?? '').trim() || null

  if (!storeName) {
    return NextResponse.json({ error: 'ไม่พบชื่อร้าน กรุณาเริ่มสมัครใหม่ที่หน้าสมัคร' }, { status: 400 })
  }

  try {
    const result = await provisionStoreForUser({
      userId: user.id,
      storeName,
      segment,
      displayName,
      email: user.email ?? null,
      ref,
    })
    if (!result.ok) {
      // The account already has a (non-store) profile awaiting approval — this is
      // the invite/join flow, not a fresh signup. Tell the client to wait there.
      return NextResponse.json({ error: 'บัญชีนี้รอการอนุมัติอยู่', pending: true, status: result.status }, { status: 409 })
    }
    return NextResponse.json(
      { ok: true, storeId: result.storeId, slug: result.slug, created: result.created, ownerPin: result.ownerPin },
      { status: result.created ? 201 : 200 },
    )
  } catch (err) {
    console.error('[provision]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'สร้างร้านไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
