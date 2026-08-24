export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.LINE_CLIENT_ID
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (!clientId || !appUrl) {
    return NextResponse.json({ error: 'LINE_CLIENT_ID or NEXT_PUBLIC_APP_URL not configured' }, { status: 503 })
  }

  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  `${appUrl}/api/auth/line/callback`,
    state,
    scope:         'profile openid',
  })

  const res = NextResponse.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`)
  // Store state in cookie for CSRF validation
  res.cookies.set('line_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 300, path: '/' })
  return res
}
