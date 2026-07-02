'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

type Role = 'admin' | 'manager' | 'bartender' | 'staff'

const ROLES: { value: Role; label: string; labelTh: string; emoji: string; desc: string }[] = [
  { value: 'admin',      label: 'Admin',     labelTh: 'ผู้ดูแลระบบ',   emoji: '👑', desc: 'จัดการทุกอย่าง' },
  { value: 'manager',   label: 'Manager',   labelTh: 'ผู้จัดการ',      emoji: '📊', desc: 'รายงาน, ตั้งราคา' },
  { value: 'bartender', label: 'Bartender', labelTh: 'บาร์เทนเดอร์',  emoji: '🍹', desc: 'รับออเดอร์, POS' },
  { value: 'staff',     label: 'Staff',     labelTh: 'พนักงาน / Cashier', emoji: '🙋', desc: 'รับออเดอร์, เสิร์ฟ' },
]

const COLORS = ['#f59e0b','#3b82f6','#8b5cf6','#10b981','#ef4444','#f97316','#06b6d4','#ec4899']

export default function AuthSetupPage() {
  const router  = useRouter()
  const [name,           setName]          = useState('')
  const [color,          setColor]         = useState(COLORS[0])
  const [requestedRole,  setRequestedRole] = useState<Role | null>(null)
  const [saving,         setSaving]        = useState(false)
  const [error,          setError]         = useState('')
  const [userId,         setUserId]        = useState<string | null>(null)

  useEffect(() => {
    getSupabaseBrowser().auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }
      setUserId(session.user.id)
      const meta = session.user.user_metadata
      setName(meta?.name ?? meta?.full_name ?? meta?.display_name ?? '')
    })
  }, [router])

  async function handleSubmit() {
    if (!name.trim() || !requestedRole || !userId) return
    setSaving(true)
    setError('')
    const sb = getSupabaseBrowser()
    const { error: e } = await sb.from('profiles').upsert({
      id:             userId,
      name:           name.trim(),
      color,
      requested_role: requestedRole,
      role:           null,
      status:         'pending',
      provider:       'oauth',
    })
    if (e) { setError(e.message); setSaving(false); return }
    router.replace('/auth/status')
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-start overflow-y-auto">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />
      <div className="relative z-10 w-full max-w-sm px-6 py-12 flex flex-col gap-6">

        <div className="text-center">
          <div className="text-4xl mb-2">👋</div>
          <h1 className="text-2xl font-black text-white">ยินดีต้อนรับ!</h1>
          <p className="text-gray-500 text-sm mt-1">ตั้งค่าบัญชีของคุณ</p>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">ชื่อที่แสดง</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="เช่น ก้อง, แพรว, Pop"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-white rounded-xl text-sm placeholder:text-gray-600 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        {/* Color */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">สีประจำตัว</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-all active:scale-90"
                style={{ background: c, outline: color === c ? `3px solid ${c}` : '3px solid transparent', outlineOffset: '2px' }}
              />
            ))}
          </div>
          {name.trim() && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0" style={{ background: color }}>
                {name.trim().charAt(0).toUpperCase()}
              </div>
              <span className="text-white text-sm font-semibold">{name.trim()}</span>
            </div>
          )}
        </div>

        {/* Role request */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">ตำแหน่งที่ต้องการ</label>
          <p className="text-[11px] text-gray-600">Admin จะตรวจสอบและอนุมัติการเข้าใช้งาน</p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {ROLES.map(r => (
              <button
                key={r.value}
                onClick={() => setRequestedRole(r.value)}
                className="flex flex-col items-start gap-1 p-3 rounded-xl border transition-all text-left"
                style={{
                  background:  requestedRole === r.value ? color + '18' : 'rgba(255,255,255,0.03)',
                  borderColor: requestedRole === r.value ? color       : 'rgba(255,255,255,0.1)',
                }}
              >
                <span className="text-lg">{r.emoji}</span>
                <span className="text-white font-bold text-xs">{r.label}</span>
                <span className="text-gray-500 text-[10px]">{r.labelTh}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !requestedRole || saving}
          className="w-full py-4 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 bg-amber-500 text-black"
        >
          {saving ? 'กำลังส่งคำขอ…' : 'ส่งคำขอเข้าร่วม →'}
        </button>

        <p className="text-xs text-gray-600 text-center">Admin จะได้รับการแจ้งเตือนและอนุมัติให้คุณเร็วๆ นี้</p>
      </div>
    </div>
  )
}
