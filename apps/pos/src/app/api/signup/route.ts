export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, getOwnerState, findStoreBySlug, createSignupStore, linkOwnerProfile, getAffiliateByCode } from '@/lib/store'

// POST — self-service store signup. The caller (logged in via Google) creates
// their own store; if they arrived via a referral code the store is attributed
// to that affiliate. Makes them the approved admin of the new store.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  // Don't let an account that already owns a store create another here.
  const existing = await getOwnerState(user.id)
  if (existing?.status === 'approved' && existing.storeId) {
    return NextResponse.json({ error: 'บัญชีนี้มีร้านอยู่แล้ว' }, { status: 409 })
  }

  const b = await req.json().catch(() => ({}))
  const name = String(b.name ?? '').trim()
  const slug = String(b.slug ?? '').trim().toLowerCase()
  if (!name) return NextResponse.json({ error: 'กรุณากรอกชื่อร้าน' }, { status: 400 })
  if (!/^[a-z0-9-]{3,}$/.test(slug)) {
    return NextResponse.json({ error: 'slug ต้องเป็นตัวอังกฤษพิมพ์เล็ก/ตัวเลข/ขีด อย่างน้อย 3 ตัว' }, { status: 400 })
  }
  if (await findStoreBySlug(slug)) return NextResponse.json({ error: 'slug นี้ถูกใช้แล้ว ลองอันอื่น' }, { status: 409 })

  // Referral attribution (best-effort — an unknown code just means no affiliate).
  let affiliateId: string | null = null
  const ref = b.ref ? String(b.ref).trim() : ''
  if (ref) {
    const aff = await getAffiliateByCode(ref)
    if (aff && aff.status === 'active') affiliateId = aff.id
  }

  try {
    const store = await createSignupStore({ name, slug, affiliateId })
    await linkOwnerProfile(user.id, name || user.email, store.id)
    return NextResponse.json({ ok: true, slug: store.slug }, { status: 201 })
  } catch (err) {
    console.error('[signup]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'สร้างร้านไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
