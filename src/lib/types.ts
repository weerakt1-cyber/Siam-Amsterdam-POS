export type OrderStatus = 'pending' | 'accepted' | 'ready' | 'delivered' | 'cancelled' | 'paid'
export type OrderSource = 'tilda' | 'pos' | 'manual'
export type MenuCategory = 'cocktail' | 'beer' | 'drink' | 'snack' | 'food' | 'shot' | 'other'

export type OrderItem = {
  menuId: string
  name: string
  nameTh: string
  qty: number
  price: number
  variantLabel?: string   // e.g. "Large, Less Ice"
}

export type OrderDiscount = {
  type: 'percent' | 'fixed'
  value: number   // percent: 0-100, fixed: baht amount
  amount: number  // resolved baht amount after calculation
}

export type Order = {
  id: string
  tableNo: string
  items: OrderItem[]
  note: string
  status: OrderStatus
  source: OrderSource
  subtotal: number         // before discount
  discount?: OrderDiscount
  total: number            // after discount
  paymentMethod?: string
  memberName?: string
  createdAt: string
  updatedAt: string
}

// ─── Member ──────────────────────────────────────────────────────────────────

export type Member = {
  id: string
  name: string
  phone?: string
  birthday?: string    // YYYY-MM-DD
  notes?: string
  points: number       // redeemable points balance
  stamps: number       // current stamp card progress (0–9, resets at 10)
  stampsEarned: number // lifetime stamps earned (for analytics)
  createdAt: string
  updatedAt: string
}

// ─── Menu item variants (e.g. Size, Ice level, Spirit) ───────────────────────

export type VariantOption = {
  id: string
  name: string          // "Small", "Large", "Less Ice"
  priceAdjust: number   // 0 = same, 50 = +฿50, -20 = -฿20
}

export type Variant = {
  id: string
  name: string          // "Size", "Ice Level", "Spirit Choice"
  required: boolean
  options: VariantOption[]
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

export type CouponType = 'percent' | 'fixed'

export type Coupon = {
  id: string
  code: string              // unique, stored uppercase
  name: string
  description?: string
  type: CouponType
  value: number             // percent: 0–100, fixed: baht
  minOrder: number          // 0 = no minimum
  maxUses: number           // 0 = unlimited
  usedCount: number
  active: boolean
  startDate?: string        // YYYY-MM-DD
  endDate?: string          // YYYY-MM-DD
  memberOnly: boolean
  createdAt: string
  updatedAt: string
}

export type CouponUse = {
  id: string
  couponId: string
  couponCode: string
  discountAmount: number
  orderTotal: number
  memberName?: string
  createdAt: string
}

// ─── Daily Cash Report ───────────────────────────────────────────────────────

export type CashEntry = {
  id: string
  amount: number
  note: string
  createdAt: string
}

export type ExpenseCategory = 'supplies' | 'utilities' | 'salary' | 'rent' | 'food' | 'other'

export type ExpenseEntry = {
  id: string
  amount: number
  note: string
  category: ExpenseCategory
  createdAt: string
}

export type DailyReport = {
  date: string          // YYYY-MM-DD
  openingCash: number
  cashIns: CashEntry[]
  expenses: ExpenseEntry[]
  updatedAt: string
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export type InventoryCategory = 'spirits' | 'beer' | 'mixer' | 'food' | 'supplies' | 'other'

export type InventoryItem = {
  id: string
  name: string
  unit: string              // 'bottle', 'can', 'kg', 'liter', 'pcs', 'portion'
  category: InventoryCategory
  currentStock: number
  lowStockThreshold: number
  costPerUnit?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export type AdjustReason = 'restock' | 'usage' | 'manual' | 'waste'

export type StockAdjustment = {
  id: string
  itemId: string
  delta: number             // positive = add, negative = remove
  reason: AdjustReason
  note?: string
  createdAt: string
}

// ─── POS Staff / User ────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'bartender' | 'staff'

export type PosUser = {
  id: string
  name: string
  role: UserRole
  pin: string        // 4 ตัวเลข เก็บ plaintext สำหรับ prototype
  color: string      // hex color สำหรับ avatar
  createdAt: string
  updatedAt: string
}

// ─── Menu item ───────────────────────────────────────────────────────────────

export type MenuItem = {
  id: string
  name: string
  nameTh: string
  price: number
  category: MenuCategory
  available: boolean
  // Extended fields
  cost?: number           // COGS — for margin calculation
  sku?: string
  description?: string
  unit?: string           // "glass", "bottle", "shot", "piece", "plate"
  taxRate?: number        // 0 or 7 (VAT %)
  image?: string          // data URL (prototype) or CDN URL (production)
  sortOrder?: number
  variants?: Variant[]
}
