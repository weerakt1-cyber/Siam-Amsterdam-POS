'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Post-signup landing, phone-first: an Android sideload install screen for the
// APK (real download from NEXT_PUBLIC_APK_URL) with a step-by-step guide, plus
// an iPhone tab that explains the PWA "add to home screen" path. The lighter
// "install as home-screen app" (PWA) stays as a secondary option on Android.
const APK_URL = (process.env.NEXT_PUBLIC_APK_URL || '').trim()

type InstallPrompt = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> }

const STEPS: { t: string; h: string }[] = [
  { t: 'ดาวน์โหลดไฟล์ APK', h: 'กดปุ่มด้านบน รอจนโหลดเสร็จ' },
  { t: 'เปิดไฟล์ที่ดาวน์โหลด', h: 'แตะที่แถบแจ้งเตือน หรือในโฟลเดอร์ Downloads' },
  { t: 'อนุญาต “ติดตั้งจากแหล่งนี้”', h: 'ถ้าถูกถาม ให้เปิดสวิตช์แล้วย้อนกลับ' },
  { t: 'กด “ติดตั้ง” แล้วเปิดแอป', h: 'ล็อกอินด้วยอีเมล + รหัสผ่านของร้าน' },
]

export default function WelcomePage() {
  const router = useRouter()
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [plat, setPlat] = useState<'android' | 'ios'>('android')

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIOS(ios)
    if (ios) setPlat('ios')
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallPrompt) }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!deferred) return
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }

  const Tab = ({ id, label, children }: { id: 'android' | 'ios'; label: string; children: React.ReactNode }) => (
    <button
      role="tab"
      aria-selected={plat === id}
      onClick={() => setPlat(id)}
      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-bold transition ${
        plat === id ? 'bg-gray-800 text-white shadow' : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {children}{label}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm flex flex-col gap-6">

        {/* ── App identity ── */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-[84px] h-[84px] rounded-[22px] grid place-items-center shadow-xl shadow-amber-500/40 bg-gradient-to-br from-amber-300 via-amber-500 to-amber-600">
            <svg viewBox="0 0 24 24" fill="none" className="w-11 h-11">
              <path d="M6 2.6h9.4a1 1 0 01.7.3l3 3a1 1 0 01.3.7V20a1.4 1.4 0 01-2.1 1.2L15 20l-2 1.3a1.4 1.4 0 01-1.5 0L9.5 20l-2.3 1.2A1.4 1.4 0 015 20V4a1.4 1.4 0 011-1.4z" fill="#fff" fillOpacity=".95" />
              <path d="M8.5 8h7M8.5 11.2h7M8.5 14.4h4.2" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-2xl font-black tracking-tight">BAZE<span className="text-amber-500"> POS</span></p>
          <p className="text-gray-400 text-sm leading-relaxed max-w-[27ch]">
            ร้านของคุณพร้อมแล้ว 🎉 ติดตั้งแอปลงเครื่องเพื่อใช้งานได้เต็มที่
          </p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {[['เวอร์ชัน', '1.0'], ['', '3.2 MB'], ['Android', '8.0+']].map(([k, v], i) => (
              <span key={i} className="text-[11px] font-semibold text-gray-400 bg-gray-800/70 border border-gray-800 rounded-full px-2.5 py-1">
                {k && `${k} `}<span className="text-white tabular-nums">{v}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Platform tabs ── */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1" role="tablist" aria-label="เลือกอุปกรณ์">
          <Tab id="android" label="Android">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><path d="M6 9h12v8a2 2 0 01-2 2H8a2 2 0 01-2-2V9z" stroke="currentColor" strokeWidth="1.6" /><path d="M9 9V7a3 3 0 016 0v2M8.5 4l-1-1.6M15.5 4l1-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </Tab>
          <Tab id="ios" label="iPhone">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><rect x="7" y="2.5" width="10" height="19" rx="2.4" stroke="currentColor" strokeWidth="1.6" /><path d="M11 19h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </Tab>
        </div>

        {plat === 'android' ? (
          <>
            {/* APK download */}
            <div>
              {APK_URL ? (
                <a href={APK_URL} download
                  className="w-full flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl font-black text-[15px] text-black bg-gradient-to-b from-amber-400 to-amber-500 shadow-lg shadow-amber-500/40 transition active:scale-[.98]">
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ดาวน์โหลดแอป (APK)
                </a>
              ) : (
                <div className="w-full text-center px-4 py-4 rounded-2xl bg-gray-900 border border-gray-800 text-gray-500 text-sm">
                  ไฟล์ติดตั้งยังไม่พร้อม — ใช้ “เพิ่มลงหน้าจอ” ด้านล่างไปก่อน
                </div>
              )}
              <p className="text-center text-gray-500 text-[11.5px] mt-2">ไฟล์ .apk · ติดตั้งนอก Play Store</p>

              {/* PWA fallback / lighter option */}
              {installed ? (
                <p className="text-emerald-400 text-[13px] text-center mt-3">✓ เพิ่มลงหน้าจอแล้ว เปิดจากไอคอนได้เลย</p>
              ) : deferred ? (
                <button onClick={install}
                  className="w-full mt-3 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-200 text-[13px] font-semibold transition active:scale-[.98]">
                  หรือ เพิ่มลงหน้าจอ (ใช้ทันที ไม่ต้องติดตั้ง)
                </button>
              ) : null}
            </div>

            {/* Install steps */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold">วิธีติดตั้ง</h2>
                <span className="flex-1 h-px bg-gray-800/80" />
              </div>
              <ol className="flex flex-col gap-0.5">
                {STEPS.map((s, i) => (
                  <li key={i} className="flex gap-3 items-start py-2 px-1">
                    <span className="flex-none w-6 h-6 rounded-lg bg-gray-800 border border-gray-700 grid place-items-center text-[13px] font-bold text-gray-400 tabular-nums">{i + 1}</span>
                    <div className="pt-0.5">
                      <p className="text-[13.5px] leading-snug">{s.t}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{s.h}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Requirements */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold">ต้องมี</h2>
                <span className="flex-1 h-px bg-gray-800/80" />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-2.5">
                {[
                  ['Android 8.0 ขึ้นไป', <path key="a" d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />],
                  ['เปิด Bluetooth เพื่อต่อเครื่องพิมพ์ใบเสร็จ', <path key="b" d="M7 7l10 10-5 4V3l5 4L7 17" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />],
                  ['เปิด Location ตอนจับคู่เครื่องพิมพ์ครั้งแรก', <g key="c"><path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" /><circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" fill="none" /></g>],
                ].map(([label, path], i) => (
                  <div key={i} className="flex gap-2.5 items-center text-[12.5px] text-gray-300">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 flex-none text-amber-500">{path as React.ReactNode}</svg>
                    <span>{label as string}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* iPhone: PWA */
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-[13.5px] text-gray-300 leading-relaxed">
              iPhone / iPad ยังไม่มีไฟล์ติดตั้ง — ใช้ผ่านเว็บได้เลย เพิ่มลงหน้าจอโฮมเพื่อเปิดแบบเต็มจอ
            </p>
            <p className="text-[13.5px] text-gray-300 leading-relaxed mt-3">
              เปิดใน Safari → กดปุ่ม <span className="text-white font-semibold bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">แชร์ ⎋</span> → เลือก{' '}
              <span className="text-white font-semibold bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">เพิ่มไปยังหน้าจอโฮม</span>
            </p>
            <p className="text-gray-500 text-[12px] mt-3">หมายเหตุ: เครื่องพิมพ์ Bluetooth รองรับบน Android เท่านั้น</p>
          </div>
        )}

        {/* Enter */}
        <button onClick={() => router.replace('/pos')}
          className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 rounded-xl text-black font-black text-sm transition-all active:scale-95">
          เข้าใช้งานเลย →
        </button>
      </div>
    </div>
  )
}
