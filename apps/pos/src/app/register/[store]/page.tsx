'use client'

import { useState, useEffect, use, useCallback } from 'react'
import QRCode from 'qrcode'

type Lang = 'th' | 'en'

// Promo contact channels the customer can opt into. `ph` is the id/username
// placeholder; `label` prefixes the stored contact string ("LINE: @somchai").
const CHANNELS = [
  { key: 'line',     label: 'LINE',     icon: '💚', ph: 'LINE ID เช่น @somchai' },
  { key: 'telegram', label: 'Telegram', icon: '✈️', ph: '@username' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '🟢', ph: '+66 8x-xxx-xxxx' },
] as const
type ChannelKey = (typeof CHANNELS)[number]['key']

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
    contactTitle: 'ช่องทางรับข่าวสาร (ไม่บังคับ)',
    contactHint: 'เลือกช่องทางเพื่อรับโปรโมชั่นและข่าวสารจากร้าน',
    contactChannelPh: 'เลือกช่องทาง',
    backToOrder: '← กลับไปสั่งอาหาร',
    lineTitle: 'เพิ่มเพื่อน LINE รับข่าวสาร',
    lineHint: 'แอดเพื่อนเพื่อรับโปรโมชั่นและข่าวสารจากร้านทาง LINE',
    lineAddBtn: '💚 เพิ่มเพื่อน LINE',
    lineScan: 'หรือสแกน QR นี้ด้วยแอป LINE',
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
    benefitsTitle: 'สิทธิประโยชน์สมาชิก',
    defaultBenefits: [
      { icon: '⭐', text: 'สะสมแต้มทุกการสั่ง' },
      { icon: '🎂', text: 'สิทธิพิเศษวันเกิด' },
      { icon: '🎁', text: 'โปรโมชั่นเฉพาะสมาชิก' },
    ],
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
    contactTitle: 'News channel (optional)',
    contactHint: 'Pick a channel to receive promotions and news from the store',
    contactChannelPh: 'Select a channel',
    backToOrder: '← Back to ordering',
    lineTitle: 'Add us on LINE for news',
    lineHint: 'Add our LINE to get promotions and news from the store',
    lineAddBtn: '💚 Add LINE friend',
    lineScan: 'Or scan this QR with the LINE app',
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
    benefitsTitle: 'Member benefits',
    defaultBenefits: [
      { icon: '⭐', text: 'Earn points on every order' },
      { icon: '🎂', text: 'Birthday perks' },
      { icon: '🎁', text: 'Member-only promotions' },
    ],
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
  const [benefits, setBenefits]   = useState<{ icon: string; text: string }[]>([])
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [birthday, setBirthday] = useState('')
  const [channel, setChannel]   = useState<ChannelKey | ''>('')
  const [contactId, setContactId] = useState('')
  const [consent, setConsent]   = useState(false)
  const [showPolicy, setShowPolicy] = useState(false)

  // Table this signup was opened from (QR ordering link passes ?table=…), so we
  // can offer a "back to ordering" button. Read from the URL to avoid pulling in
  // useSearchParams (which would force a Suspense boundary on this page).
  const [table, setTable] = useState('')
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('table')
      if (t) setTable(t)
    } catch { /* ignore */ }
  }, [])
  const orderHref = table ? `/order/${store}/${encodeURIComponent(table)}` : null

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState<null | { already: boolean }>(null)

  const sfetch = useCallback((path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set('x-store-id', store)
    return fetch(path, { ...init, headers })
  }, [store])

  // Store's LINE OA add-friend link + QR (shown when the store connected an OA).
  const [lineAddUrl, setLineAddUrl] = useState<string | null>(null)
  const [lineQr, setLineQr] = useState<string | null>(null)

  useEffect(() => {
    sfetch('/api/store').then(r => r.ok ? r.json() : null).then(d => { if (d?.store) setStoreName(d.store.name) }).catch(() => {})
    sfetch('/api/member-benefits').then(r => r.ok ? r.json() : null).then(d => { if (Array.isArray(d?.benefits)) setBenefits(d.benefits) }).catch(() => {})
    sfetch('/api/line/oa/public').then(r => r.ok ? r.json() : null).then(d => {
      const basicId: string | undefined = d?.basicId
      if (!basicId) return
      // LINE add-friend deep link. basicId includes the leading "@".
      const id = basicId.startsWith('@') ? basicId : `@${basicId}`
      const url = `https://line.me/R/ti/p/${encodeURIComponent(id)}`
      setLineAddUrl(url)
      QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setLineQr).catch(() => {})
    }).catch(() => {})
  }, [sfetch])

  // Store-authored benefits if configured, else the default list (follows the toggle).
  const shownBenefits = benefits.length > 0 ? benefits : t.defaultBenefits

  const phoneDigits = phone.replace(/\D/g, '')
  const canSubmit = name.trim().length > 0 && phoneDigits.length >= 8 && consent && !submitting

  async function submit() {
    setError('')
    if (!name.trim())            { setError(t.errName); return }
    if (phoneDigits.length < 8)  { setError(t.errPhone); return }
    if (!consent)                { setError(t.errConsent); return }
    setSubmitting(true)
    // Send the structured channel + handle; the API stores both the structured
    // pair (for broadcasts) and a readable "LINE: @handle" display string.
    const trimmedId = contactId.trim()
    try {
      const r = await sfetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), phone: phone.trim(), birthday: birthday || undefined,
          contactChannel: channel && trimmedId ? channel : undefined,
          contactId: channel && trimmedId ? trimmedId : undefined,
          consent: true,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || t.errGeneric); setSubmitting(false); return }
      setDone({ already: !!d.alreadyMember })
    } catch {
      setError(t.errGeneric); setSubmitting(false)
    }
  }

  // Store LINE OA add-friend card (button + QR). Null when no OA is connected.
  const lineCard = lineAddUrl ? (
    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex flex-col items-center gap-3">
      <div className="text-center">
        <p className="text-sm font-bold text-emerald-800">{t.lineTitle}</p>
        <p className="text-[11px] text-emerald-700 mt-0.5 leading-snug">{t.lineHint}</p>
      </div>
      <a href={lineAddUrl} target="_blank" rel="noopener noreferrer"
        className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm text-center active:scale-[0.98] transition">
        {t.lineAddBtn}
      </a>
      {lineQr && (
        <div className="flex flex-col items-center gap-1.5">
          <div className="bg-white rounded-xl p-2 border border-emerald-100">
            <img src={lineQr} alt="LINE OA QR" className="w-36 h-36 object-contain" />
          </div>
          <p className="text-[10px] text-emerald-600">{t.lineScan}</p>
        </div>
      )}
    </div>
  ) : null

  // ─── Success screen ───────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5" style={{ userSelect: 'none' }}>
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-5xl mb-3">{done.already ? '😊' : '🎉'}</p>
          <h1 className="text-xl font-black text-gray-900">{done.already ? t.alreadyTitle : t.successTitle}</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">{done.already ? t.alreadyBody : t.successBody}</p>
          {storeName && <p className="text-xs text-gray-400 mt-4">{storeName}</p>}
          {lineCard && <div className="mt-5">{lineCard}</div>}
          {orderHref && (
            <a href={orderHref}
              className="mt-5 block w-full py-3.5 rounded-2xl bg-gray-900 text-white font-black text-sm active:scale-[0.98] transition">
              {t.backToOrder}
            </a>
          )}
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

          {/* Benefits — what you get by signing up (draws people in) */}
          {shownBenefits.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-4 mb-5">
              <p className="text-[11px] font-bold text-amber-700 uppercase tracking-widest mb-2.5">{t.benefitsTitle}</p>
              <div className="flex flex-col gap-2.5">
                {shownBenefits.map((b, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-lg leading-none shrink-0">{b.icon || '⭐'}</span>
                    <span className="text-sm text-gray-700 leading-snug">{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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

            {/* Promo contact channel — pick LINE / Telegram / WhatsApp, then id */}
            <Field label={t.contactTitle}>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {CHANNELS.map(c => {
                  const active = channel === c.key
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setChannel(active ? '' : c.key)}
                      className={`py-2.5 rounded-xl border-2 flex flex-col items-center gap-1 transition active:scale-95 ${
                        active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-base leading-none">{c.icon}</span>
                      <span className="text-[11px] font-bold">{c.label}</span>
                    </button>
                  )
                })}
              </div>
              {channel && (
                <input
                  value={contactId}
                  onChange={e => setContactId(e.target.value)}
                  placeholder={CHANNELS.find(c => c.key === channel)?.ph}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition"
                  style={{ userSelect: 'text' }}
                />
              )}
              <p className="text-[11px] text-gray-400 mt-1">{t.contactHint}</p>
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

            {lineCard}

            {orderHref && (
              <a href={orderHref}
                className="w-full py-3 rounded-2xl border border-gray-200 bg-white text-gray-600 font-bold text-sm text-center active:scale-[0.98] transition">
                {t.backToOrder}
              </a>
            )}
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
