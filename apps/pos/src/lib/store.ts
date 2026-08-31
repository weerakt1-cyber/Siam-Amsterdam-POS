import { supabase } from './supabase'
import bcrypt from 'bcryptjs'
import type {
  Order, OrderItem, OrderStatus, OrderDiscount, OrderSource, OrderType, DeliveryChannel,
  MenuItem, MenuCategory, Variant,
  Member,
  InventoryItem, InventoryCategory, StockAdjustment, AdjustReason,
  DailyReport, CashEntry, ExpenseEntry, ExpenseCategory,
  Coupon, CouponUse, CouponType,
  Promotion, PromotionType,
  PosUser, UserRole,
  MenuIngredient,
} from './types'
import type { CatEntry } from './categories'
import { computePointsEarned, getTier } from './loyalty'
import { businessDayOf, businessDayRange } from './business-day'
// Store-context helpers + the subscription/billing/payments/AI-credit data layer
// now live in @baze/db (monorepo M2). Re-export them so existing `@/lib/store`
// imports keep working; import requireStoreId for the POS-domain functions below.
import { requireStoreId, getStore, getAffiliateByCode } from '@baze/db'
import { transliterate } from 'transliteration'
export * from '@baze/db'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString()
function makeId(_prefix?: string) { return crypto.randomUUID() }

// ─── Type mappers (snake_case DB → camelCase TS) ──────────────────────────────

function mapMenuItem(row: Record<string, unknown>): MenuItem {
  return {
    id:          row.id as string,
    name:        row.name as string,
    nameTh:      row.name_th as string,
    price:       Number(row.price),
    category:    row.category as MenuCategory,
    available:   Boolean(row.available),
    cost:        row.cost != null ? Number(row.cost) : undefined,
    sku:         row.sku as string | undefined,
    description: row.description as string | undefined,
    unit:        row.unit as string | undefined,
    taxRate:     row.tax_rate != null ? Number(row.tax_rate) : undefined,
    image:       row.image as string | undefined,
    sortOrder:   row.sort_order != null ? Number(row.sort_order) : undefined,
    variants:    (row.variants as Variant[] | null) ?? [],
  }
}

function mapOrder(row: Record<string, unknown>): Order {
  const rawItems = (row.order_items as Record<string, unknown>[] | null) ?? []
  return {
    id:            row.id as string,
    tableNo:       row.table_no as string,
    items:         rawItems.map(i => ({
      menuId:       i.menu_id as string,
      name:         i.name as string,
      nameTh:       (i.name_th as string) ?? '',
      qty:          Number(i.qty),
      price:        Number(i.price),
      variantLabel: i.variant_label as string | undefined,
    })),
    note:          (row.note as string) ?? '',
    status:        row.status as OrderStatus,
    source:        row.source as OrderSource,
    subtotal:      Number(row.subtotal),
    discount:      row.discount as OrderDiscount | undefined,
    total:         Number(row.total),
    paymentMethod: row.payment_method as string | undefined,
    memberName:    row.member_name as string | undefined,
    memberId:      (row.member_id as string | null) ?? undefined,
    pointsAwarded: Boolean(row.points_awarded),
    customerName:  row.customer_name as string | undefined,
    orderType:     (row.order_type as OrderType | null) ?? 'dine-in',
    channel:       (row.channel as DeliveryChannel | null) ?? undefined,
    platformCode:  (row.platform_code as string | null) ?? undefined,
    platformOrderId: (row.platform_order_id as string | null) ?? undefined,
    commissionRate: row.commission_rate != null ? Number(row.commission_rate) : undefined,
    createdAt:     row.created_at as string,
    updatedAt:     row.updated_at as string,
  }
}

function mapMember(row: Record<string, unknown>): Member {
  return {
    id:             row.id as string,
    name:           row.name as string,
    phone:          row.phone as string | undefined,
    contact:        row.contact as string | undefined,
    birthday:       row.birthday as string | undefined,
    notes:          row.notes as string | undefined,
    points:         Number(row.points),
    lifetimePoints: Number(row.lifetime_points ?? 0),
    tier:           (row.tier as Member['tier']) ?? 'bronze',
    stamps:         Number(row.stamps),
    stampsEarned:   Number(row.stamps_earned),
    createdAt:      row.created_at as string,
    updatedAt:      row.updated_at as string,
  }
}

function mapInventoryItem(row: Record<string, unknown>): InventoryItem {
  return {
    id:                 row.id as string,
    name:               row.name as string,
    unit:               row.unit as string,
    category:           row.category as InventoryCategory,
    currentStock:       Number(row.current_stock),
    lowStockThreshold:  Number(row.low_stock_threshold),
    costPerUnit:        row.cost_per_unit != null ? Number(row.cost_per_unit) : undefined,
    contentAmount:      row.content_amount != null ? Number(row.content_amount) : undefined,
    contentUnit:        row.content_unit as string | undefined,
    notes:              row.notes as string | undefined,
    createdAt:          row.created_at as string,
    updatedAt:          row.updated_at as string,
  }
}

function mapAdjustment(row: Record<string, unknown>): StockAdjustment {
  return {
    id:        row.id as string,
    itemId:    row.item_id as string,
    delta:     Number(row.delta),
    reason:    row.reason as AdjustReason,
    note:      row.note as string | undefined,
    createdAt: row.created_at as string,
  }
}

function mapReport(row: Record<string, unknown>): DailyReport {
  return {
    date:         row.date as string,
    openingCash:  Number(row.opening_cash),
    cashIns:      (row.cash_ins as CashEntry[]) ?? [],
    expenses:     (row.expenses as ExpenseEntry[]) ?? [],
    updatedAt:    row.updated_at as string,
  }
}

function mapCoupon(row: Record<string, unknown>): Coupon {
  return {
    id:          row.id as string,
    code:        row.code as string,
    name:        row.name as string,
    description: row.description as string | undefined,
    type:        row.type as CouponType,
    value:       Number(row.value),
    minOrder:    Number(row.min_order),
    maxUses:     Number(row.max_uses),
    usedCount:   Number(row.used_count),
    active:      Boolean(row.active),
    startDate:   row.start_date as string | undefined,
    endDate:     row.end_date as string | undefined,
    memberOnly:  Boolean(row.member_only),
    createdAt:   row.created_at as string,
    updatedAt:   row.updated_at as string,
  }
}

function mapCouponUse(row: Record<string, unknown>): CouponUse {
  return {
    id:             row.id as string,
    couponId:       row.coupon_id as string,
    couponCode:     row.coupon_code as string,
    discountAmount: Number(row.discount_amount),
    orderTotal:     Number(row.order_total),
    memberName:     row.member_name as string | undefined,
    createdAt:      row.created_at as string,
  }
}

function mapStaff(row: Record<string, unknown>): PosUser {
  return {
    id:        row.id as string,
    name:      row.name as string,
    role:      row.role as UserRole,
    pin:       row.pin as string,
    color:     row.color as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────
// Shared across the Items → Categories manager, the POS ordering screen, and the
// customer-facing QR ordering page — previously only in the staff device's
// localStorage, which the QR page (a different device) could never read.

function mapCategory(row: Record<string, unknown>): CatEntry {
  return {
    value: row.value as string,
    label: row.label as string,
    color: row.color as string,
    icon:  (row.icon as string | undefined) ?? undefined,
  }
}


export async function getCategories(storeId?: string): Promise<CatEntry[]> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('store_id', sid)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapCategory)
}

// ─── App config (key/value) ────────────────────────────────────────────────
// Server-side settings that must not live in the browser (e.g. Omise secret key).

export async function getConfig(key: string, storeId?: string): Promise<string | null> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase.from('app_config').select('value').eq('key', key).eq('store_id', sid).maybeSingle()
  if (error || !data) return null
  return (data.value as string | null) ?? null
}

export async function getConfigMany(keys: string[], storeId?: string): Promise<Record<string, string>> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase.from('app_config').select('key, value').in('key', keys).eq('store_id', sid)
  if (error || !data) return {}
  const out: Record<string, string> = {}
  for (const row of data) if (row.value != null) out[row.key as string] = row.value as string
  return out
}

export async function setConfig(key: string, value: string, storeId?: string): Promise<void> {
  const sid = await requireStoreId(storeId)
  const { error } = await supabase.from('app_config').upsert({ store_id: sid, key, value, updated_at: now() }, { onConflict: 'store_id,key' })
  if (error) throw error
}

// Full-replace semantics — matches how the Categories manager already mutates
// the whole array client-side (add/delete/reorder), so persisting is one shot.
export async function saveCategories(cats: CatEntry[], storeId?: string): Promise<CatEntry[]> {
  const sid = await requireStoreId(storeId)
  // Scope the wipe to THIS store — a global delete would erase other stores'
  // categories on every save.
  const { error: delErr } = await supabase.from('categories').delete().eq('store_id', sid)
  if (delErr) throw delErr
  if (cats.length === 0) return []
  const rows = cats.map((c, i) => ({
    value: c.value, label: c.label, color: c.color, icon: c.icon ?? null, sort_order: i, store_id: sid,
  }))
  const { data, error } = await supabase.from('categories').insert(rows).select()
  if (error) throw error
  return (data ?? [])
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map(mapCategory)
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export async function getMenu(storeId?: string): Promise<MenuItem[]> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('store_id', sid)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapMenuItem)
}

export async function createMenuItem(data: Omit<MenuItem, 'id'>, storeId?: string): Promise<MenuItem> {
  const sid = await requireStoreId(storeId)
  const { data: row, error } = await supabase
    .from('menu_items')
    .insert({
      id:          crypto.randomUUID(),
      store_id:    sid,
      name:        data.name,
      name_th:     data.nameTh,
      price:       data.price,
      category:    data.category,
      available:   data.available,
      cost:        data.cost ?? null,
      sku:         data.sku ?? null,
      description: data.description ?? null,
      unit:        data.unit ?? null,
      tax_rate:    data.taxRate ?? 0,
      image:       data.image ?? null,
      sort_order:  data.sortOrder ?? 0,
      variants:    data.variants ?? [],
    })
    .select()
    .single()
  if (error) throw error
  return mapMenuItem(row)
}

