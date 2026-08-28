'use client'

import { useState, useEffect, useCallback } from 'react'
import { authedFetch } from '@/lib/supabase-browser'

// Admin/manager affordance in the Users page: shows the store's staff-invite
// link (…/signup?invite=TOKEN) to share so a new staff member can install the
// app on their own device, sign up, and be auto-joined to this store. Regenerate
// revokes every previously shared link.
export default function InviteStaffButton() {
  const [open, setOpen]       = useState(false)
  const [token, setToken]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [copied, setCopied]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await authedFetch('/api/staff-invite')
      if (r.ok) { const d = await r.json(); setToken(d.token ?? null) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (open) load() }, [open, load])

  const link = token ? `${location.origin}/signup?invite=${token}` : ''

  async function generate() {
    setBusy(true)
    try {
      const r = await authedFetch('/api/staff-invite', { method: 'POST' })
      if (r.ok) { const d = await r.json(); setToken(d.token) }
    } finally { setBusy(false) }
  }

  function copy() {
    if (!link) return
    navigator.clipboard?.writeText(link)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <button
        onPointerDown={() => setOpen(true)}
        className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition active:scale-95"
      >
        เชิญพนักงาน
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onPointerDown={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl" onPointerDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-gray-900">เชิญพนักงาน</h3>
              <button onPointerDown={() => setOpen(false)} className="text-gray-400 text-lg leading-none px-1">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              ส่งลิงก์นี้ให้พนักงานเปิดในเครื่องของตัวเอง — สมัครบัญชีแล้วจะเข้าร่วมร้านนี้โดยอัตโนมัติ
            </p>

            {loading ? (
              <p className="text-sm text-gray-400">กำลังโหลด…</p>
            ) : token ? (
              <>
                <div className="flex gap-2">
                  <input readOnly value={link} onFocus={e => e.currentTarget.select()}
                    className="flex-1 min-w-0 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700" />
                  <button onPointerDown={copy}
                    className="shrink-0 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold active:scale-95">
                    {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
                  </button>
                </div>
                <button onPointerDown={generate} disabled={busy}
                  className="mt-3 text-[11px] text-red-500 font-semibold disabled:opacity-40">
                  {busy ? 'กำลังสร้าง…' : 'สร้างลิงก์ใหม่ (ยกเลิกลิงก์เดิมทั้งหมด)'}
                </button>
              </>
            ) : (
              <button onPointerDown={generate} disabled={busy}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm disabled:opacity-40 active:scale-95">
                {busy ? 'กำลังสร้าง…' : 'สร้างลิงก์เชิญ'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
