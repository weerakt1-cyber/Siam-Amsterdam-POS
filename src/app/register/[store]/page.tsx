'use client'

import { useState, useEffect, use, useCallback } from 'react'

type Lang = 'th' | 'en'

// Self-contained bilingual copy (this page stands alone from the POS/order i18n).
const T = {
  th: {
    title: 'สมัครสมาชิก',
    subtitle: 'รับสิทธิพิเศษ สะสมแต้ม และสั่งง่ายผ่าน QR',
    name: 'ชื่อ-นามสกุล',
    namePh: 'เช่น สมชาย ใจดี',
    phone: 'เบอร์โทรศัพท์',
    phonePh: '08x-xxx-xxxx',
    birthday: 'วันเกิด (ไม่บังคับ)',
    birthdayHint: 'ใช้สำหรับสิทธิพิเศษวันเกิด',
    consent: 'ฉันยินยอมให้ร้านเก็บและใช้ข้อมูลข้างต้นตามนโยบายความเป็นส่วนตัว',
    policyToggle: 'อ่านนโยบายความเป็นส่วนตัว',
    submit: 'สมัครสมาชิก',
    submitting: 'กำลังสมัคร…',
    errName: 'กรุณากรอกชื่อ',
    errPhone: 'กรุณากรอกเบอร์โทรให้ถูกต้อง',
    errConsent: 'กรุณายอมรับนโยบายความเป็นส่วนตัวก่อน',
    errGeneric: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
    successTitle: 'สมัครสำเร็จ! 🎉',
    successBody: 'คุณเป็นสมาชิกของร้านแล้ว แจ้งเบอร์โทรที่แคชเชียร์เพื่อสะสมแต้มได้เลย',
    alreadyTitle: 'คุณเป็นสมาชิกอยู่แล้ว 😊',
    alreadyBody: 'เบอร์นี้ลงทะเบียนไว้แล้ว แจ้งเบอร์ที่แคชเชียร์เพื่อสะสมแต้มได้เลย',
    secureNote: '🔒 ข้อมูลของคุณปลอดภัย เห็นเฉพาะร้านนี้เท่านั้น ไม่ขายหรือส่งต่อให้บุคคลภายนอก',
    policy: [
      ['ข้อมูลที่เราเก็บ', 'ชื่อ, เบอร์โทรศัพท์ และวันเกิด (ถ้ากรอก) เท่านั้น'],
      ['ใช้ทำอะไร', 'เพื่อเป็นสมาชิก สะสมแต้ม แจ้งโปรโมชั่น/สิทธิพิเศษวันเกิด และให้สั่งอาหารสะดวกขึ้น'],
      ['ใครเห็นข้อมูล', 'เฉพาะพนักงานของร้านนี้ — เราไม่ขายหรือแบ่งปันให้บุคคลภายนอก'],
      ['สิทธิของคุณ', 'ขอดู แก้ไข หรือลบข้อมูลของคุณได้ตลอดเวลา เพียงแจ้งพนักงาน'],
      ['การยินยอม', 'เมื่อกดสมัคร ถือว่าคุณยินยอมให้เก็บและใช้ข้อมูลตามนโยบายนี้ (ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล PDPA)'],
    ],
  },
  en: {
    title: 'Become a Member',
    subtitle: 'Get perks, earn points, and order easily via QR',
    name: 'Full name',
    namePh: 'e.g. John Smith',
    phone: 'Phone number',
    phonePh: '08x-xxx-xxxx',
    birthday: 'Birthday (optional)',
    birthdayHint: 'Used for birthday perks',
    consent: 'I agree to let the store store and use the above information per the privacy policy',
    policyToggle: 'Read the privacy policy',
    submit: 'Sign up',
    submitting: 'Signing up…',
    errName: 'Please enter your name',
    errPhone: 'Please enter a valid phone number',
    errConsent: 'Please accept the privacy policy first',
    errGeneric: 'Something went wrong. Please try again.',
    successTitle: "You're in! 🎉",
    successBody: "You're now a member. Just give your phone number at the cashier to earn points.",
    alreadyTitle: "You're already a member 😊",
    alreadyBody: 'This number is already registered. Give it at the cashier to earn points.',
    secureNote: '🔒 Your details are safe — visible only to this store, never sold or shared.',
    policy: [
      ['What we collect', 'Only your name, phone number, and birthday (if given).'],
      ['What it is for', 'Membership, points, promotions / birthday perks, and easier ordering.'],
      ['Who can see it', 'Only this store’s staff — we never sell or share it with third parties.'],
      ['Your rights', 'Ask to view, correct, or delete your data anytime — just tell our staff.'],
      ['Consent', 'By signing up you consent to us storing and using your data per this policy (Thailand PDPA).'],
    ],
  },
} as const