export async function updateMenuItem(id: string, data: Partial<Omit<MenuItem, 'id'>>, storeId?: string): Promise<MenuItem | null> {
  const sid = await requireStoreId(storeId)
  const update: Record<string, unknown> = {}
  if (data.name        !== undefined) update.name        = data.name
  if (data.nameTh      !== undefined) update.name_th     = data.nameTh
  if (data.price       !== undefined) update.price       = data.price
  if (data.category    !== undefined) update.category    = data.category
  if (data.available   !== undefined) update.available   = data.available
  if (data.cost        !== undefined) update.cost        = data.cost ?? null
  if (data.sku         !== undefined) update.sku         = data.sku ?? null
  if (data.description !== undefined) update.description = data.description ?? null
  if (data.unit        !== undefined) update.unit        = data.unit ?? null
  if (data.taxRate     !== undefined) update.tax_rate    = data.taxRate
  if (data.image       !== undefined) update.image       = data.image ?? null
  if (data.sortOrder   !== undefined) update.sort_order  = data.sortOrder
  if (data.variants    !== undefined) update.variants    = data.variants
  update.updated_at = now()

  const { data: row, error } = await supabase
    .from('menu_items')
    .update(update)
    .eq('id', id)
    .eq('store_id', sid)   // can't edit another store's item
    .select()
    .single()
  if (error) return null
  return mapMenuItem(row)
}

export async function deleteMenuItem(id: string, storeId?: string): Promise<boolean> {
  const sid = await requireStoreId(storeId)
  const { error, count } = await supabase
    .from('menu_items')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('store_id', sid)   // can't delete another store's item
  return !error && (count ?? 0) > 0
}

// ─── Orders ───────────────────────────────────────────────────────────────────

// The live boards poll this every few seconds, so it must stay bounded — an
// unfiltered `select('*, order_items(*)')` grows without limit as history piles
// up. Callers pass a window:
//   • sinceDays — only orders created within the last N days (via created_at)
//   • statuses  — only these order statuses (e.g. the active kitchen set)
//   • fields    — 'list' fetches ONLY the columns the kitchen/floor boards
//                 render (much smaller rows); 'full' (default) keeps everything
//                 for checkout/receipt paths that need the whole order.
// Omit the window only when you genuinely need full history (and a big payload).
export type GetOrdersOpts = { sinceDays?: number; statuses?: string[]; fields?: 'list' | 'full' }

// Slim projection for the polling boards — exactly what the kitchen/floor views
// draw (order header + item name/qty/variant), and nothing else (no subtotal,
// discount, payment, points, timestamps beyond created_at).
const ORDER_LIST_SELECT =
  'id, table_no, status, source, order_type, channel, platform_code, created_at, total, note, ' +
  'customer_name, member_name, order_items(name, name_th, qty, variant_label)'

// Map a slim ORDER_LIST_SELECT row to an Order. Fields the boards never read are
// filled with harmless defaults so the shape still satisfies the Order type.
function mapOrderListRow(row: Record<string, unknown>): Order {
  const rawItems = (row.order_items as Record<string, unknown>[] | null) ?? []
  const createdAt = row.created_at as string
  return {
    id:           row.id as string,
    tableNo:      row.table_no as string,
    items:        rawItems.map(i => ({
      menuId:       '',
      name:         i.name as string,
      nameTh:       (i.name_th as string) ?? '',
      qty:          Number(i.qty),
      price:        0,
      variantLabel: i.variant_label as string | undefined,
    })),
    note:         (row.note as string) ?? '',
    status:       row.status as OrderStatus,
    source:       row.source as OrderSource,
    subtotal:     Number(row.total),   // not selected in list mode; mirror total
    total:        Number(row.total),
    memberName:   (row.member_name as string | null) ?? undefined,
    customerName: (row.customer_name as string | null) ?? undefined,
    orderType:    (row.order_type as OrderType | null) ?? 'dine-in',
    channel:      (row.channel as DeliveryChannel | null) ?? undefined,
    platformCode: (row.platform_code as string | null) ?? undefined,
    createdAt,
    updatedAt:    createdAt,           // not selected in list mode
  }
}

export async function getOrders(storeId?: string, opts: GetOrdersOpts = {}): Promise<Order[]> {
  const sid = await requireStoreId(storeId)
  const slim = opts.fields === 'list'
  let q = supabase
    .from('orders')
    .select(slim ? ORDER_LIST_SELECT : '*, order_items(*)')
    .eq('store_id', sid)
  if (opts.sinceDays != null) {
    q = q.gte('created_at', new Date(Date.now() - opts.sinceDays * 86400000).toISOString())
  }
  if (opts.statuses && opts.statuses.length > 0) {
    q = q.in('status', opts.statuses)
  }
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  // The select string is chosen at runtime, so PostgREST can't infer the row
  // type — cast to the shape our mappers expect.
  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return rows.map(slim ? mapOrderListRow : mapOrder)
}

export async function getOrder(id: string, storeId?: string): Promise<Order | undefined> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .eq('store_id', sid)   // can't read another store's order by id
    .single()
  if (error || !data) return undefined
  return mapOrder(data)
}

// Webhook idempotency lookup — has this platform order already been ingested?
export async function getOrderByPlatformOrderId(platformOrderId: string, storeId?: string): Promise<Order | undefined> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('platform_order_id', platformOrderId)
    .eq('store_id', sid)
    .maybeSingle()
  if (error || !data) return undefined
  return mapOrder(data)
}

export async function createOrder(data: {
  tableNo: string
  items: OrderItem[]
  note?: string
  source?: OrderSource
  paymentMethod?: string
  discount?: OrderDiscount
  memberName?: string
  memberId?: string
  customerName?: string
  hold?: boolean  // true = ส่งครัว/บาร์ทันทีแต่ "พักบิล" ไว้ ยังไม่เก็บเงิน (status เริ่มที่ pending เหมือน QR order)
  orderType?: OrderType
  channel?: DeliveryChannel
  platformCode?: string
  platformOrderId?: string
  commissionRate?: number
}, storeId?: string): Promise<Order> {
  const sid = await requireStoreId(storeId)
  const subtotal = data.items.reduce((s, i) => s + i.price * i.qty, 0)
  const total    = Math.max(0, subtotal - (data.discount?.amount ?? 0))
  const id       = makeId('ord')
  const ts       = now()
  // Delivery orders always start pending (kitchen queue) — they're marked paid on rider pickup
  const status   = data.hold || data.orderType === 'delivery'
    ? 'pending'
    : (data.source === 'pos' ? 'paid' : 'pending')

  const { error: orderErr } = await supabase.from('orders').insert({
    id,
    store_id:       sid,
    table_no:       data.tableNo,
    note:           data.note ?? '',
    status,
    source:         data.source ?? 'manual',
    subtotal,
    discount:       data.discount ?? null,
    total,
    payment_method: data.paymentMethod ?? null,
    member_name:    data.memberName ?? null,
    member_id:      data.memberId ?? null,
    customer_name:  data.customerName ?? null,
    order_type:     data.orderType ?? 'dine-in',
    channel:        data.channel ?? null,
    platform_code:  data.platformCode ?? null,
    platform_order_id: data.platformOrderId ?? null,
    commission_rate: data.commissionRate ?? null,
    created_at:     ts,
    updated_at:     ts,
  })
  if (orderErr) throw orderErr

  if (data.items.length > 0) {
    const { error: itemsErr } = await supabase.from('order_items').insert(
      data.items.map(item => ({
        order_id:      id,
        store_id:      sid,
        menu_id:       item.menuId,
        name:          item.name,
        name_th:       item.nameTh ?? '',
        qty:           item.qty,
        price:         item.price,
        variant_label: item.variantLabel ?? null,
      }))
    )
    if (itemsErr) throw itemsErr
  }

  // คืน order object โดยไม่ต้อง re-fetch
  return {
    id, tableNo: data.tableNo, items: data.items,
    note: data.note ?? '', status,
    source: data.source ?? 'manual', subtotal, discount: data.discount, total,
    paymentMethod: data.paymentMethod, memberName: data.memberName, customerName: data.customerName,
    orderType: data.orderType ?? 'dine-in', channel: data.channel,
    platformCode: data.platformCode, platformOrderId: data.platformOrderId,
    commissionRate: data.commissionRate,
    createdAt: ts, updatedAt: ts,
  }
}

export async function updateOrderStatus(id: string, status: OrderStatus, paymentMethod?: string, storeId?: string): Promise<Order | null> {
  const sid = await requireStoreId(storeId)
  const update: Record<string, unknown> = { status, updated_at: now() }
  if (paymentMethod) update.payment_method = paymentMethod
  const { error } = await supabase
    .from('orders')
    .update(update)
    .eq('id', id)
    .eq('store_id', sid)   // can't change another store's order
  if (error) return null
  return (await getOrder(id, sid)) ?? null
}

// Credit loyalty points for a paid order that's linked to a member. Idempotent —
// points_awarded guards against double-crediting if the order is PATCHed to
// paid more than once. No-op for orders with no linked member.
export async function awardOrderPoints(orderId: string, storeId?: string): Promise<void> {
  const sid   = await requireStoreId(storeId)
  const order = await getOrder(orderId, sid)
  if (!order || !order.memberId || order.pointsAwarded) return
  const member = await getMember(order.memberId, sid)
  if (member) {
    const pts = computePointsEarned(order.total, getTier(member.lifetimePoints))
    if (pts > 0) {
      const newLifetime = member.lifetimePoints + pts
      await updateMember(member.id, {
        points:         member.points + pts,
        lifetimePoints: newLifetime,
        tier:           getTier(newLifetime).name,
      }, sid)
    }
  }
  // Mark awarded even if 0 pts / member missing, so we never recompute this order.
  await supabase.from('orders').update({ points_awarded: true }).eq('id', orderId).eq('store_id', sid)
}

// The store's sales-day reset time ("HH:MM"), from bar_settings; "00:00" default.
async function getBusinessCutoff(storeId: string): Promise<string> {
  const raw = await getConfig('bar_settings', storeId)
  if (raw) {
    try { const s = JSON.parse(raw); if (typeof s?.businessDayCutoff === 'string') return s.businessDayCutoff } catch { /* ignore */ }
  }
  return '00:00'
}

// The business day (YYYY-MM-DD) that "now" falls in for this store.
export async function currentBusinessDay(storeId?: string): Promise<string> {
  const sid = await requireStoreId(storeId)
  return businessDayOf(new Date(), await getBusinessCutoff(sid))
}

// `date` is a business-day label; orders are matched to that store's business
// day (cutoff-aware), so a past-midnight night's bills stay on one day.
export async function getOrdersByDate(date: string, storeId?: string): Promise<Order[]> {
  const sid = await requireStoreId(storeId)
  const { start, end } = businessDayRange(date, await getBusinessCutoff(sid))
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('store_id', sid)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapOrder)
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function getMembers(storeId?: string): Promise<Member[]> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('store_id', sid)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapMember)
}

