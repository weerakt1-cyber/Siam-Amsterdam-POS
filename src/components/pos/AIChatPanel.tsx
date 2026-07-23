'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { AI_NAME } from '@/lib/ai-brand'

// ─── Types ────────────────────────────────────────────────────────────────────

type Msg = {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  file?: { name: string; size: number; ext: string }
}

type AttachedFile = {
  name: string
  ext: string       // csv | json | txt | xlsx
  content: string   // text content (Excel converted to CSV)
  size: number
}

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLAN = (process.env.NEXT_PUBLIC_POS_PLAN ?? 'starter') as 'starter' | 'pro' | 'enterprise'

const PLAN_LABEL: Record<string, string> = {
  starter:    'Starter',
  pro:        'Pro',
  enterprise: 'Enterprise',
}

const PLAN_MONTHS: Record<string, number> = {
  starter:    18,
  pro:        60,
  enterprise: 9999,
}

const PLAN_COLOR: Record<string, string> = {
  starter:    'bg-stone-700 text-stone-300',
  pro:        'bg-blue-900 text-blue-300',
  enterprise: 'bg-amber-900 text-amber-300',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK = [
  'ยอดขายวันนี้เท่าไร?',
  'โต๊ะที่เปิดอยู่มีอะไรบ้าง?',
  'สินค้าขายดีวันนี้คืออะไร?',
  'สินค้าคงคลังใกล้หมดมีอะไร?',
]

const ACCEPT = '.csv,.json,.txt,.xlsx,.xls'

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIChatPanel() {
  const [open, setOpen]               = useState(false)
  const [msgs, setMsgs]               = useState<Msg[]>([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [attached, setAttached]       = useState<AttachedFile | null>(null)
  const [fileError, setFileError]     = useState('')
  const [fileLoading, setFileLoading] = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const abortRef    = useRef<AbortController | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  // ─── File handler ──────────────────────────────────────────────────────────

  const handleFileSelect = async (file: File) => {
    setFileError('')
    setFileLoading(true)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    try {
      if (['csv', 'json', 'txt'].includes(ext)) {
        const text = await file.text()
        setAttached({ name: file.name, ext, content: text, size: file.size })

      } else if (['xlsx', 'xls'].includes(ext)) {
        // Dynamic import — loads xlsx only when needed
        const XLSX = await import('xlsx')
        const ab   = await file.arrayBuffer()
        const wb   = XLSX.read(ab, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const csv  = XLSX.utils.sheet_to_csv(ws)
        setAttached({ name: file.name, ext: 'xlsx', content: csv, size: file.size })

      } else {
        setFileError(`ไม่รองรับไฟล์ .${ext || '?'} — รองรับ: CSV, JSON, TXT, Excel (.xlsx)`)
      }
    } catch {
      setFileError('อ่านไฟล์ไม่ได้ กรุณาตรวจสอบไฟล์')
    } finally {
      setFileLoading(false)
    }
  }

  // ─── Send ──────────────────────────────────────────────────────────────────

  const send = useCallback(async (text: string, fileOverride?: AttachedFile | null) => {
    const trimmed   = text.trim()
    const fileToSend = fileOverride !== undefined ? fileOverride : attached
    if ((!trimmed && !fileToSend) || loading) return

    const displayText = trimmed || `[แนบไฟล์: ${fileToSend!.name}]`
    const history     = msgs.filter(m => !m.streaming)
    const userMsg: Msg = {
      role: 'user',
      content: displayText,
      file: fileToSend ? { name: fileToSend.name, size: fileToSend.size, ext: fileToSend.ext } : undefined,
    }
    const next = [...history, userMsg]

    setMsgs([...next, { role: 'assistant', content: '', streaming: true }])
    setInput('')
    setAttached(null)
    setFileError('')
    setLoading(true)

    abortRef.current = new AbortController()

    try {
      const body: Record<string, unknown> = {
        messages: next.map(m => ({ role: m.role, content: m.content })),
        plan:     PLAN,
      }
      if (fileToSend) {
        body.file = { name: fileToSend.name, ext: fileToSend.ext, content: fileToSend.content }
      }

      const res = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'เกิดข้อผิดพลาด' }))
        setMsgs(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: err.error ?? 'เกิดข้อผิดพลาด' },
        ])
        return
      }

      const reader  = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      let accumulated = ''
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break
          try {
            const { text: t } = JSON.parse(payload)
            if (t) {
              accumulated += t
              setMsgs(prev => [
                ...prev.slice(0, -1),
                { role: 'assistant', content: accumulated, streaming: true },
              ])
            }
          } catch { /* skip malformed */ }
        }
      }

      setMsgs(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: accumulated || '…', streaming: false },
      ])
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setMsgs(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' },
      ])
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [msgs, loading, attached])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const handleClose = () => {
    abortRef.current?.abort()
    setOpen(false)
  }

  const maxMonths = PLAN_MONTHS[PLAN]

  return (
    <>
      {/* ── Floating button ── */}
      <button
        onPointerDown={() => (open ? handleClose() : setOpen(true))}
        className={`fixed bottom-20 right-4 sm:bottom-6 sm:right-5 z-[60] w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-2xl transition-all active:scale-95 select-none ${
          open ? 'bg-stone-800 text-white' : 'bg-amber-500 hover:bg-amber-400 text-white'
        }`}
        title={AI_NAME}
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="fixed z-[59] flex flex-col bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden"
          style={{
            bottom:    'calc(4.5rem + 1rem + 56px)',
            right:     '1rem',
            width:     'min(calc(100vw - 2rem), 380px)',
            maxHeight: 'calc(100dvh - 12rem)',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-stone-900 text-white shrink-0">
            <span className="text-xl">🤖</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold leading-none">{AI_NAME}</p>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${PLAN_COLOR[PLAN]}`}>
                  {PLAN_LABEL[PLAN]}
                </span>
              </div>
              <p className="text-[10px] text-stone-400 mt-0.5 leading-none">
                Powered by Claude · {maxMonths >= 9999 ? 'ไม่จำกัดเดือน' : `ข้อมูลย้อนหลัง ${maxMonths} เดือน`}
              </p>
            </div>
            {msgs.length > 0 && (
              <button
                onPointerDown={() => { setMsgs([]); setInput(''); setAttached(null) }}
                className="text-xs text-stone-500 hover:text-stone-200 transition px-2 py-1 rounded-lg hover:bg-stone-800"
              >
                ล้าง
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {msgs.length === 0 ? (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-stone-400 text-center leading-relaxed">
                  สวัสดี! ถามฉันเกี่ยวกับธุรกิจ หรือ{' '}
                  <button
                    className="text-amber-600 underline underline-offset-2"
                    onPointerDown={() => fileInputRef.current?.click()}
                  >
                    แนบไฟล์
                  </button>
                  {' '}เพื่อนำเข้าข้อมูล
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK.map(q => (
                    <button
                      key={q}
                      onPointerDown={() => send(q)}
                      className="text-left text-xs bg-stone-50 hover:bg-amber-50 hover:border-amber-300 border border-stone-200 text-stone-700 rounded-xl px-3 py-2.5 leading-snug transition-all active:scale-95"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {/* Import hint */}
                <button
                  onPointerDown={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3 border border-dashed border-stone-300 hover:border-amber-400 hover:bg-amber-50 rounded-xl text-left transition-all active:scale-[0.98] group"
                >
                  <span className="text-2xl">📂</span>
                  <div>
                    <p className="text-xs font-semibold text-stone-700 group-hover:text-amber-700">นำเข้าข้อมูลเก่า</p>
                    <p className="text-[10px] text-stone-400 mt-0.5">CSV, Excel, JSON · ข้อมูลย้อนหลัง {maxMonths >= 9999 ? 'ไม่จำกัด' : `${maxMonths} เดือน`} ({PLAN_LABEL[PLAN]})</p>
                  </div>
                </button>
              </div>
            ) : (
              msgs.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {/* File badge on user messages */}
                  {m.file && (
                    <div className="flex items-center gap-1.5 mb-1 px-2 py-1 bg-amber-100 border border-amber-200 rounded-lg">
                      <span className="text-xs">📎</span>
                      <span className="text-[10px] font-medium text-amber-800 max-w-[160px] truncate">{m.file.name}</span>
                      <span className="text-[10px] text-amber-500">{fmtSize(m.file.size)}</span>
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-amber-500 text-white rounded-br-sm'
                        : 'bg-stone-100 text-stone-900 rounded-bl-sm'
                    }`}
                  >
                    {m.content
                      ? (
                        <>
                          {m.content}
                          {m.streaming && (
                            <span className="inline-block w-0.5 h-4 bg-stone-400 animate-pulse ml-0.5 align-text-bottom rounded-full" />
                          )}
                        </>
                      )
                      : (
                        <span className="flex gap-1 items-center py-0.5">
                          <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      )
                    }
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* File preview strip */}
          {(attached || fileLoading || fileError) && (
            <div className={`px-3 py-2 border-t shrink-0 ${
              fileError ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
            }`}>
              {fileLoading ? (
                <div className="flex items-center gap-2 text-xs text-amber-700">
                  <span className="w-3.5 h-3.5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin shrink-0" />
                  กำลังอ่านไฟล์...
                </div>
              ) : fileError ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-red-600 leading-snug">{fileError}</p>
                  <button onPointerDown={() => setFileError('')} className="text-red-400 text-sm shrink-0">✕</button>
                </div>
              ) : attached ? (
                <div className="flex items-center gap-2">
                  <span className="text-base">📎</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-900 truncate">{attached.name}</p>
                    <p className="text-[10px] text-amber-600">{fmtSize(attached.size)} · {attached.ext.toUpperCase()}</p>
                  </div>
                  <button
                    onPointerDown={() => { setAttached(null); setFileError('') }}
                    className="text-amber-500 hover:text-amber-800 text-sm shrink-0 transition"
                  >
                    ✕
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Input area */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3 border-t border-stone-100 shrink-0">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file)
                e.target.value = ''
              }}
            />

            {/* Attach button */}
            <button
              type="button"
              onPointerDown={() => fileInputRef.current?.click()}
              disabled={loading || fileLoading}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all active:scale-95 shrink-0 ${
                attached
                  ? 'bg-amber-100 text-amber-600 border border-amber-300'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200 disabled:opacity-40'
              }`}
              title="แนบไฟล์ CSV, Excel, JSON"
            >
              📎
            </button>

            {/* Text input */}
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={attached ? 'พิมพ์คำสั่งสำหรับไฟล์...' : 'ถามเกี่ยวกับธุรกิจ...'}
              disabled={loading}
              className="flex-1 text-sm bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition disabled:opacity-60 min-w-0"
            />

            {/* Send button */}
            <button
              type="submit"
              disabled={(!input.trim() && !attached) || loading}
              className="w-10 h-10 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-200 text-white disabled:text-stone-400 rounded-xl flex items-center justify-center transition-all active:scale-95 shrink-0"
            >
              {loading
                ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <span className="text-base font-bold">↑</span>
              }
            </button>
          </form>
        </div>
      )}
    </>
  )
}
