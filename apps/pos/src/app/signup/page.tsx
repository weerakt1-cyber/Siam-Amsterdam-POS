'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, authedFetch } from '@/lib/supabase-browser'

// Self-service store signup. The standard path is email + password (works fully
// inside the native app WebView, same as /auth login) — the owner registers an
// account and creates their store in one form. Google stays as a secondary
// option. /api/signup is provider-agnostic: it only needs a session + name/slug.
//
// Email confirmation is handled both ways:
//  • confirmation OFF → signUp returns a session immediately → create the store now.
//  • confirmation ON  → no session yet → show "check your email"; the verify link
//    returns here with name/slug/ref in the URL + a session, and we finish
//    creating the store automatically.
type Phase = 'loading' | 'register' | 'store' | 'checkEmail'

export default function SignupPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [ref, setRef]     = useState('')
  const [name, setName]   = useState('')
  const [slug, setSlug]   = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const [done, setDone]   = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qRef  = params.get('ref')  ?? ''
    const qName = params.get('name') ?? ''
    const qSlug = params.get('slug') ?? ''
    setRef(qRef)
    if (qName) setName(qName)
    if (qSlug) setSlug(qSlug)

    getSupabaseBrowser().auth.getSession().then(async ({ data: { session } }) => {
      if (session && qName && qSlug) {
        // Returned from the email-verification link — finish automatically.
        setPhase('store')
        await createStore(qName, qSlug, qRef)
      } else if (session) {
        // Already signed in (e.g. via Google) but no store yet → collect details.
        setPhase('store')
      } else {
        setPhase('register')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function validStoreFields(): string | null {
    if (!name.trim()) return 'กรุณากรอกชื่อร้าน'
    if (!/^[a-z0-9-]{3,}$/.test(slug.trim())) return 'ชื่อลิงก์ร้าน (slug): ตัวอังกฤษพิมพ์เล็ก/ตัวเลข/ขีด อย่างน้อย 3 ตัว'
    return null
  }

  // Create the store for the currently-signed-in user, then head to /welcome.
  async function createStore(n: string, s: string, r: string) {
    setBusy(true); setError('')
    try {
      const res = await authedFetch('/api/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n.trim(), slug: s.trim(), ref: r }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'สร้างร้านไม่สำเร็จ'); setBusy(false); return }
      setDone(true)
      setTimeout(() => router.replace('/welcome'), 1200)
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่'); setBusy(false)
    }
  }

  // Email + password registration.
  async function register(e: React.FormEvent) {
    e.preventDefault()
    const fieldErr = validStoreFields()
    if (fieldErr) { setError(fieldErr); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('กรุณากรอกอีเมลให้ถูกต้อง'); return }
    if (password.length < 6) { setError('รหัสผ่านอย่างน้อย 6 ตัวอักษร'); return }

    setBusy(true); setError('')
    const sb = getSupabaseBrowser()
    // Carry the store details through the (optional) email-verification round-trip.
    const params = new URLSearchParams({ name: name.trim(), slug: slug.trim() })
    if (ref) params.set('ref', ref)
    const { data, error: err } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${location.origin}/signup?${params.toString()}` },
    })

    if (err) {
      const msg = /already registered|already exists/i.test(err.message)
        ? 'อีเมลนี้ถูกใช้แล้ว — กรุณาเข้าสู่ระบบแทน'
        : err.message
      setError(msg); setBusy(false); return
    }

    if (data.session) {
      // Confirmation is off — we already have a session, create the store now.
      await createStore(name, slug, ref)
    } else {
      // Confirmation is on — wait for the user to click the email link.
      setBusy(false); setPhase('checkEmail')
    }
  }

  async function loginGoogle() {
    setError('')
    const params = new URLSearchParams()
    if (name.trim()) params.set('name', name.trim())
    if (slug.trim()) params.set('slug', slug.trim())
    if (ref) params.set('ref', ref)
    const q = params.toString()
    const { error: e } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/signup${q ? `?${q}` : ''}` },
    })
    if (e) setError(e.message)
  }

  // ── Screens ──────────────────────────────────────────────────────────────
  if (phase === 'loading') return <div className="min-h-screen bg-gray-950" />

  if (done) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-5xl mb-3">🎉</p>
        <p className="text-white font-black text-lg">สร้างร้านสำเร็จ!</p>
        <p className="text-gray-400 text-sm mt-1">กำลังเตรียมการติดตั้ง…</p>
      </div>
    </div>
  )

  if (phase === 'checkEmail') return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center bg-gray-900 border border-gray-800 rounded-2xl p-8">
        <p className="text-5xl mb-3">📧</p>
        <p className="text-white font-black text-lg">ยืนยันอีเมลของคุณ</p>
        <p className="text-gray-400 text-sm mt-2 leading-relaxed">
          เราส่งลิงก์ยืนยันไปที่<br /><span className="text-amber-400 font-semibold">{email.trim()}</span><br />
          คลิกลิงก์ในอีเมลเพื่อเปิดร้านให้เสร็จสมบูรณ์
        </p>
        <p className="text-gray-600 text-[11px] mt-4">ไม่พบอีเมล? ลองเช็คในกล่อง Spam / Junk</p>
      </div>
    </div>
  )

  const inputCls = 'w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition'

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">🚀 เปิดร้านกับ BAZE</h1>
          <p className="text-gray-400 text-sm mt-1">ทดลองใช้ฟรี 15 วัน · ไม่ต้องใส่บัตร</p>
          {ref && <p className="text-[11px] text-amber-500 mt-2">แนะนำโดยนายหน้า · โค้ด {ref}</p>}
        </div>

        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          {/* Store details — collected in both phases */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">ชื่อร้าน</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น Siam Bar" className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">ชื่อลิงก์ร้าน (slug)</label>
            <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="siam-bar" className={inputCls} />
            <p className="text-[11px] text-gray-500 mt-1">ใช้ในลิงก์ QR ลูกค้า · ตัวอังกฤษพิมพ์เล็ก/ตัวเลข/ขีด</p>
          </div>

          {phase === 'register' ? (
            <form onSubmit={register} className="flex flex-col gap-4">
              <div className="h-px bg-gray-800" />
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">อีเมล</label>
                <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                  value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className={inputCls} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">รหัสผ่าน</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="อย่างน้อย 6 ตัวอักษร" className={inputCls} />
              </div>
              <button type="submit" disabled={busy}
                className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
                {busy ? 'กำลังสร้างร้าน…' : 'สร้างร้าน + เริ่มทดลองใช้'}
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-[10px] text-gray-600 uppercase tracking-widest">หรือ</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <button type="button" onClick={loginGoogle} disabled={busy}
                className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-100 disabled:opacity-50 rounded-xl text-gray-900 font-semibold text-sm transition-all active:scale-95">
                <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.7 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.8l6.2 5.2C41.1 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                เปิดร้านด้วย Google
              </button>

              <p className="text-center text-xs text-gray-500">
                มีบัญชีแล้ว? <a href="/auth" className="text-amber-400 font-semibold">เข้าสู่ระบบ</a>
              </p>
            </form>
          ) : (
            // phase === 'store' — already signed in, just need the store details.
            <button onClick={() => { const err = validStoreFields(); if (err) { setError(err); return } createStore(name, slug, ref) }} disabled={busy}
              className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
              {busy ? 'กำลังสร้างร้าน…' : 'สร้างร้าน + เริ่มทดลองใช้'}
            </button>
          )}

          {error && <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        </div>
      </div>
    </div>
  )
}
