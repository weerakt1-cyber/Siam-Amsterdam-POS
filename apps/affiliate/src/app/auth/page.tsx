'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

export default function PartnerAuthPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<'google' | 'password' | null>(null)
  const [error, setError]     = useState('')
  const [checking, setChecking] = useState(true)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    getSupabaseBrowser().auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/')
      else setChecking(false)
    })
  }, [router])

  async function loginPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading('password'); setError('')
    const { data, error: err } = await getSupabaseBrowser().auth.signInWithPassword({ email: email.trim(), password })
    if (err || !data.session) { setError(err?.message ?? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'); setLoading(null); return }
    router.replace('/')
  }

  async function loginGoogle() {
    setLoading('google'); setError('')
    const { error: e } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
    if (e) { setError(e.message); setLoading(null) }
  }

  if (checking) {
    return <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
    </div>
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">🤝 BAZE PARTNER</h1>
          <p className="text-gray-400 text-sm mt-1">เข้าสู่ระบบเพื่อดูรายได้นายหน้าของคุณ</p>
        </div>

        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          <button onClick={loginGoogle} disabled={!!loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-100 disabled:opacity-50 rounded-xl text-gray-900 font-semibold text-sm transition-all active:scale-95">
            <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.7 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.8l6.2 5.2C41.1 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
            {loading === 'google' ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย Google'}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-[10px] text-gray-600 uppercase tracking-widest">หรือ</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          <form onSubmit={loginPassword} className="flex flex-col gap-3">
            <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="อีเมล / Email"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="รหัสผ่าน / Password"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition" />
            <button type="submit" disabled={!!loading || !email.trim() || !password}
              className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-bold text-sm transition-all active:scale-95">
              {loading === 'password' ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {error && <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        </div>
        <button onClick={() => router.push('/apply')} className="text-[12px] text-amber-500 hover:text-amber-400 transition text-center font-semibold">
          ยังไม่เป็นนายหน้า? · สมัครที่นี่
        </button>
      </div>
    </div>
  )
}
