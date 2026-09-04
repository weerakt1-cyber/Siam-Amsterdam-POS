'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/pos-auth'
import { useShift, type ShiftBreakType } from '@/lib/pos-shift'
import { usePosLang, type PosLang } from '@/lib/pos-i18n'

const BREAK_LABEL: Record<PosLang, Record<ShiftBreakType, string>> = {
  th: { meal: 'ทานข้าว', restroom: 'เข้าห้องน้ำ', other: 'อื่นๆ' },
  en: { meal: 'Meal', restroom: 'Restroom', other: 'Other' },
}
const BREAK_EMOJI: Record<ShiftBreakType, string> = { meal: '🍚', restroom: '🚻', other: '☕' }

// Page-local bilingual copy — same pattern the order pages use.
const T: Record<PosLang, Record<string, string>> = {
  th: {
    position: 'ตำแหน่ง', notClockedIn: 'ยังไม่ได้เข้ากะ',
    tapToStart: 'แตะเพื่อเริ่มกะ — ระบบ POS จะเปิดให้ใช้งานหลังเข้ากะ',
    saving: 'กำลังบันทึก…', clockIn: 'เข้ากะ', posLocked: 'POS · ล็อกอยู่',
    onBreak: 'พักเบรค', startedBreakAt: 'เริ่มพักเมื่อ', breakNoCount: 'เวลาพักไม่นับเป็นชั่วโมงทำงาน',
    backToWork: 'กลับมาทำงาน', working: 'กำลังทำงาน', clockedInAt: 'เข้ากะเมื่อ',
    goDashboard: 'ไปแดชบอร์ด →', openPos: 'เปิดหน้า POS →', breakHeading: 'พักเบรค', clockOut: 'ออกกะ',
    sumBreakTotal: 'พักรวม', sumWorked: 'ทำงาน', historyToday: 'ประวัติวันนี้',
    clockInLog: 'เข้ากะ', backToWorkLog: 'กลับมาทำงาน', clockSuffix: 'น.', hourSuffix: 'น',
  },
  en: {
    position: 'Role', notClockedIn: 'Not clocked in',
    tapToStart: 'Tap to start your shift — the POS unlocks once you clock in',
    saving: 'Saving…', clockIn: 'Clock in', posLocked: 'POS · Locked',
    onBreak: 'On break', startedBreakAt: 'Break started at', breakNoCount: "break time doesn't count as work hours",
    backToWork: 'Back to work', working: 'Working', clockedInAt: 'Clocked in at',
    goDashboard: 'Go to dashboard →', openPos: 'Open POS →', breakHeading: 'Break', clockOut: 'Clock out',
    sumBreakTotal: 'Break total', sumWorked: 'Worked', historyToday: "Today's history",
    clockInLog: 'Clock in', backToWorkLog: 'Back to work', clockSuffix: '', hourSuffix: 'h',
  },
}

const pad = (n: number) => String(n).padStart(2, '0')
const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` }
const hm  = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}:${pad(m % 60)}` }
const clockOf = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

