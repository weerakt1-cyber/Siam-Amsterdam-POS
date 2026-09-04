export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreId } from '@/lib/api-auth'
import { getLineOaSettings } from '@/lib/line-oa'

// Public — the signup page (no login, store rides in via x-store-id) shows an
// "add our LINE OA" button/QR. Returns ONLY the public basic id, and only when
// the OA is enabled and has a basic id set. Never exposes the access token.
export async function GET(req: NextRequest) {
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ basicId: null })
  const s = await getLineOaSettings(storeId)
  const basicId = s.enabled && s.basicId ? s.basicId : null
  return NextResponse.json({ basicId })
}
