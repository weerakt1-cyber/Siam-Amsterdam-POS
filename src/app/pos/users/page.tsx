'use client'

import { useState, useEffect, useCallback } from 'react'
import type { UserRole } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type PosUserPublic = {
  id: string
  name: string
  role: UserRole
  color: string
  createdAt: string
  updatedAt: string
}

type PendingUser = {
  id:             string
  name:           string
  color:          string
  email:          string
  requested_role: string
  status:         string
  created_at:     string
  provider:       string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

const ROLE_META: Record<UserRole, { label: string; labelTh: string; badge: string }> = {
  admin:     { label: 'Admin',     labelTh: 'ผู้ดูแลระบบ', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  manager:   { label: 'Manager',   labelTh: 'ผู้จัดการ',   badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  bartender: { label: 'Bartender', labelTh: 'บาร์เทนเดอร์', badge: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
  staff:     { label: 'Staff',     labelTh: 'พนักงาน',     badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
}

// ─── PinPad Component ─────────────────────────────────────────────────────────

function PinDots({ count, error }: { count: number; error?: boolean }) {
  return (
    <div className="flex justify-center gap-4 py-3">
      {Array(4).fill(0).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full transition-all duration-150 ${
            error ? 'bg-red-500 scale-110' :
            i < count ? 'bg-amber-500 scale-110' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

function PinPad({
  value, onChange, label,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const press = (d: string) => { if (value.length < 4) onChange(value + d) }
  const back = () => onChange(value.slice(0, -1))
  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="w-full">
      {label && <p className="text-xs text-gray-500 text-center mb-1">{label}</p>}
      <PinDots count={value.length} />
      <div className="grid grid-cols-3 gap-2 mt-2 max-w-[180px] mx-auto">
        {KEYS.map((k, i) => (
          <button
            key={i}
            type="button"
            onPointerDown={k === '⌫' ? back : k ? () => press(k) : undefined}
            className={`h-11 rounded-xl text-base font-semibold transition-all select-none ${
              k === '' ? 'invisible' :
              k === '⌫'
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-95'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-300 active:scale-95'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'w-16 h-16 text-2xl' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base'
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-bold text-black shrink-0`}
      style={{ background: color }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Mode = 'idle' | 'new' | 'view' | 'edit-pin'
type Tab  = 'staff' | 'pending'

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>('staff')

  // ── Staff (PIN) state ────────────────────────────────────────
  const [users, setUsers] = useState<PosUserPublic[]>([])
  const [selected, setSelected] = useState<PosUserPublic | null>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [loading, setLoading] = useState(true)

  // ── Pending (OAuth) state ────────────────────────────────────
  const [pending,         setPending]         = useState<PendingUser[]>([])
  const [pendingLoading,  setPendingLoading]   = useState(false)
  const [selectedPending, setSelectedPending]  = useState<PendingUser | null>(null)
  const [approveRole,     setApproveRole]      = useState<UserRole>('staff')
  const [approving,       setApproving]        = useState(false)

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  // form state
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('bartender')
  const [color, setColor] = useState(AVATAR_COLORS[1])
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinStep, setPinStep] = useState<'set' | 'confirm'>('set')
  const [pinError, setPinError] = useState('')
  const [newPin, setNewPin] = useState('')  // for change-pin mode

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/users')
      if (r.ok) { const d = await r.json(); setUsers(d.users) }
    } finally { setLoading(false) }
  }, [])

  const loadPending = useCallback(async () => {
    setPendingLoading(true)
    try {
      const r = await fetch('/api/admin/pending')
      if (r.ok) { const d = await r.json(); setPending(d.pending) }
    } finally { setPendingLoading(false) }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { loadPending() }, [loadPending])

  // auto-advance PIN steps for new user
  useEffect(() => {
    if (mode !== 'new') return
    if (pinStep === 'set' && pin.length === 4) {
      setPinStep('confirm')
      setConfirmPin('')
    }
  }, [pin, mode, pinStep])

  useEffect(() => {
    if (mode !== 'new' || pinStep !== 'confirm') return
    if (confirmPin.length === 4) {
      if (confirmPin !== pin) {
        setPinError('PIN ไม่ตรงกัน — ลองใหม่')
        setPin('')
        setConfirmPin('')
        setPinStep('set')
        setTimeout(() => setPinError(''), 2000)
      }
    }
  }, [confirmPin, pin, mode, pinStep])

  // auto-save PIN when changing existing user's PIN
  useEffect(() => {
    if (mode !== 'edit-pin' || newPin.length !== 4 || !selected) return
    handleSavePin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPin])

  const startNew = () => {
    setSelected(null)
    setName('')
    setRole('bartender')
    setColor(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)])
    setPin('')
    setConfirmPin('')
    setPinStep('set')
    setPinError('')
    setMode('new')
  }

  const selectUser = (u: PosUserPublic) => {
    setSelected(u)
    setName(u.name)
    setRole(u.role)
    setColor(u.color)
    setPin('')
    setConfirmPin('')
    setPinStep('set')
    setPinError('')
    setNewPin('')
    setMode('view')
  }

  const handleCreate = async () => {
    if (!name.trim()) return showToast('กรุณาใส่ชื่อ')
    if (pin.length !== 4 || confirmPin.length !== 4) return showToast('กรุณาตั้ง PIN 4 หลัก')
    if (pin !== confirmPin) return showToast('PIN ไม่ตรงกัน')
    setSaving(true)
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), role, pin, color }),
      })
      if (r.ok) {
        const d = await r.json()
        setUsers(prev => [...prev, d.user])
        selectUser(d.user)
        showToast('สร้าง User สำเร็จ ✓')
      } else {
        const e = await r.json()
        showToast(e.error ?? 'เกิดข้อผิดพลาด')
      }
    } finally { setSaving(false) }
  }

  const handleSaveDetails = async () => {
    if (!selected || !name.trim()) return
    setSaving(true)
    try {
      const r = await fetch(`/api/users/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), role, color }),
      })
      if (r.ok) {
        const d = await r.json()
        setUsers(prev => prev.map(u => u.id === selected.id ? d.user : u))
        setSelected(d.user)
        showToast('บันทึกสำเร็จ ✓')
      }
    } finally { setSaving(false) }
  }

  const handleSavePin = async () => {
    if (!selected || newPin.length !== 4) return
    setSaving(true)
    try {
      const r = await fetch(`/api/users/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin }),
      })
      if (r.ok) {
        setMode('view')
        setNewPin('')
        showToast('เปลี่ยน PIN สำเร็จ ✓')
      }
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!confirm(`ลบ User "${selected.name}" ออกจากระบบ?`)) return
    const r = await fetch(`/api/users/${selected.id}`, { method: 'DELETE' })
    if (r.ok) {
      setUsers(prev => prev.filter(u => u.id !== selected.id))
      setSelected(null)
      setMode('idle')
      showToast('ลบ User แล้ว')
    }
  }

  const handleApprove = async (action: 'approve' | 'reject') => {
    if (!selectedPending) return
    setApproving(true)
    try {
      const r = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedPending.id, action, role: action === 'approve' ? approveRole : undefined }),
      })
      if (r.ok) {
        setPending(prev => prev.filter(p => p.id !== selectedPending.id))
        setSelectedPending(null)
        showToast(action === 'approve' ? 'อนุมัติแล้ว ✓' : 'ปฏิเสธแล้ว')
      } else {
        const e = await r.json(); showToast(e.error ?? 'เกิดข้อผิดพลาด')
      }
    } finally { setApproving(false) }
  }

  const isNewReady = name.trim() && pin.length === 4 && confirmPin.length === 4 && pin === confirmPin
  const isDirty = selected && (name !== selected.name || role !== selected.role || color !== selected.color)

  // ─── Pending right panel ─────────────────────────────────────────────────────

  const renderPendingRight = () => {
    if (!selectedPending) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <span className="text-5xl opacity-20">⏳</span>
          <p className="text-gray-400 text-sm">เลือกผู้ใช้เพื่ออนุมัติการเข้าถึง</p>
        </div>
      )
    }

    const p = selectedPending
    const ROLE_KEYS = Object.keys(ROLE_META) as UserRole[]

    return (
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Avatar name={p.name} color={p.color} size="lg" />
          <div>
            <h2 className="text-base font-bold text-gray-900">{p.name}</h2>
            <p className="text-xs text-gray-400">{p.email}</p>
            <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              ขอตำแหน่ง: {ROLE_META[p.requested_role as UserRole]?.label ?? p.requested_role}
            </span>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Assign Role */}
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide">อนุมัติด้วย Role</label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {ROLE_KEYS.map(r => (
              <button
                key={r}
                type="button"
                onPointerDown={() => setApproveRole(r)}
                className={`py-2 rounded-xl text-sm font-semibold border transition-all ${
                  approveRole === r
                    ? `${ROLE_META[r].badge} border-current`
                    : 'bg-gray-100/50 text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {ROLE_META[r].label}
              </button>
            ))}
          </div>
          {approveRole !== p.requested_role && (
            <p className="text-[10px] text-amber-600 mt-1">
              เปลี่ยนจาก {ROLE_META[p.requested_role as UserRole]?.label ?? p.requested_role} → {ROLE_META[approveRole]?.label}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onPointerDown={() => handleApprove('approve')}
            disabled={approving}
            className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm rounded-xl transition-all active:scale-95 disabled:opacity-40"
          >
            {approving ? 'กำลังบันทึก…' : '✓ อนุมัติ'}
          </button>
          <button
            onPointerDown={() => handleApprove('reject')}
            disabled={approving}
            className="px-4 py-3 border border-red-200 text-red-500 hover:bg-red-50 font-bold text-sm rounded-xl transition-all active:scale-95 disabled:opacity-40"
          >
            ✕ ปฏิเสธ
          </button>
        </div>

        <div className="border-t border-gray-100" />
        <div>
          <p className="text-xs text-gray-400">Provider: {p.provider}</p>
          <p className="text-xs text-gray-400">สมัครเมื่อ: {new Date(p.created_at).toLocaleString('th-TH')}</p>
        </div>
      </div>
    )
  }

  // ─── Right panel content ────────────────────────────────────────────────────

  const renderRight = () => {
    if (mode === 'idle') {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <span className="text-5xl opacity-20">👤</span>
          <p className="text-gray-400 text-sm">เลือก User หรือสร้างใหม่</p>
          <button
            onPointerDown={startNew}
            className="mt-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-xl active:scale-95 transition-all"
          >
            + New User
          </button>
        </div>
      )
    }

    if (mode === 'new') {
      return (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-3">
            <Avatar name={name || '?'} color={color} size="lg" />
            <div>
              <h2 className="text-base font-bold text-gray-900">New User</h2>
              <p className="text-xs text-gray-500">กรอกข้อมูลและตั้ง PIN</p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide">ชื่อ</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ชื่อพนักงาน"
              className="mt-1 w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-white/25 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Role */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide">Role</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(Object.keys(ROLE_META) as UserRole[]).map(r => (
                <button
                  key={r}
                  type="button"
                  onPointerDown={() => setRole(r)}
                  className={`py-2 rounded-xl text-sm font-semibold border transition-all ${
                    role === r
                      ? `${ROLE_META[r].badge} border-current`
                      : 'bg-gray-100/50 text-gray-500 border-gray-200 hover:border-white/20'
                  }`}
                >
                  {ROLE_META[r].label}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide">สี Avatar</label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onPointerDown={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all active:scale-95 ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-100 scale-110' : ''
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {/* PIN entry */}
          <div className="bg-gray-100 rounded-2xl p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center mb-2">
              {pinStep === 'set' ? 'ตั้ง PIN 4 หลัก' : 'ยืนยัน PIN อีกครั้ง'}
            </p>
            {pinError && (
              <p className="text-xs text-red-400 text-center mb-2 animate-pulse">{pinError}</p>
            )}
            <PinPad
              value={pinStep === 'set' ? pin : confirmPin}
              onChange={pinStep === 'set' ? setPin : setConfirmPin}
              label={pinStep === 'set' ? 'กดตัวเลข 4 หลัก' : 'กรอก PIN เดิมอีกครั้งเพื่อยืนยัน'}
            />
          </div>

          {/* Create button */}
          <button
            onPointerDown={handleCreate}
            disabled={!isNewReady || saving}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'กำลังสร้าง...' : 'สร้าง User'}
          </button>
        </div>
      )
    }

    // view / edit-pin
    if (!selected) return null

    return (
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Avatar name={name} color={color} size="lg" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{selected.name}</h2>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${ROLE_META[selected.role].badge}`}>
              {ROLE_META[selected.role].label}
            </span>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide">ชื่อ</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1 w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Role */}
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide">Role</label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {(Object.keys(ROLE_META) as UserRole[]).map(r => (
              <button
                key={r}
                type="button"
                onPointerDown={() => setRole(r)}
                className={`py-2 rounded-xl text-sm font-semibold border transition-all ${
                  role === r
                    ? `${ROLE_META[r].badge} border-current`
                    : 'bg-gray-100/50 text-gray-500 border-gray-200 hover:border-white/20'
                }`}
              >
                {ROLE_META[r].label}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide">สี Avatar</label>
          <div className="flex gap-2 mt-2 flex-wrap">
            {AVATAR_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onPointerDown={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all active:scale-95 ${
                  color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-100 scale-110' : ''
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        {/* Save details button */}
        <button
          onPointerDown={handleSaveDetails}
          disabled={!isDirty || saving}
          className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
        >
          {saving && mode !== 'edit-pin' ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
        </button>

        <div className="border-t border-gray-100" />

        {/* PIN Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">PIN</p>
              <p className="text-xs text-gray-400">4 หลัก สำหรับเข้าระบบ</p>
            </div>
            {mode !== 'edit-pin' ? (
              <button
                onPointerDown={() => { setNewPin(''); setMode('edit-pin') }}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-300 text-gray-900 text-xs font-semibold rounded-lg transition-all active:scale-95"
              >
                เปลี่ยน PIN
              </button>
            ) : (
              <button
                onPointerDown={() => { setMode('view'); setNewPin('') }}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs font-semibold rounded-lg transition-all"
              >
                ยกเลิก
              </button>
            )}
          </div>

          {mode === 'edit-pin' ? (
            <div className="bg-gray-100 rounded-2xl p-4 border border-gray-100">
              <p className="text-xs text-gray-500 text-center mb-1">
                กรอก PIN ใหม่ 4 หลัก (จะบันทึกอัตโนมัติ)
              </p>
              <PinPad value={newPin} onChange={setNewPin} />
            </div>
          ) : (
            <div className="flex gap-2 items-center text-gray-300">
              <span className="text-2xl tracking-widest">●●●●</span>
              <span className="text-xs">(PIN ที่ตั้งไว้)</span>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* Delete */}
        <div className="pb-4">
          <p className="text-xs text-gray-400 mb-2">Danger Zone</p>
          <button
            onPointerDown={handleDelete}
            className="w-full py-2.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-semibold rounded-xl transition-all active:scale-95"
          >
            ลบ User นี้ออกจากระบบ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden h-full">

      {/* ── Left panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 border-r border-gray-100 flex flex-col bg-white">

        {/* Tabs */}
        <div className="px-3 pt-3 pb-0 border-b border-gray-100">
          <div className="flex gap-1 mb-0">
            <button
              onPointerDown={() => { setTab('staff'); setSelectedPending(null) }}
              className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all ${
                tab === 'staff' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Staff PIN
            </button>
            <button
              onPointerDown={() => { setTab('pending'); setSelected(null); setMode('idle') }}
              className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center justify-center gap-1 ${
                tab === 'pending' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              App Users
              {pending.length > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 bg-amber-500 text-black text-[9px] font-black rounded-full">
                  {pending.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {tab === 'staff' ? (
          <>
            {/* Staff header */}
            <div className="px-4 py-2 flex items-center justify-between">
              <p className="text-xs text-gray-400">{users.length} accounts</p>
              <button
                onPointerDown={startNew}
                className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center text-base font-bold transition-all active:scale-95"
              >+</button>
            </div>

            {/* Staff list */}
            <div className="flex-1 overflow-y-auto pb-2">
              {loading ? (
                Array(4).fill(0).map((_, i) => (
                  <div key={i} className="mx-3 my-1 h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))
              ) : users.length === 0 ? (
                <p className="text-center text-gray-400 text-sm mt-8">ยังไม่มี User</p>
              ) : (
                users.map(u => (
                  <button
                    key={u.id}
                    onPointerDown={() => selectUser(u)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all ${
                      selected?.id === u.id ? 'bg-gray-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <Avatar name={u.name} color={u.color} size="sm" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ROLE_META[u.role].badge}`}>
                        {ROLE_META[u.role].label}
                      </span>
                    </div>
                    {selected?.id === u.id && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {/* Pending list */}
            <div className="px-4 py-2">
              <p className="text-xs text-gray-400">
                {pendingLoading ? 'กำลังโหลด…' : `${pending.length} รายการรออนุมัติ`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto pb-2">
              {pendingLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="mx-3 my-1 h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))
              ) : pending.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-4">
                  <span className="text-3xl opacity-30">✓</span>
                  <p className="text-gray-400 text-xs">ไม่มีคำขอรออนุมัติ</p>
                </div>
              ) : (
                pending.map(p => (
                  <button
                    key={p.id}
                    onPointerDown={() => { setSelectedPending(p); setApproveRole((p.requested_role as UserRole) || 'staff') }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all ${
                      selectedPending?.id === p.id ? 'bg-amber-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <Avatar name={p.name} color={p.color} size="sm" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      <p className="text-[10px] text-amber-600 font-medium">ขอ: {ROLE_META[p.requested_role as UserRole]?.label ?? p.requested_role}</p>
                    </div>
                    {selectedPending?.id === p.id && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Right panel ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {tab === 'pending' ? renderPendingRight() : renderRight()}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-100 border border-gray-200 text-gray-900 text-sm px-5 py-2.5 rounded-full shadow-xl z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}