// Find a member by phone within a store — used to de-duplicate public self-
// registration (a phone already on file returns the existing member instead of
// creating a second one).
export async function getMemberByPhone(phone: string, storeId?: string): Promise<Member | undefined> {
  const sid = await requireStoreId(storeId)
  const clean = phone.trim()
  if (!clean) return undefined
  const { data } = await supabase.from('members').select('*').eq('store_id', sid).eq('phone', clean).limit(1).maybeSingle()
  return data ? mapMember(data) : undefined
}

export async function getMember(id: string, storeId?: string): Promise<Member | undefined> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase.from('members').select('*').eq('id', id).eq('store_id', sid).single()
  if (error || !data) return undefined
  return mapMember(data)
}

export async function createMember(
  data: Omit<Member, 'id' | 'createdAt' | 'updatedAt'>,
  storeId?: string,
  meta?: { source?: string; consentAt?: string },
): Promise<Member> {
  const sid = await requireStoreId(storeId)
  const ts = now()
  const { data: row, error } = await supabase
    .from('members')
    .insert({
      id:            crypto.randomUUID(),
      store_id:      sid,
      name:          data.name,
      phone:         data.phone ?? null,
      contact:       data.contact ?? null,
      birthday:      data.birthday ?? null,
      notes:         data.notes ?? null,
      points:          data.points,
      lifetime_points: data.lifetimePoints ?? 0,
      tier:            data.tier ?? 'bronze',
      stamps:          data.stamps,
      stamps_earned:   data.stampsEarned,
      source:          meta?.source ?? null,
      consent_at:      meta?.consentAt ?? null,
      created_at:      ts,
      updated_at:      ts,
    })
    .select()
    .single()
  if (error) throw error
  return mapMember(row)
}

export async function updateMember(id: string, data: Partial<Omit<Member, 'id' | 'createdAt'>>, storeId?: string): Promise<Member | null> {
  const sid = await requireStoreId(storeId)
  const update: Record<string, unknown> = { updated_at: now() }
  if (data.name         !== undefined) update.name          = data.name
  if (data.phone        !== undefined) update.phone         = data.phone ?? null
  if (data.contact      !== undefined) update.contact       = data.contact ?? null
  if (data.birthday     !== undefined) update.birthday      = data.birthday ?? null
  if (data.notes        !== undefined) update.notes         = data.notes ?? null
  if (data.points         !== undefined) update.points          = data.points
  if (data.lifetimePoints !== undefined) update.lifetime_points = data.lifetimePoints
  if (data.tier           !== undefined) update.tier            = data.tier
  if (data.stamps         !== undefined) update.stamps          = data.stamps
  if (data.stampsEarned   !== undefined) update.stamps_earned   = data.stampsEarned

  const { data: row, error } = await supabase
    .from('members').update(update).eq('id', id).eq('store_id', sid).select().single()
  if (error || !row) return null
  return mapMember(row)
}

export async function deleteMember(id: string, storeId?: string): Promise<boolean> {
  const sid = await requireStoreId(storeId)
  const { error, count } = await supabase
    .from('members').delete({ count: 'exact' }).eq('id', id).eq('store_id', sid)
  return !error && (count ?? 0) > 0
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export async function getInventory(storeId?: string): Promise<InventoryItem[]> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('store_id', sid)
    .order('name', { ascending: true })
  if (error) throw error
  const items = (data ?? []).map(mapInventoryItem)
  // วางของที่ใกล้หมดขึ้นก่อน
  return items.sort((a, b) => {
    const aLow = a.currentStock <= a.lowStockThreshold
    const bLow = b.currentStock <= b.lowStockThreshold
    if (aLow !== bLow) return aLow ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function getInventoryItem(id: string, storeId?: string): Promise<InventoryItem | undefined> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase.from('inventory_items').select('*').eq('id', id).eq('store_id', sid).single()
  if (error || !data) return undefined
  return mapInventoryItem(data)
}

export async function createInventoryItem(data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>, storeId?: string): Promise<InventoryItem> {
  const sid = await requireStoreId(storeId)
  const ts = now()
  const { data: row, error } = await supabase
    .from('inventory_items')
    .insert({
      id:                  crypto.randomUUID(),
      store_id:            sid,
      name:                data.name,
      unit:                data.unit,
      category:            data.category,
      current_stock:       data.currentStock,
      low_stock_threshold: data.lowStockThreshold,
      cost_per_unit:       data.costPerUnit ?? null,
      content_amount:      data.contentAmount ?? null,
      content_unit:        data.contentUnit ?? null,
      notes:               data.notes ?? null,
      created_at:          ts,
      updated_at:          ts,
    })
    .select()
    .single()
  if (error) throw error
  return mapInventoryItem(row)
}

export async function updateInventoryItem(id: string, data: Partial<Omit<InventoryItem, 'id' | 'createdAt'>>, storeId?: string): Promise<InventoryItem | null> {
  const sid = await requireStoreId(storeId)
  const update: Record<string, unknown> = { updated_at: now() }
  if (data.name               !== undefined) update.name                = data.name
  if (data.unit               !== undefined) update.unit                = data.unit
  if (data.category           !== undefined) update.category            = data.category
  if (data.currentStock       !== undefined) update.current_stock       = data.currentStock
  if (data.lowStockThreshold  !== undefined) update.low_stock_threshold = data.lowStockThreshold
  if (data.costPerUnit        !== undefined) update.cost_per_unit       = data.costPerUnit ?? null
  if (data.contentAmount      !== undefined) update.content_amount      = data.contentAmount ?? null
  if (data.contentUnit        !== undefined) update.content_unit        = data.contentUnit ?? null
  if (data.notes              !== undefined) update.notes               = data.notes ?? null

  const { data: row, error } = await supabase
    .from('inventory_items').update(update).eq('id', id).eq('store_id', sid).select().single()
  if (error || !row) return null
  return mapInventoryItem(row)
}

export async function deleteInventoryItem(id: string, storeId?: string): Promise<boolean> {
  const sid = await requireStoreId(storeId)
  const { error, count } = await supabase
    .from('inventory_items').delete({ count: 'exact' }).eq('id', id).eq('store_id', sid)
  return !error && (count ?? 0) > 0
}

// บันทึกการปรับสต็อก + อัปเดตยอดคงเหลือ
export async function adjustStock(itemId: string, delta: number, reason: AdjustReason, note?: string, storeId?: string): Promise<InventoryItem | null> {
  const sid = await requireStoreId(storeId)
  const item = await getInventoryItem(itemId, sid)
  if (!item) return null

  const newStock = Math.max(0, item.currentStock + delta)
  await updateInventoryItem(itemId, { currentStock: newStock }, sid)

  await supabase.from('stock_adjustments').insert({
    id:         makeId('adj'),
    store_id:   sid,
    item_id:    itemId,
    delta,
    reason,
    note:       note ?? null,
    created_at: now(),
  })

  return (await getInventoryItem(itemId, sid)) ?? null
}

export async function getAdjustments(itemId?: string, storeId?: string): Promise<StockAdjustment[]> {
  const sid = await requireStoreId(storeId)
  let q = supabase.from('stock_adjustments').select('*').eq('store_id', sid).order('created_at', { ascending: false }).limit(50)
  if (itemId) q = q.eq('item_id', itemId).limit(20)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapAdjustment)
}

export type { InventoryCategory }

// ─── Daily Reports ────────────────────────────────────────────────────────────

export async function getReport(date: string, storeId?: string): Promise<DailyReport> {
  const sid = await requireStoreId(storeId)
  const { data } = await supabase.from('daily_reports').select('*').eq('date', date).eq('store_id', sid).maybeSingle()
  if (data) return mapReport(data)
  // สร้างรายงานใหม่ถ้ายังไม่มี
  const blank: DailyReport = { date, openingCash: 0, cashIns: [], expenses: [], updatedAt: now() }
  await supabase.from('daily_reports').insert({
    store_id: sid, date, opening_cash: 0, cash_ins: [], expenses: [], updated_at: blank.updatedAt,
  })
  return blank
}

export async function setOpeningCash(date: string, amount: number, storeId?: string): Promise<DailyReport> {
  const sid = await requireStoreId(storeId)
  // Preserve existing cash_ins/expenses — only the opening float changes.
  const cur = await getReport(date, sid)
  const { data, error } = await supabase
    .from('daily_reports')
    .upsert({ store_id: sid, date, opening_cash: amount, cash_ins: cur.cashIns, expenses: cur.expenses, updated_at: now() }, { onConflict: 'store_id,date' })
    .select()
    .single()
  if (error) throw error
  return mapReport(data)
}

export async function addCashIn(date: string, data: Omit<CashEntry, 'id' | 'createdAt'>, storeId?: string): Promise<DailyReport> {
  const sid = await requireStoreId(storeId)
  const report = await getReport(date, sid)
  const entry: CashEntry = { ...data, id: makeId('ci'), createdAt: now() }
  const { data: row, error } = await supabase
    .from('daily_reports')
    .update({ cash_ins: [...report.cashIns, entry], updated_at: now() })
    .eq('date', date)
    .eq('store_id', sid)
    .select()
    .single()
  if (error) throw error
  return mapReport(row)
}

export async function removeCashIn(date: string, entryId: string, storeId?: string): Promise<DailyReport> {
  const sid = await requireStoreId(storeId)
  const report = await getReport(date, sid)
  const { data: row, error } = await supabase
    .from('daily_reports')
    .update({ cash_ins: report.cashIns.filter(e => e.id !== entryId), updated_at: now() })
    .eq('date', date)
    .eq('store_id', sid)
    .select()
    .single()
  if (error) throw error
  return mapReport(row)
}

export async function addExpense(date: string, data: Omit<ExpenseEntry, 'id' | 'createdAt'>, storeId?: string): Promise<DailyReport> {
  const sid = await requireStoreId(storeId)
  const report = await getReport(date, sid)
  const entry: ExpenseEntry = { ...data, id: makeId('ex'), createdAt: now() }
  const { data: row, error } = await supabase
    .from('daily_reports')
    .update({ expenses: [...report.expenses, entry], updated_at: now() })
    .eq('date', date)
    .eq('store_id', sid)
    .select()
    .single()
  if (error) throw error
  return mapReport(row)
}

export async function removeExpense(date: string, entryId: string, storeId?: string): Promise<DailyReport> {
  const sid = await requireStoreId(storeId)
  const report = await getReport(date, sid)
  const { data: row, error } = await supabase
    .from('daily_reports')
    .update({ expenses: report.expenses.filter(e => e.id !== entryId), updated_at: now() })
    .eq('date', date)
    .eq('store_id', sid)
    .select()
    .single()
  if (error) throw error
  return mapReport(row)
}

export type { ExpenseCategory }

// ─── Coupons ─────────────────────────────────────────────────────────────────

export async function getCoupons(storeId?: string): Promise<Coupon[]> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase.from('coupons').select('*').eq('store_id', sid).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapCoupon)
}

