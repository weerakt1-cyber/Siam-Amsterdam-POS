'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, authedFetch } from '@/lib/supabase-browser'

type State = 'none' | 'pending' | 'active' | 'rejected'

export default function ApplyPage() {
  const router = useRouter()
  const [ready, setReady]     = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [email, setEmail]     = useState('')
  const [state, setState]     = useState<State>('none')
  const [name, setName]       = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  const check = useCallback(async () => {
    const r = await authedFetch('/api/apply')
    if (!r.ok) { setReady(true); return }
    const d = await r.json()
    setEmail(d.email ?? '')
    setState((d.state as State) ?? 'none')
    if (d.state === 'active') { router.replace('/'); return }  // already a partner → dashboard
    setReady(true)
  }, [router])

  useEffect(() => {
    getSupabaseBrowser().auth.getSession().then(({ data: { session } }) => {
      if (!session) { setSignedIn(false); setReady(true); return }
      setSignedIn(true); check()
    })
  }, [check])

  async function loginGoogle() {
    setError('')
    const { error: e } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/apply` },
    })
    if (e) setError(e.message)
  }

  async function submit() {
    if (name.trim().length < 2) { setError('กรุณากรอกชื่อ-นามสกุล'); return }
    setBusy(true); setError('')
    try {
      const r = await authedFetch('/api/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), contact: contact.trim() || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'สมัครไม่สำเร็จ'); setBusy(false); return }
      setState((d.state as State) ?? 'pending')
      setBusy(false)
    } catch { setError('เชื่อมต่อไม่ได้'); setBusy(false) }
  }

  async function logout() {
    await getSupabaseBrowser().auth.signOut()
    setSignedIn(false); setState('none')
  }

  if (!ready) return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center px-6 overflow-y-auto py-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">🤝 สมัครเป็นนายหน้า BAZE</h1>
          <p className="text-gray-400 text-sm mt-1">แนะนำร้านมาใช้ Baze POS · รับคอมมิชชั่นทุกเดือนที่ร้านต่ออายุ</p>
        </div>

        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          {!signedIn ? (
            <>
              <p className="text-gray-300 text-sm text-center">เข้าสู่ระบบด้วย Google เพื่อสมัคร</p>
              <button onClick={loginGoogle}
                className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-100 rounded-xl text-gray-900 font-semibold text-sm transition-all active:scale-95">
                <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.7 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.8l6.2 5.2C41.1 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                เข้าสู่ระบบด้วย Google
              </button>
            </>
          ) : state === 'pending' ? (
            <div className="text-center py-2">
              <p className="text-4xl mb-2">⏳</p>
              <p className="text-white font-black">ส่งใบสมัครแล้ว</p>
              <p className="text-gray-400 text-sm mt-1">กำลังรอผู้ดูแลระบบอนุมัติ เมื่อผ่านแล้วคุณจะเข้าดูรายได้ได้ทันที</p>
            </div>
          ) : state === 'rejected' ? (
            <div className="text-center py-2">
              <p className="text-4xl mb-2">🚫</p>
              <p className="text-white font-black">ใบสมัครไม่ผ่าน</p>
              <p className="text-gray-400 text-sm mt-1">กรุณาติดต่อผู้ดูแลระบบสำหรับรายละเอียด</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">ชื่อ-นามสกุล</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น สมชาย ใจดี"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">เบอร์ / LINE (ไว้ติดต่อ)</label>
                <input value={contact} onChange={e => setContact(e.target.value)} placeholder="08x-xxx-xxxx"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition" />
              </div>
              <p className="text-[11px] text-gray-500">สมัครด้วยอีเมล <span className="text-gray-300">{email}</span> — ใช้อีเมลนี้เข้าดูรายได้หลังได้รับอนุมัติ</p>
              <button onClick={submit} disabled={busy}
                className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
                {busy ? 'กำลังส่งใบสมัคร…' : 'ส่งใบสมัคร'}
              </button>
            </>
          )}

          {error && <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        </div>

        <button onClick={signedIn ? logout : () => router.replace('/auth')}
          className="text-[12px] text-gray-500 hover:text-gray-300 transition text-center">
          {signedIn ? 'ออกจากระบบ' : 'มีบัญชีนายหน้าแล้ว · เข้าสู่ระบบ'}
        </button>
      </div>
    </div>
  )
}
