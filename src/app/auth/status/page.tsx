'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, fetchProfile } from '@/lib/supabase-browser'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', bartender: 'Bartender', staff: 'Staff / Cashier',
}
const ROLE_EMOJI: Record<string, string> = {
  admin: '👑', manager: '📊', bartender: '🍹', staff: '🙋',
}
const ROLE_HOME: Record<string, string> = {
  admin: '/pos/analytics', manager: '/pos/analytics', bartender: '/pos', staff: '/pos',
}

export default function AuthStatusPage() {
  const router = useRouter()
  const [requestedRole, setRequestedRole] = useState<string | null>(null)
  const [status,        setStatus]        = useState<string>('pending')
  const [userId,        setUserId]        = useState<string | null>(null)
  const [dots,          setDots]          = useState('.')

  // Animated dots
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 600)
    return () => clearInterval(id)
  }, [])

  const checkStatus = useCallback(async (uid: string) => {
    const profile = await fetchProfile(uid)
    if (!profile) { router.replace('/auth/setup'); return }
    setRequestedRole(profile.requested_role ?? null)
    setStatus(profile.status)
    if (profile.status === 'approved' && profile.role) {
      // Approved — redirect to role-based home
      router.replace(ROLE_HOME[profile.role] ?? '/pos')
    }
  }, [router])

  useEffect(() => {
    const sb = getSupabaseBrowser()
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }
      setUserId(session.user.id)
      checkStatus(session.user.id)
    })
  }, [router, checkStatus])

  // Poll every 10 seconds for approval
  useEffect(() => {
    if (!userId || status === 'approved') return
    const id = setInterval(() => checkStatus(userId), 10_000)
    return () => clearInterval(id)
  }, [userId, status, checkStatus])

  async function handleLogout() {
    await getSupabaseBrowser().auth.signOut()
    router.replace('/auth')
  }

  if (status === 'rejected') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-5xl">🚫</div>
        <div className="text-center">
          <h2 className="text-xl font-black text-white">คำขอถูกปฏิเสธ</h2>
          <p className="text-gray-400 text-sm mt-2">ติดต่อ Admin เพื่อขอสิทธิ์เข้าใช้งาน</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-xl transition-all"
        >
          ออกจากระบบ
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-8 px-6">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-sm">

        {/* Pulse animation */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-4xl">
            {requestedRole ? ROLE_EMOJI[requestedRole] ?? '⏳' : '⏳'}
          </div>
          <div className="absolute inset-0 rounded-full bg-amber-500/5 animate-ping" />
        </div>

        {/* Status text */}
        <div className="text-center">
          <h2 className="text-xl font-black text-white">รอการอนุมัติ{dots}</h2>
          <p className="text-gray-400 text-sm mt-2">Admin กำลังตรวจสอบคำขอของคุณ</p>
        </div>

        {/* Request card */}
        {requestedRole && (
          <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl flex-shrink-0">
              {ROLE_EMOJI[requestedRole]}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">ตำแหน่งที่ขอ</p>
              <p className="text-white font-bold">{ROLE_LABELS[requestedRole] ?? requestedRole}</p>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-600 text-center">ระบบจะอัปเดตอัตโนมัติเมื่อ Admin อนุมัติ</p>

        <button
          onClick={handleLogout}
          className="text-xs text-gray-600 hover:text-gray-400 transition underline underline-offset-2"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}
