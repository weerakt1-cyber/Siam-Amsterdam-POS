'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, fetchProfile } from '@/lib/supabase-browser'

const ROLE_COLORS: Record<string, string> = {
  admin:      '#f59e0b',
  manager:    '#3b82f6',
  bartender:  '#8b5cf6',
  staff:      '#10b981',
}

export default function AuthPage() {
  const router  = useRouter()
  const [loading, setLoading] = useState<'google' | 'line' | null>(null)
  const [error,   setError]   = useState('')
  const [checking, setChecking] = useState(true)

  // If already logged in → skip to POS
  useEffect(() => {
    const sb = getSupabaseBrowser()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const profile = await fetchProfile(session.user.id)
        if (!profile) router.replace('/auth/setup')
        else if (profile.status !== 'approved') router.replace('/auth/status')
        else router.replace('/pos')
      } else {
        setChecking(false)
      }
    })
  }, [router])

  async function loginGoogle() {
    setLoading('google')
    setError('')
    const sb = getSupabaseBrowser()
    const { error: e } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
    if (e) { setError(e.message); setLoading(null) }
  }

  function loginLine() {
    setLoading('line')
    setError('')
    const state = Math.random().toString(36).slice(2)
    sessionStorage.setItem('line_oauth_state', state)
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     process.env.NEXT_PUBLIC_LINE_CLIENT_ID ?? '',
      redirect_uri:  `${location.origin}/api/auth/line/callback`,
      state,
      scope:         'profile openid',
    })
    location.href = `https://access.line.me/oauth2/v2.1/authorize?${params}`
  }

  if (checking) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center overflow-y-auto">
      {/* Background dots */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 w-full max-w-sm py-12">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Bar logo" className="w-24 h-24 object-contain" />
          <div className="text-center">
            <h1 className="text-2xl font-black text-white tracking-tight">BAZE POS</h1>
            <p className="text-sm text-gray-500 mt-1">Bar POS System</p>
          </div>
        </div>

        {/* Login card */}
        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          <div className="text-center mb-1">
            <p className="text-white font-semibold text-lg">เข้าสู่ระบบ</p>
            <p className="text-gray-400 text-sm mt-1">เลือกวิธีเข้าสู่ระบบ</p>
          </div>

          {/* Google */}
          <button
            onClick={loginGoogle}
            disabled={!!loading}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-100 disabled:opacity-50 rounded-xl text-gray-900 font-semibold text-sm transition-all active:scale-95"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.7 39.6 16.3 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.8l6.2 5.2C41.1 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
            </svg>
            {loading === 'google' ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย Google'}
          </button>

          {/* LINE */}
          <button
            onClick={loginLine}
            disabled={!!loading}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-[#06C755] hover:bg-[#05b34c] disabled:opacity-50 rounded-xl text-white font-semibold text-sm transition-all active:scale-95"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="white">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.105.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
            {loading === 'line' ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย LINE'}
          </button>

          {error && (
            <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>
          )}
        </div>

        {/* Role preview chips */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-600">สำหรับทีมงานบาร์</p>
          <div className="flex gap-2 flex-wrap justify-center">
            {Object.entries(ROLE_COLORS).map(([role, color]) => (
              <span
                key={role}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                style={{ background: color + '20', color }}
              >
                {role}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
