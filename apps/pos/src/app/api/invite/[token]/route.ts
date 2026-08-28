export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { findStoreByInviteToken } from '@/lib/store'

// Public — the signup page resolves an invite token to its store so it can show
// "join <store>" without the staff typing anything. Only the store name/slug is
// exposed, and only for a valid token.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const store = await findStoreByInviteToken(token)
  if (!store) return NextResponse.json({ error: 'invalid' }, { status: 404 })
  return NextResponse.json({ store: { name: store.name, slug: store.slug } })
}
