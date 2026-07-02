'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, fetchProfile } from '@/lib/supabase-browser'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('กำลังยืนยันตัวตน…')

  useEffect(() => {
    const sb = getSupabaseBrowser()

    async function handle() {
      // Supabase handles hash params automatically on getSession()
      const { data: { session }, error } = await sb.auth.getSession()

      if (error || !session) {
        setStatus('ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่')
        setTimeout(() => router.replace('/auth'), 2000)
        return
      }

      const profile = await fetchProfile(session.user.id)
      if (!profile) {
        router.replace('/auth/setup')
      } else if (profile.status === 'pending' || profile.status === 'rejected') {
        router.replace('/auth/status')
      } else {
        router.replace('/pos')
      }
    }

    handle()
  }, [router])

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      <p className="text-gray-400 text-sm">{status}</p>
    </div>
  )
}
