'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

export default function PartnerAuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('กำลังยืนยันตัวตน…')

  useEffect(() => {
    getSupabaseBrowser().auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        setStatus('ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่')
        setTimeout(() => router.replace('/auth'), 2000)
      } else {
        router.replace('/')
      }
    })
  }, [router])

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      <p className="text-gray-400 text-sm">{status}</p>
    </div>
  )
}
