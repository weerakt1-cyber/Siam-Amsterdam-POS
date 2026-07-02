'use client'

import { useState, useEffect } from 'react'
import { useAuth, type ActiveUser } from '@/lib/pos-auth'
import { DEMO_USERS, isDemoUser } from '@/lib/demo-data'

type StaffUser = { id: string; name: string; role: string; color: string }

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', bartender: 'Bartender', staff: 'Staff',
}

// ─── PIN dots ─────────────────────────────────────────────────────────────────

function PinDots({ count, error }: { count: number; error: boolean }) {
  return (
    <div className="flex justify-center gap-4 py-4">
      {Array(4).fill(0).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full transition-all duration-150 ${
            error     ? 'bg-red-400 scale-125' :
            i < count ? 'bg-amber-500 scale-110' :
                        'bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

// ─── Step 1: staff picker ─────────────────────────────────────────────────────

function StaffPicker({ users, onPick }: { users: StaffUser[]; onPick: (u: StaffUser) => void }) {
  return (
    <div className="w-full">
      <p className="text-sm text-gray-400 text-center mb-5">เลือกชื่อของคุณ</p>
      <div className="grid grid-cols-2 gap-3">
        {users.map(u => (
          <button
            key={u.id}
            onClick={() => onPick(u)}
            className="flex flex-col items-center gap-3 p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-amber-300 transition-all active:scale-95"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-md"
              style={{ background: u.color }}
            >
              {u.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-900">{u.name}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{ROLE_LABELS[u.role] ?? u.role}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Step 2: PIN pad ──────────────────────────────────────────────────────────

function PinPad({ user, onSuccess, onBack }: { user: StaffUser; onSuccess: (u: ActiveUser) => void; onBack: () => void }) {
  const [pin,      setPin]      = useState('')
  const [error,    setError]    = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (pin.length !== 4 || checking) return
    setChecking(true)
    fetch('/api/users/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, pin }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.valid) {
          onSuccess({ id: d.user.id, name: d.user.name, role: d.user.role, color: d.user.color })
        } else {
          setError(true)
          setTimeout(() => { setError(false); setPin('') }, 700)
          setChecking(false)
        }
      })
      .catch(() => { setChecking(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* User badge */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-md"
          style={{ background: user.color }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-bold text-gray-900">{user.name}</p>
          <p className="text-xs text-gray-400">{ROLE_LABELS[user.role] ?? user.role}</p>
        </div>
      </div>

      <p className="text-sm text-gray-400">กรอก PIN 4 หลัก</p>
      <PinDots count={pin.length} error={error} />

      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
        {KEYS.map((k, i) => (
          <button
            key={i}
            onClick={() => {
              if (checking || error) return
              if (k === '⌫') setPin(p => p.slice(0, -1))
              else if (k && pin.length < 4) setPin(p => p + k)
            }}
            className={`h-14 rounded-xl text-xl font-semibold transition-all active:scale-90 ${
              k === ''  ? 'invisible' :
              k === '⌫' ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' :
                          'bg-white border border-gray-200 text-gray-900 hover:bg-amber-50 hover:border-amber-300 shadow-sm'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-500 font-semibold animate-pulse mt-1">PIN ไม่ถูกต้อง ลองใหม่อีกครั้ง</p>
      )}

      <button
        onClick={onBack}
        className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition"
      >
        ← เปลี่ยน User
      </button>
    </div>
  )
}

// ─── Full-screen login overlay ────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (u: ActiveUser) => void }) {
  const [users,  setUsers]  = useState<StaffUser[]>(DEMO_USERS)  // แสดงทันทีก่อน API
  const [picked, setPicked] = useState<StaffUser | null>(null)
  const [time,   setTime]   = useState('')

  useEffect(() => {
    // แสดง demo users ทันที แล้วแทนที่ด้วยข้อมูลจริงถ้า API ตอบกลับ
    fetch('/api/users')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.users?.length) setUsers(d.users) })
      .catch(() => {})
    const tick = () => setTime(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [])

  function handlePick(u: StaffUser) {
    // demo users: ข้าม PIN เพื่อใช้งาน prototype ได้ทันที
    if (isDemoUser(u.id)) {
      onLogin({ id: u.id, name: u.name, role: u.role, color: u.color })
    } else {
      setPicked(u)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-gray-50 flex flex-col items-center justify-start overflow-y-auto">
      <div className="w-full max-w-sm px-5 py-10 flex flex-col items-center gap-6">

        {/* Header */}
        <div className="text-center">
          <img src="/logo.png" alt="Siam Amsterdam" className="w-28 h-28 object-contain mx-auto mb-2" />
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">BAR POS</h1>
          {time && <p className="text-3xl font-light text-gray-400 mt-1 tabular-nums">{time}</p>}
        </div>

        {/* Card */}
        <div className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {!picked ? (
            <StaffPicker users={users} onPick={handlePick} />
          ) : (
            <PinPad user={picked} onSuccess={onLogin} onBack={() => setPicked(null)} />
          )}
        </div>

        <p className="text-xs text-gray-300">v1.0 — Siam Amsterdam</p>
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="fixed inset-0 z-[200] bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <img src="/logo.png" alt="Siam Amsterdam" className="w-20 h-20 object-contain animate-pulse" />
        <div className="w-24 h-2 bg-gray-200 rounded-full animate-pulse" />
      </div>
    </div>
  )
}

// ─── Auth Guard (exported) ────────────────────────────────────────────────────

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, login } = useAuth()

  if (loading)  return <LoadingSkeleton />
  if (!user)    return <LoginScreen onLogin={login} />
  return <>{children}</>
}
