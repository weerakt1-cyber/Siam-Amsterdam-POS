export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { listPaymentsAdmin, signedSlipUrl } from '@/lib/store'

// GET — payments across all stores (super-admin). ?status=pending to filter.
// Each slip path is turned into a short-lived signed URL for viewing.
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  const payments = await listPaymentsAdmin(status && ['pending', 'confirmed', 'rejected'].includes(status) ? status : undefined)

  const withUrls = await Promise.all(payments.map(async p => ({
    ...p,
    slipSignedUrl: p.slipUrl ? await signedSlipUrl(p.slipUrl).catch(() => null) : null,
  })))
  return NextResponse.json({ payments: withUrls })
}
