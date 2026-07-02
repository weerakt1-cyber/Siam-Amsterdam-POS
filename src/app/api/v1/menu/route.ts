export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { getMenu } from '@/lib/store'

export async function GET(req: NextRequest) {
  const key = await validateApiKey(req)
  if (!key) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const menu = await getMenu()
  return NextResponse.json({ menu: menu.filter(m => m.available) })
}
