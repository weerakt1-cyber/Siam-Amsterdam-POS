'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Public download page. Visitors pick their device — Tablet (the main POS
// counter machine) or Smartphone (Android/iPhone) — and get the right install
// path. It's one app today: both Android tracks download the same APK (the app
// adapts to screen size), iPhone uses the web app (PWA). The phone-optimized UI
// is a follow-up; this page just routes people to the correct install.
const APK_URL = (process.env.NEXT_PUBLIC_APK_URL || '').trim()

type Device = 'tablet' | 'phone'
type Mobile = 'android' | 'ios'

const STEPS = [
  { t: 'ดาวน์โหลดไฟล์ APK', h: 'กดปุ่มด้านบน รอจนโหลดเสร็จ' },
  { t: 'เปิดไฟล์ที่ดาวน์โหลด', h: 'แตะที่แถบแจ้งเตือน หรือในโฟลเดอร์ Downloads' },
  { t: 'อนุญาต “ติดตั้งจากแหล่งนี้”', h: 'ถ้าถูกถาม ให้เปิดสวิตช์แล้วย้อนกลับ' },
  { t: 'กด “ติดตั้ง” แล้วเปิดแอป', h: 'ล็อกอินด้วยอีเมล + รหัสผ่านของร้าน' },
]

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold text-gray-400 bg-gray-800/70 border border-gray-800 rounded-full px-2.5 py-1">
      {children}
    </span>
  )
}

function ApkButton() {
  if (!APK_URL) {
    return (
      <div className="w-full text-center px-4 py-4 rounded-2xl bg-gray-900 border border-gray-800 text-gray-500 text-sm">
        ไฟล์ติดตั้งยังไม่พร้อม — ลองใหม่อีกครั้งภายหลัง
      </div>
    )
  }
  return (
    <a href={APK_URL} download
      className="w-full flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl font-black text-[15px] text-black bg-gradient-to-b from-amber-400 to-amber-500 shadow-lg shadow-amber-500/40 transition active:scale-[.98]">
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ดาวน์โหลดแอป (APK)
    </a>
  )
}

