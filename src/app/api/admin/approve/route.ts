import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

type ApproveBody = {
  userId:  string
  action:  'approve' | 'reject'
  role?:   string
}

export async function POST(req: NextRequest) {
  const body: ApproveBody = await req.json()
  const { userId, action, role } = body

  if (!userId || !action) {
    return NextResponse.json({ error: 'userId and action required' }, { status: 400 })
  }

  if (action === 'approve') {
    if (!role) return NextResponse.json({ error: 'role required for approval' }, { status: 400 })
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'approved', role })
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
