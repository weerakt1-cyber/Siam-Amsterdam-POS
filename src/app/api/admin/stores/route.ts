export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { listStoresAdmin, createStoreAdmin, findStoreBySlug } from '@/lib/store'

// GET — every store + its subscription/billing (super-admin only).
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  return NextResponse.json({ stores: await listStoresAdmin() })
}

// POST — provision a new store (the in-UI equivalent of provision-store.mjs;
// owner-linking still happens via the script or by hand for now).
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  try {
    const b = await req.json()
    const name = String(b.name ?? '').trim()
    const slug = String(b.slug ?? '').trim()
    if (!name || !slug) return NextResponse.json({ error: 'name and slug are required' }, { status: 400 })
    if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: 'slug must be lowercase letters, digits, hyphens' }, { status: 400 })
    if (await findStoreBySlug(slug)) return NextResponse.json({ error: 'slug already exists' }, { status: 409 })

    const store = await createStoreAdmin({
      name, slug,
      plan:        b.plan ? String(b.plan) : undefined,
      cycle:       b.cycle ? String(b.cycle) : null,
      until:       b.until ? String(b.until) : null,
      lockedPrice: b.lockedPrice != null ? Number(b.lockedPrice) : null,
    })
    return NextResponse.json({ store }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
