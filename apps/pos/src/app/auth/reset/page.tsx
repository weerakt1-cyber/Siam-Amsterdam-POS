'use client'

import { useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

// Step 1 of password reset: the user enters their email and we send a recovery
// link (Supabase auth.resetPasswordForEmail). The link lands on
// /auth/update-password, where they set a new password.
//
// We always show the same "check your email" screen on success — never reveal
// whether an email is registered.
export default function ResetRequestPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy]   = useState(false)
  const [sent, setSent]   = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('กรุณากรอกอีเมลให้ถูกต้อง'); return }
    setBusy(true); setError('')
    const { error: err } = await getSupabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/update-password`,
    })
    setBusy(false)
    // Show success regardless (don't leak which emails exist); only surface a
    // real transport error (e.g. rate limit / misconfigured SMTP).
    if (err && !/user not found|not found/i.test(err.message)) { setError(err.message); return }
    setSent(true)
  }

  const inputCls = 'w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition'

  if (sent) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center bg-gray-900 border border-gray-800 rounded-2xl p-8">
        <p className="text-5xl mb-3">📧</p>
        <p className="text-white font-black text-lg">ส่งลิงก์รีเซ็ตแล้ว</p>
        <p className="text-gray-400 text-sm mt-2 leading-relaxed">
          ถ้ามีบัญชีสำหรับ<br /><span className="text-amber-400 font-semibold">{email.trim()}</span><br />
          เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว
        </p>
        <p className="text-gray-600 text-[11px] mt-4">ไม่พบอีเมล? ลองเช็คในกล่อง Spam / Junk</p>
        <a href="/auth" className="mt-5 inline-block text-amber-400 font-semibold text-sm">← กลับไปเข้าสู่ระบบ</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">🔑 ลืมรหัสผ่าน</h1>
          <p className="text-gray-400 text-sm mt-1">กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p>
        </div>

        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">อีเมล</label>
              <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className={inputCls} />
            </div>
            <button type="submit" disabled={busy}
              className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
              {busy ? 'กำลังส่ง…' : 'ส่งลิงก์รีเซ็ต'}
            </button>
            <a href="/auth" className="text-center text-xs text-gray-500 hover:text-amber-400 transition">
              ← กลับไปเข้าสู่ระบบ
            </a>
          </form>
          {error && <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        </div>
      </div>
    </div>
  )
}
