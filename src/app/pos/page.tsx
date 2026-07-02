'use client'

import { useState, useEffect, useCallback } from 'react'
import type { MenuItem, Order } from '@/lib/types'
import CheckoutModal from '@/components/pos/CheckoutModal'
import NumPad from '@/components/pos/NumPad'
import SplitBillModal from '@/components/pos/SplitBillModal'
import { DEMO_MENU } from '@/lib/demo-data'
import { loadBarSettings, type BarSettings } from '@/lib/printer'

const TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'BAR', 'VIP1', 'VIP2']

// Fix #3: added Shot and Other to match MenuCategory type
const CATEGORIES = ['All', 'Cocktail', 'Beer', 'Drink', 'Snack', 'Food', 'Shot', 'Other']

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

// สร้าง HTML Check Bill สำหรับให้ลูกค้าดูก่อนชำระเงิน
function buildTicketHtml({
  cart, table, memberName, subtotal, discountAmount, total, discountLabel, cfg,
}: {
  cart: CartItem[]
  table: string
  memberName: string
  subtotal: number
  discountAmount: number
  total: number
  discountLabel?: string
  cfg: BarSettings
}): string {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-GB')
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const vat     = Math.round(total * 7 / 107)

  const itemRows = cart.map(c => {
    const t = itemEffectiveTotal(c)
    const d = c.itemDiscount && c.itemDiscount > 0
    return `<div class="row"><span class="item-name">${c.name}<span class="qty"> ×${c.qty}${d ? ` (-${c.itemDiscount}%)` : ''}</span></span><span>฿${t.toLocaleString()}</span></div>`
  }).join('')

  const discountRow = discountAmount > 0
    ? `<div class="row green"><span>Discount${discountLabel ? ` (${discountLabel})` : ''}</span><span>-฿${discountAmount.toLocaleString()}</span></div>`
    : ''

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Check Bill</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Courier New',Courier,monospace;font-size:12px;width:280px;margin:0 auto;padding:14px 10px;color:#111;background:#fff;}
  .center{text-align:center;}.bold{font-weight:bold;}.xlarge{font-size:20px;letter-spacing:1px;}
  .row{display:flex;justify-content:space-between;padding:2px 0;}.item-name{flex:1;}.qty{color:#666;}
  .sep{border-top:1px dashed #aaa;margin:7px 0;}.sep2{border-top:2px solid #333;margin:7px 0;}
  .small{font-size:10px;color:#777;}.green{color:#1a7a1a;}.gray{color:#555;}
  .banner{text-align:center;border:2px dashed #bbb;padding:6px;color:#888;font-size:11px;margin-bottom:8px;letter-spacing:2px;}
  .total-row{font-size:16px;font-weight:bold;padding:4px 0;}
  .footer{margin-top:10px;text-align:center;font-size:11px;color:#555;}
  @media print{body{padding:0;}}
</style></head>
<body>
<div class="banner">── CHECK BILL ──</div>
<div class="center" style="margin-bottom:8px">
  <p class="bold xlarge">${cfg.barName}</p>
  ${cfg.address ? `<p class="small" style="margin-top:2px">${cfg.address}</p>` : ''}
</div>
<div class="sep"></div>
<div class="row"><span>Date: ${dateStr}</span><span>${timeStr}</span></div>
<div class="row"><span>Table: <strong>${table}</strong></span></div>
${memberName ? `<div class="row small"><span>Member: ${memberName}</span></div>` : ''}
<div class="sep"></div>
${itemRows}
<div class="sep"></div>
<div class="row gray"><span>Subtotal</span><span>฿${subtotal.toLocaleString()}</span></div>
${discountRow}
<div class="sep2"></div>
<div class="row total-row"><span>TOTAL</span><span>฿${total.toLocaleString()}</span></div>
<div class="row small gray"><span>VAT 7% incl.</span><span>฿${vat.toLocaleString()}</span></div>
<div class="sep"></div>
<div class="footer">Please check before payment<br><span style="color:#bbb;font-size:10px">── NOT A RECEIPT ──</span></div>
</body></html>`
}

export default function POSPage() {
  const [table, setTable] = useState('T1')
  const [category, setCategory] = useState('All')
  const [menu, setMenu] = useState<MenuItem[]>(DEMO_MENU)

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

  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [discountValue, setDiscountValue] = useState('')
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
  const [showNumPad, setShowNumPad] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [clock, setClock] = useState('')
  const [bizName, setBizName] = useState('Siam Amsterdam')
  const [coupons, setCoupons] = useState<{ id: string; code: string; name: string; type: string; value: number }[]>([])
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

  useEffect(() => {
    setBizName(loadBarSettings().barName || 'Siam Amsterdam')
    fetch('/api/coupons')
      .then(r => r.json())
      .then(d => setCoupons((d.coupons ?? []).filter((c: { active: boolean }) => c.active)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Fetch menu + ingredients + inventory in parallel; compute low-stock map
    Promise.all([
      fetch('/api/menu').then(r => r.json()),
      fetch('/api/menu/ingredients').then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
    ]).then(([menuData, ingData, invData]) => {
      if (menuData.menu?.length) setMenu(menuData.menu)
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
    }).catch(() => {})
    fetch('/api/members')
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
      const r = await fetch('/api/orders')
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
    setDiscountValue('')
    setMemberName('')
    setAppliedCoupon(null)
    setCouponCode('')
    setCouponError('')
    setPointsToRedeem(0)
  }

  async function handleVoidOrder(orderId: string) {
    try {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (r.ok) { await fetchOrders(); showToast('Order voided') }
      else showToast('Failed to void order', false)
    } catch { showToast('Failed to void order', false) }
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
      const r = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal, memberName: memberName.trim() || undefined }),
      })
      const data = await r.json()
      if (!r.ok || !data.valid) {
        setCouponError(data.error ?? 'Invalid coupon')
        setAppliedCoupon(null)
      } else {
        // Fix #13: store type + value for client-side discount recalculation
        setAppliedCoupon({
          id: data.couponId, code: data.couponCode, name: data.couponName,
          type: data.type, value: data.value, discountAmount: data.discountAmount,
        })
        setCouponCode('')
        setCouponError('')
        // Fix #7: clear manual discount when coupon applied
        setDiscountValue('')
      }
    } catch {
      setCouponError('Could not validate coupon')
    }
  }

  async function openDrawer() {
    fetch('/api/drawer', { method: 'POST' }).catch(() => {})
    showToast('Cash drawer opening...')
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
  const parsedDiscount = parseFloat(discountValue) || 0

  // Fix #7: manual discount is ignored when coupon is applied
  const manualDiscountAmount =
    !appliedCoupon && discountValue !== '' && parsedDiscount > 0
      ? discountType === 'percent'
        ? Math.round(subtotal * Math.min(parsedDiscount, 100) / 100)
        : Math.min(parsedDiscount, subtotal)
      : 0

  // Fix #13: recalculate coupon discount from current subtotal client-side
  const couponDiscountAmount = appliedCoupon
    ? appliedCoupon.type === 'percent'
      ? Math.round(subtotal * appliedCoupon.value / 100)
      : Math.min(appliedCoupon.value, subtotal)
    : 0

  const discountAmount = appliedCoupon ? couponDiscountAmount : manualDiscountAmount

  // Points redemption — 1 point = ฿1, applied after coupon/manual discount
  const selectedMember = members.find(m => m.name === memberName) ?? null
  const memberAvailablePoints = selectedMember?.points ?? 0
  const afterCouponManual = Math.max(0, subtotal - discountAmount)
  const actualPointsDiscount = pointsToRedeem > 0
    ? Math.min(pointsToRedeem, memberAvailablePoints, afterCouponManual)
    : 0
  const finalTotal = Math.max(0, afterCouponManual - actualPointsDiscount)

  // พิมพ์ Check Bill ให้ลูกค้าดูก่อนชำระเงิน (ไม่ต้องเปิด Checkout Modal)
  function handlePrintTicket() {
    if (cart.length === 0) return
    const cfg = loadBarSettings()
    const discountLabel = appliedCoupon
      ? appliedCoupon.code
      : discountType === 'percent' && parsedDiscount > 0
      ? `${parsedDiscount}%`
      : undefined
    const html = buildTicketHtml({
      cart, table, memberName, subtotal,
      discountAmount: discountAmount + actualPointsDiscount, total: finalTotal, discountLabel, cfg,
    })
    const win = window.open('', '_blank', 'width=340,height=700,toolbar=0,menubar=0')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 600)
  }

  // Fix #5/B-04: pass couponId so orders API records use atomically
  // รายการที่ดึงมาจาก QR order จะถูก "settle" โดย PATCH order เดิมเป็น paid (รักษา stock deduction +
  // source แยกตามออเดอร์จริง) ส่วนรายการที่พนักงานเพิ่มเองจะสร้างเป็น POS order ใหม่ตามปกติ
  // — กันไม่ให้นับยอดซ้ำสองรอบ
  async function handleConfirmPayment(method: string, received?: number): Promise<string> {
    const manualItems = cart.filter(c => !c.fromOrderId)
    let representativeId = ''

    for (const orderId of mergedOrderIds) {
      const r = await fetch(`/api/orders/${orderId}`, {
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
      const res = await fetch('/api/orders', {
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
        showToast(err.error ?? 'Failed to save order', false)
        throw new Error(err.error ?? 'Failed to save order')
      }

      const data = await res.json()
      representativeId = data.order.id
    }

    if (method === 'cash') {
      fetch('/api/drawer', { method: 'POST' }).catch(() => {})
    }

    // Deduct redeemed points from member
    if (actualPointsDiscount > 0 && selectedMember?.id) {
      const newPoints = Math.max(0, selectedMember.points - actualPointsDiscount)
      fetch(`/api/members/${selectedMember.id}`, {
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
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNo: table,
          hold: true,
          source: 'pos',
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
        showToast(err.error ?? 'Hold bill failed', false)
        return
      }
      clearCart()
      await fetchOrders()
      showToast('Bill held — sent to kitchen/bar ✓')
    } catch {
      showToast('Hold bill failed — network error', false)
    }
  }

  // Pay a single open ticket on its own — bypasses the shared table cart entirely,
  // so separate customers at the same table can each pay for just their own order.
  async function handleSingleTicketPayment(method: string, received?: number): Promise<string> {
    if (!payingTicket) throw new Error('No ticket selected')
    const r = await fetch(`/api/orders/${payingTicket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid', paymentMethod: method }),
    })
    if (!r.ok) {
      const err = await r.json()
      showToast(err.error ?? 'Failed to process payment', false)
      throw new Error(err.error ?? 'Failed to process payment')
    }
    const d = await r.json()
    if (method === 'cash') fetch('/api/drawer', { method: 'POST' }).catch(() => {})
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
    return category === 'All' || m.category.toLowerCase() === category.toLowerCase()
  })

  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  // Fix #3: added Shot and Other icons
  const CAT_ICONS: Record<string, string> = {
    All: '🍽️', Cocktail: '🍹', Beer: '🍺', Drink: '🥤',
    Snack: '🍿', Food: '🍔', Shot: '🥃', Other: '🏷️',
  }

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
          note=""
          discount={{ type: discountType, value: parsedDiscount, amount: discountAmount + actualPointsDiscount, couponCode: appliedCoupon?.code }}
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
                  {showAllHistory ? 'All Tables' : 'This Table'}
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
                  <p className="text-4xl mb-3">📋</p>
                  <p>{showAllHistory ? 'No orders today' : `No orders for ${table} today`}</p>
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
                      {o.memberName && <p className="text-xs text-stone-400 mt-0.5">👤 {o.memberName}</p>}
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
                  Tap a ticket to pay it separately · use <span className="font-semibold text-amber-600">Add to Bill</span> to combine orders for one payment
                </p>
              </div>
              <button
                onClick={() => setShowOpenTickets(false)}
                className="text-stone-400 hover:text-stone-700 text-3xl leading-none w-10 h-10 flex items-center justify-center"
              >×</button>
            </div>

            {/* Ticket list */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {allOpenTableOrders.length === 0 ? (
                <div className="py-12 text-center text-stone-300">
                  <p className="text-4xl mb-3">🎫</p>
                  <p className="text-sm">No open tickets for Table {table}</p>
                </div>
              ) : (
                allOpenTableOrders.map(o => {
                  const isMerged = mergedOrderIds.has(o.id)
                  const statusLabel =
                    o.status === 'delivered' ? '✓ Served'
                    : o.status === 'ready'    ? '⚡ Ready'
                    : o.status === 'accepted' ? '👨‍🍳 In Progress'
                    : '⏳ Pending'
                  return (
                    <div
                      key={o.id}
                      onClick={() => { if (!isMerged) setPayingTicket(o) }}
                      className={`rounded-xl border overflow-hidden transition ${
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
                            {o.source === 'qr' ? '📱 QR' : '🖥 POS'}
                          </span>
                          <span className="text-xs font-mono text-stone-400">#{o.id.slice(-6)}</span>
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
                              💳 Pay This Order
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
                      {unmerged > 0 ? `${unmerged} not added` : 'All added'}
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
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-stone-200 shrink-0 shadow-sm">
        <span className="font-black text-sm text-stone-900 mr-2 shrink-0 whitespace-nowrap leading-none tracking-tight">
          {bizName}
        </span>

        {/* Table tabs — amber dot on tables with items in cart */}
        <div className="flex gap-1 overflow-x-auto flex-1 py-0.5">
          {TABLES.map((t) => {
            const hasItems = (carts[t] ?? []).length > 0
            return (
              <button
                key={t}
                onClick={() => setTable(t)}
                className={`relative px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition shrink-0 active:scale-95 ${
                  table === t
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {t}
                {hasItems && t !== table && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-500 rounded-full" />
                )}
              </button>
            )
          })}
        </div>

        {/* Clock + Drawer */}
        <div className="flex items-center gap-2 ml-1 shrink-0">
          <span className="font-mono text-sm text-stone-400 hidden md:block">{clock}</span>
          <button
            onClick={openDrawer}
            className="bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 transition text-sm font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5"
          >
            💰 <span className="hidden sm:inline">Open Drawer</span>
          </button>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Menu Panel */}
        <div className="flex flex-col flex-3 overflow-hidden border-r border-stone-200">

          {/* Category filter + Search */}
          <div className="flex flex-col shrink-0 bg-white border-b border-stone-100">
            <div className="flex gap-1.5 px-3 pt-2.5 pb-2 overflow-x-auto">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setCategory(cat); setSearch('') }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 flex items-center gap-1.5 active:scale-95 ${
                    category === cat && !search
                      ? 'bg-stone-900 text-white font-bold shadow-sm'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <span>{CAT_ICONS[cat]}</span> {cat}
                </button>
              ))}
            </div>
            <div className="px-3 pb-2.5 relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-300 text-sm pointer-events-none">🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search menu..."
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
            {filteredMenu.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-stone-300 text-sm gap-2">
                <span className="text-3xl">{search ? '🔍' : '🍽️'}</span>
                <p>{search ? `No results for "${search}"` : 'No items in this category'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
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
                      <div className={`flex flex-col flex-1 ${hasImage ? 'p-2.5' : 'p-3'}`}>
                        <p className={`font-bold leading-snug text-stone-900 ${hasImage ? 'text-xs' : 'text-sm'}`}>{item.name}</p>
                        <p className="text-[10px] text-stone-400 mt-0.5 leading-tight truncate">{item.nameTh}</p>
                        <p className={`font-black mt-1.5 ${hasImage ? 'text-sm' : 'text-base mt-2'} ${inCart ? 'text-amber-600' : 'text-amber-500'}`}>
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
                    🎫 {pendingTableOrders.length} open
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
                <p className="text-5xl mb-3">🛒</p>
                <p className="text-sm">Tap items to add</p>
              </div>
            ) : (
              cart.map((item) => {
                const key = cartKey(item)
                const hasDiscount = !!item.itemDiscount && item.itemDiscount > 0
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
                    {/* ราคา — แสดงขีดทับถ้ามีส่วนลด */}
                    <div className="flex flex-col items-end shrink-0 min-w-[52px]">
                      {hasDiscount ? (
                        <>
                          <span className="text-[10px] text-stone-300 line-through leading-none">{baht(item.price * item.qty)}</span>
                          <span className="text-amber-600 text-sm font-bold leading-tight">{baht(itemEffectiveTotal(item))}</span>
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
                        Remove
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

            {/* Subtotal */}
            <div className="flex items-baseline justify-between">
              <span className="text-stone-400 text-xs">Subtotal</span>
              <span className="text-stone-600 font-semibold text-sm">{baht(subtotal)}</span>
            </div>

            {cart.length > 0 && cart.every(c => c.fromOrderId) && (
              <p className="text-[10px] text-amber-600 -mt-1">
                All items are from held tickets — discounts apply only to items added manually.
              </p>
            )}

            {/* Fix #7: manual discount hidden when coupon is applied */}
            {!appliedCoupon && (
              <div className="flex items-start gap-1.5">
                <span className="text-stone-400 text-xs w-14 shrink-0 pt-1.5">Discount</span>
                <div className="flex rounded-lg overflow-hidden border border-stone-200 shrink-0">
                  <button
                    onClick={() => setDiscountType('percent')}
                    className={`px-2.5 py-1 text-xs font-bold transition ${
                      discountType === 'percent' ? 'bg-stone-900 text-white' : 'bg-white text-stone-400 hover:text-stone-600'
                    }`}
                  >%</button>
                  <button
                    onClick={() => setDiscountType('fixed')}
                    className={`px-2.5 py-1 text-xs font-bold transition ${
                      discountType === 'fixed' ? 'bg-stone-900 text-white' : 'bg-white text-stone-400 hover:text-stone-600'
                    }`}
                  >฿</button>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <button
                    onClick={() => setShowNumPad(true)}
                    className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-sm text-right hover:border-stone-400 transition"
                  >
                    <span className={discountValue ? 'text-stone-900' : 'text-stone-300'}>
                      {discountValue || '0'}
                    </span>
                  </button>
                  {/* Fix #12: max discount hint */}
                  {discountType === 'percent' && parsedDiscount > 100 && (
                    <p className="text-[10px] text-amber-600 text-right">Capped at 100%</p>
                  )}
                </div>
                {manualDiscountAmount > 0 && (
                  <span className="text-emerald-600 text-xs font-bold shrink-0 pt-1.5">-{baht(manualDiscountAmount)}</span>
                )}
              </div>
            )}

            {/* Coupon code */}
            <div className="flex flex-col gap-1">
              {appliedCoupon ? (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <span className="text-emerald-700 text-xs flex-1 font-bold">
                    🎟 {appliedCoupon.code} · -{baht(couponDiscountAmount)}
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
                <select
                  value=""
                  onChange={e => {
                    if (!e.target.value) return
                    applyCoupon(e.target.value)
                    e.target.value = ''
                  }}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-700 outline-none focus:border-stone-400 transition appearance-none"
                >
                  <option value="">🎟 {coupons.length > 0 ? 'Select coupon...' : 'No active coupons'}</option>
                  {coupons.map(c => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.name} ({c.type === 'percent' ? `${c.value}%` : `฿${c.value}`} off)
                    </option>
                  ))}
                </select>
              )}
              {couponError && <p className="text-xs text-red-500 px-1">{couponError}</p>}
            </div>

            {/* Total */}
            <div className="flex items-baseline justify-between border-t border-stone-200 pt-2">
              <span className="text-stone-700 text-sm font-semibold">Total</span>
              <span className="text-2xl font-black text-stone-900">{baht(finalTotal)}</span>
            </div>

            {/* Member — select จาก DB */}
            <select
              value={memberName}
              onChange={e => { setMemberName(e.target.value); setPointsToRedeem(0) }}
              className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-700 outline-none focus:border-stone-400 transition appearance-none"
            >
              <option value="">👤 No member</option>
              {members.map(m => (
                <option key={m.id} value={m.name}>{m.name} {m.points > 0 ? `(${m.points} pts)` : ''}</option>
              ))}
            </select>

            {/* Points redemption — shown when member has points */}
            {selectedMember && memberAvailablePoints > 0 && (
              actualPointsDiscount > 0 ? (
                <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                  <span className="text-violet-700 text-xs font-bold flex-1">
                    ⭐ Points redeemed · -{baht(actualPointsDiscount)}
                  </span>
                  <button
                    onClick={() => setPointsToRedeem(0)}
                    className="text-stone-400 hover:text-red-500 text-xs transition"
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => setPointsToRedeem(Math.min(memberAvailablePoints, afterCouponManual))}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 font-semibold hover:bg-violet-100 transition active:scale-95 text-left"
                >
                  ⭐ Use {memberAvailablePoints} pts = -{baht(Math.min(memberAvailablePoints, afterCouponManual))} discount
                </button>
              )
            )}

            {/* Hold Bill — send to kitchen now, collect payment later */}
            {cart.some(c => !c.fromOrderId) && (
              <button
                onClick={handleHoldBill}
                className="w-full py-2.5 rounded-2xl font-bold text-sm border-2 border-amber-400 text-amber-600 bg-amber-50 hover:bg-amber-100 transition active:scale-95"
              >
                🧊 Hold Bill (send to kitchen/bar)
              </button>
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
                        🧾 Print check bill
                      </button>
                      <button
                        onClick={() => { setShowMoreActions(false); setShowSplitBill(true) }}
                        disabled={cart.length === 0}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition border-t border-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ✂️ Split Bill
                      </button>
                      <button
                        onClick={() => { setShowMoreActions(false); setShowOpenTickets(true) }}
                        className="w-full flex items-center justify-between gap-2.5 px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition border-t border-stone-100"
                      >
                        <span>🎫 Open Tickets</span>
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
                {cart.length > 0 ? `${baht(finalTotal)} →` : 'SELECT ITEMS'}
              </button>
            </div>

            {/* History link */}
            <button
              onClick={() => { setShowHistory(true); setShowAllHistory(false) }}
              className="text-xs text-stone-400 hover:text-stone-600 transition text-center py-0.5"
            >
              {table}: {tableOrders.length} orders · All today: {todayOrders.length}
            </button>
          </div>
        </div>
      </div>

      {/* Order-level Discount NumPad */}
      {showNumPad && (
        <NumPad
          label="Discount"
          value={discountValue}
          onChange={setDiscountValue}
          onClose={() => setShowNumPad(false)}
          allowDecimal={discountType === 'percent'}
          suffix={discountType === 'percent' ? '%' : '฿'}
        />
      )}

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

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-white border-t border-stone-100 text-xs text-stone-400 shrink-0">
        <span>SIAM AMSTERDAM POS v1.0</span>
        <span>
          Today:{' '}
          <span className="text-amber-600 font-semibold">{baht(todayTotal)}</span>
          {' · '}
          {todayOrders.length} orders
        </span>
        <span className="font-mono">{dateLabel}</span>
      </div>
    </div>
  )
}
