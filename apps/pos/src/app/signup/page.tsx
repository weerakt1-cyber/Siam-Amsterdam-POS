'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, authedFetch } from '@/lib/supabase-browser'

// Self-service store signup for PLOEN POS. The standard path is email + password
// (works fully inside the native Android WebView, same as /auth login) — the
// owner registers an account and their store is provisioned in one step. Google
// stays as a secondary option. The store's URL slug is derived automatically
// from the store name server-side (transliterated), so the owner never types one.
//
// The store name + business segment are stashed in user_metadata at signup so
// provisioning can read them after the OAuth / email-confirmation round-trip,
// and are also carried in the return URL as a fallback. /api/provision is
// provider-agnostic and idempotent: it only needs a session + store name.
//
// 'invite'/'joining' are the staff-invite flow: an admin's link
// (…/signup?invite=TOKEN) auto-joins the signer-up to that store as staff — no
// store to create, the store is fixed by the token.
type Phase = 'loading' | 'register' | 'store' | 'checkEmail' | 'invite' | 'joining'

const SEGMENTS: { value: string; label: string }[] = [
  { value: 'restaurant', label: 'ร้านอาหาร' },
  { value: 'cafe',       label: 'คาเฟ่ / กาแฟ' },
  { value: 'bar',        label: 'บาร์ / ผับ' },
  { value: 'massage',    label: 'นวด / สปา' },
  { value: 'salon',      label: 'ร้านเสริมสวย' },
  { value: 'nails',      label: 'ร้านทำเล็บ' },
  { value: 'other',      label: 'อื่นๆ' },
]

