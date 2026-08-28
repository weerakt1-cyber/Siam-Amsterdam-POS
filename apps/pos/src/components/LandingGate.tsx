'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

// Set once the app has been successfully entered (AppAuthGuard → ready), so a
// device that has been set up before skips the public landing on the next open.
export const SEEN_POS_KEY = 'baze_seen_pos'

// Wraps the public marketing landing. A first-time visitor sees it; a returning
// user — one who already has an account and has used the app on this device —
// is sent straight to /pos (→ the staff PIN screen) instead. The marketing is
// never rendered while we check, so returning staff never flash past it.
//
// `disabled` keeps the landing visible regardless (used for affiliate ?ref=
// links, whose whole purpose is to show the signup landing).
export default function LandingGate({
  disabled,
  children,
}: {
  disabled?: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (disabled) { setReady(true); return }

    // Fast path: this device has entered the POS before → go straight there,
    // even if the Supabase session has since expired (AppAuthGuard will then
    // prompt a re-login rather than showing marketing again).
    let seen = false
    try { seen = localStorage.getItem(SEEN_POS_KEY) === '1' } catch {}
    if (seen) { router.replace('/pos'); return }

    // Otherwise fall back to a live session check — covers a fresh device that
    // is nonetheless already logged in.
    let alive = true
    getSupabaseBrowser().auth.getSession()
      .then(({ data: { session } }) => {
        if (!alive) return
        if (session) router.replace('/pos')
        else setReady(true)
      })
      .catch(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [disabled, router])

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    )
  }
  return <>{children}</>
}
