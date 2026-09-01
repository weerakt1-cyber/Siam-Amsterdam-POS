'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { authedFetch } from '@/lib/supabase-browser'
import { usePosLang } from '@/lib/pos-i18n'

// A tiny, dismissible get-started card shown on the FIRST landing on /pos (the
// POS home only — not the sub-pages). Three steps, not a modal maze: the store
// name/logo step is already done at signup; the other two link straight to where
// the owner finishes them, and each is skippable. Dismissal is persisted per
// store in app_config (via /api/onboarding), so it stays gone across devices.
export default function OnboardingChecklist() {
  const { lang } = usePosLang()
  const L = (en: string, th: string) => (lang === 'en' ? en : th)
  const pathname = usePathname()
  const [state, setState] = useState<'loading' | 'show' | 'hidden'>('loading')

  useEffect(() => {
    if (pathname !== '/pos') { setState('hidden'); return }
    let alive = true
    ;(async () => {
      try {
        const r = await authedFetch('/api/onboarding')
        const d = r.ok ? await r.json() : { dismissed: true }
        if (alive) setState(d.dismissed ? 'hidden' : 'show')
      } catch {
        if (alive) setState('hidden')   // don't nag if we can't tell
      }
    })()
    return () => { alive = false }
  }, [pathname])

  async function dismiss() {
    setState('hidden')
    try { await authedFetch('/api/onboarding', { method: 'POST' }) } catch { /* best-effort */ }
  }

  if (state !== 'show') return null

  const steps = [
    { done: true,  label: L('Set store name / logo', 'ตั้งชื่อร้าน / โลโก้'), href: '/pos/settings', hint: L('Done at signup', 'เสร็จแล้วตอนสมัคร') },
    { done: false, label: L('Add real menu items, or use the samples for now', 'เพิ่มเมนูจริง หรือใช้เมนูตัวอย่างไปก่อน'), href: '/pos/items', hint: L('You can edit/delete the samples', 'แก้ไข/ลบเมนูตัวอย่างได้') },
    { done: false, label: L('Set up the printer', 'ตั้งค่าเครื่องพิมพ์'), href: '/pos/settings', hint: L('Skippable — set it up later', 'ข้ามได้ ตั้งทีหลังก็ได้') },
  ]

  return (
    <div className="mx-3 mt-3 rounded-2xl border border-amber-300 bg-amber-50 shadow-sm">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <p className="text-sm font-black text-gray-900">{L('🎉 Get started with PLOEN POS', '🎉 เริ่มต้นใช้งาน PLOEN POS')}</p>
          <p className="text-[12px] text-gray-600 mt-0.5">{L('Three quick steps and you\'re ready to sell', 'ทำ 3 ขั้นตอนสั้นๆ แล้วพร้อมขายได้เลย')}</p>
        </div>
        <button onClick={dismiss} aria-label={L('Close', 'ปิด')}
          className="shrink-0 -mt-1 -mr-1 w-8 h-8 rounded-full text-gray-400 hover:text-gray-700 hover:bg-amber-100 transition text-lg leading-none">
          ✕
        </button>
      </div>
      <ul className="px-4 py-3 flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i}>
            <Link href={s.href}
              className="flex items-center gap-3 rounded-xl bg-white/70 hover:bg-white border border-amber-200 px-3 py-2 transition active:scale-[0.99]">
              <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black ${
                s.done ? 'bg-emerald-500 text-white' : 'bg-amber-200 text-amber-800'}`}>
                {s.done ? '✓' : i + 1}
              </span>
              <span className="flex-1">
                <span className={`text-[13px] font-semibold ${s.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{s.label}</span>
                <span className="block text-[11px] text-gray-500">{s.hint}</span>
              </span>
              {!s.done && <span className="text-amber-500 text-sm">→</span>}
            </Link>
          </li>
        ))}
      </ul>
      <div className="px-4 pb-3">
        <button onClick={dismiss} className="text-[12px] text-gray-500 hover:text-gray-800 underline underline-offset-2">
          {L('Skip for now', 'ข้ามไปก่อน')}
        </button>
      </div>
    </div>
  )
}