export async function getCoupon(id: string, storeId?: string): Promise<Coupon | undefined> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase.from('coupons').select('*').eq('id', id).eq('store_id', sid).single()
  if (error || !data) return undefined
  return mapCoupon(data)
}

export async function getCouponByCode(code: string, storeId?: string): Promise<Coupon | undefined> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase
    .from('coupons').select('*').eq('code', code.trim().toUpperCase()).eq('store_id', sid).single()
  if (error || !data) return undefined
  return mapCoupon(data)
}

export async function createCoupon(data: Omit<Coupon, 'id' | 'usedCount' | 'createdAt' | 'updatedAt'>, storeId?: string): Promise<Coupon> {
  const sid = await requireStoreId(storeId)
  const ts = now()
  const { data: row, error } = await supabase
    .from('coupons')
    .insert({
      id:          makeId('cp'),
      store_id:    sid,
      code:        data.code,
      name:        data.name,
      description: data.description ?? null,
      type:        data.type,
      value:       data.value,
      min_order:   data.minOrder,
      max_uses:    data.maxUses,
      used_count:  0,
      active:      data.active,
      start_date:  data.startDate ?? null,
      end_date:    data.endDate ?? null,
      member_only: data.memberOnly,
      created_at:  ts,
      updated_at:  ts,
    })
    .select()
    .single()
  if (error) throw error
  return mapCoupon(row)
}

export async function updateCoupon(id: string, data: Partial<Omit<Coupon, 'id' | 'createdAt'>>, storeId?: string): Promise<Coupon | null> {
  const sid = await requireStoreId(storeId)
  const update: Record<string, unknown> = { updated_at: now() }
  if (data.code        !== undefined) update.code        = data.code
  if (data.name        !== undefined) update.name        = data.name
  if (data.description !== undefined) update.description = data.description ?? null
  if (data.type        !== undefined) update.type        = data.type
  if (data.value       !== undefined) update.value       = data.value
  if (data.minOrder    !== undefined) update.min_order   = data.minOrder
  if (data.maxUses     !== undefined) update.max_uses    = data.maxUses
  if (data.active      !== undefined) update.active      = data.active
  if (data.startDate   !== undefined) update.start_date  = data.startDate ?? null
  if (data.endDate     !== undefined) update.end_date    = data.endDate ?? null
  if (data.memberOnly  !== undefined) update.member_only = data.memberOnly

  const { data: row, error } = await supabase
    .from('coupons').update(update).eq('id', id).eq('store_id', sid).select().single()
  if (error || !row) return null
  return mapCoupon(row)
}

export async function deleteCoupon(id: string, storeId?: string): Promise<boolean> {
  const sid = await requireStoreId(storeId)
  const { error, count } = await supabase.from('coupons').delete({ count: 'exact' }).eq('id', id).eq('store_id', sid)
  return !error && (count ?? 0) > 0
}

// ─── Promotions (item-level auto-applied deals) ────────────────────────────────

function mapPromotion(row: Record<string, unknown>): Promotion {
  return {
    id:            row.id as string,
    name:          row.name as string,
    type:          row.type as PromotionType,
    active:        Boolean(row.active),
    targetType:    (row.target_type as 'item' | 'category') ?? 'item',
    targetId:      (row.target_id as string | null) ?? undefined,
    buyQty:        row.buy_qty == null ? undefined : Number(row.buy_qty),
    bundlePrice:   row.bundle_price == null ? undefined : Number(row.bundle_price),
    freeText:      (row.free_text as string | null) ?? undefined,
    discountType:  (row.discount_type as CouponType | null) ?? undefined,
    discountValue: row.discount_value == null ? undefined : Number(row.discount_value),
    startDate:     (row.start_date as string | null) ?? undefined,
    endDate:       (row.end_date as string | null) ?? undefined,
    startTime:     (row.start_time as string | null) ?? undefined,
    endTime:       (row.end_time as string | null) ?? undefined,
    showOnQr:      Boolean(row.show_on_qr),
    createdAt:     row.created_at as string,
    updatedAt:     row.updated_at as string,
  }
}

export async function getPromotions(storeId?: string): Promise<Promotion[]> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase
    .from('promotions').select('*').eq('store_id', sid).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPromotion)
}

export async function createPromotion(data: Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>, storeId?: string): Promise<Promotion> {
  const sid = await requireStoreId(storeId)
  const ts = now()
  const { data: row, error } = await supabase
    .from('promotions')
    .insert({
      id:             makeId('promo'),
      store_id:       sid,
      name:           data.name,
      type:           data.type,
      active:         data.active,
      target_type:    data.targetType,
      target_id:      data.targetId ?? null,
      buy_qty:        data.buyQty ?? null,
      bundle_price:   data.bundlePrice ?? null,
      free_text:      data.freeText ?? null,
      discount_type:  data.discountType ?? null,
      discount_value: data.discountValue ?? null,
      start_date:     data.startDate ?? null,
      end_date:       data.endDate ?? null,
      start_time:     data.startTime ?? null,
      end_time:       data.endTime ?? null,
      show_on_qr:     data.showOnQr,
      created_at:     ts,
      updated_at:     ts,
    })
    .select()
    .single()
  if (error) throw error
  return mapPromotion(row)
}

export async function updatePromotion(id: string, data: Partial<Omit<Promotion, 'id' | 'createdAt'>>, storeId?: string): Promise<Promotion | null> {
  const sid = await requireStoreId(storeId)
  const u: Record<string, unknown> = { updated_at: now() }
  if (data.name          !== undefined) u.name           = data.name
  if (data.type          !== undefined) u.type           = data.type
  if (data.active        !== undefined) u.active         = data.active
  if (data.targetType    !== undefined) u.target_type    = data.targetType
  if (data.targetId      !== undefined) u.target_id      = data.targetId ?? null
  if (data.buyQty        !== undefined) u.buy_qty        = data.buyQty ?? null
  if (data.bundlePrice   !== undefined) u.bundle_price   = data.bundlePrice ?? null
  if (data.freeText      !== undefined) u.free_text      = data.freeText ?? null
  if (data.discountType  !== undefined) u.discount_type  = data.discountType ?? null
  if (data.discountValue !== undefined) u.discount_value = data.discountValue ?? null
  if (data.startDate     !== undefined) u.start_date     = data.startDate ?? null
  if (data.endDate       !== undefined) u.end_date       = data.endDate ?? null
  if (data.startTime     !== undefined) u.start_time     = data.startTime ?? null
  if (data.endTime       !== undefined) u.end_time       = data.endTime ?? null
  if (data.showOnQr      !== undefined) u.show_on_qr     = data.showOnQr

  const { data: row, error } = await supabase
    .from('promotions').update(u).eq('id', id).eq('store_id', sid).select().single()
  if (error || !row) return null
  return mapPromotion(row)
}

export async function deletePromotion(id: string, storeId?: string): Promise<boolean> {
  const sid = await requireStoreId(storeId)
  const { error, count } = await supabase.from('promotions').delete({ count: 'exact' }).eq('id', id).eq('store_id', sid)
  return !error && (count ?? 0) > 0
}

// ตรวจสอบ coupon code และคำนวณส่วนลด
export async function validateCoupon(
  code: string, subtotal: number, memberName?: string, storeId?: string
): Promise<{ valid: true; coupon: Coupon; discountAmount: number } | { valid: false; error: string }> {
  const coupon = await getCouponByCode(code, storeId)
  if (!coupon) return { valid: false, error: 'Coupon code not found' }
  if (!coupon.active) return { valid: false, error: 'This coupon is no longer active' }

  const today = new Date().toISOString().slice(0, 10)
  if (coupon.startDate && today < coupon.startDate) return { valid: false, error: 'Coupon not yet valid' }
  if (coupon.endDate   && today > coupon.endDate)   return { valid: false, error: 'Coupon has expired' }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return { valid: false, error: 'Coupon usage limit reached' }
  if (coupon.minOrder > 0 && subtotal < coupon.minOrder) return { valid: false, error: `Minimum order ฿${coupon.minOrder} required` }
  if (coupon.memberOnly && !memberName?.trim()) return { valid: false, error: 'This coupon is for members only' }

  const discountAmount = coupon.type === 'percent'
    ? Math.round(subtotal * coupon.value / 100)
    : Math.min(coupon.value, subtotal)

  return { valid: true, coupon, discountAmount }
}

// บันทึกการใช้ coupon
export async function recordCouponUse(couponId: string, discountAmount: number, orderTotal: number, memberName?: string, storeId?: string): Promise<CouponUse> {
  const sid = await requireStoreId(storeId)
  const coupon = await getCoupon(couponId, sid)
  // เพิ่ม used_count
  await supabase.from('coupons').update({ used_count: (coupon?.usedCount ?? 0) + 1, updated_at: now() }).eq('id', couponId).eq('store_id', sid)

  const use: CouponUse = {
    id: makeId('use'), couponId, couponCode: coupon?.code ?? '',
    discountAmount, orderTotal, memberName, createdAt: now(),
  }
  await supabase.from('coupon_uses').insert({
    id:              use.id,
    store_id:        sid,
    coupon_id:       couponId,
    coupon_code:     use.couponCode,
    discount_amount: discountAmount,
    order_total:     orderTotal,
    member_name:     memberName ?? null,
    created_at:      use.createdAt,
  })
  return use
}

export async function getCouponUses(couponId?: string, storeId?: string): Promise<CouponUse[]> {
  const sid = await requireStoreId(storeId)
  let q = supabase.from('coupon_uses').select('*').eq('store_id', sid).order('created_at', { ascending: false }).limit(100)
  if (couponId) q = q.eq('coupon_id', couponId).limit(20)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapCouponUse)
}

export type { CouponType }

// ─── Staff ────────────────────────────────────────────────────────────────────

export type PosUserPublic = Omit<PosUser, 'pin'>

export async function getStaff(storeId?: string): Promise<PosUserPublic[]> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase.from('staff').select('*').eq('store_id', sid).order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(row => {
    const { pin: _p, ...pub } = mapStaff(row)
    return pub
  })
}

export async function getStaffMember(id: string, storeId?: string): Promise<PosUser | undefined> {
  const sid = await requireStoreId(storeId)
  const { data, error } = await supabase.from('staff').select('*').eq('id', id).eq('store_id', sid).single()
  if (error || !data) return undefined
  return mapStaff(data)
}

