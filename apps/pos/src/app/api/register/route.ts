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
    // Optional promo contact channel (LINE / Telegram / WhatsApp + handle).
    // Stored two ways: structured contactChannel + contactId (for broadcasts by
    // channel) and a readable "Channel: handle" string in `contact` (display /
    // search on the Members screen). Both length-capped.
    const CHANNELS = ['line', 'telegram', 'whatsapp'] as const
    const contactChannel = CHANNELS.includes(body.contactChannel)
      ? (body.contactChannel as (typeof CHANNELS)[number])
      : undefined
    const contactId = contactChannel && typeof body.contactId === 'string' && body.contactId.trim()
      ? body.contactId.trim().slice(0, 120)
      : undefined
    // Drop a lone channel with no handle — nothing to reach them on.
    const channel = contactId ? contactChannel : undefined
    const CHANNEL_LABEL: Record<string, string> = { line: 'LINE', telegram: 'Telegram', whatsapp: 'WhatsApp' }
    const contact = channel && contactId ? `${CHANNEL_LABEL[channel]}: ${contactId}` : undefined

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
        contactChannel: channel,
        contactId,
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
