export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/api-auth'
import { getConfig, setConfig } from '@/lib/store'

// Per-store onboarding-checklist dismissal, persisted in app_config so it sticks
// across devices/reinstalls (localStorage alone would re-show the card on every
// new tablet). Any authenticated staff member may read or dismiss it.
const K_ONBOARDING = 'onboarding_dismissed'

export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id
  if (!storeId) return NextResponse.json({ dismissed: false })
  const v = await getConfig(K_ONBOARDING, storeId)
  return NextResponse.json({ dismissed: v === '1' })
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const storeId = gate.profile.store_id
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  await setConfig(K_ONBOARDING, '1', storeId)
  return NextResponse.json({ ok: true })
}
