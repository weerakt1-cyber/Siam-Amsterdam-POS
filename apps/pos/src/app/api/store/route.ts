export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'

// Returns the caller's store { id, name, slug } — the POS settings page uses the
// slug to build the customer QR link (/order/{slug}/{tableNo}).
export async function GET(req: NextRequest) {
  const storeId = await resolveStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
  const store = await getStore(storeId)
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  return NextResponse.json({ store })
}
