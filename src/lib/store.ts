import { supabase } from './supabase'
import bcrypt from 'bcryptjs'
import type {
  Order, OrderItem, OrderStatus, OrderDiscount, OrderSource,
  MenuItem, MenuCategory, Variant,
  Member,
  InventoryItem, InventoryCategory, StockAdjustment, AdjustReason,
  DailyReport, CashEntry, ExpenseEntry, ExpenseCategory,
  Coupon, CouponUse, CouponType,
  PosUser, UserRole,
} from './types'

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
    createdAt:     row.created_at as string,
    updatedAt:     row.updated_at as string,
  }
}

function mapMember(row: Record<string, unknown>): Member {
  return {
    id:           row.id as string,
    name:         row.name as string,
    phone:        row.phone as string | undefined,
    birthday:     row.birthday as string | undefined,
    notes:        row.notes as string | undefined,
    points:       Number(row.points),
    stamps:       Number(row.stamps),
    stampsEarned: Number(row.stamps_earned),
    createdAt:    row.created_at as string,
    updatedAt:    row.updated_at as string,
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

// ─── Menu ─────────────────────────────────────────────────────────────────────

export async function getMenu(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapMenuItem)
}

export async function createMenuItem(data: Omit<MenuItem, 'id'>): Promise<MenuItem> {
  const { data: row, error } = await supabase
    .from('menu_items')
    .insert({
      id:          crypto.randomUUID(),
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

export async function updateMenuItem(id: string, data: Partial<Omit<MenuItem, 'id'>>): Promise<MenuItem | null> {
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
    .select()
    .single()
  if (error) return null
  return mapMenuItem(row)
}

export async function deleteMenuItem(id: string): Promise<boolean> {
  const { error } = await supabase.from('menu_items').delete().eq('id', id)
  return !error
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function getOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapOrder)
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .single()
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
}): Promise<Order> {
  const subtotal = data.items.reduce((s, i) => s + i.price * i.qty, 0)
  const total    = Math.max(0, subtotal - (data.discount?.amount ?? 0))
  const id       = makeId('ord')
  const ts       = now()

  const { error: orderErr } = await supabase.from('orders').insert({
    id,
    table_no:       data.tableNo,
    note:           data.note ?? '',
    status:         data.source === 'pos' ? 'paid' : 'pending',
    source:         data.source ?? 'manual',
    subtotal,
    discount:       data.discount ?? null,
    total,
    payment_method: data.paymentMethod ?? null,
    member_name:    data.memberName ?? null,
    created_at:     ts,
    updated_at:     ts,
  })
  if (orderErr) throw orderErr

  if (data.items.length > 0) {
    const { error: itemsErr } = await supabase.from('order_items').insert(
      data.items.map(item => ({
        order_id:      id,
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
    note: data.note ?? '', status: data.source === 'pos' ? 'paid' : 'pending',
    source: data.source ?? 'manual', subtotal, discount: data.discount, total,
    paymentMethod: data.paymentMethod, memberName: data.memberName,
    createdAt: ts, updatedAt: ts,
  }
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: now() })
    .eq('id', id)
  if (error) return null
  return (await getOrder(id)) ?? null
}

export async function getOrdersByDate(date: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .gte('created_at', `${date}T00:00:00`)
    .lt('created_at', `${date}T23:59:59.999`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapOrder)
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function getMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapMember)
}

export async function getMember(id: string): Promise<Member | undefined> {
  const { data, error } = await supabase.from('members').select('*').eq('id', id).single()
  if (error || !data) return undefined
  return mapMember(data)
}

export async function createMember(data: Omit<Member, 'id' | 'createdAt' | 'updatedAt'>): Promise<Member> {
  const ts = now()
  const { data: row, error } = await supabase
    .from('members')
    .insert({
      id:            crypto.randomUUID(),
      name:          data.name,
      phone:         data.phone ?? null,
      birthday:      data.birthday ?? null,
      notes:         data.notes ?? null,
      points:        data.points,
      stamps:        data.stamps,
      stamps_earned: data.stampsEarned,
      created_at:    ts,
      updated_at:    ts,
    })
    .select()
    .single()
  if (error) throw error
  return mapMember(row)
}

export async function updateMember(id: string, data: Partial<Omit<Member, 'id' | 'createdAt'>>): Promise<Member | null> {
  const update: Record<string, unknown> = { updated_at: now() }
  if (data.name         !== undefined) update.name          = data.name
  if (data.phone        !== undefined) update.phone         = data.phone ?? null
  if (data.birthday     !== undefined) update.birthday      = data.birthday ?? null
  if (data.notes        !== undefined) update.notes         = data.notes ?? null
  if (data.points       !== undefined) update.points        = data.points
  if (data.stamps       !== undefined) update.stamps        = data.stamps
  if (data.stampsEarned !== undefined) update.stamps_earned = data.stampsEarned

  const { data: row, error } = await supabase
    .from('members').update(update).eq('id', id).select().single()
  if (error || !row) return null
  return mapMember(row)
}

export async function deleteMember(id: string): Promise<boolean> {
  const { error } = await supabase.from('members').delete().eq('id', id)
  return !error
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export async function getInventory(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
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

export async function getInventoryItem(id: string): Promise<InventoryItem | undefined> {
  const { data, error } = await supabase.from('inventory_items').select('*').eq('id', id).single()
  if (error || !data) return undefined
  return mapInventoryItem(data)
}

export async function createInventoryItem(data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<InventoryItem> {
  const ts = now()
  const { data: row, error } = await supabase
    .from('inventory_items')
    .insert({
      id:                  crypto.randomUUID(),
      name:                data.name,
      unit:                data.unit,
      category:            data.category,
      current_stock:       data.currentStock,
      low_stock_threshold: data.lowStockThreshold,
      cost_per_unit:       data.costPerUnit ?? null,
      notes:               data.notes ?? null,
      created_at:          ts,
      updated_at:          ts,
    })
    .select()
    .single()
  if (error) throw error
  return mapInventoryItem(row)
}

export async function updateInventoryItem(id: string, data: Partial<Omit<InventoryItem, 'id' | 'createdAt'>>): Promise<InventoryItem | null> {
  const update: Record<string, unknown> = { updated_at: now() }
  if (data.name               !== undefined) update.name                = data.name
  if (data.unit               !== undefined) update.unit                = data.unit
  if (data.category           !== undefined) update.category            = data.category
  if (data.currentStock       !== undefined) update.current_stock       = data.currentStock
  if (data.lowStockThreshold  !== undefined) update.low_stock_threshold = data.lowStockThreshold
  if (data.costPerUnit        !== undefined) update.cost_per_unit       = data.costPerUnit ?? null
  if (data.notes              !== undefined) update.notes               = data.notes ?? null

  const { data: row, error } = await supabase
    .from('inventory_items').update(update).eq('id', id).select().single()
  if (error || !row) return null
  return mapInventoryItem(row)
}

export async function deleteInventoryItem(id: string): Promise<boolean> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id)
  return !error
}

// บันทึกการปรับสต็อก + อัปเดตยอดคงเหลือ
export async function adjustStock(itemId: string, delta: number, reason: AdjustReason, note?: string): Promise<InventoryItem | null> {
  const item = await getInventoryItem(itemId)
  if (!item) return null

  const newStock = Math.max(0, item.currentStock + delta)
  await updateInventoryItem(itemId, { currentStock: newStock })

  await supabase.from('stock_adjustments').insert({
    id:         makeId('adj'),
    item_id:    itemId,
    delta,
    reason,
    note:       note ?? null,
    created_at: now(),
  })

  return (await getInventoryItem(itemId)) ?? null
}

export async function getAdjustments(itemId?: string): Promise<StockAdjustment[]> {
  let q = supabase.from('stock_adjustments').select('*').order('created_at', { ascending: false }).limit(50)
  if (itemId) q = q.eq('item_id', itemId).limit(20)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapAdjustment)
}

export type { InventoryCategory }

// ─── Daily Reports ────────────────────────────────────────────────────────────

export async function getReport(date: string): Promise<DailyReport> {
  const { data } = await supabase.from('daily_reports').select('*').eq('date', date).single()
  if (data) return mapReport(data)
  // สร้างรายงานใหม่ถ้ายังไม่มี
  const blank: DailyReport = { date, openingCash: 0, cashIns: [], expenses: [], updatedAt: now() }
  await supabase.from('daily_reports').insert({
    date, opening_cash: 0, cash_ins: [], expenses: [], updated_at: blank.updatedAt,
  })
  return blank
}

export async function setOpeningCash(date: string, amount: number): Promise<DailyReport> {
  const { data, error } = await supabase
    .from('daily_reports')
    .upsert({ date, opening_cash: amount, cash_ins: [], expenses: [], updated_at: now() }, { onConflict: 'date' })
    .select()
    .single()
  if (error) throw error
  return mapReport(data)
}

export async function addCashIn(date: string, data: Omit<CashEntry, 'id' | 'createdAt'>): Promise<DailyReport> {
  const report = await getReport(date)
  const entry: CashEntry = { ...data, id: makeId('ci'), createdAt: now() }
  const { data: row, error } = await supabase
    .from('daily_reports')
    .update({ cash_ins: [...report.cashIns, entry], updated_at: now() })
    .eq('date', date)
    .select()
    .single()
  if (error) throw error
  return mapReport(row)
}

export async function removeCashIn(date: string, entryId: string): Promise<DailyReport> {
  const report = await getReport(date)
  const { data: row, error } = await supabase
    .from('daily_reports')
    .update({ cash_ins: report.cashIns.filter(e => e.id !== entryId), updated_at: now() })
    .eq('date', date)
    .select()
    .single()
  if (error) throw error
  return mapReport(row)
}

export async function addExpense(date: string, data: Omit<ExpenseEntry, 'id' | 'createdAt'>): Promise<DailyReport> {
  const report = await getReport(date)
  const entry: ExpenseEntry = { ...data, id: makeId('ex'), createdAt: now() }
  const { data: row, error } = await supabase
    .from('daily_reports')
    .update({ expenses: [...report.expenses, entry], updated_at: now() })
    .eq('date', date)
    .select()
    .single()
  if (error) throw error
  return mapReport(row)
}

export async function removeExpense(date: string, entryId: string): Promise<DailyReport> {
  const report = await getReport(date)
  const { data: row, error } = await supabase
    .from('daily_reports')
    .update({ expenses: report.expenses.filter(e => e.id !== entryId), updated_at: now() })
    .eq('date', date)
    .select()
    .single()
  if (error) throw error
  return mapReport(row)
}

export type { ExpenseCategory }

// ─── Coupons ─────────────────────────────────────────────────────────────────

export async function getCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapCoupon)
}

export async function getCoupon(id: string): Promise<Coupon | undefined> {
  const { data, error } = await supabase.from('coupons').select('*').eq('id', id).single()
  if (error || !data) return undefined
  return mapCoupon(data)
}

export async function getCouponByCode(code: string): Promise<Coupon | undefined> {
  const { data, error } = await supabase
    .from('coupons').select('*').eq('code', code.trim().toUpperCase()).single()
  if (error || !data) return undefined
  return mapCoupon(data)
}

export async function createCoupon(data: Omit<Coupon, 'id' | 'usedCount' | 'createdAt' | 'updatedAt'>): Promise<Coupon> {
  const ts = now()
  const { data: row, error } = await supabase
    .from('coupons')
    .insert({
      id:          makeId('cp'),
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

export async function updateCoupon(id: string, data: Partial<Omit<Coupon, 'id' | 'createdAt'>>): Promise<Coupon | null> {
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
    .from('coupons').update(update).eq('id', id).select().single()
  if (error || !row) return null
  return mapCoupon(row)
}

export async function deleteCoupon(id: string): Promise<boolean> {
  const { error } = await supabase.from('coupons').delete().eq('id', id)
  return !error
}

// ตรวจสอบ coupon code และคำนวณส่วนลด
export async function validateCoupon(
  code: string, subtotal: number, memberName?: string
): Promise<{ valid: true; coupon: Coupon; discountAmount: number } | { valid: false; error: string }> {
  const coupon = await getCouponByCode(code)
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
export async function recordCouponUse(couponId: string, discountAmount: number, orderTotal: number, memberName?: string): Promise<CouponUse> {
  const coupon = await getCoupon(couponId)
  // เพิ่ม used_count
  await supabase.from('coupons').update({ used_count: (coupon?.usedCount ?? 0) + 1, updated_at: now() }).eq('id', couponId)

  const use: CouponUse = {
    id: makeId('use'), couponId, couponCode: coupon?.code ?? '',
    discountAmount, orderTotal, memberName, createdAt: now(),
  }
  await supabase.from('coupon_uses').insert({
    id:              use.id,
    coupon_id:       couponId,
    coupon_code:     use.couponCode,
    discount_amount: discountAmount,
    order_total:     orderTotal,
    member_name:     memberName ?? null,
    created_at:      use.createdAt,
  })
  return use
}

export async function getCouponUses(couponId?: string): Promise<CouponUse[]> {
  let q = supabase.from('coupon_uses').select('*').order('created_at', { ascending: false }).limit(100)
  if (couponId) q = q.eq('coupon_id', couponId).limit(20)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapCouponUse)
}

export type { CouponType }

// ─── Staff ────────────────────────────────────────────────────────────────────

export type PosUserPublic = Omit<PosUser, 'pin'>

export async function getStaff(): Promise<PosUserPublic[]> {
  const { data, error } = await supabase.from('staff').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(row => {
    const { pin: _p, ...pub } = mapStaff(row)
    return pub
  })
}

export async function getStaffMember(id: string): Promise<PosUser | undefined> {
  const { data, error } = await supabase.from('staff').select('*').eq('id', id).single()
  if (error || !data) return undefined
  return mapStaff(data)
}

export async function createStaffMember(data: Omit<PosUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<PosUserPublic> {
  const ts = now()
  const { data: row, error } = await supabase
    .from('staff')
    .insert({
      id:         crypto.randomUUID(),
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

export async function updateStaffMember(id: string, data: Partial<Omit<PosUser, 'id' | 'createdAt'>>): Promise<PosUserPublic | null> {
  const update: Record<string, unknown> = { updated_at: now() }
  if (data.name  !== undefined) update.name  = data.name
  if (data.role  !== undefined) update.role  = data.role
  if (data.pin   !== undefined) update.pin   = await bcrypt.hash(data.pin, 10)
  if (data.color !== undefined) update.color = data.color

  const { data: row, error } = await supabase
    .from('staff').update(update).eq('id', id).select().single()
  if (error || !row) return null
  const { pin: _p, ...pub } = mapStaff(row)
  return pub
}

export async function deleteStaffMember(id: string): Promise<boolean> {
  const { error } = await supabase.from('staff').delete().eq('id', id)
  return !error
}

export async function verifyStaffPin(id: string, pin: string): Promise<boolean> {
  const user = await getStaffMember(id)
  if (!user) return false
  // Support bcrypt hashes and legacy plaintext PINs
  if (user.pin.startsWith('$2')) return await bcrypt.compare(pin, user.pin)
  return user.pin === pin
}

export type { UserRole }

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalyticsData(period: '7d' | '30d' | 'all' = '7d') {
  // ดึง paid orders ตาม period (เพิ่ม date filter ที่ DB level)
  let q = supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })

  if (period !== 'all') {
    const days = period === '7d' ? 7 : 30
    const since = new Date(Date.now() - days * 86400000).toISOString()
    q = q.gte('created_at', since)
  }

  const { data, error } = await q
  if (error) throw error
  const periodOrders = (data ?? []).map(mapOrder)

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayOrders = periodOrders.filter(o => o.createdAt.startsWith(todayStr))

  const revenue    = periodOrders.reduce((s, o) => s + o.total, 0)
  const orderCount = periodOrders.length
  const avgOrder   = orderCount > 0 ? Math.round(revenue / orderCount) : 0
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0)

  // แนวโน้มรายได้ 14 วันล่าสุด
  const now2 = new Date()
  const dailyTrend = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now2); d.setDate(d.getDate() - (13 - i))
    const date  = d.toISOString().slice(0, 10)
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    const dayOrders = periodOrders.filter(o => o.createdAt.startsWith(date))
    return { date, label, revenue: dayOrders.reduce((s, o) => s + o.total, 0), orders: dayOrders.length }
  })

  // Top items by revenue
  const itemMap: Record<string, { name: string; nameTh: string; menuId: string; qty: number; revenue: number }> = {}
  for (const o of periodOrders) {
    for (const item of o.items) {
      if (!itemMap[item.menuId]) itemMap[item.menuId] = { name: item.name, nameTh: item.nameTh, menuId: item.menuId, qty: 0, revenue: 0 }
      itemMap[item.menuId].qty     += item.qty
      itemMap[item.menuId].revenue += item.price * item.qty
    }
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // Revenue by payment method
  const payMap: Record<string, { count: number; revenue: number }> = {}
  for (const o of periodOrders) {
    const m = o.paymentMethod ?? 'unknown'
    if (!payMap[m]) payMap[m] = { count: 0, revenue: 0 }
    payMap[m].count++
    payMap[m].revenue += o.total
  }
  const byPayment = Object.entries(payMap).map(([method, d]) => ({ method, ...d })).sort((a, b) => b.revenue - a.revenue)

  // Revenue by source
  const srcMap: Record<string, { count: number; revenue: number }> = {}
  for (const o of periodOrders) {
    if (!srcMap[o.source]) srcMap[o.source] = { count: 0, revenue: 0 }
    srcMap[o.source].count++
    srcMap[o.source].revenue += o.total
  }
  const bySource = Object.entries(srcMap).map(([source, d]) => ({ source, ...d })).sort((a, b) => b.revenue - a.revenue)

  // Orders per hour
  const byHour = Array(24).fill(0) as number[]
  for (const o of periodOrders) byHour[new Date(o.createdAt).getHours()]++

  // Revenue by category (inferred from menuId prefix)
  const catMap: Record<string, { revenue: number; qty: number }> = {}
  for (const o of periodOrders) {
    for (const item of o.items) {
      const cat = item.menuId.startsWith('c')  ? 'Cocktails'
        : item.menuId.startsWith('bb') || item.menuId.startsWith('db') ? 'Beer'
        : item.menuId.startsWith('d')  ? 'Drinks'
        : item.menuId.startsWith('f')  ? 'Food'
        : item.menuId.startsWith('s')  ? 'Snacks'
        : 'Other'
      if (!catMap[cat]) catMap[cat] = { revenue: 0, qty: 0 }
      catMap[cat].revenue += item.price * item.qty
      catMap[cat].qty     += item.qty
    }
  }
  const byCategory = Object.entries(catMap).map(([category, d]) => ({ category, ...d })).sort((a, b) => b.revenue - a.revenue)

  const memberOrders   = periodOrders.filter(o => o.memberName)
  const memberRevenue  = memberOrders.reduce((s, o) => s + o.total, 0)
  const discountedOrders = periodOrders.filter(o => o.discount?.amount)
  const totalDiscount  = discountedOrders.reduce((s, o) => s + (o.discount?.amount ?? 0), 0)

  return {
    period,
    stats: { revenue, orders: orderCount, avgOrder, today: { revenue: todayRevenue, orders: todayOrders.length } },
    dailyTrend,
    topItems,
    byPayment,
    bySource,
    byHour,
    byCategory,
    memberStats: { withMember: memberOrders.length, withoutMember: orderCount - memberOrders.length, memberRevenue, nonMemberRevenue: revenue - memberRevenue },
    discountStats: { totalDiscount, ordersWithDiscount: discountedOrders.length, totalOrders: orderCount },
  }
}
