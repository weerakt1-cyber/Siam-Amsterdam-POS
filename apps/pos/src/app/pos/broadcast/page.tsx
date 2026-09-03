'use client'

import { authedFetch } from '@/lib/supabase-browser'
import { useEffect, useMemo, useState } from 'react'
import { usePosLang } from '@/lib/pos-i18n'
import type { Member } from '@/lib/types'

// ─── Broadcast / promo outreach ─────────────────────────────────────────────
// Members opt into a promo channel (LINE / Telegram / WhatsApp) at signup, but
// none of those platforms let a store push to an arbitrary handle a customer
// typed in — LINE/Telegram need a bot relationship (userId / chat_id) and
// WhatsApp needs the Business API with an approved template + opt-in. So this
// page is an *assisted* broadcaster: compose once, then reach each customer with
// one tap (WhatsApp deep link with the message prefilled, Telegram opens the
// chat) or copy the message + handles for a manual send. No message is sent
// server-side, and nothing here can spam — every send is a human tap.

type Channel = 'line' | 'telegram' | 'whatsapp'

const CHANNELS: { key: Channel; label: string; icon: string }[] = [
  { key: 'line',     label: 'LINE',     icon: '💚' },
  { key: 'telegram', label: 'Telegram', icon: '✈️' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '🟢' },
]

// Best-effort E.164-ish digits for a wa.me link. A leading 0 (local Thai form)
// becomes 66; other input is kept as typed digits.
function waNumber(raw: string): string {
  const d = raw.replace(/[^\d]/g, '')
  if (!d) return ''
  if (d.startsWith('0')) return '66' + d.slice(1)
  return d
}

function personalize(msg: string, name: string): string {
  return msg.replace(/\{name\}/g, name || '')
}

