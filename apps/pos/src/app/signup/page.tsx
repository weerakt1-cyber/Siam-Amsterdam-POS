'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, authedFetch } from '@/lib/supabase-browser'

// Store self-signup. Two paths, both landing on POST /api/signup (which is
// provider-agnostic — it just needs an authenticated session + name/slug):
//   • Email + password (primary): collect everything up front, send a Supabase
//     confirmation email whose redirect carries name/slug/ref back here; on
//     return (session established) the store is created automatically.
//   • Google (secondary): OAuth round-trip → come back signed in → fill the
//     name/slug form → create.
//
// Email is the reliable path inside the Android app WebView, matching /auth.

type Phase = 'form' | 'check-email' | 'creating' | 'done'

export default function SignupPage() {
  const router = useRouter()
  const [ready, setReady]   = useState(false)
  const [phase, setPhase]   = useState<Phase>('form')
  const [signedIn, setSignedIn] = useState(false)   // Google returned, no pending store yet

  const [ref, setRef]       = useState('')
  const [email, setEmail]   = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]     = useState('')
  const [slug, setSlug]     = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')

  // Create the store for the current session, then head to onboarding.
  async function createStore(storeName: string, storeSlug: string, refCode: string) {
    setPhase('creating'); setError('')
    const res = await authedFetch('/api/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: storeName, slug: storeSlug, ref: refCode }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      // e.g. slug taken → drop the owner back to the form (still signed in) to fix it.
      setError(d.error || 'สร้างร้านไม่สำเร็จ')
      setName(storeName); setSlug(storeSlug); setRef(refCode)
      setSignedIn(true); setPhase('form')
      return
    }
    setPhase('done')
    setTimeout(() => router.replace('/welcome'), 1200)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qRef  = params.get('ref') ?? ''
    const qName = params.get('name') ?? ''
    const qSlug = params.get('slug') ?? ''
    setRef(qRef)

    getSupabaseBrowser().auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Returned from the email-verify link (or Google) with a pending store
        // encoded in the URL → create it now, no re-entry needed.
        if (qName && qSlug) { createStore(qName, qSlug, qRef); setReady(true); return }
        // Signed in via Google with nothing pending → show the name/slug form.
        setSignedIn(true)
      }
      setReady(true)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function validStore(): boolean {
    if (!name.trim()) { setError('กรุณากรอกชื่อร้าน'); return false }
    if (!/^[a-z0-9-]{3,}$/.test(slug.trim())) { setError('slug: ตัวอังกฤษพิมพ์เล็ก/ตัวเลข/ขีด อย่างน้อย 3 ตัว'); return false }
    return true
  }

  // Email + password sign-up. Confirm-email is ON, so signUp returns no session
  // until the link is clicked — we stash name/slug/ref in the redirect URL.
  async function signupEmail(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('อีเมลไม่ถูกต้อง'); return }
    if (password.length < 6) { setError('รหัสผ่านอย่างน้อย 6 ตัว'); return }
    if (!validStore()) return
    setBusy(true)
    const redirect = new URL(`${location.origin}/signup`)
    redirect.searchParams.set('name', name.trim())
    redirect.searchParams.set('slug', slug.trim())
    if (ref) redirect.searchParams.set('ref', ref)
    const { data, error: err } = await getSupabaseBrowser().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirect.toString() },
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    // Confirm-email OFF (session returned) → create immediately; else prompt.
    if (data.session) { createStore(name.trim(), slug.trim(), ref); return }
    setPhase('check-email')
  }

  // Google → OAuth, come back to /signup signed in (no pending store) → form.
  async function loginGoogle() {
    setError('')
    const r = ref ? `?ref=${encodeURIComponent(ref)}` : ''
    const { error: e } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/signup${r}` },
    })
    if (e) setError(e.message)
  }

  // Signed-in-via-Google path: submit the name/slug form.
  async function submitForm() {
    if (!validStore()) return
    setBusy(true)
    await createStore(name.trim(), slug.trim(), ref)
    setBusy(false)
  }

  if (!ready) return <div className="min-h-screen bg-gray-950" />

  if (phase === 'done') return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center"><p className="text-5xl mb-3">🎉</p><p className="text-white font-black text-lg">สร้างร้านสำเร็จ!</p><p className="text-gray-400 text-sm mt-1">กำลังเตรียมการติดตั้ง…</p></div>
    </div>
  )

  if (phase === 'creating') return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">กำลังสร้างร้าน…</p>
      </div>
    </div>
  )

  if (phase === 'check-email') return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center flex flex-col gap-3 shadow-2xl">
        <p className="text-5xl">📧</p>
        <p className="text-white font-black text-lg">ยืนยันอีเมลของคุณ</p>
        <p className="text-gray-400 text-sm">เราส่งลิงก์ยืนยันไปที่<br/><span className="text-amber-400 font-semibold">{email}</span></p>
        <p className="text-gray-500 text-xs mt-1">คลิกลิงก์ในอีเมลเพื่อยืนยัน แล้วร้านของคุณจะถูกสร้างอัตโนมัติ · หากไม่พบให้ตรวจในกล่อง Spam/Junk</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">🚀 เปิดร้านกับ BAZE</h1>
          <p className="text-gray-400 text-sm mt-1">ทดลองใช้ฟรี 15 วัน · ไม่ต้องใส่บัตร</p>
          {ref && <p className="text-[11px] text-amber-500 mt-2">แนะนำโดยนายหน้า · โค้ด {ref}</p>}
        </div>

        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          {signedIn ? (
            // Google returned — just need the store name/slug.
            <>
              <StoreFields name={name} slug={slug} setName={setName} setSlug={setSlug} />
              <button onClick={submitForm} disabled={busy}
                className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
                {busy ? 'กำลังสร้างร้าน…' : 'สร้างร้าน + เริ่มทดลองใช้'}
              </button>
            </>
          ) : (
            <>
              {/* Email + password + store — primary */}
              <form onSubmit={signupEmail} className="flex flex-col gap-3">
                <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                  value={email} onChange={e => setEmail(e.target.value)} placeholder="อีเมล / Email"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="ตั้งรหัสผ่าน (อย่างน้อย 6 ตัว)"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition" />
                <StoreFields name={name} slug={slug} setName={setName} setSlug={setSlug} />
                <button type="submit" disabled={busy}
                  className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
                  {busy ? 'กำลังส่งอีเมล…' : 'สร้างร้าน + เริ่มทดลองใช้'}
                </button>
              </form>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-[10px] text-gray-600 uppercase tracking-widest">หรือ</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>

              <button onClick={loginGoogle}
                className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-100 rounded-xl text-gray-900 font-semibold text-sm transition-all active:scale-95">
                <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.7 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.8l6.2 5.2C41.1 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                เข้าสู่ระบบด้วย Google
              </button>
            </>
          )}
          {error && <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        </div>

        <p className="text-center text-xs text-gray-600">มีร้านอยู่แล้ว? <a href="/auth" className="text-amber-500">เข้าสู่ระบบ</a></p>
      </div>
    </div>
  )
}

function StoreFields({
  name, slug, setName, setSlug,
}: { name: string; slug: string; setName: (v: string) => void; setSlug: (v: string) => void }) {
  return (
    <>
      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">ชื่อร้าน</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น Siam Bar"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition" />
      </div>
      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">ชื่อลิงก์ร้าน (slug)</label>
        <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="siam-bar"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition" />
        <p className="text-[11px] text-gray-500 mt-1">ใช้ในลิงก์ QR ลูกค้า · ตัวอังกฤษพิมพ์เล็ก/ตัวเลข/ขีด</p>
      </div>
    </>
  )
}
