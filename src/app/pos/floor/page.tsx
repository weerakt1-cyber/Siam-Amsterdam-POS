'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/pos-auth'

// ── Types ─────────────────────────────────────────────────────────────────────

type TableTile = {
  id: string
  tableNo: string
  x: number
  y: number
  w: number
  h: number
  shape: 'rect' | 'round'
  capacity: number
}

type RawOrder = {
  tableNo: string
  status: string
  total: number
  createdAt: string
}

type TileStatus = 'empty' | 'pending' | 'ready'

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID     = 40
const CANVAS_W = 800
const CANVAS_H = 520
const LS_KEY   = 'pos_floor_layout'
const INACTIVE = new Set(['paid', 'cancelled', 'delivered'])

const DEFAULT_TILES: TableTile[] = [
  { id: 'dt-T1',   tableNo: 'T1',   x: 40,  y: 40,  w: 120, h: 80,  shape: 'rect',  capacity: 4  },
  { id: 'dt-T2',   tableNo: 'T2',   x: 200, y: 40,  w: 120, h: 80,  shape: 'rect',  capacity: 4  },
  { id: 'dt-T3',   tableNo: 'T3',   x: 360, y: 40,  w: 120, h: 80,  shape: 'rect',  capacity: 4  },
  { id: 'dt-T4',   tableNo: 'T4',   x: 520, y: 40,  w: 120, h: 80,  shape: 'rect',  capacity: 4  },
  { id: 'dt-T5',   tableNo: 'T5',   x: 40,  y: 200, w: 160, h: 80,  shape: 'rect',  capacity: 6  },
  { id: 'dt-T6',   tableNo: 'T6',   x: 240, y: 200, w: 160, h: 80,  shape: 'rect',  capacity: 6  },
  { id: 'dt-VIP1', tableNo: 'VIP1', x: 600, y: 180, w: 120, h: 120, shape: 'round', capacity: 8  },
  { id: 'dt-BAR',  tableNo: 'BAR',  x: 40,  y: 400, w: 280, h: 80,  shape: 'rect',  capacity: 10 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function snapTo(n: number)                         { return Math.round(n / GRID) * GRID }
function clamp(v: number, lo: number, hi: number)  { return Math.max(lo, Math.min(hi, v)) }

function tileStatus(orders: RawOrder[], tableNo: string): { status: TileStatus; total: number; elapsed: number } {
  const active = orders.filter(o => o.tableNo === tableNo && !INACTIVE.has(o.status))
  if (!active.length) return { status: 'empty', total: 0, elapsed: 0 }
  const hasReady = active.some(o => o.status === 'ready')
  const oldest   = active.reduce((a, b) => a.createdAt < b.createdAt ? a : b)
  const elapsed  = Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 60000)
  const total    = active.reduce((s, o) => s + o.total, 0)
  return { status: hasReady ? 'ready' : 'pending', total, elapsed }
}

// Scan canvas top-left → right → down and return first non-overlapping position
function findFreePosition(w: number, h: number, currentTiles: TableTile[]): { x: number; y: number } {
  for (let r = 0; r * GRID + h <= CANVAS_H; r++) {
    for (let c = 0; c * GRID + w <= CANVAS_W; c++) {
      const x = c * GRID
      const y = r * GRID
      const blocked = currentTiles.some(
        t => x < t.x + t.w && x + w > t.x && y < t.y + t.h && y + h > t.y
      )
      if (!blocked) return { x, y }
    }
  }
  return { x: 0, y: 0 }
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-stone-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

const INPUT  = 'w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber-400 transition'
const SELECT = 'w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber-400 transition'

// ── Tile card ─────────────────────────────────────────────────────────────────

function TileCard({
  tile, status, total, elapsed, isSelected, editMode, onPointerDown, onClick,
}: {
  tile: TableTile
  status: TileStatus
  total: number
  elapsed: number
  isSelected: boolean
  editMode: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
}) {
  const round = tile.shape === 'round'
  const surface =
    status === 'ready'   ? 'bg-emerald-50 border-emerald-400 text-emerald-900' :
    status === 'pending' ? 'bg-amber-50   border-amber-400   text-amber-900'   :
                           'bg-white      border-stone-200   text-stone-600'

  return (
    <div
      style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h, touchAction: 'none' }}
      className={[
        'absolute flex flex-col items-center justify-center border-2 select-none transition-all',
        round ? 'rounded-full' : 'rounded-2xl',
        surface,
        isSelected ? 'ring-2 ring-amber-500 ring-offset-2 shadow-xl z-10' : 'shadow-sm hover:shadow-md',
        editMode ? 'cursor-move' : 'cursor-pointer active:scale-95',
      ].join(' ')}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <p className="font-black text-sm leading-none">{tile.tableNo}</p>
      {status === 'empty' ? (
        <p className="text-[9px] text-stone-300 mt-1">{tile.capacity}p</p>
      ) : (
        <>
          <p className={`text-[9px] font-bold mt-0.5 ${status === 'ready' ? 'text-emerald-600' : 'text-amber-600'}`}>
            {status === 'ready' ? 'Ready!' : 'Ordered'}
          </p>
          <p className="text-[9px] text-stone-500 mt-0.5">
            ฿{Math.round(total).toLocaleString()} · {elapsed}m
          </p>
        </>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FloorPage() {
  const router    = useRouter()
  const { user }  = useAuth()
  const isManager = ['admin', 'manager'].includes(user?.role ?? '')

  const [tiles, setTiles] = useState<TableTile[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return JSON.parse(raw) as TableTile[]
    } catch { /* ignore */ }
    return DEFAULT_TILES
  })

  const [editMode,   setEditMode]   = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [orders,     setOrders]     = useState<RawOrder[]>([])
  const [saved,      setSaved]      = useState(false)
  const [addError,   setAddError]   = useState('')

  // Add-tile form state
  const [newNo,    setNewNo]    = useState('')
  const [newShape, setNewShape] = useState<'rect' | 'round'>('rect')
  const [newCap,   setNewCap]   = useState('4')
  const [newW,     setNewW]     = useState('120')
  const [newH,     setNewH]     = useState('80')

  // Pointer-drag state (works for mouse + touch via Pointer Events API)
  const dragRef = useRef<{
    tileId: string; pointerId: number
    sx: number; sy: number; ox: number; oy: number
    moved: boolean
  } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // ── Poll orders ─────────────────────────────────────────────────────────────

  const poll = useCallback(async () => {
    try {
      const r = await fetch('/api/orders')
      if (r.ok) setOrders((await r.json()).orders ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    poll()
    const iv = setInterval(poll, 10000)
    return () => clearInterval(iv)
  }, [poll])

  // ── Layout persistence ──────────────────────────────────────────────────────

  function saveLayout() {
    localStorage.setItem(LS_KEY, JSON.stringify(tiles))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function resetLayout() {
    if (!confirm('รีเซ็ตผังโต๊ะเป็นค่าเริ่มต้น?\nการเปลี่ยนแปลงทั้งหมดจะหายไป')) return
    setTiles(DEFAULT_TILES)
    localStorage.setItem(LS_KEY, JSON.stringify(DEFAULT_TILES))
    setSelectedId(null)
  }

  // ── Shape change → auto-resize ──────────────────────────────────────────────

  function handleNewShapeChange(shape: 'rect' | 'round') {
    setNewShape(shape)
    if (shape === 'round') { setNewW('100'); setNewH('100') }
    else                   { setNewW('120'); setNewH('80')  }
  }

  // ── Table CRUD ──────────────────────────────────────────────────────────────

  function addTile() {
    const no = newNo.trim()
    if (!no) return
    if (tiles.some(t => t.tableNo === no)) {
      setAddError(`โต๊ะ "${no}" มีอยู่แล้ว`)
      return
    }
    setAddError('')
    const w = Math.max(GRID * 2, snapTo(parseInt(newW) || 120))
    const h = Math.max(GRID * 2, snapTo(parseInt(newH) || 80))
    const { x, y } = findFreePosition(w, h, tiles)
    const t: TableTile = {
      id:       crypto.randomUUID(),
      tableNo:  no,
      x, y, w, h,
      shape:    newShape,
      capacity: Math.max(1, parseInt(newCap) || 4),
    }
    setTiles(p => [...p, t])
    setSelectedId(t.id)
    setNewNo('')
  }

  function deleteTile(id: string) {
    if (!confirm('ลบโต๊ะนี้ออกจากผังโต๊ะ?')) return
    setTiles(p => p.filter(t => t.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function updateTile(id: string, patch: Partial<TableTile>) {
    setTiles(p => p.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  // ── Pointer drag (Pointer Events API: handles mouse + touch uniformly) ──────

  function handleTilePointerDown(e: React.PointerEvent, tileId: string) {
    if (!editMode) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const tile = tiles.find(t => t.id === tileId)
    if (!tile) return
    setSelectedId(tileId)
    dragRef.current = { tileId, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, ox: tile.x, oy: tile.y, moved: false }
  }

  function handleCanvasPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const tile = tiles.find(t => t.id === d.tileId)
    if (!tile) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true
    const nx = clamp(snapTo(d.ox + dx), 0, CANVAS_W - tile.w)
    const ny = clamp(snapTo(d.oy + dy), 0, CANVAS_H - tile.h)
    setTiles(p => p.map(t => t.id === d.tileId ? { ...t, x: nx, y: ny } : t))
  }

  function handleCanvasPointerUp() {
    dragRef.current = null
  }

  const selectedTile = tiles.find(t => t.id === selectedId)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-stone-50 text-stone-900">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-white border-b border-stone-200 flex items-center gap-3 shrink-0">
        <h1 className="font-bold text-stone-900">Floor Plan</h1>

        {!editMode && (
          <div className="flex items-center gap-3 ml-2">
            {[
              { color: 'bg-white border-stone-300',        label: 'Empty'   },
              { color: 'bg-amber-50 border-amber-400',     label: 'Ordered' },
              { color: 'bg-emerald-50 border-emerald-400', label: 'Ready'   },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs text-stone-400">
                <span className={`w-3 h-3 rounded border ${color} inline-block`} />
                {label}
              </span>
            ))}
          </div>
        )}

        {editMode && (
          <span className="text-xs text-amber-600 font-semibold ml-2">
            {tiles.length} tables · drag to move
          </span>
        )}

        <div className="flex-1" />

        {isManager && (
          <div className="flex items-center gap-2">
            {editMode && (
              <>
                <button
                  onClick={resetLayout}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-xl transition"
                >
                  🔄 Reset Default
                </button>
                <button
                  onClick={saveLayout}
                  className={`text-xs font-bold px-4 py-1.5 rounded-xl transition active:scale-95 shadow-sm ${
                    saved ? 'bg-emerald-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-white'
                  }`}
                >
                  {saved ? '✓ Saved' : 'Save Layout'}
                </button>
              </>
            )}
            <button
              onClick={() => { setEditMode(m => !m); setSelectedId(null); setAddError('') }}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition active:scale-95 ${
                editMode
                  ? 'bg-amber-500 border-amber-400 text-white shadow-sm'
                  : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
              }`}
            >
              {editMode ? '✏️ Editing' : '✏️ Edit'}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Canvas */}
        <div className="flex-1 overflow-auto p-4">
          <div
            ref={canvasRef}
            className={`relative rounded-2xl border-2 bg-stone-100/50 ${editMode ? 'border-amber-200' : 'border-stone-100'}`}
            style={{ width: CANVAS_W, height: CANVAS_H, minWidth: CANVAS_W }}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerUp}
            onClick={() => editMode && setSelectedId(null)}
          >
            {/* Grid dots (edit mode only) */}
            {editMode && (
              <svg className="absolute inset-0 pointer-events-none opacity-20" width={CANVAS_W} height={CANVAS_H}>
                <defs>
                  <pattern id="gdot" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                    <circle cx={GRID / 2} cy={GRID / 2} r="1.5" fill="#92400e" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#gdot)" />
              </svg>
            )}

            {tiles.map(tile => {
              const { status, total, elapsed } = tileStatus(orders, tile.tableNo)
              return (
                <TileCard
                  key={tile.id}
                  tile={tile}
                  status={status}
                  total={total}
                  elapsed={elapsed}
                  isSelected={editMode && selectedId === tile.id}
                  editMode={editMode}
                  onPointerDown={e => { e.stopPropagation(); handleTilePointerDown(e, tile.id) }}
                  onClick={e => {
                    e.stopPropagation()
                    if (!editMode) {
                      router.push(`/pos?table=${encodeURIComponent(tile.tableNo)}`)
                    } else if (!dragRef.current?.moved) {
                      setSelectedId(tile.id)
                    }
                  }}
                />
              )
            })}
          </div>
        </div>

        {/* ── Edit sidebar ──────────────────────────────────────────────────── */}
        {editMode && (
          <div className="w-56 bg-white border-l border-stone-200 shrink-0 flex flex-col overflow-y-auto">
            <div className="p-3 flex flex-col gap-4">

              {/* ── Add table ─────────────────────────────────────────────── */}
              <section>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">
                  + Add Table
                </p>
                <div className="flex flex-col gap-2">

                  <Field label="Table No *">
                    <input
                      value={newNo}
                      onChange={e => { setNewNo(e.target.value); setAddError('') }}
                      onKeyDown={e => e.key === 'Enter' && addTile()}
                      placeholder="T7, VIP2, Gameroom…"
                      className={`${INPUT} font-mono`}
                    />
                  </Field>

                  <Field label="Shape">
                    <select
                      value={newShape}
                      onChange={e => handleNewShapeChange(e.target.value as 'rect' | 'round')}
                      className={SELECT}
                    >
                      <option value="rect">■  Rectangle</option>
                      <option value="round">●  Round</option>
                    </select>
                  </Field>

                  <div className="flex gap-1.5">
                    <Field label="W (px)">
                      <input
                        type="number" min={GRID * 2} step={GRID}
                        value={newW}
                        onChange={e => setNewW(e.target.value)}
                        className={INPUT}
                      />
                    </Field>
                    <Field label="H (px)">
                      <input
                        type="number" min={GRID * 2} step={GRID}
                        value={newH}
                        onChange={e => setNewH(e.target.value)}
                        className={INPUT}
                      />
                    </Field>
                  </div>

                  <Field label="Capacity">
                    <input
                      type="number" min="1" max="99"
                      value={newCap}
                      onChange={e => setNewCap(e.target.value)}
                      className={INPUT}
                    />
                  </Field>

                  {addError && (
                    <p className="text-[10px] text-red-500 bg-red-50 rounded-lg px-2 py-1">{addError}</p>
                  )}

                  <button
                    onClick={addTile}
                    disabled={!newNo.trim()}
                    className="w-full py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-xl transition active:scale-95 disabled:opacity-40"
                  >
                    + Add Table
                  </button>
                </div>
              </section>

              <div className="h-px bg-stone-100" />

              {/* ── Selected table editor ─────────────────────────────────── */}
              <section>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">
                  Selected
                </p>

                {selectedTile ? (
                  <div className="flex flex-col gap-2">

                    <Field label="Table No">
                      <input
                        value={selectedTile.tableNo}
                        onChange={e => {
                          const val = e.target.value
                          const dup = tiles.some(t => t.id !== selectedTile.id && t.tableNo === val)
                          if (!dup) updateTile(selectedTile.id, { tableNo: val })
                        }}
                        className={`${INPUT} font-mono`}
                      />
                    </Field>

                    <Field label="Shape">
                      <select
                        value={selectedTile.shape}
                        onChange={e => updateTile(selectedTile.id, { shape: e.target.value as 'rect' | 'round' })}
                        className={SELECT}
                      >
                        <option value="rect">■  Rectangle</option>
                        <option value="round">●  Round</option>
                      </select>
                    </Field>

                    <div className="flex gap-1.5">
                      <Field label="W (px)">
                        <input
                          type="number" min={GRID * 2} step={GRID}
                          value={selectedTile.w}
                          onChange={e => updateTile(selectedTile.id, {
                            w: Math.max(GRID * 2, snapTo(parseInt(e.target.value) || GRID * 2)),
                          })}
                          className={INPUT}
                        />
                      </Field>
                      <Field label="H (px)">
                        <input
                          type="number" min={GRID * 2} step={GRID}
                          value={selectedTile.h}
                          onChange={e => updateTile(selectedTile.id, {
                            h: Math.max(GRID * 2, snapTo(parseInt(e.target.value) || GRID * 2)),
                          })}
                          className={INPUT}
                        />
                      </Field>
                    </div>

                    <Field label="Capacity">
                      <input
                        type="number" min="1" max="99"
                        value={selectedTile.capacity}
                        onChange={e => updateTile(selectedTile.id, {
                          capacity: Math.max(1, parseInt(e.target.value) || 1),
                        })}
                        className={INPUT}
                      />
                    </Field>

                    <p className="text-[9px] text-stone-300 font-mono">
                      pos ({selectedTile.x}, {selectedTile.y}) · {selectedTile.w}×{selectedTile.h}
                    </p>

                    <button
                      onClick={() => deleteTile(selectedTile.id)}
                      className="w-full py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition active:scale-95"
                    >
                      🗑 Delete Table
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-stone-300 text-center py-3">
                    Click a table to edit
                  </p>
                )}
              </section>

              <div className="flex-1" />
              <p className="text-[9px] text-stone-300 text-center pb-1">
                Drag to reposition · {GRID}px grid snap
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
