import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
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