export default function RegisterPage({ params }: { params: Promise<{ store: string }> }) {
  const { store } = use(params)

  const [lang, setLang] = useState<Lang>('th')
  const t = T[lang]

  const [storeName, setStoreName] = useState('')
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [birthday, setBirthday] = useState('')
  const [consent, setConsent]   = useState(false)
  const [showPolicy, setShowPolicy] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState<null | { already: boolean }>(null)

  const sfetch = useCallback((path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set('x-store-id', store)
    return fetch(path, { ...init, headers })
  }, [store])

  useEffect(() => {
    sfetch('/api/store').then(r => r.ok ? r.json() : null).then(d => { if (d?.store) setStoreName(d.store.name) }).catch(() => {})
  }, [sfetch])

  const phoneDigits = phone.replace(/\D/g, '')
  const canSubmit = name.trim().length > 0 && phoneDigits.length >= 8 && consent && !submitting

  async function submit() {
    setError('')
    if (!name.trim())            { setError(t.errName); return }
    if (phoneDigits.length < 8)  { setError(t.errPhone); return }
    if (!consent)                { setError(t.errConsent); return }
    setSubmitting(true)
    try {
      const r = await sfetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), birthday: birthday || undefined, consent: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || t.errGeneric); setSubmitting(false); return }
      setDone({ already: !!d.alreadyMember })
    } catch {
      setError(t.errGeneric); setSubmitting(false)
    }
  }

  // ─── Success screen ───────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5" style={{ userSelect: 'none' }}>
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-5xl mb-3">{done.already ? '😊' : '🎉'}</p>
          <h1 className="text-xl font-black text-gray-900">{done.already ? t.alreadyTitle : t.successTitle}</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">{done.already ? t.alreadyBody : t.successBody}</p>
          {storeName && <p className="text-xs text-gray-400 mt-4">{storeName}</p>}
        </div>
      </div>
    )
  }

  // ─── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-5 py-8" style={{ userSelect: 'none' }}>
      <div className="w-full max-w-sm">

        {/* Language toggle */}
        <div className="flex justify-center gap-2 mb-4">
          {(['th', 'en'] as Lang[]).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${lang === l ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}>
              {l === 'th' ? '🇹🇭 ไทย' : '🇬🇧 EN'}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="text-center mb-5">
            {storeName && <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">{storeName}</p>}
            <h1 className="text-2xl font-black text-gray-900 mt-1">{t.title}</h1>
            <p className="text-sm text-gray-400 mt-1">{t.subtitle}</p>
          </div>

          <div className="flex flex-col gap-4">
            <Field label={t.name}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t.namePh}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition"
                style={{ userSelect: 'text' }} autoFocus />
            </Field>

            <Field label={t.phone}>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phonePh}
                inputMode="tel" type="tel"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition"
                style={{ userSelect: 'text' }} />
            </Field>

            <Field label={t.birthday}>
              <input value={birthday} onChange={e => setBirthday(e.target.value)} type="date"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-amber-400 transition"
                style={{ userSelect: 'text' }} />
              <p className="text-[11px] text-gray-400 mt-1">{t.birthdayHint}</p>
            </Field>

            {/* Privacy / consent */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0" />
                <span className="text-[12px] text-gray-600 leading-snug">{t.consent}</span>
              </label>
              <button type="button" onClick={() => setShowPolicy(v => !v)}
                className="text-[11px] font-semibold text-amber-600 mt-2 ml-[26px]">
                {showPolicy ? '▲ ' : '▼ '}{t.policyToggle}
              </button>
              {showPolicy && (
                <div className="mt-2 flex flex-col gap-2 border-t border-gray-200 pt-2">
                  {t.policy.map(([h, b], i) => (
                    <div key={i}>
                      <p className="text-[11px] font-bold text-gray-700">{h}</p>
                      <p className="text-[11px] text-gray-500 leading-snug">{b}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

            <button onClick={submit} disabled={!canSubmit}
              className={`w-full py-4 rounded-2xl font-black text-base transition active:scale-[0.98] ${
                canSubmit ? 'bg-gray-900 text-white shadow-lg shadow-gray-900/20' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}>
              {submitting ? t.submitting : t.submit}
            </button>

            <p className="text-[11px] text-gray-400 text-center leading-snug">{t.secureNote}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
      {children}
    </div>
  )
}