export default function SignupPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [ref, setRef]     = useState('')
  const [name, setName]   = useState('')
  const [segment, setSegment] = useState('restaurant')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const [done, setDone]   = useState(false)
  const [ownerPin, setOwnerPin] = useState('')
  const [resent, setResent] = useState(false)
  // Staff-invite flow
  const [invite, setInvite]       = useState('')   // token
  const [storeName, setStoreName] = useState('')   // resolved from the token
  const [pin, setPin]             = useState('')   // 4-digit operator PIN

  const INVITE_PIN_KEY = 'baze_invite_pin'         // survives the email round-trip (same device)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qRef     = params.get('ref')  ?? ''
    const qName    = params.get('name') ?? ''
    const qSegment = params.get('segment') ?? ''
    const qToken   = params.get('invite') ?? ''
    setRef(qRef)
    if (qName) setName(qName)
    if (qSegment) setSegment(qSegment)

    // ── Staff invite flow ──────────────────────────────────────────────────
    if (qToken) {
      setInvite(qToken)
      ;(async () => {
        // Resolve the token → store name (public endpoint).
        try {
          const r = await fetch(`/api/invite/${encodeURIComponent(qToken)}`)
          if (r.ok) { const d = await r.json(); setStoreName(d.store?.name ?? '') }
          else { setError('ลิงก์เชิญไม่ถูกต้องหรือถูกยกเลิกแล้ว') }
        } catch { setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่') }

        // Already signed in (returned from email verify, or logged in) → join now.
        const { data: { session } } = await getSupabaseBrowser().auth.getSession()
        if (session) {
          let savedPin = ''
          try { savedPin = sessionStorage.getItem(INVITE_PIN_KEY) ?? '' } catch {}
          setPhase('joining')
          await joinStaff(qToken, qName || (session.user.email ?? ''), savedPin)
        } else setPhase('invite')
      })()
      return
    }

    getSupabaseBrowser().auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // Signed in (returned from Google OAuth or the email-verify link, or an
        // owner revisiting). Provision from the URL/metadata store details. If no
        // store intent is known yet, collect it (the 'store' phase).
        const metaName    = String(session.user.user_metadata?.storeName ?? '').trim()
        const metaSegment = String(session.user.user_metadata?.segment ?? '').trim()
        const n = qName || metaName
        const s = qSegment || metaSegment || 'restaurant'
        if (n) { setPhase('store'); await provision(n, s, qRef) }
        else setPhase('store')
      } else {
        setPhase('register')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function validStoreFields(): string | null {
    if (!name.trim()) return 'กรุณากรอกชื่อร้าน'
    return null
  }

  // Provision (or resolve) the store for the currently-signed-in user, then head
  // to /welcome. Idempotent server-side — safe if called more than once.
  async function provision(n: string, seg: string, r: string) {
    setBusy(true); setError('')
    try {
      const res = await authedFetch('/api/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName: n.trim(), segment: seg, ref: r }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.status === 409 && d.pending) {
        // The account is tied to a pending join/approval — not a fresh store.
        router.replace('/auth/status'); return
      }
      if (!res.ok) { setError(d.error || 'สร้างร้านไม่สำเร็จ'); setBusy(false); return }
      if (d.ownerPin) setOwnerPin(String(d.ownerPin))
      setDone(true)
      setTimeout(() => router.replace('/welcome'), d.ownerPin ? 3500 : 1200)
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่'); setBusy(false)
    }
  }

  // Email + password registration. Store name + segment go into user_metadata so
  // provisioning can read them after the (optional) email-confirmation round-trip.
  async function register(e: React.FormEvent) {
    e.preventDefault()
    const fieldErr = validStoreFields()
    if (fieldErr) { setError(fieldErr); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('กรุณากรอกอีเมลให้ถูกต้อง'); return }
    if (password.length < 6) { setError('รหัสผ่านอย่างน้อย 6 ตัวอักษร'); return }

    setBusy(true); setError('')
    const sb = getSupabaseBrowser()
    // Carry the store details through the (optional) email-verification round-trip.
    const params = new URLSearchParams({ name: name.trim(), segment })
    if (ref) params.set('ref', ref)
    const { data, error: err } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${location.origin}/signup?${params.toString()}`,
        data: { storeName: name.trim(), segment, ref: ref || undefined },
      },
    })

    if (err) {
      const msg = /already registered|already exists/i.test(err.message)
        ? 'อีเมลนี้ถูกใช้แล้ว — หากเป็นของคุณ กรุณาเข้าสู่ระบบ (ลืมรหัสผ่าน? รีเซ็ตได้ที่หน้าเข้าสู่ระบบ)'
        : err.message
      setError(msg); setBusy(false); return
    }

    if (data.session) {
      // Confirmation is off — we already have a session, provision now.
      await provision(name, segment, ref)
    } else {
      // Confirmation is on — wait for the user to click the email link.
      setBusy(false); setPhase('checkEmail')
    }
  }

  // Resend the confirmation email (confirmation-on flow).
  async function resendConfirmation() {
    setError(''); setResent(false)
    const params = new URLSearchParams({ name: name.trim(), segment })
    if (ref) params.set('ref', ref)
    const { error: err } = await getSupabaseBrowser().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/signup?${params.toString()}` },
    })
    if (err) { setError(err.message); return }
    setResent(true)
  }

  async function loginGoogle() {
    setError('')
    const fieldErr = validStoreFields()
    if (fieldErr) { setError(fieldErr); return }
    // OAuth can't set user_metadata directly, so carry the store details in the
    // return URL; the page reads them back and provisions on return.
    const params = new URLSearchParams({ name: name.trim(), segment })
    if (ref) params.set('ref', ref)
    const q = params.toString()
    const { error: e } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/signup${q ? `?${q}` : ''}` },
    })
    if (e) setError(e.message)
  }

  // ── Staff invite ──────────────────────────────────────────────────────────
  // Link the signed-in user into the invite's store as staff (+ create their PIN
  // operator when a pin is supplied), then go to /pos.
  async function joinStaff(token: string, n: string, staffPin: string) {
    setBusy(true); setError('')
    try {
      const res = await authedFetch('/api/staff-join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: n.trim(), pin: staffPin }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'เข้าร่วมร้านไม่สำเร็จ'); setBusy(false); setPhase('invite'); return }
      try { sessionStorage.removeItem(INVITE_PIN_KEY) } catch {}
      setDone(true)
      setTimeout(() => router.replace('/pos'), 1200)
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่'); setBusy(false); setPhase('invite')
    }
  }

  // Email + password registration for an invited staff member.
  async function registerStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('กรุณากรอกชื่อของคุณ'); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('กรุณากรอกอีเมลให้ถูกต้อง'); return }
    if (password.length < 6) { setError('รหัสผ่านอย่างน้อย 6 ตัวอักษร'); return }
    if (!/^\d{4}$/.test(pin)) { setError('ตั้ง PIN 4 หลักสำหรับเข้ากะ'); return }

    setBusy(true); setError('')
    const sb = getSupabaseBrowser()
    // Keep the PIN for the email round-trip (same device) — never put it in the URL.
    try { sessionStorage.setItem(INVITE_PIN_KEY, pin) } catch {}
    const params = new URLSearchParams({ invite, name: name.trim() })
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
    if (data.session) await joinStaff(invite, name, pin)  // confirmation off → join now
    else { setBusy(false); setPhase('checkEmail') }       // confirmation on → verify email
  }

  async function loginGoogleInvite() {
    setError('')
    // Carry the PIN (if set) across the OAuth round-trip via sessionStorage.
    try { if (/^\d{4}$/.test(pin)) sessionStorage.setItem(INVITE_PIN_KEY, pin) } catch {}
    const params = new URLSearchParams({ invite })
    if (name.trim()) params.set('name', name.trim())
    const { error: e } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/signup?${params.toString()}` },
    })
    if (e) setError(e.message)
  }

  // ── Screens ──────────────────────────────────────────────────────────────
  if (phase === 'loading') return <div className="min-h-screen bg-gray-950" />

  if (done) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-3">🎉</p>
        <p className="text-white font-black text-lg">{invite ? 'เข้าร่วมร้านสำเร็จ!' : 'สร้างร้านสำเร็จ!'}</p>
        <p className="text-gray-400 text-sm mt-1">{invite ? 'กำลังเข้าสู่ระบบ…' : 'กำลังเตรียมการติดตั้ง…'}</p>
        {!invite && ownerPin && (
          <div className="mt-5 bg-gray-900 border border-amber-500/30 rounded-2xl p-4">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">PIN เข้ากะของคุณ</p>
            <p className="text-3xl font-black text-amber-400 tracking-[0.3em] mt-1">{ownerPin}</p>
            <p className="text-[11px] text-gray-500 mt-2">จดไว้แล้วเปลี่ยนได้ที่ ตั้งค่า → พนักงาน</p>
          </div>
        )}
      </div>
    </div>
  )

  if (phase === 'joining') return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4">
        <div className="w-7 h-7 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">กำลังเข้าร่วมร้าน…</p>
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
          คลิกลิงก์ในอีเมลเพื่อ{invite ? 'เข้าร่วมร้านให้เสร็จสมบูรณ์' : 'เปิดร้านให้เสร็จสมบูรณ์'}
        </p>
        <button onClick={resendConfirmation}
          className="mt-5 w-full px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-white font-semibold text-sm transition-all active:scale-95">
          ส่งอีเมลอีกครั้ง
        </button>
        {resent && <p className="text-emerald-400 text-xs mt-2">✓ ส่งอีเมลยืนยันใหม่แล้ว</p>}
        {error && <p className="text-red-400 text-xs mt-2 bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        <p className="text-gray-600 text-[11px] mt-4">ไม่พบอีเมล? ลองเช็คในกล่อง Spam / Junk</p>
      </div>
    </div>
  )

  const inputCls = 'w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 outline-none focus:border-amber-500 transition'

  // ── Staff invite: register/join a fixed store (no store creation) ──────────
  if (phase === 'invite') return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">👋 เข้าร่วมทีมงาน</h1>
          {storeName
            ? <p className="text-gray-400 text-sm mt-1">ร้าน <span className="text-amber-400 font-bold">{storeName}</span> เชิญคุณเข้าร่วม</p>
            : <p className="text-gray-500 text-sm mt-1">สมัครบัญชีพนักงานเพื่อเริ่มใช้งาน</p>}
        </div>

        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          <form onSubmit={registerStaff} className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">ชื่อของคุณ</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น สมชาย" className={inputCls} />
            </div>
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
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">PIN 4 หลัก (สำหรับเข้ากะ)</label>
              <input inputMode="numeric" autoComplete="off" value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="เช่น 1234"
                className={`${inputCls} tracking-[0.4em] text-center`} />
              <p className="text-[11px] text-gray-500 mt-1">ใช้เลือกชื่อตัวเองแล้วกดเข้ากะบนหน้า POS</p>
            </div>
            <button type="submit" disabled={busy}
              className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
              {busy ? 'กำลังเข้าร่วม…' : 'สมัคร + เข้าร่วมร้าน'}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-[10px] text-gray-600 uppercase tracking-widest">หรือ</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>
            <button type="button" onClick={loginGoogleInvite} disabled={busy}
              className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-100 disabled:opacity-50 rounded-xl text-gray-900 font-semibold text-sm transition-all active:scale-95">
              <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.7 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.8l6.2 5.2C41.1 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
              เข้าร่วมด้วย Google
            </button>

            <p className="text-center text-xs text-gray-500">
              มีบัญชีแล้ว? <a href="/auth" className="text-amber-400 font-semibold">เข้าสู่ระบบ</a>
            </p>
          </form>
          {error && <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">🚀 เปิดร้านกับ PLOEN POS</h1>
          <p className="text-gray-400 text-sm mt-1">เริ่มใช้ฟรี · ไม่ต้องใส่บัตร</p>
          {ref && <p className="text-[11px] text-amber-500 mt-2">แนะนำโดยนายหน้า · โค้ด {ref}</p>}
        </div>

        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          {/* Store details — collected in both phases */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">ชื่อร้าน</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น ร้านสยาม" className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">ประเภทธุรกิจ</label>
            <select value={segment} onChange={e => setSegment(e.target.value)} className={inputCls}>
              {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
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
                {busy ? 'กำลังสร้างร้าน…' : 'สร้างร้าน + เริ่มใช้งานฟรี'}
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
            <button onClick={() => { const err = validStoreFields(); if (err) { setError(err); return } provision(name, segment, ref) }} disabled={busy}
              className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
              {busy ? 'กำลังสร้างร้าน…' : 'สร้างร้าน + เริ่มใช้งานฟรี'}
            </button>
          )}

          {error && <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        </div>
      </div>
    </div>
  )
}
