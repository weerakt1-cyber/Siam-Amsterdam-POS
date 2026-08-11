import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole } from '@/lib/api-auth'

// Pending signups aren't assigned to a store yet (they get one on approval), so
// this list is global to admins — an admin approves a pending user into their
// own store. Gated to admins (previously unauthenticated).
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ['admin'])
  if (!gate.ok) return gate.res

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, color, requested_role, status, created_at, provider')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch auth user emails for display
  const ids = (data ?? []).map((p: { id: string }) => p.id)
  const emails: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: { users } } = await supabase.auth.admin.listUsers()
    for (const u of users ?? []) {
      if (ids.includes(u.id)) emails[u.id] = u.email ?? u.phone ?? ''
    }
  }

  const result = (data ?? []).map((p: { id: string; name: string; color: string; requested_role: string; status: string; created_at: string; provider: string }) => ({
    ...p,
    email: emails[p.id] ?? '',
  }))

  return NextResponse.json({ pending: result })
}
