import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { credential } = body as { credential?: string }

  if (!credential) {
    return NextResponse.json({ error: 'credential required' }, { status: 400 })
  }

  try {
    const r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    )
    const data = await r.json()

    if (!r.ok || data.error) {
      return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    }

    return NextResponse.json({
      profile: {
        sub:     data.sub     ?? '',
        email:   data.email   ?? '',
        name:    data.name    ?? data.email ?? 'Owner',
        picture: data.picture ?? '',
      },
    })
  } catch {
    return NextResponse.json({ error: 'verification failed' }, { status: 500 })
  }
}