export async function createStaffMember(data: Omit<PosUser, 'id' | 'createdAt' | 'updatedAt'>, storeId?: string): Promise<PosUserPublic> {
  const sid = await requireStoreId(storeId)
  const ts = now()
  const { data: row, error } = await supabase
    .from('staff')
    .insert({
      id:         crypto.randomUUID(),
      store_id:   sid,
      name:       data.name,
      role:       data.role,
      pin:        await bcrypt.hash(data.pin, 10),
      color:      data.color,
      created_at: ts,
      updated_at: ts,
    })
    .select()
    .single()
  if (error) throw error
  const { pin: _p, ...pub } = mapStaff(row)
  return pub
}

export async function updateStaffMember(id: string, data: Partial<Omit<PosUser, 'id' | 'createdAt'>>, storeId?: string): Promise<PosUserPublic | null> {
  const sid = await requireStoreId(storeId)
  const update: Record<string, unknown> = { updated_at: now() }
  if (data.name  !== undefined) update.name  = data.name
  if (data.role  !== undefined) update.role  = data.role
  if (data.pin   !== undefined) update.pin   = await bcrypt.hash(data.pin, 10)
  if (data.color !== undefined) update.color = data.color

  const { data: row, error } = await supabase
    .from('staff').update(update).eq('id', id).eq('store_id', sid).select().single()
  if (error || !row) return null
  const { pin: _p, ...pub } = mapStaff(row)
  return pub
}

export async function deleteStaffMember(id: string, storeId?: string): Promise<boolean> {
  const sid = await requireStoreId(storeId)
  const { error, count } = await supabase.from('staff').delete({ count: 'exact' }).eq('id', id).eq('store_id', sid)
  return !error && (count ?? 0) > 0
}

export async function verifyStaffPin(id: string, pin: string, storeId?: string): Promise<boolean> {
  const user = await getStaffMember(id, storeId)
  if (!user) return false
  // Support bcrypt hashes and legacy plaintext PINs
  if (user.pin.startsWith('$2')) return await bcrypt.compare(pin, user.pin)
  return user.pin === pin
}

export type { UserRole }

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalyticsData(period: '7d' | '30d' | 'all' = '7d', storeId?: string) {
  const sid = await requireStoreId(storeId)
  // Bangkok timezone offset (UTC+7)
  const BKK_MS = 7 * 60 * 60 * 1000

  function toBkkDate(isoStr: string): string {
    return new Date(new Date(isoStr).getTime() + BKK_MS).toISOString().slice(0, 10)
  }

  // Fetch enough data to cover both stats period AND 14-day trend chart
  const statsDays = period === '7d' ? 7 : period === '30d' ? 30 : null
  const fetchDays = statsDays === null ? null : Math.max(statsDays, 14)

  let ordersQ = supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('store_id', sid)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })

  if (fetchDays !== null) {
    ordersQ = ordersQ.gte('created_at', new Date(Date.now() - fetchDays * 86400000).toISOString())
  }

  // Fetch orders + menu categories in parallel
  const [{ data: ordersData, error: ordersErr }, { data: menuData }] = await Promise.all([
    ordersQ,
    supabase.from('menu_items').select('id, category').eq('store_id', sid),
  ])
  if (ordersErr) throw ordersErr

  const allOrders = (ordersData ?? []).map(mapOrder)

  // Real category lookup from menu_items (avoids fragile menuId prefix matching)
  const menuCatMap: Record<string, string> = {}
  for (const m of menuData ?? []) {
    const cat = m.category as string
    menuCatMap[m.id] = cat.charAt(0).toUpperCase() + cat.slice(1)
  }

  // Filter to stats period (keep allOrders for 14-day trend)
  const statsCutoff = statsDays
    ? new Date(Date.now() - statsDays * 86400000).toISOString()
    : null
  const periodOrders = statsCutoff
    ? allOrders.filter(o => o.createdAt >= statsCutoff)
    : allOrders

  // Today in Bangkok time
  const todayBKK = toBkkDate(new Date().toISOString())
  const todayOrders = periodOrders.filter(o => toBkkDate(o.createdAt) === todayBKK)

  const revenue    = periodOrders.reduce((s, o) => s + o.total, 0)
  const orderCount = periodOrders.length
  const avgOrder   = orderCount > 0 ? Math.round(revenue / orderCount) : 0

  // Daily trend: always 14 days, dates in Bangkok timezone
  const nowBKK = new Date(Date.now() + BKK_MS)
  const dailyTrend = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(nowBKK)
    d.setDate(d.getDate() - (13 - i))
    const date  = d.toISOString().slice(0, 10)
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    const dayOrders = allOrders.filter(o => toBkkDate(o.createdAt) === date)
    return { date, label, revenue: dayOrders.reduce((s, o) => s + o.total, 0), orders: dayOrders.length }
  })

  // Top items
  const itemMap: Record<string, { name: string; nameTh: string; menuId: string; qty: number; revenue: number }> = {}
  for (const o of periodOrders) {
    for (const item of o.items) {
      if (!itemMap[item.menuId]) itemMap[item.menuId] = { name: item.name, nameTh: item.nameTh, menuId: item.menuId, qty: 0, revenue: 0 }
      itemMap[item.menuId].qty     += item.qty
      itemMap[item.menuId].revenue += item.price * item.qty
    }
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // Payment methods
  const payMap: Record<string, { count: number; revenue: number }> = {}
  for (const o of periodOrders) {
    const m = o.paymentMethod ?? 'unknown'
    if (!payMap[m]) payMap[m] = { count: 0, revenue: 0 }
    payMap[m].count++
    payMap[m].revenue += o.total
  }
  const byPayment = Object.entries(payMap).map(([method, d]) => ({ method, ...d })).sort((a, b) => b.revenue - a.revenue)

  // Order sources
  const srcMap: Record<string, { count: number; revenue: number }> = {}
  for (const o of periodOrders) {
    if (!srcMap[o.source]) srcMap[o.source] = { count: 0, revenue: 0 }
    srcMap[o.source].count++
    srcMap[o.source].revenue += o.total
  }
  const bySource = Object.entries(srcMap).map(([source, d]) => ({ source, ...d })).sort((a, b) => b.revenue - a.revenue)

  // Peak hours in Bangkok timezone
  const byHour = Array(24).fill(0) as number[]
  for (const o of periodOrders) {
    byHour[new Date(new Date(o.createdAt).getTime() + BKK_MS).getHours()]++
  }

  // Category from real menu_items data
  const catMap: Record<string, { revenue: number; qty: number }> = {}
  for (const o of periodOrders) {
    for (const item of o.items) {
      const cat = menuCatMap[item.menuId] ?? 'Other'
      if (!catMap[cat]) catMap[cat] = { revenue: 0, qty: 0 }
      catMap[cat].revenue += item.price * item.qty
      catMap[cat].qty     += item.qty
    }
  }
  const byCategory = Object.entries(catMap).map(([category, d]) => ({ category, ...d })).sort((a, b) => b.revenue - a.revenue)

  // Delivery channels (Grab / LINE MAN / Shopee Food) — gross vs net after commission
  const chMap: Record<string, { count: number; gross: number; commission: number }> = {}
  for (const o of periodOrders) {
    if (!o.channel) continue
    if (!chMap[o.channel]) chMap[o.channel] = { count: 0, gross: 0, commission: 0 }
    chMap[o.channel].count++
    chMap[o.channel].gross      += o.total
    chMap[o.channel].commission += o.total * (o.commissionRate ?? 0)
  }
  const byChannel = Object.entries(chMap)
    .map(([channel, d]) => ({ channel, count: d.count, gross: d.gross, commission: Math.round(d.commission), net: Math.round(d.gross - d.commission) }))
    .sort((a, b) => b.gross - a.gross)
  const deliveryGross = byChannel.reduce((s, c) => s + c.gross, 0)
  const deliveryStats = {
    orders:     byChannel.reduce((s, c) => s + c.count, 0),
    gross:      deliveryGross,
    commission: byChannel.reduce((s, c) => s + c.commission, 0),
    net:        byChannel.reduce((s, c) => s + c.net, 0),
    inStoreRevenue: revenue - deliveryGross,
  }

  const memberOrders     = periodOrders.filter(o => o.memberName)
  const memberRevenue    = memberOrders.reduce((s, o) => s + o.total, 0)
  const discountedOrders = periodOrders.filter(o => o.discount?.amount)
  const totalDiscount    = discountedOrders.reduce((s, o) => s + (o.discount?.amount ?? 0), 0)

  return {
    period,
    stats: { revenue, orders: orderCount, avgOrder, today: { revenue: todayOrders.reduce((s, o) => s + o.total, 0), orders: todayOrders.length } },
    dailyTrend,
    topItems,
    byPayment,
    bySource,
    byChannel,
    deliveryStats,
    byHour,
    byCategory,
    memberStats: { withMember: memberOrders.length, withoutMember: orderCount - memberOrders.length, memberRevenue, nonMemberRevenue: revenue - memberRevenue },
    discountStats: { totalDiscount, ordersWithDiscount: discountedOrders.length, totalOrders: orderCount },
  }
}

// ─── Month-over-Month Analytics ───────────────────────────────────────────────