function Steps() {
  return (
    <ol className="flex flex-col gap-0.5">
      {STEPS.map((s, i) => (
        <li key={i} className="flex gap-3 items-start py-2 px-1">
          <span className="flex-none w-6 h-6 rounded-lg bg-gray-800 border border-gray-700 grid place-items-center text-[13px] font-bold text-gray-400 tabular-nums">{i + 1}</span>
          <div className="pt-0.5">
            <p className="text-[13.5px] leading-snug text-white">{s.t}</p>
            <p className="text-gray-500 text-xs mt-0.5">{s.h}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function SecHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-sm font-bold text-white">{children}</h2>
      <span className="flex-1 h-px bg-gray-800/80" />
    </div>
  )
}

export default function DownloadPage() {
  const [device, setDevice] = useState<Device>('tablet')
  const [mobile, setMobile] = useState<Mobile>('android')

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const phone = ios || (/android/i.test(navigator.userAgent) && /mobile/i.test(navigator.userAgent))
    if (phone) setDevice('phone')
    if (ios) setMobile('ios')
  }, [])

  const DeviceCard = ({ id, icon, title, sub, badge }: { id: Device; icon: React.ReactNode; title: string; sub: string; badge?: string }) => (
    <button
      onClick={() => setDevice(id)}
      aria-pressed={device === id}
      className={`relative flex-1 text-left rounded-2xl p-4 border transition active:scale-[.99] ${
        device === id ? 'bg-amber-500/10 border-amber-500/60' : 'bg-gray-900 border-gray-800 hover:border-gray-700'
      }`}
    >
      {badge && <span className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-wider bg-amber-500 text-black px-2 py-0.5 rounded-full">{badge}</span>}
      <div className={`w-10 h-10 rounded-xl grid place-items-center mb-3 ${device === id ? 'bg-amber-500 text-black' : 'bg-gray-800 text-gray-300'}`}>{icon}</div>
      <p className="font-bold text-sm text-white">{title}</p>
      <p className="text-gray-400 text-xs mt-0.5 leading-snug">{sub}</p>
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* header */}
      <header className="w-full max-w-2xl mx-auto px-6 py-5 flex items-center justify-between">
        <span className="font-black text-lg tracking-tight">🚀 PLOEN<span className="text-amber-500"> POS</span></span>
        <Link href="/" className="text-sm text-gray-400 hover:text-white transition">หน้าแรก</Link>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-6 pb-16">
        <div className="text-center mt-4 mb-8">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">ดาวน์โหลดแอป PLOEN POS</h1>
          <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            เลือกอุปกรณ์ของคุณ — ใช้บนแท็บเล็ตเป็นเครื่องหลักหน้าร้าน หรือบนมือถือเพื่อดูออเดอร์และยอดขายระหว่างวัน
          </p>
        </div>

        {/* device chooser */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <DeviceCard
            id="tablet" badge="แนะนำ"
            title="แท็บเล็ต (เครื่องหลัก POS)"
            sub="สำหรับหน้าร้าน จอใหญ่ ขายและจัดการทั้งวัน + เครื่องพิมพ์ Bluetooth"
            icon={<svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M18 8v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
          />
          <DeviceCard
            id="phone"
            title="มือถือ (Android / iPhone)"
            sub="สำหรับเจ้าของร้าน/พนักงาน ดูสถานะร้านจากที่ไหนก็ได้"
            icon={<svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><rect x="7" y="2.5" width="10" height="19" rx="2.4" stroke="currentColor" strokeWidth="1.7" /><path d="M11 19h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
          />
        </div>

        {/* panel */}
        <div className="bg-gray-900/40 border border-gray-800 rounded-3xl p-5 sm:p-7 max-w-md mx-auto">
          {device === 'tablet' ? (
            <>
              <div className="flex flex-wrap gap-1.5 justify-center mb-5">
                <Chip>Android <span className="text-white">8.0+</span></Chip>
                <Chip>จอ <span className="text-white">10&quot;</span> ขึ้นไป</Chip>
                <Chip>Bluetooth printer</Chip>
              </div>
              <ApkButton />
              <p className="text-center text-gray-500 text-[11.5px] mt-2">ไฟล์ .apk · ติดตั้งนอก Play Store</p>

              <div className="mt-7"><SecHead>วิธีติดตั้ง</SecHead><Steps /></div>

              <div className="mt-6">
                <SecHead>ต้องมี</SecHead>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-2.5 text-[12.5px] text-gray-300">
                  <div className="flex gap-2.5 items-center"><span className="text-amber-500">•</span> แท็บเล็ต Android 8.0 ขึ้นไป (แนะนำจอ 10 นิ้ว+)</div>
                  <div className="flex gap-2.5 items-center"><span className="text-amber-500">•</span> เปิด Bluetooth + Location เพื่อต่อเครื่องพิมพ์ใบเสร็จ</div>
                  <div className="flex gap-2.5 items-center"><span className="text-amber-500">•</span> เชื่อมต่ออินเทอร์เน็ต (Wi-Fi หรือซิม)</div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* mobile note */}
              <div className="mb-5 text-[12px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-center leading-relaxed">
                หน้าจอมือถือกำลังปรับ UI ให้เหมาะกับจอเล็ก — ใช้งานได้แล้ว และจะดีขึ้นเร็ว ๆ นี้
              </div>

              {/* android / ios sub-toggle */}
              <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-5" role="tablist">
                {(['android', 'ios'] as Mobile[]).map(m => (
                  <button key={m} role="tab" aria-selected={mobile === m} onClick={() => setMobile(m)}
                    className={`flex-1 py-2 rounded-lg text-[13px] font-bold transition ${mobile === m ? 'bg-gray-800 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
                    {m === 'android' ? 'Android' : 'iPhone'}
                  </button>
                ))}
              </div>

              {mobile === 'android' ? (
                <>
                  <div className="flex flex-wrap gap-1.5 justify-center mb-5"><Chip>Android <span className="text-white">8.0+</span></Chip><Chip><span className="text-white">3.2</span> MB</Chip></div>
                  <ApkButton />
                  <p className="text-center text-gray-500 text-[11.5px] mt-2">ไฟล์ .apk · ติดตั้งนอก Play Store</p>
                  <div className="mt-7"><SecHead>วิธีติดตั้ง</SecHead><Steps /></div>
                </>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-[13.5px] text-gray-300 leading-relaxed">
                    iPhone / iPad ใช้ผ่านเว็บได้เลย เพิ่มลงหน้าจอโฮมเพื่อเปิดแบบเต็มจอ:
                  </p>
                  <p className="text-[13.5px] text-gray-300 leading-relaxed mt-3">
                    เปิดใน Safari → กดปุ่ม <span className="text-white font-semibold bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">แชร์ ⎋</span> → เลือก{' '}
                    <span className="text-white font-semibold bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">เพิ่มไปยังหน้าจอโฮม</span>
                  </p>
                  <a href="/pos" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-amber-400 hover:text-amber-300">เปิดเว็บแอปเลย →</a>
                  <p className="text-gray-500 text-[12px] mt-3">หมายเหตุ: เครื่องพิมพ์ Bluetooth รองรับบน Android เท่านั้น</p>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-8">
          ยังไม่มีร้าน? <Link href="/signup" className="text-amber-400 font-semibold">เปิดร้านฟรี 15 วัน</Link>
        </p>
      </main>
    </div>
  )
}
