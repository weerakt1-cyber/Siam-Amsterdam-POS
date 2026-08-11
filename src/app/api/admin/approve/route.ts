import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole } from '@/lib/api-auth'

type ApproveBody = {
  userId:  string
  action:  'approve' | 'reject'
  role?:   string
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ['admin'])
  if (!gate.ok) return gate.res

  const body: ApproveBody = await req.json()
  const { userId, action, role } = body

  if (!userId || !action) {
    return NextResponse.json({ error: 'userId and action required' }, { status: 400 })
  }

  if (action === 'approve') {
    if (!role) return NextResponse.json({ error: 'role required for approval' }, { status: 400 })
    // Approving brings the user INTO the approving admin's store (manual
    // assignment) — this is how a 2nd store's staff get scoped to that store.
    const update: Record<string, unknown> = { status: 'approved', role }
    if (gate.profile.store_id) update.store_id = gate.profile.store_id
    const { error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'rejected' })
      .eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'invalid action' }, { status: 400 })
}