export async function getMomAnalyticsData(storeId?: string) {
  const sid = await requireStoreId(storeId)
  const BKK_MS = 7 * 60 * 60 * 1000

  function toBkkDate(isoStr: string): string {
    return new Date(new Date(isoStr).getTime() + BKK_MS).toISOString().slice(0, 10)
  }

  const nowBKK       = new Date(Date.now() + BKK_MS)
  const currYear     = nowBKK.getUTCFullYear()
  const currMonthIdx = nowBKK.getUTCMonth()

  const prevMonthIdx = currMonthIdx === 0 ? 11 : currMonthIdx - 1
  const prevYear     = currMonthIdx === 0 ? currYear - 1 : currYear

  // UTC cutoffs: midnight Bangkok on the 1st of each calendar month
  const prevMonthStartUtc = new Date(Date.UTC(prevYear, prevMonthIdx, 1) - BKK_MS).toISOString()
  const currMonthStartUtc = new Date(Date.UTC(currYear, currMonthIdx,  1) - BKK_MS).toISOString()

  const [{ data: ordersData, error: ordersErr }, { data: menuData }] = await Promise.all([
    supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('store_id', sid)
      .eq('status', 'paid')
      .gte('created_at', prevMonthStartUtc)
      .order('created_at', { ascending: false }),
    supabase.from('menu_items').select('id, category').eq('store_id', sid),
  ])
  if (ordersErr) throw ordersErr

  const allOrders  = (ordersData ?? []).map(mapOrder)
  const currOrders = allOrders.filter(o => o.createdAt >= currMonthStartUtc)
  const prevOrders = allOrders.filter(o => o.createdAt >= prevMonthStartUtc && o.createdAt < currMonthStartUtc)

  const menuCatMap: Record<string, string> = {}
  for (const m of menuData ?? []) {
    const cat = m.category as string
    menuCatMap[m.id] = cat.charAt(0).toUpperCase() + cat.slice(1)
  }

  // ── Current month stats ───────────────────────────────────────────────────
  const revenue    = currOrders.reduce((s, o) => s + o.total, 0)
  const orderCount = currOrders.length
  const avgOrder   = orderCount > 0 ? Math.round(revenue / orderCount) : 0

  const todayBKK    = toBkkDate(new Date().toISOString())
  const todayOrders = currOrders.filter(o => toBkkDate(o.createdAt) === todayBKK)

  // ── Previous month stats ──────────────────────────────────────────────────
  const prevRevenue  = prevOrders.reduce((s, o) => s + o.total, 0)
  const prevCount    = prevOrders.length
  const prevAvgOrder = prevCount > 0 ? Math.round(prevRevenue / prevCount) : 0

  const pctChange = (curr: number, prev: number): number =>
    prev > 0 ? +((curr - prev) / prev * 100).toFixed(1) : curr > 0 ? 100 : 0

  // ── Daily maps for weekly chart ───────────────────────────────────────────
  const currDailyMap: Record<string, { revenue: number; orders: number }> = {}
  for (const o of currOrders) {
    const d = toBkkDate(o.createdAt)
    if (!currDailyMap[d]) currDailyMap[d] = { revenue: 0, orders: 0 }
    currDailyMap[d].revenue += o.total
    currDailyMap[d].orders++
  }
  const prevDailyMap: Record<string, { revenue: number; orders: number }> = {}
  for (const o of prevOrders) {
    const d = toBkkDate(o.createdAt)
    if (!prevDailyMap[d]) prevDailyMap[d] = { revenue: 0, orders: 0 }
    prevDailyMap[d].revenue += o.total
    prevDailyMap[d].orders++
  }

  const daysInPrevMonth = new Date(Date.UTC(currYear, currMonthIdx, 0)).getUTCDate()
  const daysInCurrMonth = new Date(Date.UTC(currYear, currMonthIdx + 1, 0)).getUTCDate()
  const numWeeks = Math.ceil(Math.max(daysInPrevMonth, daysInCurrMonth) / 7)
  const pad = (n: number) => String(n).padStart(2, '0')

  const weeklyTrend = Array.from({ length: numWeeks }, (_, w) => {
    const dayStart = w * 7 + 1
    const dayEnd   = (w + 1) * 7
    let curr = 0, prev = 0, currOrd = 0, prevOrd = 0
    for (let day = dayStart; day <= dayEnd; day++) {
      if (day <= daysInCurrMonth) {
        const k = `${currYear}-${pad(currMonthIdx + 1)}-${pad(day)}`
        const c = currDailyMap[k]
        if (c) { curr += c.revenue; currOrd += c.orders }
      }
      if (day <= daysInPrevMonth) {
        const k = `${prevYear}-${pad(prevMonthIdx + 1)}-${pad(day)}`
        const p = prevDailyMap[k]
        if (p) { prev += p.revenue; prevOrd += p.orders }
      }
    }
    return { label: `W${w + 1}`, curr, prev, currOrders: currOrd, prevOrders: prevOrd }
  })

  // ── Daily trend: current month, day 1 → today ────────────────────────────
  const todayDayNum = nowBKK.getUTCDate()
  const dailyTrend = Array.from({ length: todayDayNum }, (_, i) => {
    const day = i + 1
    const k   = `${currYear}-${pad(currMonthIdx + 1)}-${pad(day)}`
    const d   = currDailyMap[k] ?? { revenue: 0, orders: 0 }
    return { date: k, label: String(day), revenue: d.revenue, orders: d.orders }
  })

  // ── Top items (current month) ─────────────────────────────────────────────
  const itemMap: Record<string, { name: string; nameTh: string; menuId: string; qty: number; revenue: number }> = {}
  for (const o of currOrders) {
    for (const item of o.items) {
      if (!itemMap[item.menuId]) itemMap[item.menuId] = { name: item.name, nameTh: item.nameTh, menuId: item.menuId, qty: 0, revenue: 0 }
      itemMap[item.menuId].qty     += item.qty
      itemMap[item.menuId].revenue += item.price * item.qty
    }
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // ── Previous month top items for rank comparison ──────────────────────────
  const prevItemMap: Record<string, { name: string; menuId: string; qty: number; revenue: number }> = {}
  for (const o of prevOrders) {
    for (const item of o.items) {
      if (!prevItemMap[item.menuId]) prevItemMap[item.menuId] = { name: item.name, menuId: item.menuId, qty: 0, revenue: 0 }
      prevItemMap[item.menuId].qty     += item.qty
      prevItemMap[item.menuId].revenue += item.price * item.qty
    }
  }
  const prevTopItems = Object.values(prevItemMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((item, i) => ({ ...item, rank: i + 1 }))

  // ── byPayment ─────────────────────────────────────────────────────────────
  const payMap: Record<string, { count: number; revenue: number }> = {}
  for (const o of currOrders) {
    const m = o.paymentMethod ?? 'unknown'
    if (!payMap[m]) payMap[m] = { count: 0, revenue: 0 }
    payMap[m].count++
    payMap[m].revenue += o.total
  }
  const byPayment = Object.entries(payMap).map(([method, d]) => ({ method, ...d })).sort((a, b) => b.revenue - a.revenue)

  // ── bySource ──────────────────────────────────────────────────────────────
  const srcMap: Record<string, { count: number; revenue: number }> = {}
  for (const o of currOrders) {
    if (!srcMap[o.source]) srcMap[o.source] = { count: 0, revenue: 0 }
    srcMap[o.source].count++
    srcMap[o.source].revenue += o.total
  }
  const bySource = Object.entries(srcMap).map(([source, d]) => ({ source, ...d })).sort((a, b) => b.revenue - a.revenue)

  // ── byHour ────────────────────────────────────────────────────────────────
  const byHour = Array(24).fill(0) as number[]
  for (const o of currOrders) {
    byHour[new Date(new Date(o.createdAt).getTime() + BKK_MS).getHours()]++
  }

  // ── byCategory ────────────────────────────────────────────────────────────
  const catMap: Record<string, { revenue: number; qty: number }> = {}
  for (const o of currOrders) {
    for (const item of o.items) {
      const cat = menuCatMap[item.menuId] ?? 'Other'
      if (!catMap[cat]) catMap[cat] = { revenue: 0, qty: 0 }
      catMap[cat].revenue += item.price * item.qty
      catMap[cat].qty     += item.qty
    }
  }
  const byCategory = Object.entries(catMap).map(([category, d]) => ({ category, ...d })).sort((a, b) => b.revenue - a.revenue)

  // ── Member + Discount stats ───────────────────────────────────────────────
  const memberOrders     = currOrders.filter(o => o.memberName)
  const memberRevenue    = memberOrders.reduce((s, o) => s + o.total, 0)
  const discountedOrders = currOrders.filter(o => o.discount?.amount)
  const totalDiscount    = discountedOrders.reduce((s, o) => s + (o.discount?.amount ?? 0), 0)

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']

  return {
    period:        'mom' as const,
    stats:         { revenue, orders: orderCount, avgOrder, today: { revenue: todayOrders.reduce((s, o) => s + o.total, 0), orders: todayOrders.length } },
    dailyTrend,
    topItems,
    byPayment,
    bySource,
    byHour,
    byCategory,
    memberStats:   { withMember: memberOrders.length, withoutMember: orderCount - memberOrders.length, memberRevenue, nonMemberRevenue: revenue - memberRevenue },
    discountStats: { totalDiscount, ordersWithDiscount: discountedOrders.length, totalOrders: orderCount },
    comparison: {
      prevRevenue,
      prevOrders:     prevCount,
      prevAvgOrder,
      revenueChange:  pctChange(revenue, prevRevenue),
      ordersChange:   pctChange(orderCount, prevCount),
      avgOrderChange: pctChange(avgOrder, prevAvgOrder),
      prevTopItems,
      weeklyTrend,
      currMonthLabel: `${MONTHS[currMonthIdx]} ${currYear}`,
      prevMonthLabel: `${MONTHS[prevMonthIdx]} ${prevYear}`,
    },
  }
}

// ─── Menu Ingredients ─────────────────────────────────────────────────────────

function mapMenuIngredient(row: Record<string, unknown>): MenuIngredient {
  return {
    id:                 row.id as string,
    menuItemId:         row.menu_item_id as string,
    inventoryItemId:    row.inventory_item_id as string,
    quantityPerServing: Number(row.quantity_per_serving),
    unit:               row.unit as string,
  }
}

export async function getMenuIngredients(menuItemId: string): Promise<MenuIngredient[]> {
  const { data, error } = await supabase
    .from('menu_ingredients')
    .select('*')
    .eq('menu_item_id', menuItemId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapMenuIngredient)
}

export async function getAllMenuIngredients(): Promise<MenuIngredient[]> {
  const { data, error } = await supabase.from('menu_ingredients').select('*')
  if (error) throw error
  return (data ?? []).map(mapMenuIngredient)
}

export async function upsertMenuIngredients(
  menuItemId: string,
  ingredients: { inventoryItemId: string; quantityPerServing: number; unit: string }[]
): Promise<MenuIngredient[]> {
  await supabase.from('menu_ingredients').delete().eq('menu_item_id', menuItemId)
  if (ingredients.length === 0) return []

  const ts = now()
  const rows = ingredients.map(ing => ({
    id:                   crypto.randomUUID(),
    menu_item_id:         menuItemId,
    inventory_item_id:    ing.inventoryItemId,
    quantity_per_serving: ing.quantityPerServing,
    unit:                 ing.unit,
    created_at:           ts,
    updated_at:           ts,
  }))

  const { data, error } = await supabase.from('menu_ingredients').insert(rows).select()
  if (error) throw error
  return (data ?? []).map(mapMenuIngredient)
}

// ─── Bank-transfer slip verification (migration 025) ──────────────────────────
// Per-store PromptPay / bank-transfer receiving config + the payment_slips
// ledger. See supabase/migrations/025_payment_slips.sql for the config shape.

export type TransferSettings = {
  enabled: boolean
  mode: 'auto' | 'manual'
  promptpayId: string
  accountName: string
  bankCode: string
  slipokApiKey: string
  slipokBranchId: string
}

export type PaymentSlip = {
  id: string
  storeId: string
  orderId: string
  transRef: string | null
  amount: number
  senderName: string | null
  receiverOk: boolean | null
  method: 'auto' | 'manual'
  status: 'pending' | 'verified' | 'rejected'
  verifiedBy: string | null
  imageUrl: string | null
  createdAt: string
  verifiedAt: string | null
}

function mapSlip(row: Record<string, unknown>): PaymentSlip {
  return {
    id:         row.id as string,
    storeId:    row.store_id as string,
    orderId:    row.order_id as string,
    transRef:   (row.trans_ref as string | null) ?? null,
    amount:     Number(row.amount),
    senderName: (row.sender_name as string | null) ?? null,
    receiverOk: (row.receiver_ok as boolean | null) ?? null,
    method:     row.method as 'auto' | 'manual',
    status:     row.status as 'pending' | 'verified' | 'rejected',
    verifiedBy: (row.verified_by as string | null) ?? null,
    imageUrl:   (row.image_url as string | null) ?? null,
    createdAt:  row.created_at as string,
    verifiedAt: (row.verified_at as string | null) ?? null,
  }
}

// Full transfer config INCLUDING SlipOK credentials — server-side only. Never
// return this straight to a client; the payment/config route exposes a public,
// secret-free subset.
export async function getTransferSettings(storeId?: string): Promise<TransferSettings> {
  const sid = await requireStoreId(storeId)
  const raw = await getConfig('transfer_settings', sid)
  let parsed: Partial<TransferSettings> = {}
  if (raw) { try { parsed = JSON.parse(raw) } catch { /* ignore */ } }
  return {
    enabled:        !!parsed.enabled,
    mode:           parsed.mode === 'auto' ? 'auto' : 'manual',
    promptpayId:    parsed.promptpayId ?? '',
    accountName:    parsed.accountName ?? '',
    bankCode:       parsed.bankCode ?? '',
    slipokApiKey:   parsed.slipokApiKey ?? '',
    slipokBranchId: parsed.slipokBranchId ?? '',
  }
}

export type NewPaymentSlip = {
  orderId: string
  transRef: string | null
  amount: number
  senderName: string | null
  receiverOk: boolean | null
  method: 'auto' | 'manual'
  status: 'pending' | 'verified' | 'rejected'
  verifiedBy?: string | null
  rawPayload?: unknown
  imageUrl?: string | null
}

// Insert a slip row. A duplicate (store_id, trans_ref) trips the unique index
// (Postgres 23505) — the caller treats that as SLIP_ALREADY_USED, the anti-reuse
// guarantee. Returns { slip } on success or { error: '23505' } on reuse.
export async function insertPaymentSlip(
  slip: NewPaymentSlip, storeId?: string,
): Promise<{ slip: PaymentSlip } | { error: string }> {
  const sid = await requireStoreId(storeId)
  const verified = slip.status === 'verified'
  const { data, error } = await supabase
    .from('payment_slips')
    .insert({
      store_id:    sid,
      order_id:    slip.orderId,
      trans_ref:   slip.transRef,
      amount:      slip.amount,
      sender_name: slip.senderName,
      receiver_ok: slip.receiverOk,
      method:      slip.method,
      status:      slip.status,
      verified_by: slip.verifiedBy ?? null,
      raw_payload: slip.rawPayload ?? null,
      image_url:   slip.imageUrl ?? null,
      verified_at: verified ? now() : null,
    })
    .select()
    .single()
  if (error) return { error: error.code ?? error.message }
  return { slip: mapSlip(data) }
}

export async function getPaymentSlip(id: string, storeId?: string): Promise<PaymentSlip | null> {
  const sid = await requireStoreId(storeId)
  const { data } = await supabase
    .from('payment_slips').select('*').eq('id', id).eq('store_id', sid).maybeSingle()
  return data ? mapSlip(data) : null
}

export async function getPaymentSlipsByOrder(orderId: string, storeId?: string): Promise<PaymentSlip[]> {
  const sid = await requireStoreId(storeId)
  const { data } = await supabase
    .from('payment_slips').select('*')
    .eq('store_id', sid).eq('order_id', orderId)
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapSlip)
}

// Move a pending slip to verified/rejected. Store-scoped and status-guarded:
// only a row still 'pending' flips, so a double confirm/reject is a no-op
// (returns null → caller 409s).
export async function resolvePaymentSlip(
  id: string, status: 'verified' | 'rejected', verifiedBy: string | null, storeId?: string,
): Promise<PaymentSlip | null> {
  const sid = await requireStoreId(storeId)
  const { data } = await supabase
    .from('payment_slips')
    .update({ status, verified_by: verifiedBy, verified_at: now() })
    .eq('id', id).eq('store_id', sid).eq('status', 'pending')
    .select().maybeSingle()
  return data ? mapSlip(data) : null
}

// ── Slip-image storage (private 'slips' bucket, auto-created on first use) ─────
const ORDER_SLIP_BUCKET = 'slips'

export async function uploadOrderSlip(
  storeId: string, orderId: string, bytes: Uint8Array, contentType: string,
): Promise<string> {
  const ext  = contentType.includes('png') ? 'png' : 'jpg'
  const path = `${storeId}/${orderId}-${Date.now()}.${ext}`
  const doUpload = () => supabase.storage.from(ORDER_SLIP_BUCKET).upload(path, bytes, { contentType, upsert: true })
  let { error } = await doUpload()
  if (error && /bucket/i.test(error.message)) {
    await supabase.storage.createBucket(ORDER_SLIP_BUCKET, { public: false }).catch(() => {})
    ;({ error } = await doUpload())
  }
  if (error) throw error
  return path
}

// Short-lived signed URL for a slip image — staff routes only, never public.
export async function signedOrderSlipUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(ORDER_SLIP_BUCKET).createSignedUrl(path, 600)
  return data?.signedUrl ?? null
}

