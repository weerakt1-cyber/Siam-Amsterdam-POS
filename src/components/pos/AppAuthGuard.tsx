'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, fetchProfile } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/pos-auth'

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
        router.replace('/auth/setup'); return
      }
      if (profile.status === 'pending' || profile.status === 'rejected') {
        router.replace('/auth/status'); return
      }
      // Approved — role must be set
      if (!profile.role) {
        router.replace('/auth/status'); return
      }

      if (!user) {
        login({ id: profile.id, name: profile.name, role: profile.role, color: profile.color })
      }
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
        <img src="/logo.png" alt="Bar logo" className="w-20 h-20 object-contain opacity-60" />
        <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    </div>
  )
}

function UnauthScreen() {
  const router = useRouter()
  return (
    <div className="fixed inset-0 z-[200] bg-gray-950 flex flex-col items-center justify-center gap-6">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />
      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Bar logo" className="w-20 h-20 object-contain" />
        <p className="text-gray-400 text-sm">กรุณาเข้าสู่ระบบก่อนใช้งาน</p>
        <button
          onClick={() => router.replace('/auth')}
          className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl transition-all active:scale-95"
        >
          เข้าสู่ระบบ
        </button>
      </div>
    </div>
  )
}
