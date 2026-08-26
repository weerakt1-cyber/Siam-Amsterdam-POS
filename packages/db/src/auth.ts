// @baze/db — platform super-admin gate (shared by apps/admin, and previously
// apps/pos). Identified by an email allow-list in SUPER_ADMIN_EMAILS; the email
// comes from the verified Supabase JWT, never the client, so it can't be spoofed.
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { supabase } from './supabase'
import { getAffiliateByEmail, type Affiliate } from './affiliates'

// Verifies the caller's Supabase JWT and maps the email to an active affiliate.
// Used by the affiliate portal (apps/affiliate) so a broker sees only their own
// earnings. 401 when unauthenticated, 403 when the email isn't a known affiliate.
export async function requireAffiliate(
  req: NextRequest,
): Promise<{ ok: true; affiliate: Affiliate } | { ok: false; res: NextResponse }> {
  const authz = req.headers.get('authorization') ?? ''
  const token = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : ''
  if (!token) {
    return { ok: false, res: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  const { data, error } = await supabase.auth.getUser(token)
  const email = data?.user?.email?.toLowerCase() ?? ''
  if (error || !email) {
    return { ok: false, res: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  const affiliate = await getAffiliateByEmail(email)
  if (!affiliate || affiliate.status !== 'active') {
    return { ok: false, res: NextResponse.json({ error: 'ไม่พบบัญชีนายหน้าสำหรับอีเมลนี้' }, { status: 403 }) }
  }
  return { ok: true, affiliate }
}

function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

export async function requireSuperAdmin(
  req: NextRequest,
): Promise<{ ok: true; email: string } | { ok: false; res: NextResponse }> {
  const authz = req.headers.get('authorization') ?? ''
  const token = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : ''
  if (!token) {
    return { ok: false, res: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  const { data, error } = await supabase.auth.getUser(token)
  const email = data?.user?.email?.toLowerCase() ?? ''
  if (error || !email) {
    return { ok: false, res: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  if (!superAdminEmails().includes(email)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, email }
}
