export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(req: NextRequest) {
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const clientId   = process.env.LINE_CLIENT_ID
  const clientSec  = process.env.LINE_CLIENT_SECRET

  if (!clientId || !clientSec || !appUrl) {
    return NextResponse.redirect(`${appUrl}/auth?error=line_not_configured`)
  }

  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')

  // CSRF check
  const storedState = req.cookies.get('line_oauth_state')?.value
  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${appUrl}/auth?error=invalid_state`)
  }

  // ── 1. Exchange code for access token ──────────────────────────────────────
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  `${appUrl}/api/auth/line/callback`,
      client_id:     clientId,
      client_secret: clientSec,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${appUrl}/auth?error=line_token_failed`)
  }

  const { access_token } = await tokenRes.json() as { access_token: string }

  // ── 2. Get LINE profile ─────────────────────────────────────────────────────
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  if (!profileRes.ok) {
    return NextResponse.redirect(`${appUrl}/auth?error=line_profile_failed`)
  }
  const lineProfile = await profileRes.json() as {
    userId:       string
    displayName:  string
    pictureUrl?:  string
  }

  // ── 3. Create or find Supabase user ─────────────────────────────────────────
  // Synthetic email based on LINE user ID — stable per user
  const syntheticEmail = `line_${lineProfile.userId}@siam.local`

  // Try to sign in via magic link (creates user on first attempt)
  let userId: string | undefined

  // Check if user already exists
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers()
  const found = existing.users.find(u => u.email === syntheticEmail)

  if (found) {
    userId = found.id
    // Update metadata
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { name: lineProfile.displayName, picture: lineProfile.pictureUrl, provider: 'line', line_id: lineProfile.userId },
    })
  } else {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email:         syntheticEmail,
      email_confirm: true,
      user_metadata: { name: lineProfile.displayName, picture: lineProfile.pictureUrl, provider: 'line', line_id: lineProfile.userId },
    })
    if (createErr || !created.user) {
      return NextResponse.redirect(`${appUrl}/auth?error=user_create_failed`)
    }
    userId = created.user.id
  }

  // ── 4. Generate magic link → client visits it → Supabase sets session ──────
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type:    'magiclink',
    email:   syntheticEmail,
    options: { redirectTo: `${appUrl}/auth/callback` },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.redirect(`${appUrl}/auth?error=link_failed`)
  }

  const res = NextResponse.redirect(linkData.properties.action_link)
  // Clear state cookie
  res.cookies.delete('line_oauth_state')
  return res
}
