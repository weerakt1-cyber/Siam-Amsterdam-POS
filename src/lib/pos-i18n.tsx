'use client'

// ─── POS staff-side i18n (TH / EN) ───────────────────────────────────────────
// Phase 1: app chrome — navigation, POS screen, page titles, settings.
// Venue-entered content (menu names, categories) is NOT translated.
// Persisted in localStorage; switching updates every mounted page instantly.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type PosLang = 'th' | 'en'

const STORAGE_KEY = 'pos_lang'
export const POS_LANG_CHANGED_EVENT = 'pos-lang-changed'

export const POS_LANGS: { code: PosLang; flag: string; label: string }[] = [
  { code: 'th', flag: '🇹🇭', label: 'ไทย' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
]

const DICT = {
  // ── Navigation ──
  navPos:       { en: 'POS',        th: 'หน้าขาย' },
  navFloor:     { en: 'Floor',      th: 'ผังโต๊ะ' },
  navKitchen:   { en: 'Kitchen',    th: 'ครัว' },
  navDelivery:  { en: 'Delivery',   th: 'เดลิเวอรี่' },
  navInventory: { en: 'Inventory',  th: 'สต๊อกสินค้า' },
  navItems:     { en: 'Items',      th: 'เมนูสินค้า' },
  navMembers:   { en: 'Members',    th: 'สมาชิก' },
  navCash:      { en: 'Cash',       th: 'เงินสด' },
  navCoupons:   { en: 'Coupons',    th: 'คูปอง' },
  navAnalytics: { en: 'Analytics',  th: 'รายงาน' },
  navUsers:     { en: 'Users',      th: 'ผู้ใช้งาน' },
  navSettings:  { en: 'Settings',   th: 'ตั้งค่า' },
  navStats:     { en: 'Stats',      th: 'สถิติ' },
  menu:         { en: 'Menu',       th: 'เมนู' },
  login:        { en: 'Login',      th: 'เข้าสู่ระบบ' },
  switchUser:   { en: 'switch user', th: 'สลับผู้ใช้' },

  // ── POS screen ──
  holdBill:        { en: 'Hold Bill',       th: 'พักบิล' },
  openDrawer:      { en: 'Open Drawer',     th: 'เปิดลิ้นชัก' },
  selectTable:     { en: 'Select Table',    th: 'เลือกโต๊ะ' },
  searchMenu:      { en: 'Search menu...',  th: 'ค้นหาเมนู...' },
  all:             { en: 'All',             th: 'ทั้งหมด' },
  noItemsCategory: { en: 'No items in this category', th: 'ไม่มีสินค้าในหมวดนี้' },
  noResultsFor:    { en: 'No results for',  th: 'ไม่พบผลลัพธ์สำหรับ' },
  total:           { en: 'Total',           th: 'รวมทั้งหมด' },
  selectItems:     { en: 'SELECT ITEMS',    th: 'เลือกสินค้า' },
  noMember:        { en: 'No member',       th: 'ไม่ระบุสมาชิก' },
  selectCoupon:    { en: 'Select coupon...', th: 'เลือกคูปอง...' },
  noActiveCoupons: { en: 'No active coupons', th: 'ไม่มีคูปองที่ใช้งาน' },
  printCheckBill:  { en: 'Print check bill', th: 'พิมพ์ใบเช็คบิล' },
  splitBill:       { en: 'Split Bill',      th: 'แยกบิล' },
  openTickets:     { en: 'Open Tickets',    th: 'บิลที่เปิดอยู่' },
  remove:          { en: 'Remove',          th: 'ลบ' },

  // ── Settings ──
  language:     { en: 'Language',              th: 'ภาษา' },
  languageDesc: { en: 'App display language — applies to every page instantly.', th: 'ภาษาที่แสดงในแอพ — มีผลทุกหน้าทันที' },
} as const

export type PosStringKey = keyof typeof DICT

type Ctx = {
  lang: PosLang
  setLang: (l: PosLang) => void
  t: (key: PosStringKey) => string
}

const PosLangContext = createContext<Ctx>({
  lang: 'en',
  setLang: () => {},
  t: (key) => DICT[key].en,
})

export function PosLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<PosLang>('en')

  // Hydrate from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'th' || saved === 'en') setLangState(saved)
    } catch { /* ignore */ }
  }, [])

  const setLang = (l: PosLang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
    window.dispatchEvent(new Event(POS_LANG_CHANGED_EVENT))
  }

  const t = (key: PosStringKey) => DICT[key][lang]

  return (
    <PosLangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </PosLangContext.Provider>
  )
}

export function usePosLang() {
  return useContext(PosLangContext)
}
