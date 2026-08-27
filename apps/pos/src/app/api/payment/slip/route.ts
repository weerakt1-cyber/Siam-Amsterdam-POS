export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, resolveStaffStoreId } from '@/lib/api-auth'
import { getPaymentSlipsByOrder, signedOrderSlipUrl } from '@/lib/store'

// GET /api/payment/slip?orderId=… — staff only. Lists slips for an order with
// short-lived signed image URLs (never the raw storage path or a public URL).
export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.res
  const storeId = await resolveStaffStoreId(req)
  if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })

  const orderId = req.nextUrl.searchParams.get('orderId')?.trim()
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  const slips = await getPaymentSlipsByOrder(orderId, storeId)
  const withUrls = await Promise.all(slips.map(async s => ({
    ...s,
    imageUrl: undefined,                                        // drop the raw path
    imageSignedUrl: s.imageUrl ? await signedOrderSlipUrl(s.imageUrl) : null,
  })))
  return NextResponse.json({ slips: withUrls })
}
