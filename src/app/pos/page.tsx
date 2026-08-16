'use client'

import { authedFetch } from "@/lib/supabase-browser"
import { useState, useEffect, useCallback } from 'react'
import type { MenuItem, Order, Promotion } from '@/lib/types'
import { applyPromotions } from '@/lib/promotions'
import CheckoutModal from '@/components/pos/CheckoutModal'
import NumPad from '@/components/pos/NumPad'
import PinPad from '@/components/pos/PinPad'
import SplitBillModal from '@/components/pos/SplitBillModal'
import NotificationBell from '@/components/pos/NotificationBell'
import { loadBarSettings, DEFAULT_BAR_SETTINGS, printReceipt, openCashDrawer, type BarSettings } from '@/lib/printer'
import { type CatEntry, CATEGORIES_CHANGED_EVENT, loadAllCategories, fetchCategories } from '@/lib/categories'
import { FLOOR_LAYOUT_CHANGED_EVENT, loadFloorTables } from '@/lib/floor'
import { getThaiGreeting, getDailyQuote } from '@/lib/greeting'
import { usePosLang } from '@/lib/pos-i18n'
import { useAuth } from '@/lib/pos-auth'

const ALL_CHIP: CatEntry = { value: 'all', label: 'All', color: 'bg-gray-200 text-gray-700', icon: '🍽️' }

// Custom POS-page icons (black line-art PNGs). Served from /public/pos-icons.
const PI = {
  table:       '/pos-icons/table.png',
  hold:        '/pos-icons/hold-bill.png',
  drawer:      '/pos-icons/open-drawer.png',
  itemsAdd:    '/pos-icons/items-add.png',
  member:      '/pos-icons/member.png',
  openTickets: '/pos-icons/open-tickets.png',
  printCheck:  '/pos-icons/print-check.png',
  coupon:      '/pos-icons/coupon.png',
  split:       '/pos-icons/split-bill.png',
  search:      '/pos-icons/search.png',
} as const

// Brand icon colour = the POS item-price yellow (Tailwind amber-500). The source
// PNGs are monochrome, so we render them through a CSS mask: a box filled with
// `color` clipped to the icon's shape. This tints every icon to the exact same
// yellow on any surface. Pass `color` to override (e.g. dark on an amber pill).
const ICON_AMBER = '#f59e0b'
function Ic({ src, color = ICON_AMBER, className = 'w-4 h-4' }: { src: string; color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  )
}

