export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, getAffiliateByEmail, applyAsAffiliate } from '@baze/db'

type State = 'none' | 'pending' | 'active' | 'rejected'
function stateOf(status: string | null | undefined): State {
  if (status === 'active') return 'active'
  if (status === 'rejected') return 'rejected'
  if (status) return 'pending'   // pending or any not-yet-active state
  return 'none'
}

// GET — application state for the logged-in Google account, so /apply can show
// the right screen (form vs. "waiting for approval" vs. redirect to dashboard).
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })
  const aff = await getAffiliateByEmail(user.email)
  return NextResponse.json({ state: stateOf(aff?.status), email: user.email, name: aff?.name ?? null })
}

// POST — submit an affiliate application. Creates a PENDING record tied to the
// verified Google email; an admin approves it in the console before it's active.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const existing = await getAffiliateByEmail(user.email)
  if (existing) {
    // Already known — surface current state instead of creating a duplicate.
    return NextResponse.json({ ok: true, state: stateOf(existing.status) })
  }

  const b = await req.json().catch(() => ({}))
  const name = String(b.name ?? '').trim()
  const contact = b.contact ? String(b.contact).trim() : null
  if (name.length < 2) return NextResponse.json({ error: 'กรุณากรอกชื่อ-นามสกุล' }, { status: 400 })

  try {
    const aff = await applyAsAffiliate({ email: user.email, name, contact })
    return NextResponse.json({ ok: true, state: stateOf(aff.status) }, { status: 201 })
  } catch (err) {
    console.error('[affiliate-apply]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'สมัครไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
