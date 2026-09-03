export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getMemberByPhone, createMember } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'

// Public member self-registration. The customer opens /register/{store} (no
// login) and this creates a member scoped to that store. The store rides in as
// the x-store-id header (same mechanism as the QR order page). De-duplicates by
// phone so registering twice doesn't create a second card. Consent is required
// and its timestamp is recorded (PDPA).
export async function POST(req: NextRequest) {
  try {
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

    const body = await req.json()
    const name  = typeof body.name === 'string' ? body.name.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const birthday = typeof body.birthday === 'string' && body.birthday ? body.birthday : undefined
    // Optional promo contact channel (LINE / Telegram / WhatsApp + handle),
    // stored as a readable "Channel: handle" string in the member's contact
    // field so staff can reach out with promotions/news. Length-capped.
    const contact = typeof body.contact === 'string' && body.contact.trim()
      ? body.contact.trim().slice(0, 120)
      : undefined

    if (!name)  return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    if (body.consent !== true) return NextResponse.json({ error: 'consent is required' }, { status: 400 })

    // Already a member with this phone? Return it rather than duplicating.
    const existing = await getMemberByPhone(phone, storeId)
    if (existing) {
      return NextResponse.json({ member: { id: existing.id, name: existing.name }, alreadyMember: true })
    }

    const member = await createMember(
      {
        name,
        phone,
        birthday,
        contact,
        points:         0,
        lifetimePoints: 0,
        tier:           'bronze',
        stamps:         0,
        stampsEarned:   0,
      },
      storeId,
      { source: 'self-register', consentAt: new Date().toISOString() },
    )

    // Return only the minimum — the public caller doesn't need the full record.
    return NextResponse.json({ member: { id: member.id, name: member.name }, alreadyMember: false }, { status: 201 })
  } catch (err) {
    console.error('[register] POST', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }
}