export default function BroadcastPage() {
  const { lang } = usePosLang()
  const L = (en: string, th: string) => (lang === 'en' ? en : th)

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<Channel>('line')
  const [message, setMessage] = useState('')
  const [copied, setCopied]   = useState<string | null>(null)

  // LINE OA connection — enables a real "broadcast to all friends" send.
  const [oa, setOa] = useState<{ enabled: boolean; hasToken: boolean; basicId: string } | null>(null)
  const [oaToken, setOaToken]     = useState('')
  const [oaBasicId, setOaBasicId] = useState('')
  const [oaOpen, setOaOpen]       = useState(false)
  const [oaSaving, setOaSaving]   = useState(false)
  const [sending, setSending]     = useState(false)
  const [sendMsg, setSendMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    authedFetch('/api/members')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.members)) setMembers(d.members) })
      .catch(() => {})
      .finally(() => setLoading(false))
    authedFetch('/api/line/oa')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setOa(d); setOaBasicId(d.basicId || '') } })
      .catch(() => {})
  }, [])

  async function saveOa(nextEnabled?: boolean) {
    setOaSaving(true)
    try {
      const r = await authedFetch('/api/line/oa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: nextEnabled ?? oa?.enabled ?? true,
          accessToken: oaToken.trim() || undefined,   // blank keeps the stored token
          basicId: oaBasicId.trim(),
        }),
      })
      if (r.ok) { setOa(await r.json()); setOaToken(''); setOaOpen(false) }
    } finally { setOaSaving(false) }
  }

  async function sendLineBroadcast() {
    if (!message.trim() || sending) return
    setSending(true); setSendMsg(null)
    // A broadcast is one identical message to everyone — {name} can't be
    // personalised here, so drop the token rather than send it literally.
    const text = message.replace(/\{name\}/g, '').replace(/[ \t]{2,}/g, ' ').trim()
    try {
      const r = await authedFetch('/api/line/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const d = await r.json().catch(() => ({}))
      setSendMsg(r.ok
        ? { ok: true,  text: L('Sent to all LINE friends ✓', 'ส่งถึงเพื่อน LINE ทุกคนแล้ว ✓') }
        : { ok: false, text: d.error || L('Send failed', 'ส่งไม่สำเร็จ') })
    } catch {
      setSendMsg({ ok: false, text: L('Connection failed', 'เชื่อมต่อไม่สำเร็จ') })
    } finally { setSending(false) }
  }

  // Members grouped by opted-in channel (only those with a handle).
  const byChannel = useMemo(() => {
    const m: Record<Channel, Member[]> = { line: [], telegram: [], whatsapp: [] }
    for (const mem of members) {
      if (mem.contactChannel && mem.contactId && m[mem.contactChannel]) {
        m[mem.contactChannel].push(mem)
      }
    }
    return m
  }, [members])

  const recipients = byChannel[channel]

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(tag)
      setTimeout(() => setCopied(c => (c === tag ? null : c)), 1500)
    } catch { /* clipboard blocked — no-op */ }
  }

  function copyAllHandles() {
    copy(recipients.map(r => r.contactId).join('\n'), 'handles')
  }

  function exportCsv() {
    const rows = [
      ['name', 'channel', 'contact_id', 'phone'],
      ...recipients.map(r => [r.name, channel, r.contactId ?? '', r.phone ?? '']),
    ]
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `broadcast-${channel}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Per-recipient deep link that actually works for the channel, or null when
  // only a manual copy is possible (LINE has no link to a personal handle).
  function sendHref(m: Member): string | null {
    const id = (m.contactId ?? '').trim()
    if (!id) return null
    const text = encodeURIComponent(personalize(message, m.name))
    if (channel === 'whatsapp') {
      const num = waNumber(id)
      return num ? `https://wa.me/${num}${message ? `?text=${text}` : ''}` : null
    }
    if (channel === 'telegram') {
      const handle = id.replace(/^@/, '')
      return /^[A-Za-z0-9_]{4,}$/.test(handle) ? `https://t.me/${handle}` : null
    }
    return null // LINE — copy the handle + message and send from the LINE app
  }

  return (
    <div className="flex-1 bg-[#FAF8F4] overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-stone-900">{L('Broadcast', 'ส่งข่าวสาร / โปรโมชั่น')}</h1>
          <p className="text-sm text-stone-500 mt-1">
            {L('Reach members who opted in to a channel at signup.',
               'ส่งถึงสมาชิกที่เลือกช่องทางไว้ตอนสมัคร')}
          </p>
        </div>

        {/* Channel tabs */}
        <div className="grid grid-cols-3 gap-2">
          {CHANNELS.map(c => {
            const count = byChannel[c.key].length
            const active = channel === c.key
            return (
              <button
                key={c.key}
                onClick={() => setChannel(c.key)}
                className={`py-3 rounded-2xl border-2 flex flex-col items-center gap-1 transition active:scale-95 ${
                  active ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                }`}
              >
                <span className="text-xl leading-none">{c.icon}</span>
                <span className="text-xs font-bold">{c.label}</span>
                <span className={`text-[11px] ${active ? 'text-stone-300' : 'text-stone-400'}`}>
                  {count} {L('members', 'คน')}
                </span>
              </button>
            )
          })}
        </div>

        {/* Message composer */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col gap-2">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">
            {L('Message', 'ข้อความ')}
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            placeholder={L('e.g. Hi {name}! 🎉 20% off this weekend at our shop.',
                           'เช่น สวัสดีคุณ {name} 🎉 สุดสัปดาห์นี้ลด 20% ที่ร้านเรา')}
            className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition resize-y"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-stone-400">
              {L('Use {name} to insert the member’s name.', 'ใส่ {name} เพื่อแทนชื่อสมาชิก')}
            </span>
            <button
              onClick={() => copy(message, 'msg')}
              disabled={!message}
              className="text-xs font-semibold text-amber-600 disabled:text-stone-300"
            >
              {copied === 'msg' ? L('Copied ✓', 'คัดลอกแล้ว ✓') : L('Copy message', 'คัดลอกข้อความ')}
            </button>
          </div>
        </div>

        {/* LINE Official Account — real one-tap broadcast to every friend */}
        {channel === 'line' && (
          <div className="bg-white rounded-2xl border-2 border-emerald-200 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">💚</span>
                <span className="text-sm font-bold text-stone-800">{L('LINE Official Account', 'LINE Official Account')}</span>
              </div>
              <button onClick={() => setOaOpen(o => !o)} className="text-xs font-semibold text-emerald-600">
                {oa?.hasToken ? L('Settings', 'ตั้งค่า') : L('Connect', 'เชื่อมต่อ')}
              </button>
            </div>

            {oa?.enabled && oa?.hasToken ? (
              <>
                <p className="text-[11px] text-stone-500 leading-snug">
                  {L('Sends this message to every friend of your LINE OA in one tap.',
                     'ส่งข้อความนี้ถึงเพื่อน LINE OA ทุกคนในปุ่มเดียว')}
                </p>
                <button
                  onClick={sendLineBroadcast}
                  disabled={!message.trim() || sending}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-40 active:scale-95 transition"
                >
                  {sending ? L('Sending…', 'กำลังส่ง…') : L('📢 Broadcast to all LINE friends', '📢 ส่งถึงเพื่อน LINE ทุกคน')}
                </button>
                {sendMsg && (
                  <p className={`text-xs text-center ${sendMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{sendMsg.text}</p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2.5 leading-snug">
                {L('Not connected yet. Add your LINE channel access token to broadcast to all OA friends at once.',
                   'ยังไม่ได้เชื่อมต่อ — ใส่ Channel Access Token ของ LINE OA เพื่อส่งถึงเพื่อนทุกคนพร้อมกัน')}
              </p>
            )}

            {oaOpen && (
              <div className="flex flex-col gap-2 border-t border-stone-100 pt-3">
                <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wide">
                  {L('Channel access token', 'Channel Access Token')}
                </label>
                <input
                  value={oaToken}
                  onChange={e => setOaToken(e.target.value)}
                  placeholder={oa?.hasToken ? L('•••• saved — leave blank to keep', '•••• บันทึกไว้แล้ว — เว้นว่างเพื่อคงเดิม') : L('paste long-lived token', 'วาง long-lived token')}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                />
                <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wide mt-1">
                  {L('Basic ID (optional)', 'Basic ID (ไม่บังคับ)')}
                </label>
                <input
                  value={oaBasicId}
                  onChange={e => setOaBasicId(e.target.value)}
                  placeholder="@yourshop"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                />
                <p className="text-[10px] text-stone-400 leading-snug">
                  {L('From LINE Developers → your Messaging API channel → Channel access token (long-lived).',
                     'หาได้จาก LINE Developers → ช่อง Messaging API → Channel access token (long-lived)')}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => saveOa(true)}
                    disabled={oaSaving || (!oaToken.trim() && !oa?.hasToken)}
                    className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white font-bold text-sm disabled:opacity-40 active:scale-95 transition"
                  >
                    {oaSaving ? L('Saving…', 'กำลังบันทึก…') : L('Save & enable', 'บันทึกและเปิดใช้')}
                  </button>
                  {oa?.hasToken && (
                    <button
                      onClick={() => saveOa(!oa.enabled)}
                      disabled={oaSaving}
                      className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm active:scale-95 transition"
                    >
                      {oa.enabled ? L('Disable', 'ปิด') : L('Enable', 'เปิด')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Per-recipient assist — for handles collected at signup (WhatsApp deep
            link / Telegram chat), and LINE ids for anyone not yet an OA friend. */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-[11px] text-amber-800 leading-snug">
          {channel === 'whatsapp'
            ? L('WhatsApp: each “Send” opens WhatsApp with your message ready — just press send.',
                'WhatsApp: กด "ส่ง" แล้วจะเปิดแอปพร้อมข้อความ แค่กดส่งในแอป')
            : channel === 'telegram'
            ? L('Telegram: “Open chat” opens the conversation; paste the copied message and send.',
                'Telegram: กด "เปิดแชท" แล้ววางข้อความที่คัดลอกไว้เพื่อส่ง')
            : L('Below are members who gave a LINE ID at signup — copy to reach anyone not yet following your OA.',
                'ด้านล่างคือสมาชิกที่ให้ LINE ID ตอนสมัคร — คัดลอกเพื่อติดต่อคนที่ยังไม่ได้เป็นเพื่อน OA')}
        </div>

        {/* Bulk actions */}
        <div className="flex flex-wrap gap-2">
          <button onClick={copyAllHandles} disabled={recipients.length === 0}
            className="px-4 py-2 rounded-xl bg-white border border-stone-200 text-stone-700 text-sm font-semibold disabled:opacity-40 active:scale-95 transition">
            {copied === 'handles' ? L('Copied ✓', 'คัดลอกแล้ว ✓') : L('Copy all IDs', 'คัดลอก ID ทั้งหมด')}
          </button>
          <button onClick={exportCsv} disabled={recipients.length === 0}
            className="px-4 py-2 rounded-xl bg-white border border-stone-200 text-stone-700 text-sm font-semibold disabled:opacity-40 active:scale-95 transition">
            {L('Export CSV', 'ดาวน์โหลด CSV')}
          </button>
        </div>

        {/* Recipients */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <span className="text-sm font-bold text-stone-700">{L('Recipients', 'ผู้รับ')}</span>
            <span className="text-xs text-stone-400">{recipients.length}</span>
          </div>
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-stone-400">{L('Loading…', 'กำลังโหลด…')}</p>
          ) : recipients.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-400">
              {L('No members on this channel yet.', 'ยังไม่มีสมาชิกในช่องทางนี้')}
            </p>
          ) : (
            <div className="divide-y divide-stone-50">
              {recipients.map(m => {
                const href = sendHref(m)
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{m.name}</p>
                      <p className="text-xs text-stone-400 truncate">{m.contactId}</p>
                    </div>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-bold active:scale-95 transition">
                        {channel === 'whatsapp' ? L('Send', 'ส่ง') : L('Open chat', 'เปิดแชท')}
                      </a>
                    ) : (
                      <button onClick={() => copy(m.contactId ?? '', `id-${m.id}`)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 text-xs font-bold active:scale-95 transition">
                        {copied === `id-${m.id}` ? L('Copied ✓', 'คัดลอก ✓') : L('Copy ID', 'คัดลอก ID')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
