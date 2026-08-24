export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/store'
import { resolveStoreId } from '@/lib/api-auth'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OmiseLib = require('omise')

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chargeId: string }> },
) {
  try {
    const { chargeId } = await params
    const storeId = await resolveStoreId(req)
    if (!storeId) return NextResponse.json({ error: 'Store context required' }, { status: 400 })
    const secretKey = (await getConfig('omise_secret_key', storeId)) || process.env.OMISE_SECRET_KEY || ''
    const omise = OmiseLib({ secretKey })
    const charge = await omise.charges.retrieve(chargeId)
    return NextResponse.json({ status: charge.status, paid: charge.paid })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
