'use client'

import { useState, useEffect, use, useCallback, useRef } from 'react'
import { type TableTile, zonesFromTiles } from '@/lib/floor'
import type { Reservation, ReservationStatus } from '@/lib/reservations'

type Lang = 'th' | 'en' | 'ru'
type Phase = 'info' | 'form' | 'tracking'

// ─── Self-contained bilingual copy (stands alone from POS/order i18n) ─────────
const T = {
  th: {
    brandTag: 'จองโต๊ะ / จองงานอีเวนต์',
    // info
    infoTitle: 'เริ่มการจอง',
    infoSubtitle: 'เข้าสู่ระบบด้วยเบอร์สมาชิก หรือใส่ชื่อเพื่อจองแบบทั่วไป',
    member: 'สมาชิก',
    guest: 'ลูกค้าทั่วไป',
    memberPhone: 'เบอร์โทรสมาชิก',
    phonePh: '08x-xxx-xxxx',
    lookup: 'ตรวจสอบ',
    lookingUp: 'กำลังตรวจสอบ…',
    memberFound: 'ยินดีต้อนรับ',
    memberNotFound: 'ไม่พบเบอร์นี้ในระบบสมาชิก ลองใหม่ หรือจองแบบทั่วไป',
    guestName: 'ชื่อของคุณ',
    guestNamePh: 'เช่น สมชาย',
    continue: 'ต่อไป',
    // form
    formTitle: 'รายละเอียดการจอง',
    zone: 'โซน',
    zoneAny: 'ไม่ระบุโซน',
    table: 'โต๊ะ',
    tableAny: 'ให้ร้านจัดให้',
    tableTaken: 'ถูกจองแล้ว',
    seats: 'ที่นั่ง',
    date: 'วันที่',
    startTime: 'เวลาเริ่ม',
    duration: 'ระยะเวลา',
    ppl: 'จำนวนคน',
    eventName: 'ชื่องาน / โอกาส (ไม่บังคับ)',
    eventNamePh: 'เช่น วันเกิด, เลี้ยงบริษัท',
    phone: 'เบอร์ติดต่อ',
    requirements: 'สิ่งที่อยากให้ร้านเตรียม (ไม่บังคับ)',
    requirementsPh: 'เช่น เค้กวันเกิด, ที่นั่งริมหน้าต่าง, เก้าอี้เด็ก',
    submit: 'ส่งคำขอจอง',
    submitting: 'กำลังส่ง…',
    back: 'ย้อนกลับ',
    hours: 'ชั่วโมง',
    errDate: 'กรุณาเลือกวันและเวลา',
    errTaken: 'โต๊ะนี้ถูกจองในช่วงเวลานี้แล้ว กรุณาเลือกโต๊ะหรือเวลาอื่น',
    errGeneric: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
    // tracking
    ref: 'รหัสการจอง',
    statusPending: 'รอร้านยืนยัน',
    statusPendingBody: 'เราส่งคำขอให้ร้านแล้ว กรุณารอการยืนยันสักครู่ หน้านี้จะอัปเดตอัตโนมัติ',
    statusApproved: 'ยืนยันการจองแล้ว!',
    statusApprovedBody: 'ร้านยืนยันการจองของคุณเรียบร้อยแล้ว แล้วพบกันนะ 🎉',
    statusRejected: 'ไม่สามารถรับจองได้',
    statusRejectedBody: 'ขออภัย ร้านไม่สามารถรับการจองนี้ได้',
    statusCancelled: 'ยกเลิกการจองแล้ว',
    shopMessage: 'ข้อความจากร้าน',
    yourBooking: 'รายละเอียดการจอง',
    cancel: 'ยกเลิกการจอง',
    cancelConfirm: 'ยืนยันยกเลิกการจองนี้?',
    newBooking: 'จองใหม่',
    people: 'คน',
    openHours: 'เวลาทำการ',
  },
  en: {
    brandTag: 'Table & Event Reservations',
    infoTitle: 'Start your booking',
    infoSubtitle: 'Log in with your member phone, or enter a name to book as a guest',
    member: 'Member',
    guest: 'Guest',
    memberPhone: 'Member phone',
    phonePh: '08x-xxx-xxxx',
    lookup: 'Check',
    lookingUp: 'Checking…',
    memberFound: 'Welcome',
    memberNotFound: 'No member found for this number. Try again, or book as a guest.',
    guestName: 'Your name',
    guestNamePh: 'e.g. John',
    continue: 'Continue',
    formTitle: 'Booking details',
    zone: 'Zone',
    zoneAny: 'Any zone',
    table: 'Table',
    tableAny: 'Let the venue assign',
    tableTaken: 'Booked',
    seats: 'seats',
    date: 'Date',
    startTime: 'Start time',
    duration: 'Duration',
    ppl: 'Party size',
    eventName: 'Event / occasion (optional)',
    eventNamePh: 'e.g. Birthday, company dinner',
    phone: 'Contact number',
    requirements: 'Anything to prepare (optional)',
    requirementsPh: 'e.g. birthday cake, window seat, high chair',
    submit: 'Send booking request',
    submitting: 'Sending…',
    back: 'Back',
    hours: 'hours',
    errDate: 'Please choose a date and time',
    errTaken: 'That table is already booked for this time. Pick another table or time.',
    errGeneric: 'Something went wrong. Please try again.',
    ref: 'Booking reference',
    statusPending: 'Waiting for confirmation',
    statusPendingBody: "We've sent your request to the venue. This page updates automatically once they confirm.",
    statusApproved: 'Booking confirmed!',
    statusApprovedBody: 'The venue has confirmed your reservation. See you soon 🎉',
    statusRejected: 'Booking not available',
    statusRejectedBody: "Sorry, the venue couldn't accept this booking.",
    statusCancelled: 'Booking cancelled',
    shopMessage: 'Message from the venue',
    yourBooking: 'Your booking',
    cancel: 'Cancel booking',
    cancelConfirm: 'Cancel this booking?',
    newBooking: 'New booking',
    people: 'people',
    openHours: 'Opening hours',
  },
  ru: {
    brandTag: 'Бронирование столов и мероприятий',
    infoTitle: 'Начать бронирование',
    infoSubtitle: 'Войдите по номеру телефона участника или укажите имя как гость',
    member: 'Участник',
    guest: 'Гость',
    memberPhone: 'Телефон участника',
    phonePh: '08x-xxx-xxxx',
    lookup: 'Проверить',
    lookingUp: 'Проверка…',
    memberFound: 'Добро пожаловать',
    memberNotFound: 'Участник с этим номером не найден. Попробуйте снова или забронируйте как гость.',
    guestName: 'Ваше имя',
    guestNamePh: 'например, Иван',
    continue: 'Далее',
    formTitle: 'Детали бронирования',
    zone: 'Зона',
    zoneAny: 'Любая зона',
    table: 'Стол',
    tableAny: 'На усмотрение заведения',
    tableTaken: 'Занят',
    seats: 'мест',
    date: 'Дата',
    startTime: 'Время начала',
    duration: 'Длительность',
    ppl: 'Кол-во гостей',
    eventName: 'Событие / повод (необязательно)',
    eventNamePh: 'например, день рождения, корпоратив',
    phone: 'Контактный номер',
    requirements: 'Что подготовить (необязательно)',
    requirementsPh: 'например, торт, столик у окна, детский стул',
    submit: 'Отправить заявку',
    submitting: 'Отправка…',
    back: 'Назад',
    hours: 'ч',
    errDate: 'Пожалуйста, выберите дату и время',
    errTaken: 'Этот стол уже забронирован на это время. Выберите другой стол или время.',
    errGeneric: 'Что-то пошло не так. Попробуйте ещё раз.',
    ref: 'Код бронирования',
    statusPending: 'Ожидание подтверждения',
    statusPendingBody: 'Мы отправили вашу заявку заведению. Эта страница обновится автоматически после подтверждения.',
    statusApproved: 'Бронирование подтверждено!',
    statusApprovedBody: 'Заведение подтвердило вашу бронь. До скорой встречи 🎉',
    statusRejected: 'Бронирование недоступно',
    statusRejectedBody: 'К сожалению, заведение не смогло принять эту бронь.',
    statusCancelled: 'Бронирование отменено',
    shopMessage: 'Сообщение от заведения',
    yourBooking: 'Ваше бронирование',
    cancel: 'Отменить бронь',
    cancelConfirm: 'Отменить это бронирование?',
    newBooking: 'Новое бронирование',
    people: 'чел.',
    openHours: 'Часы работы',
  },
} as const

