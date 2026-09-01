'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, fetchProfile, authedFetch, provisionFromSession } from "@/lib/supabase-browser"
import { useAuth } from '@/lib/pos-auth'
import { usePosLang } from '@/lib/pos-i18n'
import { SEEN_POS_KEY } from '@/components/LandingGate'

type State = 'checking' | 'ready' | 'unauthenticated'

export default function AppAuthGuard({ children }: { children: React.ReactNode }) {
  const router         = useRouter()
  const { login, user} = useAuth()
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    const sb = getSupabaseBrowser()

    async function check() {
      const { data: { session } } = await sb.auth.getSession()

      if (!session) { setState('unauthenticated'); return }

      const profile = await fetchProfile(session.user.id)

      if (!profile) {
        // Reached /pos with a session but no profile: provision a fresh signup's
        // store from its metadata (idempotent), else route to the setup/approval
        // flow. A provisioned owner continues straight into the POS below.
        const outcome = await provisionFromSession()
        if (outcome.kind === 'pending') { router.replace('/auth/status'); return }
        if (outcome.kind !== 'provisioned') { router.replace('/auth/setup'); return }
        // provisioned → re-fetch the freshly-created profile and continue.
        const fresh = await fetchProfile(session.user.id)
        if (!fresh) { router.replace('/auth/setup'); return }
        try { login({ id: fresh.id, name: fresh.name, role: fresh.role!, color: fresh.color }) } catch {}
        try { localStorage.setItem(SEEN_POS_KEY, '1') } catch {}
        setState('ready'); return
      }
      if (profile.status === 'pending' || profile.status === 'rejected') {
        router.replace('/auth/status'); return
      }
      // Approved — role must be set
      if (!profile.role) {
        router.replace('/auth/status'); return
      }

      // The Google/email login only gates device access. The POS operating
      // identity is a real staff (PIN) account — so we do NOT auto-set the
      // profile as the active user (that made the owner's name, e.g. "Fluke",
      // leak in as the POS user). StaffGate will prompt for a staff PIN.
      // Exception — bootstrap: if there are no staff accounts yet, let the
      // authenticated admin operate so they can reach Settings → Users. Also
      // bootstrap on a fetch error, to avoid locking the tablet out.
      if (!user) {
        try {
          const r = await authedFetch('/api/users')
          const d = r.ok ? await r.json() : null
          const staff = Array.isArray(d?.users) ? d.users : []
          if (staff.length === 0) {
            login({ id: profile.id, name: profile.name, role: profile.role, color: profile.color })
          }
        } catch {
          login({ id: profile.id, name: profile.name, role: profile.role, color: profile.color })
        }
      }
      // Remember this device reached the POS, so the public landing is skipped
      // on the next app open (LandingGate reads this flag).
      try { localStorage.setItem(SEEN_POS_KEY, '1') } catch {}
      setState('ready')
    }

    check()

    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setState('unauthenticated')
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state === 'checking')       return <LoadingSkeleton />
  if (state === 'unauthenticated') return <UnauthScreen />
  return <>{children}</>
}

function LoadingSkeleton() {
  return (
    <div className="fixed inset-0 z-[200] bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="PLOEN POS" className="w-20 h-20 object-contain opacity-60" />
        <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    </div>
  )
}

function UnauthScreen() {
  const router = useRouter()
  const { lang } = usePosLang()
  const L = (en: string, th: string) => (lang === 'en' ? en : th)
  return (
    <div className="fixed inset-0 z-[200] bg-gray-950 flex flex-col items-center justify-center gap-6">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />
      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="PLOEN POS" className="w-20 h-20 object-contain" />
        <p className="text-gray-400 text-sm">{L('Please sign in to continue', 'กรุณาเข้าสู่ระบบก่อนใช้งาน')}</p>
        <button
          onClick={() => router.replace('/auth')}
          className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl transition-all active:scale-95"
        >
          {L('Sign in', 'เข้าสู่ระบบ')}
        </button>
      </div>
    </div>
  )
}
