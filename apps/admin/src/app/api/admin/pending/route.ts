export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, listPendingProfiles } from '@baze/db'

// GET — app accounts (Google/email logins) awaiting approval, platform-wide.
// Super-admin only: the operator decides which store each account joins.
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.res
  return NextResponse.json({ pending: await listPendingProfiles() })
}
