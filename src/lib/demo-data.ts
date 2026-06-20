import type { MenuItem } from './types'

// ── Demo staff users shown when database has no users yet ──────────────────────
export const DEMO_USERS = [
  { id: 'demo-1', name: 'Boss',   role: 'admin',     color: '#ef4444' },
  { id: 'demo-2', name: 'Nok',    role: 'bartender', color: '#f59e0b' },
  { id: 'demo-3', name: 'Ping',   role: 'bartender', color: '#10b981' },
  { id: 'demo-4', name: 'Pam',    role: 'staff',     color: '#6366f1' },
]

export function isDemoUser(id: string) {
  return id.startsWith('demo-')
}

// ── Demo menu items shown when database has no menu yet ────────────────────────
export const DEMO_MENU: MenuItem[] = [
  { id: 'dm-c1', name: 'Mojito',       nameTh: 'โมฮิโต',       price: 280, category: 'cocktail', available: true },
  { id: 'dm-c2', name: 'Margarita',    nameTh: 'มาการิต้า',    price: 280, category: 'cocktail', available: true },
  { id: 'dm-c3', name: 'Moscow Mule',  nameTh: 'มอสโคว มิวล์', price: 300, category: 'cocktail', available: true },
  { id: 'dm-c4', name: 'Gin & Tonic',  nameTh: 'จินโทนิค',     price: 260, category: 'cocktail', available: true },
  { id: 'dm-c5', name: 'Negroni',      nameTh: 'เนโกรนี',      price: 290, category: 'cocktail', available: true },
  { id: 'dm-c6', name: 'Aperol Spritz',nameTh: 'อาเปรอลสปริตซ์',price: 290, category: 'cocktail', available: true },
  { id: 'dm-b1', name: 'Singha',       nameTh: 'สิงห์',         price: 100, category: 'beer',     available: true },
  { id: 'dm-b2', name: 'Chang',        nameTh: 'ช้าง',          price:  90, category: 'beer',     available: true },
  { id: 'dm-b3', name: 'Leo',          nameTh: 'ลีโอ',          price:  90, category: 'beer',     available: true },
  { id: 'dm-b4', name: 'Heineken',     nameTh: 'ไฮเนเก้น',     price: 120, category: 'beer',     available: true },
  { id: 'dm-d1', name: 'Coke',         nameTh: 'โค้ก',          price:  60, category: 'drink',    available: true },
  { id: 'dm-d2', name: 'Sprite',       nameTh: 'สไปรท์',        price:  60, category: 'drink',    available: true },
  { id: 'dm-d3', name: 'Water',        nameTh: 'น้ำเปล่า',      price:  30, category: 'drink',    available: true },
  { id: 'dm-d4', name: 'Fresh OJ',     nameTh: 'น้ำส้มคั้น',    price: 120, category: 'drink',    available: true },
  { id: 'dm-s1', name: 'Peanuts',      nameTh: 'ถั่วทอด',       price:  80, category: 'snack',    available: true },
  { id: 'dm-s2', name: 'Edamame',      nameTh: 'ถั่วแระ',       price: 100, category: 'snack',    available: true },
  { id: 'dm-f1', name: 'Fries',        nameTh: 'มันทอด',        price: 130, category: 'food',     available: true },
  { id: 'dm-f2', name: 'Nachos',       nameTh: 'นาชอส',         price: 150, category: 'food',     available: true },
]