// Custom dropdown that can show a leading PNG icon — native <select>/<option>
// can't render images, so the coupon + member pickers use this instead.
function IconDropdown({
  icon, placeholder, value, options, onPick,
}: {
  icon: string
  placeholder: string
  value: string                                   // label of current selection; '' = none
  options: { value: string; label: string }[]
  onPick: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-700 outline-none focus:border-stone-400 transition text-left"
      >
        <Ic src={icon} className="w-3.5 h-3.5 opacity-70" />
        <span className={`flex-1 truncate ${value ? '' : 'text-stone-400'}`}>{value || placeholder}</span>
        <span className={`text-[9px] text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-white rounded-xl shadow-xl border border-stone-200 overflow-hidden max-h-64 overflow-y-auto">
            {options.map(o => (
              <button
                type="button"
                key={o.value || '__none__'}
                onClick={() => { onPick(o.value); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-50 transition truncate ${
                  o.value === value ? 'bg-stone-50 font-semibold text-stone-900' : 'text-stone-700'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

type CartItem = {
  menuId: string; name: string; qty: number; price: number
  variantLabel?: string
  itemDiscount?: number  // % discount เฉพาะ item นี้ (0-100)
  fromOrderId?: string   // ติดแท็กถ้าดึงมาจาก QR self-order — แก้ qty/discount ไม่ได้, ลบได้ทั้งกลุ่มเท่านั้น
}

// Fix #13: store type + value so we can recalculate client-side when subtotal changes
type AppliedCoupon = {
  id: string; code: string; name: string
  type: 'percent' | 'fixed'; value: number
  discountAmount: number
}

function baht(n: number) {
  return '฿' + new Intl.NumberFormat('en').format(Math.round(n))
}

function cartKey(c: { menuId: string; variantLabel?: string; fromOrderId?: string }) {
  if (c.fromOrderId) return `qr::${c.fromOrderId}::${c.menuId}${c.variantLabel ? `::${c.variantLabel}` : ''}`
  return c.variantLabel ? `${c.menuId}::${c.variantLabel}` : c.menuId
}

// คำนวณราคารวมหลังหักส่วนลดของ item นั้นๆ
function itemEffectiveTotal(c: CartItem): number {
  const gross = c.price * c.qty
  if (!c.itemDiscount || c.itemDiscount <= 0) return gross
  return Math.round(gross * (1 - c.itemDiscount / 100))
}


export default function POSPage() {
  // Table tabs mirror the Floor Plan layout (single source of truth in @/lib/floor),
  // so the tables you can ring up always match the room drawn on the floor plan.
  const { t, lang } = usePosLang()
  const { user } = useAuth()
  const [tables, setTables] = useState<string[]>(() => loadFloorTables())
  const [table, setTable] = useState(() => loadFloorTables()[0] ?? 'T1')
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [drawerPinOpen, setDrawerPinOpen] = useState(false)
  const [category, setCategory] = useState('all')
  const [categories, setCategories] = useState<CatEntry[]>(() => loadAllCategories())
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [menuLoading, setMenuLoading] = useState(true)

  // Live-refresh category chips when Items → Categories adds/deletes/reorders —
  // covers same-tab edits (custom event), another tab/window on this device
  // (storage event), and — via the initial fetchCategories() call — changes
  // made on a different device entirely, since categories live in Supabase.
  // If the currently-selected category was deleted, fall back to "All" so the menu
  // doesn't silently show nothing with no chip highlighted.
  const applyCategories = useCallback((next: CatEntry[]) => {
    setCategories(next)
    setCategory(prev => (prev === 'all' || next.some(c => c.value === prev) ? prev : 'all'))
  }, [])

  useEffect(() => {
    fetchCategories().then(applyCategories)
    const refresh = () => applyCategories(loadAllCategories())
    window.addEventListener(CATEGORIES_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(CATEGORIES_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [applyCategories])

  // Fix #2: per-table carts stored in a map keyed by table
  const [carts, setCarts] = useState<Record<string, CartItem[]>>({})
  const cart = carts[table] ?? []

  function setCart(updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) {
    setCarts(prev => {
      const current = prev[table] ?? []
      const next = typeof updater === 'function' ? updater(current) : updater
      return { ...prev, [table]: next }
    })
  }

  const [search, setSearch] = useState('')
  const [memberName, setMemberName] = useState('')
  const [members, setMembers] = useState<{ id: string; name: string; points: number; tier?: string }[]>([])
  const [couponCode, setCouponCode] = useState('')
  const [itemDiscountTarget, setItemDiscountTarget] = useState<string | null>(null)
  const [itemDiscountValue,  setItemDiscountValue]  = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null)
  const [couponError, setCouponError] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [showSplitBill, setShowSplitBill] = useState(false)
  const [showOpenTickets, setShowOpenTickets] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [payingTicket, setPayingTicket] = useState<Order | null>(null)
  const [pointsToRedeem, setPointsToRedeem] = useState(0)
  const [voidConfirmId, setVoidConfirmId] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [clock, setClock] = useState('')
  const [bizName, setBizName] = useState(DEFAULT_BAR_SETTINGS.barName)
  const [coupons, setCoupons] = useState<{ id: string; code: string; name: string; type: string; value: number }[]>([])
  const [promos, setPromos] = useState<Promotion[]>([])
  const [lowStockMap, setLowStockMap] = useState<Record<string, string[]>>({})

  // Fix #4: variant picker state
  const [variantPicking, setVariantPicking] = useState<MenuItem | null>(null)
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({})

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('table')
    if (t) setTable(t.toUpperCase())
  }, [])

  // Keep the table tabs in sync with the Floor Plan — refresh on same-tab edits
  // (custom event) and edits from another tab/window (storage event). Also
  // reconcile once on mount, since the initial useState ran before hydration.
  // If the selected table was removed from the layout, fall back to the first.
  useEffect(() => {
    const refresh = () => {
      const next = loadFloorTables()
      setTables(next)
      setTable(prev => (next.includes(prev) ? prev : next[0] ?? prev))
    }
    refresh()
    window.addEventListener(FLOOR_LAYOUT_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(FLOOR_LAYOUT_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  useEffect(() => {
    setBizName(loadBarSettings().barName || DEFAULT_BAR_SETTINGS.barName)
    authedFetch('/api/coupons')
      .then(r => r.json())
      .then(d => setCoupons((d.coupons ?? []).filter((c: { active: boolean }) => c.active)))
      .catch(() => {})
    authedFetch('/api/promotions')
      .then(r => r.json())
      .then(d => setPromos((d.promotions ?? []).filter((p: Promotion) => p.active)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Fetch menu + ingredients + inventory in parallel; compute low-stock map
    Promise.all([
      authedFetch('/api/menu').then(r => r.json()),
      authedFetch('/api/menu/ingredients').then(r => r.json()),
      authedFetch('/api/inventory').then(r => r.json()),
    ]).then(([menuData, ingData, invData]) => {
      setMenu(menuData.menu ?? [])
      const invMap: Record<string, { name: string; currentStock: number; lowStockThreshold: number }> =
        Object.fromEntries((invData.items ?? []).map((i: { id: string; name: string; currentStock: number; lowStockThreshold: number }) => [i.id, i]))
      const map: Record<string, string[]> = {}
      for (const ing of (ingData.ingredients ?? []) as { menuItemId: string; inventoryItemId: string }[]) {
        const inv = invMap[ing.inventoryItemId]
        if (inv && inv.currentStock <= inv.lowStockThreshold) {
          if (!map[ing.menuItemId]) map[ing.menuItemId] = []
          map[ing.menuItemId].push(inv.name)
        }
      }
      setLowStockMap(map)
    }).catch(() => {}).finally(() => setMenuLoading(false))
    authedFetch('/api/members')
      .then((r) => r.json())
      .then((d) => {
        if (d.members?.length)
          setMembers(d.members.map((m: { id: string; name: string; points?: number; tier?: string }) => ({
            id: m.id, name: m.name, points: m.points ?? 0, tier: m.tier ?? 'bronze',
          })))
      })
      .catch(() => {})
  }, [])

  const fetchOrders = useCallback(async () => {
    try {
      const r = await authedFetch('/api/orders')
      if (r.ok) {
        const d = await r.json()
        setOrders(d.orders ?? [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchOrders()
    const iv = setInterval(fetchOrders, 15000)
    return () => clearInterval(iv)
  }, [fetchOrders])

  const todayStr = new Date().toDateString()
  const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === todayStr)
  const todayTotal = todayOrders.reduce((s, o) => s + o.total, 0)
  // Fix #10: filter history by current table
  const tableOrders = todayOrders.filter(o => o.tableNo === table)
  const historyOrders = showAllHistory ? todayOrders : tableOrders

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // Add to cart without variant selection (after modal confirmation or no variants)
  function addToCartDirect(item: MenuItem, variantLabel?: string, priceAdjust = 0) {
    const key = variantLabel ? `${item.id}::${variantLabel}` : item.id
    const finalPrice = item.price + priceAdjust
    const displayName = variantLabel ? `${item.name} (${variantLabel})` : item.name
    setCart(prev => {
      const idx = prev.findIndex(c => cartKey(c) === key)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { menuId: item.id, name: displayName, qty: 1, price: finalPrice, variantLabel }]
    })
  }

  // Fix #4: open variant picker for items with variants; add directly otherwise
  function addToCart(item: MenuItem) {
    if (item.variants && item.variants.length > 0) {
      setVariantPicking(item)
      setVariantSelections({})
      return
    }
    addToCartDirect(item)
  }

  function confirmVariant() {
    if (!variantPicking) return
    const item = variantPicking
    if (item.variants?.some(v => v.required && !variantSelections[v.id])) return
    const labels: string[] = []
    let priceAdjust = 0
    item.variants?.forEach(v => {
      const opt = v.options.find(o => o.id === variantSelections[v.id])
      if (opt) { labels.push(opt.name); priceAdjust += opt.priceAdjust }
    })
    addToCartDirect(item, labels.join(', ') || undefined, priceAdjust)
    setVariantPicking(null)
    setVariantSelections({})
  }

  // Fix #4: changeQty matches by menuId + variantLabel + fromOrderId pair
  function changeQty(menuId: string, delta: number, variantLabel?: string, fromOrderId?: string) {
    setCart(prev =>
      prev
        .map(c => c.menuId === menuId && c.variantLabel === variantLabel && c.fromOrderId === fromOrderId ? { ...c, qty: c.qty + delta } : c)
        .filter(c => c.qty > 0)
    )
  }

  // ดึงรายการจากออเดอร์ QR เข้าตะกร้า (ล็อกแก้ qty/discount ไม่ได้ — ถอดออกได้ทั้งกลุ่มเท่านั้น)
  function mergeQrOrder(order: Order) {
    setCart(prev => [
      ...prev,
      ...order.items.map(item => ({
        menuId: item.menuId, name: item.name, qty: item.qty, price: item.price,
        variantLabel: item.variantLabel, fromOrderId: order.id,
      })),
    ])
  }

  function unmergeQrOrder(orderId: string) {
    setCart(prev => prev.filter(c => c.fromOrderId !== orderId))
  }

  function clearCart() {
    setCarts(prev => {
      const { [table]: _dropped, ...rest } = prev
      return rest
    })
    setMemberName('')
    setAppliedCoupon(null)
    setCouponCode('')
    setCouponError('')
    setPointsToRedeem(0)
  }

  async function handleVoidOrder(orderId: string) {
    try {
      const r = await authedFetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (r.ok) { await fetchOrders(); showToast(t('toastOrderVoided')) }
      else showToast(t('toastVoidFail'), false)
    } catch { showToast(t('toastVoidFail'), false) }
    setVoidConfirmId(null)
  }

  function setItemDiscountForItem(key: string, discount: number | undefined) {
    setCart(prev => prev.map(c => cartKey(c) === key ? { ...c, itemDiscount: discount } : c))
  }

  async function applyCoupon(codeOverride?: string) {
    const code = (codeOverride ?? couponCode).trim()
    if (!code) return
    setCouponError('')
    try {
      const r = await authedFetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal, memberName: memberName.trim() || undefined }),
      })
      const data = await r.json()
      if (!r.ok || !data.valid) {
        setCouponError(data.error ?? t('toastInvalidCoupon'))
        setAppliedCoupon(null)
      } else {
        // Fix #13: store type + value for client-side discount recalculation
        setAppliedCoupon({
          id: data.couponId, code: data.couponCode, name: data.couponName,
          type: data.type, value: data.value, discountAmount: data.discountAmount,
        })
        setCouponCode('')
        setCouponError('')
      }
    } catch {
      setCouponError(t('toastValidateCouponFail'))
    }
  }

  // Kicks the cash drawer via the Bluetooth printer (same path as checkout —
  // the old /api/drawer route only worked for a server-side LAN printer).
  async function fireDrawer() {
    try {
      await openCashDrawer(loadBarSettings())
      showToast(t('posDrawerOpened'))
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('toastPrintFailed'), false)
    }
  }

  function openDrawer() {
    // Gated by the active user's own login PIN (nothing extra to remember).
    // If there's no signed-in user, fall back to a light confirm().
    if (user?.id) { setDrawerPinOpen(true); return }
    if (!confirm(t('posOpenDrawerConfirm'))) return
    fireDrawer()
  }

  // Verify an entered PIN against the current user's login PIN; on success open
  // the till and close the pad. Returns false so PinPad flashes on a wrong PIN.
  async function verifyDrawerPin(entered: string): Promise<boolean> {
    if (!user?.id) return false
    try {
      const r = await authedFetch('/api/users/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, pin: entered }),
      })
      const d = await r.json()
      if (d.valid) { setDrawerPinOpen(false); fireDrawer(); return true }
    } catch { /* fall through */ }
    return false
  }

  const mergedOrderIds = new Set(cart.filter(c => c.fromOrderId).map(c => c.fromOrderId!))
  // All open (unpaid) orders for this table — includes already-merged ones (for the modal)
  const allOpenTableOrders = orders.filter(o =>
    o.tableNo === table &&
    ['pending', 'accepted', 'ready', 'delivered'].includes(o.status)
  )
  // Subset that haven't been pulled into the cart yet (for badge count)
  const pendingTableOrders = allOpenTableOrders.filter(o => !mergedOrderIds.has(o.id))

  const subtotal = cart.reduce((s, c) => s + itemEffectiveTotal(c), 0)

  // Auto-applied item-level promotions (bundle / free-item / timed discount).
  // Computed on each line's effective unit price; the resulting per-line
  // discount is shown as a tag and folded into the order-level discount lump.
  const menuCategoryOf = (menuId: string) => menu.find(m => m.id === menuId)?.category
  const promoResult = applyPromotions(
    cart.map(c => ({ key: cartKey(c), menuId: c.menuId, qty: c.qty, unitPrice: c.qty > 0 ? itemEffectiveTotal(c) / c.qty : c.price })),
    promos, new Date(), menuCategoryOf,
  )
  const promoDiscount = promoResult.totalDiscount
  const subtotalAfterPromo = Math.max(0, subtotal - promoDiscount)

  // Fix #13: recalculate coupon discount from current subtotal client-side —
  // coupon stacks after promotions (applied to the promo-reduced subtotal).
  const couponDiscountAmount = appliedCoupon
    ? appliedCoupon.type === 'percent'
      ? Math.round(subtotalAfterPromo * appliedCoupon.value / 100)
      : Math.min(appliedCoupon.value, subtotalAfterPromo)
    : 0

  // Coupons + auto promotions are the discount sources (manual entry removed).
  const discountAmount = couponDiscountAmount + promoDiscount

  // Points redemption — 1 point = ฿1, applied after coupon/promo discount
  const selectedMember = members.find(m => m.name === memberName) ?? null
  const memberAvailablePoints = selectedMember?.points ?? 0
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const actualPointsDiscount = pointsToRedeem > 0
    ? Math.min(pointsToRedeem, memberAvailablePoints, afterDiscount)
    : 0
  const finalTotal = Math.max(0, afterDiscount - actualPointsDiscount)

  // Free-item promos are tag/note only (no line, no stock) — surfaced on the
  // order note so the kitchen/staff hand them out.
  const freebieNote = promoResult.freebies
    .map(f => `🎁 ${f.text}${f.qty > 1 ? ` ×${f.qty}` : ''}`)
    .join(', ')

  // พิมพ์ Check Bill ให้ลูกค้าดูก่อนชำระเงิน — พิมพ์ผ่านเครื่องพิมพ์ (Bluetooth/LAN)
  // โดยตรง ไม่เปิดแท็บเบราว์เซอร์ (บนแอป Android การเปิดแท็บจะไปที่ Chrome แล้วกลับ
  // แอปไม่ได้)
  async function handlePrintTicket() {
    if (cart.length === 0) return
    const cfg = loadBarSettings()
    try {
      await printReceipt({
        orderId:        'CHECK' + Date.now().toString().slice(-8),
        tableNo:        table,
        createdAt:      new Date().toISOString(),
        memberName:     memberName || undefined,
        couponCode:     appliedCoupon?.code,
        items:          cart.map(c => ({ name: c.name, qty: c.qty, price: c.price })),
        subtotal,
        discountAmount: discountAmount + actualPointsDiscount,
        total:          finalTotal,
        vatIncluded:    Math.round(finalTotal * 7 / 107),
        note:           freebieNote || undefined,
      }, cfg)   // Print Check = pre-payment bill: no review QR (only the final checkout receipt has it)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('posPrintCheckConn'))
    }
  }

  // Fix #5/B-04: pass couponId so orders API records use atomically
  // รายการที่ดึงมาจาก QR order จะถูก "settle" โดย PATCH order เดิมเป็น paid (รักษา stock deduction +
  // source แยกตามออเดอร์จริง) ส่วนรายการที่พนักงานเพิ่มเองจะสร้างเป็น POS order ใหม่ตามปกติ
  // — กันไม่ให้นับยอดซ้ำสองรอบ
  async function handleConfirmPayment(method: string, received?: number): Promise<string> {
    const manualItems = cart.filter(c => !c.fromOrderId)
    let representativeId = ''

    for (const orderId of mergedOrderIds) {
      const r = await authedFetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid', paymentMethod: method }),
      })
      if (r.ok) {
        const d = await r.json()
        representativeId = d.order?.id ?? representativeId
      }
    }

    if (manualItems.length > 0) {
      const res = await authedFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNo: table,
          items: manualItems.map((c) => ({
            menuId: c.menuId,
            name: c.name,
            qty: c.qty,
            price: c.itemDiscount ? Math.round(c.price * (1 - c.itemDiscount / 100)) : c.price,
            variantLabel: c.variantLabel,
          })),
          paymentMethod: method,
          source: 'pos',
          note: freebieNote || undefined,
          discount: (discountAmount + actualPointsDiscount) > 0
            ? { type: 'fixed' as const, value: discountAmount + actualPointsDiscount, amount: discountAmount + actualPointsDiscount }
            : undefined,
          memberName: memberName.trim() || undefined,
          couponId: appliedCoupon?.id,
          couponOrderTotal: finalTotal,
          couponMemberName: memberName.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.error ?? t('toastSaveOrderFail'), false)
        throw new Error(err.error ?? t('toastSaveOrderFail'))
      }

      const data = await res.json()
      representativeId = data.order.id
    }

    if (method === 'cash') {
      authedFetch('/api/drawer', { method: 'POST' }).catch(() => {})
    }

    // Deduct redeemed points from member
    if (actualPointsDiscount > 0 && selectedMember?.id) {
      const newPoints = Math.max(0, selectedMember.points - actualPointsDiscount)
      authedFetch(`/api/members/${selectedMember.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: newPoints }),
      }).catch(() => {})
      setMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, points: newPoints } : m))
      setPointsToRedeem(0)
    }

    fetchOrders()
    return representativeId
  }

  // พักบิล — ส่งรายการที่เพิ่มเองเข้าครัว/บาร์ทันที (เหมือน QR order) แต่ยังไม่เก็บเงิน
  // จะไปโผล่ใน panel "บิลที่ค้างอยู่" รอบหน้าที่เปิดโต๊ะนี้ ดึงกลับมาจ่ายทีหลังได้
  async function handleHoldBill() {
    const manualItems = cart.filter(c => !c.fromOrderId)
    if (manualItems.length === 0) return
    try {
      const res = await authedFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNo: table,
          hold: true,
          source: 'pos',
          note: freebieNote || undefined,
          items: manualItems.map((c) => ({
            menuId: c.menuId,
            name: c.name,
            qty: c.qty,
            price: c.itemDiscount ? Math.round(c.price * (1 - c.itemDiscount / 100)) : c.price,
            variantLabel: c.variantLabel,
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.error ?? t('toastHoldBillFail'), false)
        return
      }
      clearCart()
      await fetchOrders()
      showToast(t('posBillHeld'))
    } catch {
      showToast(t('posHoldBillNetFail'), false)
    }
  }

  // Pay a single open ticket on its own — bypasses the shared table cart entirely,
  // so separate customers at the same table can each pay for just their own order.
  async function handleSingleTicketPayment(method: string, received?: number): Promise<string> {
    if (!payingTicket) throw new Error(t('toastNoTicket'))
    const r = await authedFetch(`/api/orders/${payingTicket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid', paymentMethod: method }),
    })
    if (!r.ok) {
      const err = await r.json()
      showToast(err.error ?? t('toastPaymentFail'), false)
      throw new Error(err.error ?? t('toastPaymentFail'))
    }
    const d = await r.json()
    if (method === 'cash') authedFetch('/api/drawer', { method: 'POST' }).catch(() => {})
    await fetchOrders()
    return d.order?.id ?? payingTicket.id
  }

  function handleCheckoutClose() { setShowCheckout(false) }
  function handleCheckoutComplete() { setShowCheckout(false); clearCart() }

  const filteredMenu = menu.filter((m) => {
    if (!m.available) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return m.name.toLowerCase().includes(q) || m.nameTh.toLowerCase().includes(q)
    }
    return category === 'all' || m.category.toLowerCase() === category.toLowerCase()
  })

  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div
      className="flex-1 bg-[#FAF8F4] text-stone-900 flex flex-col overflow-hidden"
      style={{ userSelect: 'none' }}
    >
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg font-semibold text-sm pointer-events-none ${
          toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {/* Checkout modal */}
      {showCheckout && (
        <CheckoutModal
          cart={cart}
          table={table}
          note={freebieNote}
          discount={{ type: appliedCoupon?.type ?? 'fixed', value: appliedCoupon?.value ?? 0, amount: discountAmount + actualPointsDiscount, couponCode: appliedCoupon?.code }}
          memberName={memberName.trim()}
          memberTier={selectedMember?.tier as 'bronze' | 'silver' | 'gold' | undefined}
          onConfirm={handleConfirmPayment}
          onClose={handleCheckoutClose}
          onComplete={handleCheckoutComplete}
        />
      )}

      {/* Split Bill modal */}
      {showSplitBill && (
        <SplitBillModal
          table={table}
          total={finalTotal}
          onConfirm={handleConfirmPayment}
          onClose={() => setShowSplitBill(false)}
          onComplete={() => { setShowSplitBill(false); clearCart() }}
        />
      )}

      {/* Single-ticket checkout — pays one open ticket standalone, independent of the shared table cart */}
      {payingTicket && (
        <CheckoutModal
          cart={payingTicket.items.map(i => ({
            menuId: i.menuId, name: i.name, qty: i.qty, price: i.price, variantLabel: i.variantLabel,
          }))}
          table={payingTicket.tableNo}
          note={payingTicket.note ?? ''}
          discount={payingTicket.discount
            ? { type: payingTicket.discount.type, value: payingTicket.discount.value, amount: payingTicket.discount.amount }
            : { type: 'fixed', value: 0, amount: 0 }}
          memberName={payingTicket.memberName ?? ''}
          memberTier={members.find(m => m.name === payingTicket.memberName)?.tier as 'bronze' | 'silver' | 'gold' | undefined}
          onConfirm={handleSingleTicketPayment}
          onClose={() => setPayingTicket(null)}
          onComplete={() => { setPayingTicket(null); fetchOrders() }}
        />
      )}

      {/* Fix #4: Variant picker modal */}
      {variantPicking && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
          onClick={() => { setVariantPicking(null); setVariantSelections({}) }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <h2 className="font-bold text-stone-900">{variantPicking.name}</h2>
                <p className="text-xs text-stone-400 mt-0.5">Base price {baht(variantPicking.price)}</p>
              </div>
              <button
                onClick={() => { setVariantPicking(null); setVariantSelections({}) }}
                className="text-stone-400 hover:text-stone-700 text-xl leading-none"
              >✕</button>
            </div>
            <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[50vh]">
              {variantPicking.variants?.map(v => (
                <div key={v.id}>
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">
                    {v.name}
                    {v.required && <span className="text-red-400 ml-1 normal-case font-normal">*required</span>}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {v.options.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setVariantSelections(s => ({ ...s, [v.id]: opt.id }))}
                        className={`py-2.5 px-3 rounded-xl text-sm font-semibold border transition active:scale-95 text-left ${
                          variantSelections[v.id] === opt.id
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        <span>{opt.name}</span>
                        {opt.priceAdjust !== 0 && (
                          <span className="block text-xs opacity-70 mt-0.5">
                            {opt.priceAdjust > 0 ? '+' : ''}{baht(opt.priceAdjust)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4 pt-3 border-t border-stone-100">
              {variantPicking.variants?.some(v => v.required && !variantSelections[v.id]) && (
                <p className="text-xs text-amber-600 text-center mb-2">Select all required options *</p>
              )}
              <button
                onClick={confirmVariant}
                disabled={variantPicking.variants?.some(v => v.required && !variantSelections[v.id])}
                className="w-full py-3 rounded-xl bg-stone-900 text-white font-bold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add to Order →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fix #10: History modal — filtered by table by default, toggle for all */}
      {showHistory && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <h2 className="text-lg font-bold text-stone-900">
                  {showAllHistory ? "Today's Orders" : `Table ${table} — Today`}
                </h2>
                <p className="text-xs text-stone-400 mt-0.5">{dateLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAllHistory(p => !p)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                    showAllHistory
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {showAllHistory ? t('posAllTables') : t('posThisTable')}
                </button>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-stone-400 hover:text-stone-700 text-3xl leading-none w-10 h-10 flex items-center justify-center"
                >×</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              {historyOrders.length === 0 ? (
                <div className="py-12 text-center text-stone-300">
                  <p>{showAllHistory ? t('posNoOrdersToday') : `${t('posNoOrdersForTable')} ${table} ${t('posTodaySuffix')}`}</p>
                </div>
              ) : (
                historyOrders.map((o) => (
                  <div key={o.id} className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-amber-600">{o.tableNo}</span>
                        <span className="text-xs text-stone-400 font-mono">#{o.id.slice(-6)}</span>
                        <span className="text-xs bg-stone-200 text-stone-500 rounded px-1.5 py-0.5 uppercase">{o.source}</span>
                        {o.status === 'cancelled' && (
                          <span className="text-xs bg-red-100 text-red-600 rounded px-1.5 py-0.5 font-bold">VOIDED</span>
                        )}
                        {o.paymentMethod && o.status !== 'cancelled' && (
                          <span className="text-xs bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 uppercase">{o.paymentMethod}</span>
                        )}
                        {o.discount && o.discount.amount > 0 && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">-{baht(o.discount.amount)}</span>
                        )}
                      </div>
                      <p className="text-sm text-stone-500 mt-1 truncate">
                        {o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}
                      </p>
                      {o.memberName && <p className="flex items-center gap-1 text-xs text-stone-400 mt-0.5"><Ic src={PI.member} className="w-3 h-3 opacity-60" /> {o.memberName}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold ${o.status === 'cancelled' ? 'text-stone-300 line-through' : 'text-amber-600'}`}>
                        {baht(o.total)}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {new Date(o.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {o.status === 'paid' && (
                        voidConfirmId === o.id ? (
                          <div className="flex gap-1 mt-1.5 justify-end">
                            <button
                              onClick={() => handleVoidOrder(o.id)}
                              className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg"
                            >
                              Confirm Void
                            </button>
                            <button
                              onClick={() => setVoidConfirmId(null)}
                              className="text-[10px] text-stone-400 hover:text-stone-600 px-1.5 py-0.5"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setVoidConfirmId(o.id)}
                            className="text-[10px] text-stone-300 hover:text-red-400 transition mt-1 block ml-auto"
                          >
                            Void
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-4 border-t border-stone-100 flex items-center justify-between">
              <span className="text-sm text-stone-500">
                {historyOrders.length} order{historyOrders.length !== 1 ? 's' : ''}
                {!showAllHistory && ` · ${table}`}
              </span>
              <span className="font-bold text-amber-600 text-lg">
                {baht(historyOrders.reduce((s, o) => s + o.total, 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Open Tickets Modal ── */}
      {showOpenTickets && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowOpenTickets(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Open Tickets</h2>
                <p className="text-xs text-stone-400 mt-0.5">
                  Table {table} · {allOpenTableOrders.length} open ticket{allOpenTableOrders.length !== 1 ? 's' : ''}
                  {mergedOrderIds.size > 0 && ` · ${mergedOrderIds.size} added to current bill`}
                </p>
                <p className="text-[10px] text-stone-400 mt-1">
                  Tap a ticket to add it to the current bill · use <span className="font-semibold text-stone-600">Pay This Order</span> to charge it separately
                </p>
              </div>
              <button
                onClick={() => setShowOpenTickets(false)}
                className="text-stone-400 hover:text-stone-700 text-3xl leading-none w-10 h-10 flex items-center justify-center"
              >×</button>
            </div>

            {/* Ticket list */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
              {allOpenTableOrders.length === 0 ? (
                <div className="py-12 text-center text-stone-300 flex flex-col items-center">
                  <Ic src={PI.openTickets} className="w-12 h-12 mb-3 opacity-25" />
                  <p className="text-sm">No open tickets for Table {table}</p>
                </div>
              ) : (
                allOpenTableOrders.map(o => {
                  const isMerged = mergedOrderIds.has(o.id)
                  const statusLabel =
                    o.status === 'delivered' ? 'Served'
                    : o.status === 'ready'    ? 'Ready'
                    : o.status === 'accepted' ? 'In Progress'
                    : 'Pending'
                  return (
                    <div
                      key={o.id}
                      onClick={() => { if (!isMerged) mergeQrOrder(o) }}
                      className={`shrink-0 rounded-xl border overflow-hidden transition ${
                        isMerged
                          ? 'border-amber-300 bg-amber-50/60'
                          : 'border-stone-200 bg-white hover:border-amber-400 hover:shadow-md cursor-pointer active:scale-[0.99]'
                      }`}
                    >
                      {/* Ticket header */}
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-inherit">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            o.source === 'qr' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {o.source === 'qr' ? 'QR' : 'POS'}
                          </span>
                          <span className="text-xs font-mono text-stone-400">#{o.id.slice(-6)}</span>
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-stone-500"><Ic src={PI.table} className="w-3 h-3 opacity-70" /> {o.tableNo}</span>
                          {o.customerName && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-stone-700"><Ic src={PI.member} className="w-3 h-3 opacity-70" /> {o.customerName}</span>
                          )}
                          <span className={`text-xs font-medium ${
                            o.status === 'delivered' ? 'text-emerald-600'
                            : o.status === 'ready' ? 'text-blue-600'
                            : o.status === 'accepted' ? 'text-amber-600'
                            : 'text-stone-400'
                          }`}>{statusLabel}</span>
                          {isMerged && (
                            <span className="text-[9px] font-bold bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">In Bill</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-bold text-amber-600">{baht(o.total)}</span>
                          {!isMerged && <span className="text-stone-300 text-sm">›</span>}
                        </div>
                      </div>

                      {/* Items */}
                      <div className="px-4 py-2.5 flex flex-col gap-1">
                        {o.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-stone-700 truncate flex-1 mr-4">
                              {item.name}
                              {item.variantLabel && <span className="text-stone-400 ml-1">({item.variantLabel})</span>}
                              <span className="text-stone-400"> ×{item.qty}</span>
                            </span>
                            <span className="text-stone-500 shrink-0">{baht(item.price * item.qty)}</span>
                          </div>
                        ))}
                        {o.note && <p className="text-xs text-stone-400 mt-0.5 italic">Note: {o.note}</p>}
                      </div>

                      {/* Action */}
                      <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
                        {isMerged ? (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-amber-700 font-semibold">✓ Added to current bill</span>
                            <button
                              onClick={() => unmergeQrOrder(o.id)}
                              className="text-xs text-stone-400 hover:text-red-500 transition font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setPayingTicket(o)}
                              className="flex-1 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold text-sm transition"
                            >
                              Pay This Order
                            </button>
                            <button
                              onClick={() => mergeQrOrder(o)}
                              className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-sm transition"
                            >
                              + Add to Bill
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-stone-100 flex items-center justify-between bg-stone-50/80 shrink-0">
              <div className="text-sm text-stone-500">
                {(() => {
                  const unmerged = allOpenTableOrders.filter(o => !mergedOrderIds.has(o.id)).length
                  const mergedTotal = allOpenTableOrders.filter(o => mergedOrderIds.has(o.id)).reduce((s, o) => s + o.total, 0)
                  return (
                    <span>
                      {unmerged > 0 ? `${unmerged} ${t('posNotAdded')}` : t('posAllAdded')}
                      {mergedOrderIds.size > 0 && <span className="ml-2 text-amber-600 font-semibold">+{baht(mergedTotal)} merged</span>}
                    </span>
                  )
                })()}
              </div>
              <div className="flex gap-2">
                {pendingTableOrders.length > 0 && (
                  <button
                    onClick={() => pendingTableOrders.forEach(o => mergeQrOrder(o))}
                    className="px-4 py-2 rounded-xl border-2 border-amber-400 text-amber-700 font-bold text-sm hover:bg-amber-50 transition active:scale-95"
                  >
                    Add All
                  </button>
                )}
                <button
                  onClick={() => setShowOpenTickets(false)}
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white font-bold text-sm transition active:scale-95"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-stone-200 shrink-0 shadow-sm">
        {/* Greeting + daily power quote (replaces the old table-tab strip) */}
        {(() => {
          const greet = getThaiGreeting(lang)
          const quote = getDailyQuote(lang)
          return (
            <div className="flex-1 min-w-0 flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-50 via-orange-50/60 to-transparent px-3 py-1.5">
              <div className="min-w-0 flex flex-col justify-center gap-0.5">
                <p className="text-sm font-black text-stone-900 leading-tight truncate">
                  {greet.text}{' '}
                  <span className="bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent">{bizName}</span>
                  {' '}!
                </p>
                <p className="text-xs font-semibold text-stone-600 italic leading-tight truncate">
                  “{quote}”
                </p>
              </div>
            </div>
          )
        })()}

        {/* Table picker + Hold Bill + Drawer + Alerts */}
        <div className="flex items-center gap-2 ml-1 shrink-0">
          {/* Single table button — opens a grid picker */}
          <div className="relative">
            <button
              onClick={() => setTablePickerOpen(v => !v)}
              className="relative bg-stone-900 hover:bg-stone-800 active:scale-95 text-white transition text-sm font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
            >
              <Ic src={PI.table} className="w-4 h-4" /> {table}
              <span className={`text-[9px] transition-transform ${tablePickerOpen ? 'rotate-180' : ''}`}>▼</span>
              {tables.some(t => t !== table && (carts[t] ?? []).length > 0) && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white" />
              )}
            </button>
            {tablePickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setTablePickerOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-stone-200 p-2 w-64">
                  <p className="flex items-center gap-1 text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 px-1.5"><Ic src={PI.table} className="w-3 h-3 opacity-60" /> {t('selectTable')}</p>
                  <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
                    {tables.map((tb) => {
                      const hasItems = (carts[tb] ?? []).length > 0
                      return (
                        <button
                          key={tb}
                          onClick={() => { setTable(tb); setTablePickerOpen(false) }}
                          className={`flex items-center justify-between gap-2 w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition active:scale-[0.98] ${
                            table === tb
                              ? 'bg-stone-900 text-white shadow-sm'
                              : 'bg-stone-50 text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          <span className="truncate">{tb}</span>
                          {hasItems && tb !== table && (
                            <span className="w-2 h-2 bg-amber-500 rounded-full shrink-0" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleHoldBill}
            disabled={!cart.some(c => !c.fromOrderId)}
            className="border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 text-amber-600 transition text-sm font-bold px-3 py-2 rounded-xl flex items-center gap-1.5"
          >
            <Ic src={PI.hold} className="w-4 h-4" /> <span className="hidden sm:inline">{t('holdBill')}</span>
          </button>
          <button
            onClick={openDrawer}
            className="bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 transition text-sm font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5"
          >
            <Ic src={PI.drawer} className="w-4 h-4" /> <span className="hidden sm:inline">{t('openDrawer')}</span>
          </button>
          <NotificationBell />
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Menu Panel */}
        <div className="flex flex-col flex-3 overflow-hidden border-r border-stone-200">

          {/* Category filter + Search */}
          <div className="flex flex-col shrink-0 bg-white border-b border-stone-100">
            <div className="flex gap-1.5 px-3 pt-2.5 pb-2 overflow-x-auto">
              {[ALL_CHIP, ...categories].map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => { setCategory(cat.value); setSearch('') }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 flex items-center gap-1.5 active:scale-95 ${
                    category === cat.value && !search
                      ? 'bg-stone-900 text-white font-bold shadow-sm'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="px-3 pb-2.5 relative">
              <Ic src={PI.search} className="w-3.5 h-3.5 absolute left-5 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('searchMenu')}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-8 py-2 text-sm text-stone-900 placeholder-stone-300 outline-none focus:border-amber-400 focus:bg-white transition"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-stone-300 hover:text-stone-600 text-base leading-none transition"
                >✕</button>
              )}
            </div>
          </div>

          {/* Menu grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {menuLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-stone-100 shadow-sm overflow-hidden flex flex-col animate-pulse">
                    <div className="w-full aspect-[3/2] bg-stone-100" />
                    <div className="p-2.5 flex flex-col gap-1.5">
                      <div className="h-3 bg-stone-100 rounded w-3/4" />
                      <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                      <div className="h-3.5 bg-stone-100 rounded w-1/3 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredMenu.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-stone-300 text-sm gap-2">
                {search && <Ic src={PI.search} className="w-8 h-8 opacity-25" />}
                <p>{search ? `${t('noResultsFor')} "${search}"` : t('noItemsCategory')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {filteredMenu.map((item) => {
                  const inCartQty = cart.filter(c => c.menuId === item.id).reduce((s, c) => s + c.qty, 0)
                  const inCart    = inCartQty > 0
                  const hasVariants = (item.variants?.length ?? 0) > 0
                  const hasImage  = !!item.image

                  return (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className={`relative rounded-2xl text-left transition active:scale-95 overflow-hidden flex flex-col ${
                        inCart
                          ? 'bg-amber-50 border-2 border-amber-400 shadow-sm'
                          : 'bg-white border border-stone-100 shadow-sm hover:shadow-md hover:border-stone-300'
                      }`}
                    >
                      {/* Image (when available) */}
                      {hasImage && (
                        <div className="w-full aspect-[3/2] overflow-hidden bg-stone-100 shrink-0">
                          <img
                            src={item.image!}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                          {/* In-cart qty badge on image */}
                          {inCart && (
                            <span className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md">
                              {inCartQty}
                            </span>
                          )}
                          {hasVariants && !inCart && (
                            <span className="absolute top-2 right-2 bg-black/50 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 backdrop-blur-sm">opt</span>
                          )}
                        </div>
                      )}

                      {/* Text content */}
                      <div className={`flex flex-col flex-1 ${hasImage ? 'p-2' : 'p-2.5'}`}>
                        <p className={`font-bold leading-snug text-stone-900 ${hasImage ? 'text-[11px]' : 'text-xs'}`}>{item.name}</p>
                        <p className="text-[9px] text-stone-400 mt-0.5 leading-tight truncate">{item.nameTh}</p>
                        <p className={`font-black mt-1 ${hasImage ? 'text-xs' : 'text-sm mt-1.5'} ${inCart ? 'text-amber-600' : 'text-amber-500'}`}>
                          {baht(item.price)}
                        </p>
                      </div>

                      {/* Badges (no-image layout) */}
                      {!hasImage && inCart && (
                        <span className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-black w-5 h-5 rounded-full flex items-center justify-center">
                          {inCartQty}
                        </span>
                      )}
                      {!hasImage && hasVariants && !inCart && (
                        <span className="absolute top-2 right-2 bg-stone-200 text-stone-500 text-[9px] font-bold rounded px-1 py-0.5">opt</span>
                      )}

                      {/* Low stock dot */}
                      {lowStockMap[item.id] && (
                        <span
                          title={`Running low: ${lowStockMap[item.id].join(', ')}`}
                          className="absolute bottom-2 left-2 w-2 h-2 bg-amber-500 rounded-full shadow-sm"
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart Panel */}
        <div className="flex flex-col flex-2 bg-white overflow-hidden min-w-60 border-l border-stone-100">

          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 bg-stone-50 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-stone-900">
                  Order — <span className="text-amber-500">{table}</span>
                </h2>
                {pendingTableOrders.length > 0 && (
                  <button
                    onClick={() => setShowOpenTickets(true)}
                    className="relative flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full transition active:scale-95"
                  >
                    <Ic src={PI.openTickets} className="w-3 h-3" /> {pendingTableOrders.length} open
                  </button>
                )}
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                {cart.length} item{cart.length !== 1 ? 's' : ''}
                {mergedOrderIds.size > 0 && <span className="text-amber-500 ml-1">· {mergedOrderIds.size} ticket{mergedOrderIds.size !== 1 ? 's' : ''} merged</span>}
              </p>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-stone-400 hover:text-red-500 transition px-2 py-1 rounded-lg hover:bg-red-50"
              >
                Clear
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1">
            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-stone-300 py-10">
                <Ic src={PI.itemsAdd} className="w-14 h-14 mb-3 opacity-25" />
                <p className="text-sm">Tap items to add</p>
              </div>
            ) : (
              cart.map((item) => {
                const key = cartKey(item)
                const hasDiscount = !!item.itemDiscount && item.itemDiscount > 0
                const promoLine = promoResult.lineDiscounts[key]
                const lineFinal = itemEffectiveTotal(item) - (promoLine?.amount ?? 0)
                const showStrike = hasDiscount || !!promoLine
                const isQr = !!item.fromOrderId
                return (
                  <div key={key} className="flex items-center gap-1.5 py-2 border-b border-stone-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium leading-snug text-stone-800 truncate">{item.name}</p>
                        {isQr && (
                          <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-bold shrink-0">QR</span>
                        )}
                      </div>
                      {item.variantLabel && (
                        <p className="text-[10px] text-stone-400 leading-tight mt-0.5">{item.variantLabel}</p>
                      )}
                      {promoLine && (
                        <span className="inline-block text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold mt-0.5">
                          {promoLine.label}
                        </span>
                      )}
                    </div>
                    {isQr ? (
                      <span className="w-5 text-center font-bold text-sm text-stone-900 shrink-0">{item.qty}</span>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => changeQty(item.menuId, -1, item.variantLabel)}
                          className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 active:scale-95 flex items-center justify-center text-base font-bold text-stone-600 transition"
                        >−</button>
                        <span className="w-5 text-center font-bold text-sm text-stone-900">{item.qty}</span>
                        <button
                          onClick={() => changeQty(item.menuId, 1, item.variantLabel)}
                          className="w-7 h-7 rounded-full bg-stone-900 hover:bg-stone-800 active:scale-95 flex items-center justify-center text-base font-bold text-white transition"
                        >+</button>
                      </div>
                    )}
                    {/* ราคา — แสดงขีดทับถ้ามีส่วนลด (item-discount หรือ promo) */}
                    <div className="flex flex-col items-end shrink-0 min-w-[52px]">
                      {showStrike ? (
                        <>
                          <span className="text-[10px] text-stone-300 line-through leading-none">{baht(item.price * item.qty)}</span>
                          <span className="text-amber-600 text-sm font-bold leading-tight">{baht(lineFinal)}</span>
                        </>
                      ) : (
                        <span className="text-amber-600 text-sm font-bold">{baht(item.price * item.qty)}</span>
                      )}
                    </div>
                    {/* ปุ่ม % ส่วนลดต่อ item — ปิดสำหรับรายการจาก QR */}
                    {isQr ? (
                      <button
                        onClick={() => unmergeQrOrder(item.fromOrderId!)}
                        className="text-[10px] bg-stone-100 text-stone-400 hover:bg-stone-200 rounded-full px-1.5 py-0.5 font-bold shrink-0 active:scale-95"
                      >
                        {t('remove')}
                      </button>
                    ) : hasDiscount ? (
                      <button
                        onClick={() => setItemDiscountForItem(key, undefined)}
                        className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 font-bold shrink-0 active:scale-95"
                      >
                        {item.itemDiscount}%✕
                      </button>
                    ) : (
                      <button
                        onClick={() => { setItemDiscountTarget(key); setItemDiscountValue('') }}
                        className="w-6 h-6 rounded-full text-[11px] font-bold text-stone-300 hover:text-stone-500 hover:bg-stone-100 flex items-center justify-center shrink-0 transition"
                      >%</button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Cart footer */}
          <div className="px-4 pt-2.5 pb-3 border-t border-stone-100 flex flex-col gap-2 shrink-0 bg-stone-50/60">

            {cart.length > 0 && cart.every(c => c.fromOrderId) && (
              <p className="text-[10px] text-amber-600">
                All items are from held tickets — discounts apply only to items added manually.
              </p>
            )}

            {/* Coupon code */}
            <div className="flex flex-col gap-1">
              {appliedCoupon ? (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <span className="flex items-center gap-1 text-emerald-700 text-xs flex-1 font-bold">
                    <Ic src={PI.coupon} className="w-3.5 h-3.5" /> {appliedCoupon.code} · -{baht(couponDiscountAmount)}
                    {appliedCoupon.type === 'percent' && (
                      <span className="text-emerald-500 ml-1">({appliedCoupon.value}%)</span>
                    )}
                  </span>
                  <button
                    onClick={() => setAppliedCoupon(null)}
                    className="text-stone-400 hover:text-red-500 text-xs transition"
                  >✕</button>
                </div>
              ) : (
                <IconDropdown
                  icon={PI.coupon}
                  placeholder={coupons.length > 0 ? t('selectCoupon') : t('noActiveCoupons')}
                  value=""
                  options={coupons.map(c => ({
                    value: c.code,
                    label: `${c.code} — ${c.name} (${c.type === 'percent' ? `${c.value}%` : `฿${c.value}`} off)`,
                  }))}
                  onPick={code => applyCoupon(code)}
                />
              )}
              {couponError && <p className="text-xs text-red-500 px-1">{couponError}</p>}
            </div>

            {/* Free-item promo banner (tag/note — staff hand it out) */}
            {promoResult.freebies.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex flex-col gap-0.5">
                {promoResult.freebies.map(f => (
                  <span key={f.promoId} className="text-emerald-700 text-xs font-bold">
                    {f.text}{f.qty > 1 ? ` ×${f.qty}` : ''} <span className="font-normal text-emerald-500">— free with this order</span>
                  </span>
                ))}
              </div>
            )}

            {/* Total */}
            <div className="flex items-baseline justify-between border-t border-stone-200 pt-2">
              <span className="text-stone-700 text-sm font-semibold">{t('total')}</span>
              <span className="text-2xl font-black text-stone-900">{baht(finalTotal)}</span>
            </div>

            {/* Member — select จาก DB */}
            <IconDropdown
              icon={PI.member}
              placeholder={t('noMember')}
              value={memberName}
              options={[
                { value: '', label: t('noMember') },
                ...members.map(m => ({ value: m.name, label: `${m.name} ${m.points > 0 ? `(${m.points} pts)` : ''}` })),
              ]}
              onPick={name => { setMemberName(name); setPointsToRedeem(0) }}
            />

            {/* Points redemption — shown when member has points */}
            {selectedMember && memberAvailablePoints > 0 && (
              actualPointsDiscount > 0 ? (
                <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                  <span className="text-violet-700 text-xs font-bold flex-1">
                    Points redeemed · -{baht(actualPointsDiscount)}
                  </span>
                  <button
                    onClick={() => setPointsToRedeem(0)}
                    className="text-stone-400 hover:text-red-500 text-xs transition"
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => setPointsToRedeem(Math.min(memberAvailablePoints, afterDiscount))}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 font-semibold hover:bg-violet-100 transition active:scale-95 text-left"
                >
                  Use {memberAvailablePoints} pts = -{baht(Math.min(memberAvailablePoints, afterDiscount))} discount
                </button>
              )
            )}

            {/* Action buttons row */}
            <div className="flex gap-2">
              {/* More actions — combines Print / Split / Open Tickets behind one button */}
              <div className="relative">
                <button
                  onClick={() => setShowMoreActions(v => !v)}
                  title="More actions"
                  className={`relative px-3 py-3.5 rounded-2xl font-bold text-sm transition active:scale-95 whitespace-nowrap ${
                    allOpenTableOrders.length > 0
                      ? 'bg-amber-500 hover:bg-amber-400 text-black'
                      : 'bg-white border-2 border-stone-900 text-stone-900 hover:bg-stone-50'
                  }`}
                >
                  ⋯
                  {pendingTableOrders.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black min-w-[16px] h-4 rounded-full flex items-center justify-center px-0.5">
                      {pendingTableOrders.length}
                    </span>
                  )}
                </button>

                {showMoreActions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMoreActions(false)} />
                    <div className="absolute bottom-full left-0 mb-2 z-50 w-44 bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
                      <button
                        onClick={() => { setShowMoreActions(false); handlePrintTicket() }}
                        disabled={cart.length === 0}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Ic src={PI.printCheck} className="w-4 h-4" /> {t('printCheckBill')}
                      </button>
                      <button
                        onClick={() => { setShowMoreActions(false); setShowSplitBill(true) }}
                        disabled={cart.length === 0}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition border-t border-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Ic src={PI.split} className="w-4 h-4" /> {t('splitBill')}
                      </button>
                      <button
                        onClick={() => { setShowMoreActions(false); setShowOpenTickets(true) }}
                        className="w-full flex items-center justify-between gap-2.5 px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition border-t border-stone-100"
                      >
                        <span className="flex items-center gap-2.5"><Ic src={PI.openTickets} className="w-4 h-4" /> {t('openTickets')}</span>
                        {pendingTableOrders.length > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                            {pendingTableOrders.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {/* Checkout */}
              <button
                onClick={() => setShowCheckout(true)}
                disabled={cart.length === 0}
                className={`flex-1 py-3.5 rounded-2xl font-black text-base tracking-wide transition active:scale-95 ${
                  cart.length > 0
                    ? 'bg-stone-900 hover:bg-stone-800 text-white shadow-md shadow-stone-300/50'
                    : 'bg-stone-100 text-stone-300 cursor-not-allowed'
                }`}
              >
                {cart.length > 0 ? `${baht(finalTotal)} →` : t('selectItems')}
              </button>
            </div>

            {/* Date + Clock */}
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-[11px] font-semibold text-stone-400">{dateLabel}</span>
              <span className="text-stone-200">·</span>
              <span className="text-xs font-mono font-bold text-stone-500">{clock}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Per-item Discount NumPad */}
      {itemDiscountTarget && (
        <NumPad
          label="Item Discount %"
          value={itemDiscountValue}
          onChange={setItemDiscountValue}
          onClose={() => {
            const v = parseFloat(itemDiscountValue)
            if (!isNaN(v) && v > 0) {
              setItemDiscountForItem(itemDiscountTarget, Math.min(Math.round(v), 100))
            }
            setItemDiscountTarget(null)
            setItemDiscountValue('')
          }}
          allowDecimal={false}
          suffix="%"
        />
      )}

      {/* Cash-drawer PIN — full-screen pad, verified against the user's login PIN */}
      {drawerPinOpen && (
        <PinPad
          heading={`🔒 ${t('posEnterDrawerPin')}`}
          onClose={() => setDrawerPinOpen(false)}
          onVerify={verifyDrawerPin}
        />
      )}

      {/* Status bar */}
      <div className="grid grid-cols-3 items-center px-4 py-1.5 bg-white border-t border-stone-100 text-xs text-stone-400 shrink-0">
        <span>BAZE POS v1.0</span>
        <button
          onClick={() => { setShowHistory(true); setShowAllHistory(false) }}
          className="justify-self-center hover:text-stone-600 transition"
        >
          {table}: {tableOrders.length} orders · Today:{' '}
          <span className="text-amber-600 font-semibold">{baht(todayTotal)}</span>
          {' '}({todayOrders.length} orders)
        </button>
        <span />
      </div>
    </div>
  )
}
