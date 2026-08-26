'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser, authedFetch } from '@/lib/supabase-browser'

export default function SignupPage() {
  const router = useRouter()
  const [ref, setRef]         = useState('')
  const [ready, setReady]     = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [name, setName]       = useState('')
  const [slug, setSlug]       = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)

  useEffect(() => {
    // Keep the referral code across the OAuth round-trip via the URL.
    const params = new URLSearchParams(window.location.search)
    setRef(params.get('ref') ?? '')
    getSupabaseBrowser().auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session); setReady(true)
    })
  }, [])

  async function loginGoogle() {
    setError('')
    const r = ref ? `?ref=${encodeURIComponent(ref)}` : ''
    const { error: e } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/signup${r}` },
    })
    if (e) setError(e.message)
  }

  async function submit() {
    if (!name.trim()) { setError('กรุณากรอกชื่อร้าน'); return }
    if (!/^[a-z0-9-]{3,}$/.test(slug.trim())) { setError('slug: ตัวอังกฤษพิมพ์เล็ก/ตัวเลข/ขีด อย่างน้อย 3 ตัว'); return }
    setBusy(true); setError('')
    try {
      const res = await authedFetch('/api/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), ref }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'สร้างร้านไม่สำเร็จ'); setBusy(false); return }
      setDone(true)
      setTimeout(() => router.replace('/pos'), 1200)
    } catch { setError('เชื่อมต่อไม่ได้'); setBusy(false) }
  }

  if (!ready) return <div className="min-h-screen bg-gray-950" />

  if (done) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center"><p className="text-5xl mb-3">🎉</p><p className="text-white font-black text-lg">สร้างร้านสำเร็จ!</p><p className="text-gray-400 text-sm mt-1">กำลังพาเข้าสู่ระบบ…</p></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">🚀 เปิดร้านกับ BAZE</h1>
          <p className="text-gray-400 text-sm mt-1">ทดลองใช้ฟรี 15 วัน · ไม่ต้องใส่บัตร</p>
          {ref && <p className="text-[11px] text-amber-500 mt-2">แนะนำโดยนายหน้า · โค้ด {ref}</p>}
        </div>

        <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
          {!signedIn ? (
            <>
              <p className="text-gray-300 text-sm text-center">เข้าสู่ระบบด้วย Google เพื่อเริ่มสร้างร้าน</p>
              <button onClick={loginGoogle}
                className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-100 rounded-xl text-gray-900 font-semibold text-sm transition-all active:scale-95">
                <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.7 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.8l6.2 5.2C41.1 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                เข้าสู่ระบบด้วย Google
              </button>
            </>
          ) : (
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
              <button onClick={submit} disabled={busy}
                className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-black font-black text-sm transition-all active:scale-95">
                {busy ? 'กำลังสร้างร้าน…' : 'สร้างร้าน + เริ่มทดลองใช้'}
              </button>
            </>
          )}
          {error && <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}
        </div>
      </div>
    </div>
  )
}