// ─── Time helpers ─────────────────────────────────────────────────────────────
const DEFAULT_OPEN = '10:00'
const DEFAULT_CLOSE = '23:00'
const DURATIONS = [1, 1.5, 2, 3, 4, 5, 6, 8] as const   // hours, up to 8h max
const END_OF_DAY_MIN = 23 * 60 + 59

const isHHMM = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
function toMin(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function fromMin(x: number): string {
  const m = Math.max(0, Math.min(END_OF_DAY_MIN, Math.round(x)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Effective closing minute for a same-day booking model. If close ≤ open (shop
// runs past midnight), we can't store an end past 23:59, so we cap there.
function effectiveCloseMin(open: string, close: string): number {
  const o = toMin(open), c = toMin(close)
  return c > o ? c : END_OF_DAY_MIN
}

// 30-min start slots from open up to 30 min before (effective) close.
function startSlots(open: string, close: string): string[] {
  const o = toMin(open), c = effectiveCloseMin(open, close)
  const out: string[] = []
  for (let m = o; m <= c - 30; m += 30) out.push(fromMin(m))
  return out.length ? out : [open]
}

// End time = start + duration, clamped to (effective) closing time — so a long
// booking near closing shows/stores an honest end that matches what's shown.
function endFor(start: string, hours: number, open: string, close: string): string {
  return fromMin(Math.min(effectiveCloseMin(open, close), toMin(start) + Math.round(hours * 60)))
}

// The venue's local (Bangkok) calendar day — so the date picker's min and
// default match the server's past-date guard, not the phone's UTC offset.
// en-CA formats as YYYY-MM-DD.
function todayISO() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

const INPUT = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition'

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReservePage({ params }: { params: Promise<{ store: string }> }) {
  const { store } = use(params)

  const [lang, setLang] = useState<Lang>('th')
  const t = T[lang]

  const [storeName, setStoreName] = useState('')
  const [phase, setPhase] = useState<Phase>('info')

  const sfetch = useCallback((path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set('x-store-id', store)
    return fetch(path, { ...init, headers })
  }, [store])

  // ── Identity (login) ──
  const [entryMode, setEntryMode] = useState<'member' | 'guest'>('member')
  const [memberPhone, setMemberPhone] = useState('')
  const [memberName, setMemberName] = useState('')
  const [guestName, setGuestName] = useState('')
  const [lookupErr, setLookupErr] = useState('')
  const [lookingUp, setLookingUp] = useState(false)

  const displayName = entryMode === 'member' ? memberName : guestName.trim()

  // ── Floor tiles / zones ──
  const [tiles, setTiles] = useState<TableTile[]>([])

  // ── Shop opening hours (from Settings; bounds the start-time slots) ──
  const [openTime, setOpenTime] = useState(DEFAULT_OPEN)
  const [closeTime, setCloseTime] = useState(DEFAULT_CLOSE)
  const slots = startSlots(openTime, closeTime)

  // ── Booking form ──
  const [zone, setZone] = useState('')
  const [tableNo, setTableNo] = useState('')          // '' = let venue assign
  const [date, setDate] = useState(todayISO())
  const [startTime, setStartTime] = useState(slots[0])
  const [durationH, setDurationH] = useState<number>(2)
  const [partySize, setPartySize] = useState(2)
  const [eventName, setEventName] = useState('')
  const [phone, setPhone] = useState('')
  const [requirements, setRequirements] = useState('')
  const [taken, setTaken] = useState<string[]>([])
  const endTime = endFor(startTime, durationH, openTime, closeTime)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // ── Tracking ──
  const [reservation, setReservation] = useState<Reservation | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeKey = `reserve_${store}_active`

  // Load store name + floor tiles; restore an in-flight booking (tracking) if any.
  useEffect(() => {
    sfetch('/api/store').then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.store) setStoreName(d.store.name) }).catch(() => {})
    sfetch('/api/settings').then(r => r.ok ? r.json() : null)
      .then(d => {
        if (Array.isArray(d?.floorTiles)) setTiles(d.floorTiles)
        const bs = d?.barSettings
        if (bs && isHHMM(bs.openTime)) setOpenTime(bs.openTime)
        if (bs && isHHMM(bs.closeTime)) setCloseTime(bs.closeTime)
      }).catch(() => {})

    try {
      const saved = localStorage.getItem(activeKey)
      if (saved) {
        const { id } = JSON.parse(saved)
        if (id) {
          sfetch(`/api/reservations/${id}`).then(r => r.ok ? r.json() : null).then(d => {
            if (d?.reservation) { setReservation(d.reservation); setPhase('tracking') }
            else localStorage.removeItem(activeKey)
          }).catch(() => {})
        }
      }
    } catch { /* ignore */ }
  }, [sfetch, activeKey])

  // Keep the selected start time inside the shop's hours once they load/change.
  useEffect(() => {
    setStartTime(cur => slots.includes(cur) ? cur : slots[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTime, closeTime])

  // Availability: refresh taken tables whenever date/time changes on the form.
  // If the table the customer already picked has become taken for the new
  // window, drop the selection so they don't submit a booking the server rejects.
  useEffect(() => {
    if (phase !== 'form') return
    const q = new URLSearchParams({ date, start: startTime, end: endTime })
    sfetch(`/api/reservations/availability?${q}`).then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!Array.isArray(d?.taken)) return
        setTaken(d.taken)
        setTableNo(cur => (cur && d.taken.includes(cur)) ? '' : cur)
      }).catch(() => {})
  }, [phase, date, startTime, endTime, sfetch])

  // Poll the reservation status while tracking (mirror QR order tracker).
  useEffect(() => {
    if (phase !== 'tracking' || !reservation) return
    // Stop polling once the booking reaches a terminal state.
    const terminal: ReservationStatus[] = ['rejected', 'cancelled', 'completed', 'no_show']
    if (terminal.includes(reservation.status)) return
    pollRef.current = setInterval(() => {
      sfetch(`/api/reservations/${reservation.id}`).then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.reservation) setReservation(d.reservation) }).catch(() => {})
    }, 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [phase, reservation, sfetch])

  const zones = zonesFromTiles(tiles).filter(Boolean)
  const zoneTables = tiles.filter(tl => !zone || (tl.zone || '') === zone)

  // ── Identity actions ──
  async function lookupMember() {
    setLookupErr('')
    const digits = memberPhone.replace(/\D/g, '')
    if (digits.length < 8) { setLookupErr(t.memberNotFound); return }
    setLookingUp(true)
    try {
      const r = await sfetch('/api/member-lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: memberPhone.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (d?.found) {
        setMemberName(d.name)
        // The booking links to the member server-side by phone (see submit()).
        if (!phone) setPhone(memberPhone.trim())
      } else {
        setLookupErr(t.memberNotFound); setMemberName('')
      }
    } catch { setLookupErr(t.errGeneric) } finally { setLookingUp(false) }
  }

  function goToForm() {
    if (entryMode === 'member' && !memberName) return
    if (entryMode === 'guest' && !guestName.trim()) return
    setPhase('form')
  }

  // ── Submit booking ──
  async function submit() {
    setError('')
    if (!date || !startTime) { setError(t.errDate); return }
    setSubmitting(true)
    try {
      const r = await sfetch('/api/reservations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Send the member's login phone (never a client-supplied id): the
          // server resolves it to the member record, same as the QR order flow.
          memberPhone: entryMode === 'member' ? memberPhone.trim() || undefined : undefined,
          customerName: displayName,
          phone: phone.trim() || memberPhone.trim() || undefined,
          zone: zone || undefined,
          tableNo: tableNo || undefined,
          partySize, reservedDate: date, startTime, endTime,
          eventName: eventName.trim() || undefined,
          requirements: requirements.trim() || undefined,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 409) { setError(t.errTaken); setSubmitting(false); return }
      if (!r.ok || !d?.reservation) { setError(d.error || t.errGeneric); setSubmitting(false); return }
      setReservation(d.reservation)
      try { localStorage.setItem(activeKey, JSON.stringify({ id: d.reservation.id })) } catch { /* ignore */ }
      setPhase('tracking')
    } catch { setError(t.errGeneric); setSubmitting(false) }
  }

  async function cancelBooking() {
    if (!reservation) return
    if (!confirm(t.cancelConfirm)) return
    try {
      const r = await sfetch(`/api/reservations/${reservation.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      const d = await r.json().catch(() => ({}))
      if (d?.reservation) setReservation(d.reservation)
    } catch { /* ignore */ }
  }

  function resetForNewBooking() {
    try { localStorage.removeItem(activeKey) } catch { /* ignore */ }
    setReservation(null)
    setEventName(''); setRequirements(''); setTableNo('')
    setPhase('info')
  }

  // ─── Language toggle ──
  const LangToggle = (
    <div className="flex justify-center gap-2 mb-4">
      {(['th', 'en', 'ru'] as Lang[]).map(l => (
        <button key={l} onClick={() => setLang(l)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${lang === l ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}>
          {l === 'th' ? '🇹🇭 ไทย' : l === 'en' ? '🇬🇧 EN' : '🇷🇺 RU'}
        </button>
      ))}
    </div>
  )

  const Header = (
    <div className="text-center mb-5">
      {storeName && <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">{storeName}</p>}
      <p className="text-[11px] text-gray-400 mt-0.5">{t.brandTag}</p>
    </div>
  )

  // ─── TRACKING screen ─────────────────────────────────────────────────────────
  if (phase === 'tracking' && reservation) {
    const st = reservation.status
    const isApproved = st === 'approved' || st === 'seated' || st === 'completed'
    const isRejected = st === 'rejected' || st === 'no_show'
    const isCancelled = st === 'cancelled'
    const emoji = isApproved ? '🎉' : isRejected ? '😔' : isCancelled ? '✖️' : '⏳'
    const title = isApproved ? t.statusApproved : isRejected ? t.statusRejected : isCancelled ? t.statusCancelled : t.statusPending
    const body = isApproved ? t.statusApprovedBody : isRejected ? t.statusRejectedBody : isCancelled ? '' : t.statusPendingBody
    const accent = isApproved ? 'from-emerald-50 to-green-50 border-emerald-100'
      : isRejected ? 'from-red-50 to-rose-50 border-red-100'
      : isCancelled ? 'from-gray-50 to-gray-100 border-gray-200'
      : 'from-amber-50 to-orange-50 border-amber-100'

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center px-5 py-8" style={{ userSelect: 'none' }}>
        <div className="w-full max-w-sm">
          {LangToggle}
          {Header}

          <div className={`bg-gradient-to-br ${accent} border rounded-3xl p-6 text-center mb-4`}>
            <p className="text-5xl mb-2">{emoji}</p>
            <h1 className="text-xl font-black text-gray-900">{title}</h1>
            {body && <p className="text-sm text-gray-500 mt-2 leading-relaxed">{body}</p>}
            {!isApproved && !isRejected && !isCancelled && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-600">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> live
              </div>
            )}
          </div>

          {/* Booking reference */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center mb-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t.ref}</p>
            <p className="text-2xl font-black text-gray-900 font-mono tracking-wider mt-1">{reservation.refCode}</p>
          </div>

          {/* Shop message */}
          {reservation.staffReply && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t.shopMessage}</p>
              <p className="text-sm text-gray-700 leading-snug whitespace-pre-wrap">{reservation.staffReply}</p>
            </div>
          )}

          {/* Booking summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t.yourBooking}</p>
            <SummaryRows t={t} r={reservation} />
          </div>

          {(st === 'pending' || st === 'approved') && (
            <button onClick={cancelBooking}
              className="w-full py-2.5 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-2xl hover:bg-red-50 transition active:scale-95 mb-2">
              {t.cancel}
            </button>
          )}
          {(isRejected || isCancelled) && (
            <button onClick={resetForNewBooking}
              className="w-full py-3 text-sm font-bold text-black bg-amber-500 rounded-2xl hover:bg-amber-400 transition active:scale-95">
              {t.newBooking}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── INFO screen (login) ─────────────────────────────────────────────────────
  if (phase === 'info') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center px-5 py-8" style={{ userSelect: 'none' }}>
        <div className="w-full max-w-sm">
          {LangToggle}
          {Header}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
            <h1 className="text-2xl font-black text-gray-900 text-center">{t.infoTitle}</h1>
            <p className="text-sm text-gray-400 mt-1 text-center mb-5">{t.infoSubtitle}</p>

            {/* Member / Guest toggle */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(['member', 'guest'] as const).map(m => (
                <button key={m} onClick={() => { setEntryMode(m); setLookupErr('') }}
                  className={`py-2.5 rounded-xl text-sm font-bold border transition ${entryMode === m ? 'bg-amber-500 text-black border-amber-500' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {m === 'member' ? t.member : t.guest}
                </button>
              ))}
            </div>

            {entryMode === 'member' ? (
              <div className="flex flex-col gap-3">
                <Field label={t.memberPhone}>
                  <div className="flex gap-2">
                    <input value={memberPhone} onChange={e => { setMemberPhone(e.target.value); setMemberName('') }}
                      placeholder={t.phonePh} inputMode="tel" type="tel"
                      className={INPUT} style={{ userSelect: 'text' }} />
                    <button onClick={lookupMember} disabled={lookingUp}
                      className="px-4 rounded-xl text-sm font-bold bg-gray-900 text-white whitespace-nowrap disabled:opacity-40">
                      {lookingUp ? t.lookingUp : t.lookup}
                    </button>
                  </div>
                </Field>
                {memberName && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 text-sm text-emerald-700 font-semibold">
                    {t.memberFound}, {memberName} 👋
                  </div>
                )}
                {lookupErr && <p className="text-xs text-red-500">{lookupErr}</p>}
              </div>
            ) : (
              <Field label={t.guestName}>
                <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder={t.guestNamePh}
                  className={INPUT} style={{ userSelect: 'text' }} autoFocus />
              </Field>
            )}

            <button onClick={goToForm}
              disabled={entryMode === 'member' ? !memberName : !guestName.trim()}
              className="w-full mt-5 py-3 text-sm font-bold text-black bg-amber-500 rounded-2xl hover:bg-amber-400 transition active:scale-95 disabled:opacity-40">
              {t.continue}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── FORM screen ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-5 py-8" style={{ userSelect: 'none' }}>
      <div className="w-full max-w-sm">
        {LangToggle}
        {Header}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-black text-gray-900">{t.formTitle}</h1>
            <span className="text-xs text-gray-400">{displayName}</span>
          </div>

          <div className="flex flex-col gap-4">
            {/* Zone */}
            {zones.length > 0 && (
              <Field label={t.zone}>
                <div className="flex flex-wrap gap-2">
                  <ZoneChip active={zone === ''} onClick={() => { setZone(''); setTableNo('') }}>{t.zoneAny}</ZoneChip>
                  {zones.map(z => (
                    <ZoneChip key={z} active={zone === z} onClick={() => { setZone(z); setTableNo('') }}>{z}</ZoneChip>
                  ))}
                </div>
              </Field>
            )}

            {/* Table */}
            {zoneTables.length > 0 && (
              <Field label={t.table}>
                <div className="grid grid-cols-3 gap-2">
                  <TableCard active={tableNo === ''} onClick={() => setTableNo('')} label={t.tableAny} sub="" />
                  {zoneTables.map(tl => {
                    const isTaken = taken.includes(tl.tableNo)
                    return (
                      <TableCard key={tl.id}
                        active={tableNo === tl.tableNo}
                        disabled={isTaken}
                        onClick={() => !isTaken && setTableNo(tl.tableNo)}
                        label={tl.tableNo}
                        sub={isTaken ? t.tableTaken : `${tl.capacity} ${t.seats}`} />
                    )
                  })}
                </div>
              </Field>
            )}

            {/* Opening hours note */}
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 -mb-1">
              <span>🕒</span><span className="font-semibold text-gray-500">{t.openHours}:</span>
              <span>{openTime} – {closeTime}</span>
            </div>

            {/* Date + time */}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.date}>
                <input type="date" value={date} min={todayISO()} onChange={e => setDate(e.target.value)}
                  className={INPUT} style={{ userSelect: 'text' }} />
              </Field>
              <Field label={t.startTime}>
                <select value={startTime} onChange={e => setStartTime(e.target.value)} className={INPUT}>
                  {slots.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t.duration}>
                <select value={durationH} onChange={e => setDurationH(Number(e.target.value))} className={INPUT}>
                  {DURATIONS.map(d => <option key={d} value={d}>{d} {t.hours} → {endFor(startTime, d, openTime, closeTime)}</option>)}
                </select>
              </Field>
              <Field label={t.ppl}>
                <div className="flex items-center gap-2">
                  <Stepper onClick={() => setPartySize(p => Math.max(1, p - 1))}>−</Stepper>
                  <span className="flex-1 text-center text-lg font-black text-gray-900">{partySize}</span>
                  <Stepper onClick={() => setPartySize(p => Math.min(99, p + 1))}>+</Stepper>
                </div>
              </Field>
            </div>

            <Field label={t.eventName}>
              <input value={eventName} onChange={e => setEventName(e.target.value)} placeholder={t.eventNamePh}
                className={INPUT} style={{ userSelect: 'text' }} />
            </Field>

            <Field label={t.phone}>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phonePh}
                inputMode="tel" type="tel" className={INPUT} style={{ userSelect: 'text' }} />
            </Field>

            <Field label={t.requirements}>
              <textarea value={requirements} onChange={e => setRequirements(e.target.value)} placeholder={t.requirementsPh}
                rows={3} className={`${INPUT} resize-none`} style={{ userSelect: 'text' }} />
            </Field>

            {error && <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setPhase('info')}
                className="px-5 py-3 text-sm font-semibold text-gray-500 bg-gray-100 rounded-2xl hover:bg-gray-200 transition active:scale-95">
                {t.back}
              </button>
              <button onClick={submit} disabled={submitting}
                className="flex-1 py-3 text-sm font-bold text-black bg-amber-500 rounded-2xl hover:bg-amber-400 transition active:scale-95 disabled:opacity-40">
                {submitting ? t.submitting : t.submit}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Small components ─────────────────────────────────────────────────────────
function ZoneChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition active:scale-95 ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
      {children}
    </button>
  )
}

function TableCard({ active, disabled, onClick, label, sub }: {
  active: boolean; disabled?: boolean; onClick: () => void; label: string; sub: string
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-xl border p-2 text-center transition active:scale-95 ${
        disabled ? 'bg-gray-50 border-gray-100 text-gray-300 line-through cursor-not-allowed'
        : active ? 'bg-amber-500 border-amber-500 text-black'
        : 'bg-white border-gray-200 text-gray-700 hover:border-amber-300'}`}>
      <p className="text-sm font-black leading-tight">{label}</p>
      {sub && <p className="text-[10px] mt-0.5 opacity-80">{sub}</p>}
    </button>
  )
}

function Stepper({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-9 h-9 rounded-xl bg-gray-100 text-gray-700 text-lg font-black hover:bg-gray-200 transition active:scale-90 flex items-center justify-center">
      {children}
    </button>
  )
}

function SummaryRows({ t, r }: { t: typeof T[Lang]; r: Reservation }) {
  const rows: [string, string][] = [
    [t.date, `${r.reservedDate}  ${r.startTime}–${r.endTime}`],
    [t.ppl, `${r.partySize} ${t.people}`],
  ]
  if (r.zone) rows.push([t.zone, r.zone])
  if (r.tableNo) rows.push([t.table, r.tableNo])
  if (r.eventName) rows.push([t.eventName.replace(' (optional)', '').replace(' (ไม่บังคับ)', ''), r.eventName])
  if (r.requirements) rows.push([t.requirements.replace(' (optional)', '').replace(' (ไม่บังคับ)', ''), r.requirements])
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 text-sm">
          <span className="text-gray-400 shrink-0">{k}</span>
          <span className="text-gray-800 font-medium text-right">{v}</span>
        </div>
      ))}
    </div>
  )
}
