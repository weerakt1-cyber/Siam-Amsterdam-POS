'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

// Step 2 of password reset: the recovery link from the email lands here. Supabase
// parses the recovery token from the URL on load and establishes a short-lived
// recovery session (emitting a PASSWORD_RECOVERY auth event). We then let the
// user set a new password via auth.updateUser, and send them into the POS.
//
// States:
//   checking → verifying the recovery link established a session
//   ready    → show the new-password form
//   invalid  → no recovery session (link expired / opened directly)
//   done     → password changed, redirecting
type State = 'checking' | 'ready' | 'invalid' | 'done'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [state, setState]       = useState<State>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    const sb = getSupabaseBrowser()
    // The client parses the recovery token from the URL hash on init; listen for
    // the resulting event, and also check for an already-established session in
    // case it was parsed before this listener attached.
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setState('ready')
    })
    sb.auth.getSession().then(({ data: { session } }) => {
      setState(s => (s === 'ready' ? s : session ? 'ready' : 'invalid'))
    })
    return () => subscription.unsubscribe()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('รหัสผ่านอย่างน้อย 6 ตัวอักษร'); return }
    if (password !== confirm) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return }
    setBusy(true); setError('')
    const { error: err } = await getSupabaseBrowser().auth.updateUser({ password })
    if (err) { setError(err.message); setBusy(false); return }
    setState('done')
    // The recovery session is now a normal session — go straight into the app;
    // AppAuthGuard resolves the profile/store from there.
    setTimeout(() => router.replace('/pos'), 1200)
  }

  const inputCls = 'w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition'

  if (state === 'checking') return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
    </div>
  )

  if (state === 'done') return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-5xl mb-3">✅</p>
        <p className="text-white font-black text-lg">ตั้งรหัสผ่านใหม่แล้ว</p>
        <p className="text-gray-400 text-sm mt-1">กำลังเข้าสู่ระบบ…</p>
      </div>
    </div>
  )

  if (state === 'invalid') return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center bg-gray-900 border border-gray-800 rounded-2xl p-8">
        <p className="text-5xl mb-3">⚠️</p>
        <p className="text-white font-black text-lg">ลิงก์หมดอายุหรือไม่ถูกต้อง</p>
        <p className="text-gray-400 text-sm mt-2">กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง</p>
        <a href="/auth/reset" className="mt-5 inline-block text-amber-400 font-semibold text-sm">ขอลิงก์ใหม่ →</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">🔒 ตั้งรหัสผ่านใหม่</h1>
          <p className="text-gray-400 text-sm mt-1">กรอกรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>
        </div>

        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">รหัสผ่านใหม่</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร" className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">ยืนยันรหัสผ่านใหม่</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="พิมพ์รหัสผ่านอีกครั้ง" className={inputCls} />
            </div>
            <button type="submit" disabled={busy}
              className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
              {busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </form>
          {error && <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        </div>
      </div>
    </div>
  )
}