// ─── Store provisioning (self-serve signup) ──────────────────────────────────
// When a new owner signs up (email/password or OAuth) they arrive with an auth
// session but no store. provisionStoreForUser() turns that session into a fully
// usable store on first authenticated visit: it creates the `stores` row, makes
// the user its owner (an 'admin' profile — the app's top role; the DB CHECK on
// profiles.role forbids a literal 'owner'), and seeds enough sample data that the
// POS never opens to a blank screen.
//
// It is IDEMPOTENT and CONCURRENCY-SAFE:
//   • Idempotent — a user who already has a store just gets that store back; a
//     user who has a non-store profile (a pending join/approval) is left alone.
//   • Concurrency-safe — the profiles row (PK = auth uid) is the claim: the store
//     id is written INTO the profile insert, so two parallel calls both create a
//     candidate store but only one wins the insert; the loser rolls its orphan
//     store back and returns the winner's store. Net result: exactly one store.

const SEGMENTS = ['restaurant', 'cafe', 'bar', 'massage', 'salon', 'nails', 'other'] as const
export type StoreSegment = (typeof SEGMENTS)[number]
export function normalizeSegment(v: unknown): StoreSegment {
  const s = String(v ?? '').trim().toLowerCase()
  return (SEGMENTS as readonly string[]).includes(s) ? (s as StoreSegment) : 'other'
}