export default function ShiftPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { lang } = usePosLang()
  const t = T[lang]
  const breakLabel = BREAK_LABEL[lang]
  const ctx = useShift()
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  // 1-second tick while a shift is active (drives the live timers).
  useEffect(() => {
    if (!ctx?.shift) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [ctx?.shift])

  if (!ctx) return null
  const { shift, onBreak, act } = ctx

  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  // ── derived times ──
  const openBreak = shift?.breaks.find(b => !b.end) ?? null
  const totalBreakMs = (shift?.breaks ?? []).reduce((s, b) => s + ((b.end ? Date.parse(b.end) : now) - Date.parse(b.start)), 0)
  const workedMs = shift ? (now - Date.parse(shift.clockIn)) - totalBreakMs : 0
  const breakMs  = openBreak ? now - Date.parse(openBreak.start) : 0

  const initial = (user?.name ?? '?').charAt(0).toUpperCase()

  return (
    <div className="flex-1 bg-[#FAF8F4] text-stone-900 overflow-y-auto">
      <div className="w-full max-w-md mx-auto px-5 pt-6 pb-24">

        {/* who */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl grid place-items-center text-white font-black text-lg shrink-0"
            style={{ background: user?.color || '#10b981' }}>{initial}</div>
          <div className="min-w-0">
            <p className="font-bold text-stone-900 leading-tight truncate">{user?.name ?? '—'}</p>
            <p className="text-xs text-stone-500 mt-0.5">{t.position} <span className="text-amber-600 font-semibold">{(user?.title && user.title.trim()) || user?.role || 'staff'}</span></p>
          </div>
        </div>

        {/* clock card */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 text-center shadow-sm">
          {!shift ? (
            <>
              <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold px-3 py-1.5 rounded-full bg-stone-100 text-stone-500 mb-4">
                <span className="w-2 h-2 rounded-full bg-stone-300" /> {t.notClockedIn}
              </span>
              <div className="text-5xl my-1">🕐</div>
              <p className="text-[13px] text-stone-400 mt-2 leading-relaxed">{t.tapToStart}</p>
              <button onClick={() => run(() => act('clock_in'))} disabled={busy}
                className="w-full mt-5 py-4 rounded-2xl font-bold text-[17px] text-emerald-950 bg-gradient-to-b from-emerald-400 to-emerald-500 shadow-lg shadow-emerald-500/30 transition active:scale-[.98] disabled:opacity-60">
                {busy ? t.saving : `✓ ${t.clockIn}`}
              </button>
              <div className="w-full mt-3 py-3.5 rounded-2xl bg-stone-100 text-stone-400 font-bold text-sm flex items-center justify-center gap-2">
                🔒 {t.posLocked}
              </div>
            </>
          ) : onBreak ? (
            <>
              <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold px-3 py-1.5 rounded-full bg-orange-100 text-orange-700 mb-4">
                <span className="w-2 h-2 rounded-full bg-orange-500" /> {t.onBreak} · {breakLabel[openBreak!.type]} {BREAK_EMOJI[openBreak!.type]}
              </span>
              <div className="text-5xl font-black text-orange-500 tabular-nums tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>{hms(breakMs)}</div>
              <p className="text-[12.5px] text-stone-500 mt-3">{t.startedBreakAt} <b className="text-stone-900">{clockOf(openBreak!.start)}</b> {t.clockSuffix} · {t.breakNoCount}</p>
              <button onClick={() => run(() => act('break_end'))} disabled={busy}
                className="w-full mt-5 py-4 rounded-2xl font-bold text-[17px] text-amber-950 bg-gradient-to-b from-amber-400 to-amber-500 shadow-lg shadow-amber-500/30 transition active:scale-[.98] disabled:opacity-60">
                ▶ {t.backToWork}
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> {t.working}
              </span>
              <div className="text-5xl font-black text-stone-900 tabular-nums tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>{hms(workedMs)}</div>
              <p className="text-[13px] text-stone-500 mt-2.5">{t.clockedInAt} <b className="text-stone-900">{clockOf(shift.clockIn)}</b> {t.clockSuffix}</p>

              <button onClick={() => router.push(user?.role === 'manager' ? '/pos/manager' : '/pos')}
                className="w-full mt-5 py-4 rounded-2xl bg-stone-900 text-white font-bold text-[15px] transition active:scale-[.98] flex items-center justify-center gap-2">
                {user?.role === 'manager' ? t.goDashboard : t.openPos}
              </button>

              <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wide mt-6 mb-2 text-left">{t.breakHeading}</p>
              <div className="grid grid-cols-3 gap-2">
                {(['meal', 'restroom', 'other'] as ShiftBreakType[]).map(type => (
                  <button key={type} onClick={() => run(() => act('break_start', type))} disabled={busy}
                    className="py-3 rounded-xl bg-orange-50 border border-orange-100 text-orange-700 font-semibold text-[13px] flex flex-col items-center gap-1 transition active:scale-95 disabled:opacity-60">
                    <span className="text-lg leading-none">{BREAK_EMOJI[type]}</span>
                    {breakLabel[type]}
                  </button>
                ))}
              </div>

              <button onClick={() => run(() => act('clock_out'))} disabled={busy}
                className="w-full mt-4 py-3.5 rounded-2xl bg-red-50 text-red-600 font-bold text-[15px] transition active:scale-[.98] disabled:opacity-60">
                ⏹ {t.clockOut}
              </button>
            </>
          )}
        </div>

        {/* today summary */}
        {shift && (
          <div className="grid grid-cols-3 gap-2.5 mt-5">
            {[
              [t.clockIn, clockOf(shift.clockIn)],
              [t.sumBreakTotal, totalBreakMs > 0 ? `${hm(totalBreakMs)}${t.hourSuffix}` : `0${t.hourSuffix}`],
              [t.sumWorked, hm(workedMs)],
            ].map(([k, v]) => (
              <div key={k} className="bg-white border border-stone-200 rounded-2xl py-3 text-center">
                <p className="font-black text-lg text-stone-900 tabular-nums">{v}</p>
                <p className="text-[11px] text-stone-500 mt-0.5">{k}</p>
              </div>
            ))}
          </div>
        )}

        {/* activity log */}
        {shift && (
          <div className="mt-6">
            <p className="text-sm font-bold text-stone-900 mb-2">{t.historyToday}</p>
            <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
              <Row icon="🟢" label={t.clockInLog} time={clockOf(shift.clockIn)} />
              {shift.breaks.map((b, i) => (
                <div key={i}>
                  <Row icon={BREAK_EMOJI[b.type]} label={`${t.onBreak} · ${breakLabel[b.type]}`} time={clockOf(b.start)} />
                  {b.end && <Row icon="▶️" label={t.backToWorkLog} time={clockOf(b.end)} muted />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ icon, label, time, muted }: { icon: string; label: string; time: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-base leading-none">{icon}</span>
      <span className={`flex-1 text-[13.5px] ${muted ? 'text-stone-500' : 'text-stone-900 font-medium'}`}>{label}</span>
      <span className="text-[13px] font-semibold text-stone-500 tabular-nums">{time}</span>
    </div>
  )
}
