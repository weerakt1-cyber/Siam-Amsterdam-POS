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
  setTabGeneral:      { en: 'General',           th: 'ทั่วไป' },
  setTabPrinter:      { en: 'Receipt & Printer', th: 'ใบเสร็จและเครื่องพิมพ์' },
  setTabQr:           { en: 'QR Ordering',       th: 'สั่งผ่าน QR' },
  setTabNotify:       { en: 'Notifications',     th: 'การแจ้งเตือน' },
  setTabPayment:      { en: 'Payment',           th: 'การชำระเงิน' },
  setTabIntegrations: { en: 'Integrations',      th: 'การเชื่อมต่อ' },

  // ── Kitchen ──
  kitchenDisplay:  { en: 'Kitchen Display',       th: 'จอครัว' },
  kdNew:           { en: 'new',                   th: 'ใหม่' },
  kdSaving:        { en: 'Saving...',             th: 'กำลังบันทึก...' },
  kdLastUpdate:    { en: 'Updated',               th: 'อัพเดตล่าสุด' },
  kdColNew:        { en: 'New Orders',            th: 'ออเดอร์ใหม่' },
  kdColPrep:       { en: 'In Progress',           th: 'กำลังทำ' },
  kdColReady:      { en: 'Ready',                 th: 'พร้อมเสิร์ฟ' },
  kdEmptyNew:      { en: 'No pending orders',     th: 'ไม่มีออเดอร์ใหม่' },
  kdEmptyPrep:     { en: 'Nothing being prepared', th: 'ไม่มีรายการที่กำลังทำ' },
  kdEmptyReady:    { en: 'Nothing ready yet',     th: 'ยังไม่มีรายการพร้อมเสิร์ฟ' },
  kdAccept:        { en: '▶ Accept',              th: '▶ รับออเดอร์' },
  kdReady:         { en: '✓ Ready',               th: '✓ พร้อมเสิร์ฟ' },
  kdServed:        { en: '✓ Served',              th: '✓ เสิร์ฟแล้ว' },

  // ── Common actions ──
  save:      { en: 'Save',    th: 'บันทึก' },
  cancel:    { en: 'Cancel',  th: 'ยกเลิก' },
  delete:    { en: 'Delete',  th: 'ลบ' },
  edit:      { en: 'Edit',    th: 'แก้ไข' },
  close:     { en: 'Close',   th: 'ปิด' },
  add:       { en: 'Add',     th: 'เพิ่ม' },
  confirm:   { en: 'Confirm', th: 'ยืนยัน' },
  search:    { en: 'Search',  th: 'ค้นหา' },
  loading:   { en: 'Loading...', th: 'กำลังโหลด...' },
  saved:     { en: 'Saved',   th: 'บันทึกแล้ว' },
  active:    { en: 'Active',  th: 'ใช้งาน' },
  inactive:  { en: 'Inactive', th: 'ปิดใช้งาน' },

  // ── Cash / drawer ──
  cashTitle:       { en: 'Cash Management',   th: 'จัดการเงินสด' },
  cashDrawer:      { en: 'Cash Drawer',       th: 'ลิ้นชักเงินสด' },
  cashInDrawer:    { en: 'Cash in Drawer',    th: 'เงินสดในลิ้นชัก' },
  cashOpening:     { en: 'Opening Balance',   th: 'ยอดยกมา' },
  cashSales:       { en: 'Cash Sales',        th: 'ยอดขายเงินสด' },
  cashPayIn:       { en: 'Pay In',            th: 'นำเงินเข้า' },
  cashPayOut:      { en: 'Pay Out',           th: 'นำเงินออก' },
  cashExpected:    { en: 'Expected',          th: 'ยอดที่ควรมี' },
  cashCounted:     { en: 'Counted',           th: 'ยอดที่นับได้' },
  cashDiff:        { en: 'Difference',        th: 'ส่วนต่าง' },
  cashOpenDrawer:  { en: 'Open Drawer',       th: 'เปิดลิ้นชัก' },
  cashCloseDrawer: { en: 'Close Drawer',      th: 'ปิดลิ้นชัก' },
  cashReason:      { en: 'Reason',            th: 'เหตุผล' },
  cashAmount:      { en: 'Amount',            th: 'จำนวนเงิน' },
  cashNoSession:   { en: 'No open drawer session', th: 'ยังไม่ได้เปิดลิ้นชัก' },
  cashToday:       { en: 'TODAY',             th: 'วันนี้' },
  cashGoToday:     { en: 'Go to Today',       th: 'ไปวันนี้' },
  cashOpeningCash: { en: 'Opening Cash',      th: 'เงินสดยกมา' },
  cashOrderRevenue:{ en: 'Order Revenue',     th: 'รายได้จากออเดอร์' },
  cashInLabel:     { en: 'Cash In',           th: 'เงินเข้า' },
  cashExpenses:    { en: 'Expenses',          th: 'ค่าใช้จ่าย' },
  cashClosing:     { en: 'Closing Balance',   th: 'ยอดปิด' },
  cashTapEdit:     { en: '✎ tap to edit',     th: '✎ แตะเพื่อแก้ไข' },
  cashAddCashIn:   { en: 'Add Cash In',       th: 'เพิ่มเงินเข้า' },
  cashAddExpense:  { en: 'Add Expense',       th: 'เพิ่มค่าใช้จ่าย' },
  cashOrders:      { en: 'Orders',            th: 'ออเดอร์' },

  // ── Coupons ──
  couponsTitle:    { en: 'Coupons',           th: 'คูปอง' },
  newCoupon:       { en: 'New Coupon',        th: 'คูปองใหม่' },
  couponCode:      { en: 'Code',              th: 'รหัสคูปอง' },
  couponName:      { en: 'Name',              th: 'ชื่อคูปอง' },
  couponType:      { en: 'Type',              th: 'ประเภท' },
  couponValue:     { en: 'Value',             th: 'มูลค่า' },
  couponPercent:   { en: 'Percent',           th: 'เปอร์เซ็นต์' },
  couponFixed:     { en: 'Fixed amount',      th: 'จำนวนคงที่' },
  couponUsed:      { en: 'Used',              th: 'ใช้ไปแล้ว' },
  couponTimes:     { en: 'times',             th: 'ครั้ง' },
  noCoupons:       { en: 'No coupons yet',    th: 'ยังไม่มีคูปอง' },

  // ── Users ──
  usersTitle:      { en: 'Users',             th: 'ผู้ใช้งาน' },
  newUser:         { en: 'New User',          th: 'เพิ่มผู้ใช้' },
  userName:        { en: 'Name',              th: 'ชื่อ' },
  userRole:        { en: 'Role',              th: 'ตำแหน่ง' },
  userPin:         { en: 'PIN',               th: 'รหัส PIN' },
  roleAdmin:       { en: 'Admin',             th: 'ผู้ดูแลระบบ' },
  roleManager:     { en: 'Manager',           th: 'ผู้จัดการ' },
  roleStaff:       { en: 'Staff',             th: 'พนักงาน' },
  noUsers:         { en: 'No users yet',      th: 'ยังไม่มีผู้ใช้งาน' },

  // ── Floor ──
  floorTitle:      { en: 'Floor Plan',        th: 'ผังโต๊ะ' },
  floorEdit:       { en: 'Edit Layout',       th: 'แก้ไขผัง' },
  floorDone:       { en: 'Done',              th: 'เสร็จสิ้น' },
  floorAddTable:   { en: 'Add Table',         th: 'เพิ่มโต๊ะ' },
  floorAvailable:  { en: 'Available',         th: 'ว่าง' },
  floorOccupied:   { en: 'Occupied',          th: 'มีลูกค้า' },
  floorEmpty:      { en: 'Empty',             th: 'ว่าง' },
  floorOrdered:    { en: 'Ordered',           th: 'สั่งแล้ว' },
  floorReadyTag:   { en: 'Ready',             th: 'พร้อมเสิร์ฟ' },
  floorResetDefault: { en: 'Reset Default',   th: 'รีเซ็ตค่าเริ่มต้น' },
  floorSaveLayout: { en: 'Save Layout',       th: 'บันทึกผัง' },
  floorEditing:    { en: 'Editing',           th: 'กำลังแก้ไข' },
  floorTablesDrag: { en: 'tables · drag to move', th: 'โต๊ะ · ลากเพื่อย้าย' },

  // ── Delivery ──
  deliveryTitle:   { en: 'Delivery',          th: 'เดลิเวอรี่' },
  newDelivery:     { en: 'New Order',         th: 'ออเดอร์ใหม่' },
  delNew:          { en: 'New',               th: 'ใหม่' },
  delPreparing:    { en: 'Preparing',         th: 'กำลังทำ' },
  delReady:        { en: 'Ready',             th: 'พร้อมส่ง' },
  delPickedUp:     { en: 'Picked up',         th: 'รับแล้ว' },
  delChannel:      { en: 'Channel',           th: 'ช่องทาง' },
  noDeliveries:    { en: 'No delivery orders', th: 'ไม่มีออเดอร์เดลิเวอรี่' },

  // ── Members ──
  registeredMembers: { en: 'registered members', th: 'สมาชิกที่ลงทะเบียน' },
  newMember:         { en: 'New Member',      th: 'เพิ่มสมาชิก' },
  memberPoints:      { en: 'points',          th: 'คะแนน' },
  searchMembers:     { en: 'Search members...', th: 'ค้นหาสมาชิก...' },

  // ── Inventory ──
  inventoryItems:    { en: 'menu items',      th: 'รายการ' },
  lowStock:          { en: 'Low Stock',       th: 'ใกล้หมด' },
  inStock:           { en: 'In Stock',        th: 'มีสินค้า' },
  searchInventory:   { en: 'Search items...', th: 'ค้นหาสินค้า...' },
  restock:           { en: 'Restock',         th: 'เติมสต๊อก' },
  invItemsStock:     { en: 'items · stock value', th: 'รายการ · มูลค่าสต๊อก' },
  invExportCSV:      { en: 'Export CSV',      th: 'ส่งออก CSV' },
  invAddItem:        { en: 'Add Item',        th: 'เพิ่มสินค้า' },
  invLowStockLabel:  { en: 'Low stock:',      th: 'ใกล้หมด:' },

  // ── Common: export / add generic ──
  exportCSV:  { en: 'Export CSV', th: 'ส่งออก CSV' },

  // ── Items ──
  menuItemsCount:    { en: 'menu items',      th: 'รายการเมนู' },
  newItem:           { en: 'New Item',        th: 'เพิ่มสินค้า' },
  tabItems:          { en: 'Menu Items',      th: 'รายการเมนู' },
  tabCategories:     { en: 'Categories',      th: 'หมวดหมู่' },
  itemsSelectHint:   { en: 'Select an item to edit, or create a new one', th: 'เลือกสินค้าเพื่อแก้ไข หรือสร้างใหม่' },

  // ── Coupons detail ──
  couponSelectHint:  { en: 'Select a coupon', th: 'เลือกคูปอง' },
  couponCreateHint:  { en: 'or create a new one', th: 'หรือสร้างใหม่' },

  // ── Delivery orders ──
  deliveryOrders:    { en: 'Delivery Orders', th: 'ออเดอร์เดลิเวอรี่' },

  // ── Checkout modal ──
  coOrderReview:   { en: 'Order Review',      th: 'ตรวจสอบออเดอร์' },
  coTable:         { en: 'Table',             th: 'โต๊ะ' },
  coSubtotal:      { en: 'Subtotal',          th: 'ยอดรวมย่อย' },
  coDiscount:      { en: 'Discount',          th: 'ส่วนลด' },
  coTotal:         { en: 'Total',             th: 'รวมทั้งหมด' },
  coVatIncluded:   { en: 'VAT 7% (included)', th: 'VAT 7% (รวมแล้ว)' },
  coMember:        { en: 'Member',            th: 'สมาชิก' },
  coStaff:         { en: 'Staff',             th: 'พนักงาน' },
  coPtsEarned:     { en: 'pts earned',        th: 'คะแนนที่ได้' },
  coPayment:       { en: 'Payment',           th: 'ชำระเงิน' },
  coBackToOrder:   { en: 'Back to order',     th: 'กลับไปที่ออเดอร์' },
  coAmountDue:     { en: 'Amount Due',        th: 'ยอดที่ต้องชำระ' },
  coCash:          { en: 'Cash',              th: 'เงินสด' },
  coEdcCard:       { en: 'EDC Card',          th: 'บัตร EDC' },
  coQrPay:         { en: 'QR Pay',            th: 'จ่ายผ่าน QR' },
  coOnlinePayment: { en: 'Online Payment · Powered by Omise', th: 'ชำระออนไลน์ · โดย Omise' },
  coCreditCard:    { en: 'Credit / Debit Card', th: 'บัตรเครดิต / เดบิต' },
  coPromptPayQr:   { en: 'PromptPay QR',      th: 'พร้อมเพย์ QR' },
  coCashReceived:  { en: 'Cash Received',     th: 'รับเงินมา' },
  coExact:         { en: 'Exact',             th: 'พอดี' },
  coChange:        { en: 'Change',            th: 'เงินทอน' },
  coProcessing:    { en: 'Processing...',     th: 'กำลังดำเนินการ...' },
  coConfirmPayment:{ en: '✓ Confirm Payment', th: '✓ ยืนยันการชำระเงิน' },
  coCardTerminal:  { en: 'Process on card terminal', th: 'ดำเนินการที่เครื่องรูดบัตร' },
  coGeneratingQr:  { en: 'Generating QR...',  th: 'กำลังสร้าง QR...' },
  coBack:          { en: 'Back',              th: 'กลับ' },

  // ── Coupons tabs ──
  tabCoupons:        { en: 'Coupons',         th: 'คูปอง' },
  tabPromotions:     { en: 'Promotions',      th: 'โปรโมชั่น' },
  searchCoupon:      { en: 'Search code or name...', th: 'ค้นหารหัสหรือชื่อ...' },
  filterAll:         { en: 'all',             th: 'ทั้งหมด' },
  filterActive:      { en: 'active',          th: 'ใช้งาน' },
  filterInactive:    { en: 'inactive',        th: 'ปิดใช้งาน' },
  filterExpired:     { en: 'expired',         th: 'หมดอายุ' },

  // ── Users detail ──
  usersSelectHint:   { en: 'Select a user or create a new one', th: 'เลือกผู้ใช้ หรือสร้างใหม่' },

  // ── Analytics ──
  anTitle:        { en: 'Analytics',          th: 'รายงาน' },
  anUpdated:      { en: 'updated',            th: 'อัพเดต' },
  anRefresh:      { en: 'Refresh',            th: 'รีเฟรช' },
  an7d:           { en: '7 Days',             th: '7 วัน' },
  an30d:          { en: '30 Days',            th: '30 วัน' },
  anMoM:          { en: 'MoM',                th: 'เทียบเดือน' },
  anAllTime:      { en: 'All Time',           th: 'ทั้งหมด' },
  anRevenue:      { en: 'Revenue',            th: 'รายได้' },
  anOrders:       { en: 'orders',             th: 'ออเดอร์' },
  anAvgOrder:     { en: 'Avg Order',          th: 'เฉลี่ยต่อบิล' },
  anPerTxn:       { en: 'per transaction',    th: 'ต่อรายการ' },
  anTodayRev:     { en: "Today's Rev",        th: 'รายได้วันนี้' },
  anOrdersMoM:    { en: 'Orders (MoM)',       th: 'ออเดอร์ (เทียบเดือน)' },
  anThisMonth:    { en: 'this month',         th: 'เดือนนี้' },
  anMemberOrders: { en: 'Member Orders',      th: 'ออเดอร์สมาชิก' },
  anOfTotal:      { en: 'of total',           th: 'ของทั้งหมด' },
  anTotalSaved:   { en: 'Total Saved',        th: 'ส่วนลดรวม' },
  anTopItems:     { en: 'Top Items',          th: 'สินค้าขายดี' },
  anThisMonthSuffix: { en: 'This Month',      th: 'เดือนนี้' },
  anPaymentMethods: { en: 'Payment Methods',  th: 'วิธีชำระเงิน' },
  anOrderSources: { en: 'Order Sources',      th: 'ช่องทางการสั่ง' },
  anRevByCategory:{ en: 'Revenue by Category', th: 'รายได้ตามหมวดหมู่' },
  anRevTrend14:   { en: 'Revenue Trend — Last 14 Days', th: 'แนวโน้มรายได้ — 14 วันล่าสุด' },
  anPeakHours:    { en: 'Peak Hours — Orders by Hour', th: 'ชั่วโมงเร่งด่วน — ออเดอร์ตามชั่วโมง' },
  anNoData:       { en: 'No data',            th: 'ไม่มีข้อมูล' },
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