// Turn a (possibly Thai / non-Latin) store name into a url-safe slug, then make
// it unique with a numeric suffix. Slugs appear in public QR/reserve links, so
// they must be [a-z0-9-]; transliteration romanizes Thai (ร้านสยาม → ran-siam).
export function slugifyStoreName(name: string): string {
  const base = transliterate(String(name ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return base || 'store'
}

async function uniqueStoreSlug(name: string): Promise<string> {
  const base = slugifyStoreName(name)
  // Pull every slug that shares the base once, then pick the first free suffix —
  // avoids a per-candidate round-trip and a race between check-then-insert.
  const { data } = await supabase.from('stores').select('slug').like('slug', `${base}%`)
  const taken = new Set((data ?? []).map(r => (r.slug as string)))
  if (!taken.has(base)) return base
  for (let i = 2; i < 10000; i++) {
    const cand = `${base}-${i}`
    if (!taken.has(cand)) return cand
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

// Create the stores row for a fresh signup: Free plan, active (no trial expiry),
// with the referring affiliate attributed when a valid code was used.
async function createProvisionedStore(input: {
  name: string; slug: string; affiliateId: string | null
}): Promise<{ id: string; slug: string }> {
  const { data, error } = await supabase.from('stores').insert({
    name: input.name,
    slug: input.slug,
    plan: 'free',
    subscription_status: 'active',
    subscription_until: null,
    affiliate_id: input.affiliateId,
  }).select('id, slug').single()
  if (error) throw error
  return { id: data.id as string, slug: data.slug as string }
}

// A tiny, segment-agnostic starter menu so the POS' first paint is never empty.
// Everything is marked (ตัวอย่าง) so the owner knows to replace it.
const SEED_CATEGORIES: CatEntry[] = [
  { value: 'food',    label: 'อาหาร',      color: 'bg-red-600 text-gray-900',    icon: '🍔' },
  { value: 'drink',   label: 'เครื่องดื่ม', color: 'bg-cyan-600 text-gray-900',   icon: '🥤' },
  { value: 'dessert', label: 'ของหวาน',    color: 'bg-pink-600 text-gray-900',   icon: '🍰' },
  { value: 'other',   label: 'อื่นๆ',       color: 'bg-gray-300 text-gray-700',   icon: '🏷️' },
]

const SEED_MENU: Array<{ name: string; nameTh: string; price: number; category: string }> = [
  { name: 'Fried Rice (sample)',   nameTh: 'ข้าวผัด (ตัวอย่าง)',   price: 60,  category: 'food'    },
  { name: 'Tom Yum (sample)',      nameTh: 'ต้มยำ (ตัวอย่าง)',     price: 120, category: 'food'    },
  { name: 'Water (sample)',        nameTh: 'น้ำเปล่า (ตัวอย่าง)',  price: 15,  category: 'drink'   },
  { name: 'Thai Iced Tea (sample)',nameTh: 'ชาเย็น (ตัวอย่าง)',    price: 35,  category: 'drink'   },
  { name: 'Cake (sample)',         nameTh: 'เค้ก (ตัวอย่าง)',      price: 55,  category: 'dessert' },
  { name: 'Ice Cream (sample)',    nameTh: 'ไอศกรีม (ตัวอย่าง)',   price: 45,  category: 'dessert' },
]

// Seed a freshly-created store's defaults. Best-effort per section — a hiccup
// seeding, say, the sample menu must not blow away a store that is otherwise
// provisioned (the owner can always add data by hand). Each write is explicitly
// scoped to `storeId` — never rely on the migration-010 default, which points at
// Store #1 and would leak seed rows into the wrong tenant.
async function seedStoreDefaults(storeId: string, storeName: string, segment: StoreSegment): Promise<void> {
  // Categories (full-replace is scoped to this store).
  await saveCategories(SEED_CATEGORIES, storeId).catch(err =>
    console.error('[provision] seed categories', err instanceof Error ? err.message : err))

  // Sample menu.
  for (let i = 0; i < SEED_MENU.length; i++) {
    const m = SEED_MENU[i]
    await createMenuItem({
      name: m.name, nameTh: m.nameTh, price: m.price, category: m.category as MenuCategory,
      available: true, description: 'ตัวอย่าง — แก้ไขหรือลบได้', sortOrder: i,
    } as Omit<MenuItem, 'id'>, storeId).catch(err =>
      console.error('[provision] seed menu', err instanceof Error ? err.message : err))
  }

  // Default floor layout + bar settings in app_config (the (store_id, key) shape
  // read by /api/settings). Floor tiles mirror the built-in DEFAULT_TILES.
  const floorTiles = [
    { id: 'dt-T1', tableNo: 'T1', x: 40,  y: 40,  w: 120, h: 80, shape: 'rect', capacity: 4, zone: 'Indoor' },
    { id: 'dt-T2', tableNo: 'T2', x: 200, y: 40,  w: 120, h: 80, shape: 'rect', capacity: 4, zone: 'Indoor' },
    { id: 'dt-T3', tableNo: 'T3', x: 360, y: 40,  w: 120, h: 80, shape: 'rect', capacity: 4, zone: 'Indoor' },
    { id: 'dt-T4', tableNo: 'T4', x: 40,  y: 200, w: 160, h: 80, shape: 'rect', capacity: 6, zone: 'Indoor' },
  ]
  await setConfig('floor_layout', JSON.stringify(floorTiles), storeId).catch(err =>
    console.error('[provision] seed floor', err instanceof Error ? err.message : err))

  const barSettings = {
    barName: storeName, address: '', phone: '', taxId: '',
    footer: 'ขอบคุณที่ใช้บริการ\nThank you! 🙏',
    promptpayNumber: '', width: 32, receiptTemplate: 'classic',
    printerConnectionType: 'bluetooth', openTime: '10:00', closeTime: '23:00',
    businessDayCutoff: '00:00',
  }
  await setConfig('bar_settings', JSON.stringify(barSettings), storeId).catch(err =>
    console.error('[provision] seed bar_settings', err instanceof Error ? err.message : err))

  // Segment + provisioning source stamp (kept in app_config so no schema change
  // is needed; plan='free' already lives on the stores row).
  await setConfig('store_segment', segment, storeId).catch(() => {})
  await setConfig('store_source', 'self-signup', storeId).catch(() => {})
}

export type ProvisionResult =
  | { ok: true; storeId: string; slug: string | null; created: boolean; ownerPin?: string }
  | { ok: false; reason: 'pending'; status: string }

// Provision (or resolve) the signed-in user's store. See the block comment above
// for the idempotency + concurrency contract.
export async function provisionStoreForUser(input: {
  userId: string
  storeName: string
  segment?: unknown
  displayName?: string | null
  email?: string | null
  ref?: string | null
}): Promise<ProvisionResult> {
  // 1. Already resolved? (idempotent re-run) — or a non-store profile we must not
  //    hijack (a pending join/approval from /auth/setup).
  const { data: existing } = await supabase.from('profiles')
    .select('store_id, status').eq('id', input.userId).maybeSingle()
  if (existing?.store_id) {
    const s = await getStore(existing.store_id as string)
    return { ok: true, storeId: existing.store_id as string, slug: s?.slug ?? null, created: false }
  }
  if (existing) {
    return { ok: false, reason: 'pending', status: (existing.status as string) ?? 'pending' }
  }

  const name = String(input.storeName ?? '').trim()
  if (!name) throw new Error('storeName is required')
  const segment = normalizeSegment(input.segment)

  // Referral attribution (best-effort — an unknown/inactive code just drops).
  let affiliateId: string | null = null
  const ref = input.ref ? String(input.ref).trim() : ''
  if (ref) { const aff = await getAffiliateByCode(ref); if (aff && aff.status === 'active') affiliateId = aff.id }

  const slug = await uniqueStoreSlug(name)
  const store = await createProvisionedStore({ name, slug, affiliateId })

  // 2. Atomic claim: write the store id straight into the owner's profile. The
  //    PK (auth uid) makes this the single point of serialization.
  const displayName = (input.displayName || input.email || name || 'Owner').toString().trim() || 'Owner'
  const { error: claimErr } = await supabase.from('profiles').insert({
    id: input.userId, name: displayName, role: 'admin', status: 'approved',
    provider: 'oauth', store_id: store.id,
  })

  if (claimErr) {
    // Lost the race (or a stale profile appeared) → roll back our orphan store.
    await supabase.from('stores').delete().eq('id', store.id)
    const code = (claimErr as { code?: string }).code
    if (code === '23505') {
      const { data: again } = await supabase.from('profiles')
        .select('store_id, status').eq('id', input.userId).maybeSingle()
      if (again?.store_id) {
        const s = await getStore(again.store_id as string)
        return { ok: true, storeId: again.store_id as string, slug: s?.slug ?? null, created: false }
      }
      return { ok: false, reason: 'pending', status: (again?.status as string) ?? 'pending' }
    }
    throw claimErr
  }

  // 3. We own the store — seed it, then also create the owner's PIN operator so
  //    they can start a shift immediately (mirrors the invite-join PIN pattern).
  //    The PIN is random (not a guessable default) and returned once so the UI
  //    can show it to the owner; they change it in Settings → Users.
  await seedStoreDefaults(store.id, name, segment)
  let ownerPin: string | undefined
  try {
    const pin = String(Math.floor(1000 + Math.random() * 9000)) // 4 digits, 1000-9999
    await createStaffMember({ name: displayName, role: 'admin', pin, color: '#f59e0b' }, store.id)
    ownerPin = pin
  } catch (err) {
    console.error('[provision] owner PIN operator', err instanceof Error ? err.message : err)
  }
  return { ok: true, storeId: store.id, slug: store.slug, created: true, ownerPin }
}

// ── Staff time clock (shifts) ────────────────────────────────────────────────
// Clock in/out + breaks per store + PIN operator. Meal/other breaks don't count
// toward worked hours. A shift left open past its business-day cutoff is
// auto-closed at that cutoff (staff forgot to clock out).
export type ShiftBreakType = 'meal' | 'restroom' | 'other'
type ShiftBreak = { start: string; end: string | null; type: ShiftBreakType }
export type Shift = {
  id: string; staffId: string; clockIn: string; clockOut: string | null
  breaks: ShiftBreak[]; status: 'open' | 'closed'; autoClosed: boolean
}

function mapShift(r: Record<string, unknown>): Shift {
  return {
    id: r.id as string,
    staffId: r.staff_id as string,
    clockIn: r.clock_in as string,
    clockOut: (r.clock_out as string | null) ?? null,
    breaks: Array.isArray(r.breaks) ? (r.breaks as ShiftBreak[]) : [],
    status: (r.status as 'open' | 'closed') ?? 'open',
    autoClosed: !!r.auto_closed,
  }
}

// If an open shift belongs to an earlier business day, close it at that day's
// cutoff (and close any dangling break there too). Returns true if it closed.
async function autoCloseStaleShift(row: Record<string, unknown>, cutoff: string): Promise<boolean> {
  const bDay  = businessDayOf(row.clock_in as string, cutoff)
  const today = businessDayOf(new Date(), cutoff)
  if (bDay >= today) return false
  const closeAt = businessDayRange(bDay, cutoff).end
  const breaks = (Array.isArray(row.breaks) ? (row.breaks as ShiftBreak[]) : []).map(b => b.end ? b : { ...b, end: closeAt })
  await supabase.from('time_entries').update({
    status: 'closed', clock_out: closeAt, auto_closed: true, breaks, updated_at: new Date().toISOString(),
  }).eq('id', row.id as string)
  return true
}

export async function getOpenShift(storeId: string, staffId: string): Promise<Shift | null> {
  const { data } = await supabase.from('time_entries')
    .select('*').eq('store_id', storeId).eq('staff_id', staffId).eq('status', 'open')
    .order('clock_in', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  const cutoff = await getBusinessCutoff(storeId)
  if (await autoCloseStaleShift(data, cutoff)) return null
  return mapShift(data)
}

export async function shiftClockIn(storeId: string, staffId: string): Promise<Shift> {
  const existing = await getOpenShift(storeId, staffId)   // auto-closes stale; returns today's open if any
  if (existing) return existing
  const { data, error } = await supabase.from('time_entries')
    .insert({ store_id: storeId, staff_id: staffId, clock_in: new Date().toISOString(), breaks: [], status: 'open' })
    .select('*').single()
  if (error) throw error
  return mapShift(data)
}

export async function shiftBreakStart(storeId: string, staffId: string, type: ShiftBreakType): Promise<Shift | null> {
  const open = await getOpenShift(storeId, staffId)
  if (!open) return null
  if (open.breaks.some(b => !b.end)) return open   // a break is already running
  const breaks = [...open.breaks, { start: new Date().toISOString(), end: null, type }]
  const { data } = await supabase.from('time_entries').update({ breaks, updated_at: new Date().toISOString() }).eq('id', open.id).select('*').single()
  return data ? mapShift(data) : open
}

export async function shiftBreakEnd(storeId: string, staffId: string): Promise<Shift | null> {
  const open = await getOpenShift(storeId, staffId)
  if (!open) return null
  const now = new Date().toISOString()
  const breaks = open.breaks.map(b => b.end ? b : { ...b, end: now })
  const { data } = await supabase.from('time_entries').update({ breaks, updated_at: now }).eq('id', open.id).select('*').single()
  return data ? mapShift(data) : open
}

export async function shiftClockOut(storeId: string, staffId: string): Promise<void> {
  const open = await getOpenShift(storeId, staffId)
  if (!open) return
  const now = new Date().toISOString()
  const breaks = open.breaks.map(b => b.end ? b : { ...b, end: now })   // close a dangling break
  await supabase.from('time_entries').update({ status: 'closed', clock_out: now, breaks, updated_at: now }).eq('id', open.id)
}
