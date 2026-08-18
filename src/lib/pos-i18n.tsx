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
  saveServerFailed: { en: 'Saved on this device, but could not save to the server. Make sure you are signed in as an admin and try again.', th: 'บันทึกในเครื่องแล้ว แต่บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบว่าล็อกอินเป็นผู้ดูแล (admin) แล้วลองใหม่' },
  memberSignupTitle: { en: 'Member sign-up link', th: 'ลิงก์สมัครสมาชิก' },
  memberSignupDesc:  { en: 'Share this link or print the QR — customers register themselves as members (name + phone) to collect points.', th: 'แชร์ลิงก์นี้หรือพิมพ์ QR ให้ลูกค้าสมัครสมาชิกเอง (ชื่อ + เบอร์โทร) เพื่อสะสมแต้ม' },
  copyLink:    { en: 'Copy link', th: 'คัดลอกลิงก์' },
  linkCopied:  { en: 'Copied ✓', th: 'คัดลอกแล้ว ✓' },
  downloadQr:  { en: 'Download QR', th: 'ดาวน์โหลด QR' },
  qrAutoPrintLabel: { en: 'Auto-print QR orders on this device', th: 'ปริ้นออเดอร์ QR อัตโนมัติบนเครื่องนี้' },
  qrAutoPrintDesc:  { en: 'When a customer places a QR self-order, a ticket prints automatically on this device’s printer. Turn off if another tablet already prints.', th: 'เมื่อลูกค้าสั่งผ่าน QR ระบบจะปริ้นใบออเดอร์อัตโนมัติที่เครื่องพิมพ์ของเครื่องนี้ ปิดถ้ามีแท็บเล็ตอื่นปริ้นอยู่แล้ว' },
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
  cashOpeningCash: { en: 'Opening Cash',      th: 'เงินสดเปิดร้าน' },
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
  invManageCats:     { en: 'Manage categories', th: 'จัดการหมวดหมู่' },
  invCategories:     { en: 'Categories',      th: 'หมวดหมู่' },
  invNewCatPh:       { en: 'New category name', th: 'ชื่อหมวดหมู่ใหม่' },
  invAddCat:         { en: 'Add',             th: 'เพิ่ม' },
  invNoCats:         { en: 'No categories yet — add one below.', th: 'ยังไม่มีหมวดหมู่ — เพิ่มด้านล่าง' },
  invDone:           { en: 'Done',            th: 'เสร็จสิ้น' },

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

  // ── Settings: General ──
  setBizInfo:        { en: 'Business Information', th: 'ข้อมูลธุรกิจ' },
  setLogo:           { en: 'Logo',            th: 'โลโก้' },
  setBizName:        { en: 'Business Name',   th: 'ชื่อธุรกิจ' },
  setAddress:        { en: 'Address',         th: 'ที่อยู่' },
  setPhone:          { en: 'Phone',           th: 'เบอร์โทร' },
  setTaxId:          { en: 'Tax ID',          th: 'เลขผู้เสียภาษี' },
  setPromptPay:      { en: 'PromptPay',       th: 'พร้อมเพย์' },
  setGoogleReview:   { en: 'Google Review Link', th: 'ลิงก์รีวิว Google' },
  setSecurity:       { en: 'Security',        th: 'ความปลอดภัย' },
  setDisplayTimeLock:{ en: 'Display Time Lock', th: 'ล็อกหน้าจอตามเวลา' },
  setDisplayTimeLockDesc: { en: 'Re-request staff PIN after this much inactivity, instead of on every screen-off or app switch.', th: 'ขอรหัส PIN พนักงานใหม่หลังไม่มีการใช้งานตามเวลานี้ แทนที่จะขอทุกครั้งที่ปิดจอหรือสลับแอพ' },
  setRevenueTargetsDesc: { en: 'Set sales goals to get 🔔 alerts when you hit them (or get close). Leave 0 to disable.', th: 'ตั้งเป้ายอดขายเพื่อรับ 🔔 แจ้งเตือนเมื่อถึงเป้า (หรือใกล้ถึง) ใส่ 0 เพื่อปิด' },
  setRevenueTargets: { en: 'Revenue Targets', th: 'เป้าหมายรายได้' },
  setDailyTarget:    { en: 'Daily target',    th: 'เป้าหมายรายวัน' },
  setWeeklyTarget:   { en: 'Weekly target',   th: 'เป้าหมายรายสัปดาห์' },
  setMonthlyTarget:  { en: 'Monthly target',  th: 'เป้าหมายรายเดือน' },
  setOff:            { en: 'Off',             th: 'ปิด' },
  setMin:            { en: 'min',             th: 'นาที' },

  // ── Settings: Receipt & Printer ──
  setReceiptPrinter: { en: 'Receipt & Printer', th: 'ใบเสร็จและเครื่องพิมพ์' },
  setReceiptTemplate:{ en: 'Receipt Template', th: 'รูปแบบใบเสร็จ' },
  setFooterText:     { en: 'Footer Text',     th: 'ข้อความท้ายใบเสร็จ' },
  setPaperSize:      { en: 'Paper Size',      th: 'ขนาดกระดาษ' },
  setPrinterConn:    { en: 'Printer Connection', th: 'การเชื่อมต่อเครื่องพิมพ์' },
  setIpAddress:      { en: 'IP Address',      th: 'ที่อยู่ IP' },
  setPort:           { en: 'Port',            th: 'พอร์ต' },

  // ── Settings: Payment / integrations ──
  setOnlinePayment:  { en: 'Online Payment · Omise', th: 'ชำระออนไลน์ · Omise' },
  setPublishableKey: { en: 'Publishable key (pkey_…)', th: 'Publishable key (pkey_…)' },
  setGoogleSheets:   { en: 'Google Sheets Export', th: 'ส่งออก Google Sheets' },
  setAutoExport:     { en: 'Auto-export to Sheets', th: 'ส่งออกอัตโนมัติไป Sheets' },
  setSheetId:        { en: 'Sheet ID',        th: 'Sheet ID' },
  setChecking:       { en: 'Checking...',     th: 'กำลังตรวจสอบ...' },
  setNotConfigured:  { en: 'Not configured',  th: 'ยังไม่ได้ตั้งค่า' },
  setTelegram:       { en: 'Telegram Bot Notifications', th: 'แจ้งเตือนผ่าน Telegram Bot' },
  setChatId:         { en: 'Chat ID',         th: 'Chat ID' },
  setCheckingStatus: { en: 'Checking status...', th: 'กำลังตรวจสอบสถานะ...' },
  setLineNotify:     { en: 'LINE Notify',     th: 'LINE Notify' },
  setChannelToken:   { en: 'Channel Token',   th: 'Channel Token' },
  setTargetId:       { en: 'Target ID',       th: 'Target ID' },
  setMissingEnv:     { en: 'Missing env vars:', th: 'ขาดตัวแปร env:' },
  setQrOrdering:     { en: 'QR Self-Ordering', th: 'สั่งเองผ่าน QR' },
  setBaseUrl:        { en: 'Base URL',        th: 'Base URL' },
  setClickGenerate:  { en: 'Click Generate to create QR codes', th: 'กด Generate เพื่อสร้าง QR code' },
  setComingSoon:     { en: 'Coming next sprint', th: 'เร็วๆ นี้' },
  setGoogleAccount:  { en: 'Google Account',  th: 'บัญชี Google' },
  setApiKeys:        { en: 'API Keys',        th: 'คีย์ API' },
  setOutboundWebhooks:{ en: 'Outbound Webhooks', th: 'Webhook ขาออก' },
  setNoWebhooks:     { en: 'No webhooks configured', th: 'ยังไม่ได้ตั้งค่า webhook' },
  setAddEndpoint:    { en: 'Add Endpoint',    th: 'เพิ่ม Endpoint' },
  setApiReference:   { en: 'API Reference',   th: 'คู่มือ API' },
  setApiWebhooks:    { en: 'API & Webhooks',  th: 'API และ Webhooks' },
  setSystemIntegrations: { en: 'System & Integrations', th: 'ระบบและการเชื่อมต่อ' },
  setStop:           { en: 'Stop',            th: 'หยุด' },

  // ── Delivery settings (moved to Settings, manager-only) ──
  setDelivery:        { en: 'Delivery',          th: 'เดลิเวอรี่' },
  dsCommissionRates:  { en: 'Commission Rates',  th: 'อัตราค่าคอมมิชชั่น' },
  dsCommissionNote:   { en: 'Applied to new orders only — existing orders keep the rate at the time they were created.', th: 'ใช้กับออเดอร์ใหม่เท่านั้น — ออเดอร์เดิมยังคงอัตราเดิม ณ ตอนที่สร้าง' },
  dsGrabApi:          { en: 'GrabFood API (Phase 2)', th: 'GrabFood API (เฟส 2)' },
  dsConfigured:       { en: 'Configured',        th: 'ตั้งค่าแล้ว' },
  dsNotConfigured:    { en: 'Not configured',    th: 'ยังไม่ได้ตั้งค่า' },
  dsGrabNote:         { en: 'Requires GrabFood partner API access. Orders pushed by Grab appear on the delivery board automatically; Accept / Ready / Cancel are relayed back to Grab.', th: 'ต้องมีสิทธิ์เข้าใช้ GrabFood partner API ออเดอร์ที่ Grab ส่งมาจะขึ้นบนบอร์ดเดลิเวอรี่อัตโนมัติ และการรับ / พร้อม / ยกเลิก จะถูกส่งกลับไปที่ Grab' },
  dsClientId:         { en: 'Client ID',         th: 'Client ID' },
  dsClientSecret:     { en: 'Client Secret',     th: 'Client Secret' },
  dsMerchantId:       { en: 'Merchant ID',       th: 'Merchant ID' },
  dsWebhookSecret:    { en: 'Webhook Secret',    th: 'Webhook Secret' },
  dsSavedReplace:     { en: 'saved — type to replace', th: 'บันทึกแล้ว — พิมพ์เพื่อเปลี่ยน' },
  dsWebhookSecretHint:{ en: 'Webhook Secret (credential registered with Grab)', th: 'Webhook Secret (รหัสที่ลงทะเบียนกับ Grab)' },
  dsAutoAccept:       { en: 'Auto-accept incoming Grab orders', th: 'รับออเดอร์ Grab อัตโนมัติ' },
  dsWebhookRegister:  { en: 'Register this URL as your order webhook in the Grab partner portal.', th: 'ลงทะเบียน URL นี้เป็น order webhook ในพอร์ทัลพาร์ทเนอร์ Grab' },
  dsCopy:             { en: 'Copy',              th: 'คัดลอก' },
  dsCopied:           { en: 'Copied',            th: 'คัดลอกแล้ว' },
  dsSaving:           { en: 'Saving…',           th: 'กำลังบันทึก…' },

  // ── Item edit form ──
  fItemName:         { en: 'Name',            th: 'ชื่อ' },
  fItemNameTh:       { en: 'Thai Name',       th: 'ชื่อภาษาไทย' },
  fItemSku:          { en: 'SKU',             th: 'รหัสสินค้า (SKU)' },
  fItemDescription:  { en: 'Description',     th: 'รายละเอียด' },
  fItemCategory:     { en: 'Category',        th: 'หมวดหมู่' },
  fItemPrice:        { en: 'Price',           th: 'ราคา' },
  fItemCost:         { en: 'Cost',            th: 'ต้นทุน' },
  fItemUnit:         { en: 'Unit',            th: 'หน่วย' },
  fItemTax:          { en: 'Tax %',           th: 'ภาษี %' },
  fItemAvailable:    { en: 'Available',       th: 'พร้อมขาย' },
  fItemImage:        { en: 'Image',           th: 'รูปภาพ' },
  fItemVariants:     { en: 'Variants / Options', th: 'ตัวเลือก' },
  fItemIngredients:  { en: 'Recipe / Ingredients', th: 'สูตร / วัตถุดิบ' },
  fRequired:         { en: 'Required',        th: 'จำเป็น' },
  fSaveChanges:      { en: 'Save Changes',    th: 'บันทึกการเปลี่ยนแปลง' },
  fCreate:           { en: 'Create',          th: 'สร้าง' },
  fNameEn:           { en: 'Name (English) *', th: 'ชื่อ (อังกฤษ) *' },
  fNameThai:         { en: 'Name (Thai)',     th: 'ชื่อ (ไทย)' },
  fSkuBarcode:       { en: 'SKU / Barcode',   th: 'SKU / บาร์โค้ด' },
  fCategoryReq:      { en: 'Category *',      th: 'หมวดหมู่ *' },
  fSellingPrice:     { en: 'Selling Price (฿) *', th: 'ราคาขาย (฿) *' },
  fCostCogs:         { en: 'Cost / COGS (฿)', th: 'ต้นทุน / COGS (฿)' },
  fVatPct:           { en: 'VAT (%)',         th: 'VAT (%)' },
  fSelectionsVariants:{ en: 'Selections / Variants', th: 'ตัวเลือก / รูปแบบ' },
  fIngredients:      { en: 'Ingredients',     th: 'วัตถุดิบ' },
  fCategoryName:     { en: 'Category Name',   th: 'ชื่อหมวดหมู่' },
  fColor:            { en: 'Color',           th: 'สี' },

  // ── Member edit form ──
  fMemberFullName:   { en: 'Full Name *',     th: 'ชื่อ-นามสกุล *' },
  fMemberPhone:      { en: 'Phone',           th: 'เบอร์โทร' },
  fMemberContact:    { en: 'Contact (optional)', th: 'ช่องทางติดต่อ (ไม่บังคับ)' },
  fMemberContactHint:{ en: 'For sending promotions or birthday greetings', th: 'สำหรับส่งโปรโมชั่นหรืออวยพรวันเกิด' },
  fMemberBirthday:   { en: 'Birthday',        th: 'วันเกิด' },
  fMemberNotes:      { en: 'Notes',           th: 'หมายเหตุ' },

  // ── Inventory edit form ──
  fInvNameReq:       { en: 'Name *',          th: 'ชื่อ *' },
  fInvCategory:      { en: 'Category',        th: 'หมวดหมู่' },
  fInvUnit:          { en: 'Unit',            th: 'หน่วย' },
  fInvStock:         { en: 'Current Stock',   th: 'สต๊อกปัจจุบัน' },
  fInvThreshold:     { en: 'Alert Threshold', th: 'เกณฑ์แจ้งเตือน' },
  fInvCost:          { en: 'Cost per Unit (฿)', th: 'ต้นทุนต่อหน่วย (฿)' },
  fInvNotes:         { en: 'Notes',           th: 'หมายเหตุ' },

  // ── Coupon edit form ──
  fCouponCodeAuto:   { en: 'Coupon Code * (auto-uppercase)', th: 'รหัสคูปอง * (พิมพ์ใหญ่อัตโนมัติ)' },
  fCouponDisplayName:{ en: 'Display Name *',  th: 'ชื่อที่แสดง *' },
  fCouponTypeLabel:  { en: 'Type',            th: 'ประเภท' },
  fCouponMinOrder:   { en: 'Min Order (฿, 0 = none)', th: 'ยอดขั้นต่ำ (฿, 0 = ไม่มี)' },
  fCouponMaxUses:    { en: 'Max Uses (0 = unlimited)', th: 'ใช้ได้สูงสุด (0 = ไม่จำกัด)' },
  fCouponStartDate:  { en: 'Start Date (optional)', th: 'วันเริ่ม (ไม่บังคับ)' },
  fCouponEndDate:    { en: 'End Date (optional)', th: 'วันสิ้นสุด (ไม่บังคับ)' },
  fCouponDescription:{ en: 'Description (optional)', th: 'รายละเอียด (ไม่บังคับ)' },

  // ── Small common ──
  change:     { en: 'Change',       th: 'เปลี่ยน' },
  upload:     { en: 'Upload',       th: 'อัปโหลด' },
  savedBang:  { en: 'Saved!',       th: 'บันทึกแล้ว!' },
  saveChanges:{ en: 'Save Changes', th: 'บันทึกการเปลี่ยนแปลง' },

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

  // ── Settings · Payment (Omise) ──
  payAcceptDesc:   { en: 'Accept Card & PromptPay online via Omise.', th: 'รับชำระบัตร & พร้อมเพย์ออนไลน์ผ่าน Omise' },
  payLiveMode:     { en: 'LIVE MODE',   th: 'โหมดใช้งานจริง' },
  payTestMode:     { en: 'TEST MODE',   th: 'โหมดทดสอบ' },
  payEnvOverride:  { en: 'Keys are currently set from environment variables. Saving here will override them.', th: 'ตอนนี้คีย์มาจาก environment variables — บันทึกที่นี่จะเขียนทับ' },
  paySecretLabel:  { en: 'Secret key (skey_…)', th: 'Secret key (skey_…)' },
  paySecretSet:    { en: 'set', th: 'ตั้งแล้ว' },
  paySecretReplace:{ en: 'Enter a new key to replace', th: 'ใส่คีย์ใหม่เพื่อแทนที่' },
  paySecretStored: { en: 'The secret key is stored server-side and never shown again.', th: 'Secret key ถูกเก็บฝั่งเซิร์ฟเวอร์และจะไม่แสดงอีก' },
  paySaveKeys:     { en: 'Save Keys', th: 'บันทึกคีย์' },
  saving:          { en: 'Saving…', th: 'กำลังบันทึก…' },

  // ── Settings · Printer status ──
  setConnected:        { en: 'Connected', th: 'เชื่อมต่อแล้ว' },
  setNoPrinter:        { en: 'No printer configured', th: 'ยังไม่ได้ตั้งค่าเครื่องพิมพ์' },
  setScanToPair:       { en: 'Scan to find and pair a printer', th: 'สแกนเพื่อค้นหาและจับคู่เครื่องพิมพ์' },
  setReconnect:        { en: 'Reconnect', th: 'เชื่อมต่อใหม่' },
  setSavedTapReconnect:{ en: 'Saved · tap Reconnect', th: 'บันทึกแล้ว · แตะเชื่อมต่อใหม่' },
  setSaveReceipt:      { en: 'Save Receipt Settings', th: 'บันทึกตั้งค่าใบเสร็จ' },
  setSavedBang:        { en: 'Saved!', th: 'บันทึกแล้ว!' },
  setDisconnect:       { en: 'Disconnect', th: 'ตัดการเชื่อมต่อ' },
  setForget:           { en: 'Forget', th: 'ลืมเครื่อง' },

  // ── Settings · Integration status badges ──
  setConfigured:   { en: 'Configured', th: 'ตั้งค่าแล้ว' },
  setSetEnvVars:   { en: 'Set env vars', th: 'ตั้ง env vars' },
  setActive:       { en: 'Active', th: 'ใช้งานอยู่' },
  setPartial:      { en: 'Partial', th: 'บางส่วน' },
  setNotSet:       { en: 'Not set', th: 'ยังไม่ตั้งค่า' },

  // ── Settings · Receipt templates ──
  tplClassic:      { en: 'Classic', th: 'คลาสสิก' },
  tplClassicDesc:  { en: 'Monospace · Retro', th: 'โมโนสเปซ · เรโทร' },
  tplModern:       { en: 'Modern', th: 'โมเดิร์น' },
  tplModernDesc:   { en: 'Clean · Stylish', th: 'เรียบ · มีสไตล์' },
  tplMinimal:      { en: 'Minimal', th: 'มินิมอล' },
  tplMinimalDesc:  { en: 'Simple · Fast', th: 'เรียบง่าย · เร็ว' },

  // ── Settings · Toast / status messages ──
  toastNetworkError:   { en: 'Network error', th: 'เครือข่ายผิดพลาด' },
  toastConnectionFail: { en: 'Connection failed', th: 'เชื่อมต่อไม่สำเร็จ' },
  toastPrintFailed:    { en: 'Print failed', th: 'พิมพ์ไม่สำเร็จ' },
  toastFailedSend:     { en: 'Failed to send', th: 'ส่งไม่สำเร็จ' },
  toastSentTelegram:   { en: 'Sent! Check your Telegram 🎉', th: 'ส่งแล้ว! เช็ค Telegram ของคุณ 🎉' },
  toastSentLine:       { en: 'Sent! Check your LINE 🎉', th: 'ส่งแล้ว! เช็ค LINE ของคุณ 🎉' },
  toastDone:           { en: 'Done', th: 'สำเร็จ' },
  toastError:          { en: 'Error', th: 'ผิดพลาด' },

  // ── POS screen · check bill (customer pre-payment slip) ──
  cbCheckBill:     { en: 'CHECK BILL', th: 'ใบแจ้งยอด' },
  cbDate:          { en: 'Date', th: 'วันที่' },
  cbTable:         { en: 'Table', th: 'โต๊ะ' },
  cbMember:        { en: 'Member', th: 'สมาชิก' },
  cbSubtotal:      { en: 'Subtotal', th: 'ยอดรวม' },
  cbDiscount:      { en: 'Discount', th: 'ส่วนลด' },
  cbTotal:         { en: 'TOTAL', th: 'รวมสุทธิ' },
  cbVat:           { en: 'VAT 7% incl.', th: 'ภาษี 7% (รวมแล้ว)' },
  cbPleaseCheck:   { en: 'Please check before payment', th: 'กรุณาตรวจสอบก่อนชำระเงิน' },
  cbNotReceipt:    { en: 'NOT A RECEIPT', th: 'ไม่ใช่ใบเสร็จรับเงิน' },

  // ── POS screen · toasts & misc ──
  toastOrderVoided:    { en: 'Order voided', th: 'ยกเลิกออเดอร์แล้ว' },
  toastVoidFail:       { en: 'Failed to void order', th: 'ยกเลิกออเดอร์ไม่สำเร็จ' },
  toastInvalidCoupon:  { en: 'Invalid coupon', th: 'คูปองไม่ถูกต้อง' },
  toastValidateCouponFail: { en: 'Could not validate coupon', th: 'ตรวจสอบคูปองไม่สำเร็จ' },
  toastSaveOrderFail:  { en: 'Failed to save order', th: 'บันทึกออเดอร์ไม่สำเร็จ' },
  toastHoldBillFail:   { en: 'Hold bill failed', th: 'พักบิลไม่สำเร็จ' },
  toastNoTicket:       { en: 'No ticket selected', th: 'ยังไม่ได้เลือกบิล' },
  toastPaymentFail:    { en: 'Failed to process payment', th: 'ชำระเงินไม่สำเร็จ' },
  posAllTables:        { en: 'All Tables', th: 'ทุกโต๊ะ' },
  posThisTable:        { en: 'This Table', th: 'โต๊ะนี้' },
  posNoOrdersToday:    { en: 'No orders today', th: 'วันนี้ยังไม่มีออเดอร์' },
  posNoOrdersForTable: { en: 'No orders for', th: 'ยังไม่มีออเดอร์สำหรับ' },
  posTodaySuffix:      { en: 'today', th: 'วันนี้' },
  posNotAdded:         { en: 'not added', th: 'ยังไม่เพิ่ม' },
  posAllAdded:         { en: 'All added', th: 'เพิ่มครบแล้ว' },

  // ── Items page ──
  itCreateItem:      { en: 'Create Item', th: 'สร้างสินค้า' },
  itDeleting:        { en: 'Deleting...', th: 'กำลังลบ...' },
  itImageUploadFail: { en: 'Image upload failed', th: 'อัปโหลดรูปไม่สำเร็จ' },
  itNameRequired:    { en: 'Name is required', th: 'กรุณากรอกชื่อ' },
  itValidPrice:      { en: 'Valid price is required', th: 'กรุณากรอกราคาที่ถูกต้อง' },
  itChangesSaved:    { en: 'Changes saved', th: 'บันทึกการเปลี่ยนแปลงแล้ว' },
  itSaveFailed:      { en: 'Save failed', th: 'บันทึกไม่สำเร็จ' },
  itDeleteFailed:    { en: 'Delete failed', th: 'ลบไม่สำเร็จ' },
  itAnalysisFailed:  { en: 'Analysis failed', th: 'วิเคราะห์ไม่สำเร็จ' },
  itAnalyzeMenuFail: { en: 'Failed to analyze menu', th: 'วิเคราะห์เมนูไม่สำเร็จ' },
  itApplyPriceFail:  { en: 'Failed to apply price', th: 'ปรับราคาไม่สำเร็จ' },
  itNoMatchingItems: { en: 'No matching items', th: 'ไม่พบสินค้าที่ตรงกัน' },
  itAllInvAdded:     { en: 'All inventory items already added', th: 'เพิ่มวัตถุดิบครบทุกรายการแล้ว' },
  itApplyAll:        { en: 'Apply All', th: 'ใช้ทั้งหมด' },
  itAllApplied:      { en: 'All Applied', th: 'ใช้แล้วทั้งหมด' },
  itSearchNameSku:   { en: 'Search name, SKU...', th: 'ค้นหาชื่อ, SKU...' },

  // ── Members page ──
  memDeleted:      { en: 'Member deleted', th: 'ลบสมาชิกแล้ว' },
  memRewardRedeemed:{ en: 'Reward redeemed! Stamp card reset.', th: 'แลกรางวัลแล้ว! รีเซ็ตบัตรสะสมแสตมป์' },
  memNeed100:      { en: 'Need 100 points to redeem', th: 'ต้องมี 100 แต้มเพื่อแลก' },
  memSortAZ:       { en: 'A–Z', th: 'ก–ฮ' },
  memSortVisits:   { en: 'Visits', th: 'จำนวนครั้ง' },
  memSortSpend:    { en: 'Spend', th: 'ยอดใช้จ่าย' },
  memSortTier:     { en: 'Tier', th: 'ระดับ' },
  memNoResults:    { en: 'No results', th: 'ไม่พบผลลัพธ์' },
  memNoMembers:    { en: 'No members yet', th: 'ยังไม่มีสมาชิก' },
  memTotalVisits:  { en: 'Total Visits', th: 'จำนวนครั้งทั้งหมด' },
  memLifetimeSpend:{ en: 'Lifetime Spend', th: 'ยอดใช้จ่ายสะสม' },
  memAvgOrder:     { en: 'Avg Order', th: 'เฉลี่ยต่อออเดอร์' },
  memMemberInfo:   { en: 'Member Info', th: 'ข้อมูลสมาชิก' },
  memEditProfile:  { en: 'Edit Profile', th: 'แก้ไขข้อมูล' },
  memCreateMember: { en: 'Create Member', th: 'สร้างสมาชิก' },
  memSearchPh:     { en: '🔍 Search name, phone, or contact...', th: '🔍 ค้นหาชื่อ, เบอร์โทร, หรือช่องทางติดต่อ...' },
  memNamePh:       { en: 'Name...', th: 'ชื่อ...' },
  memContactPh:    { en: 'Email, LINE ID, Facebook...', th: 'อีเมล, LINE ID, Facebook...' },
  memNotesPh:      { en: 'Preferences, allergies, VIP notes...', th: 'ความชอบ, อาการแพ้, บันทึก VIP...' },

  // ── Analytics page (extra) ──
  anLastMonth:     { en: 'Last month', th: 'เดือนก่อน' },
  anWeeklyRevenue: { en: 'Weekly Revenue', th: 'รายได้รายสัปดาห์' },
  anByRevenue:     { en: 'By Revenue', th: 'ตามรายได้' },
  anByQty:         { en: 'By Qty', th: 'ตามจำนวน' },
  anMidnight:      { en: 'Midnight', th: 'เที่ยงคืน' },
  anNoon:          { en: 'Noon', th: 'เที่ยงวัน' },
  anDiscounts:     { en: 'Discounts', th: 'ส่วนลด' },
  anLoyaltyTier:   { en: 'Loyalty Tier Breakdown', th: 'สรุประดับสมาชิก' },

  // ── Shared ──
  cmDeleted:       { en: 'Deleted', th: 'ลบแล้ว' },

  // ── Coupons page ──
  cpRequired:      { en: 'Code, name, and value are required', th: 'ต้องกรอกรหัส, ชื่อ, และมูลค่า' },
  cpNoCoupons:     { en: 'No coupons', th: 'ไม่มีคูปอง' },
  cpUsage:         { en: 'Usage', th: 'การใช้งาน' },
  cpCodePh:        { en: 'e.g. HAPPY10', th: 'เช่น HAPPY10' },
  cpNamePh:        { en: 'e.g. Happy Hour Discount', th: 'เช่น ส่วนลด Happy Hour' },
  cpNotePh:        { en: 'Internal note...', th: 'บันทึกภายใน...' },
  cpEnterCodePh:   { en: 'Enter code...', th: 'กรอกรหัส...' },
  cpAmountPh:      { en: '฿ amount', th: '฿ จำนวน' },

  // ── Delivery page ──
  dlPlatformPh:    { en: 'Platform code (e.g. GF-1234)', th: 'รหัสแพลตฟอร์ม (เช่น GF-1234)' },
  dlNotePh:        { en: 'Note (optional)', th: 'หมายเหตุ (ไม่บังคับ)' },
  dlSearchMenuPh:  { en: '🔍 Search menu…', th: '🔍 ค้นหาเมนู…' },

  // ── Inventory page ──
  invNotePh:       { en: 'Note (optional)...', th: 'หมายเหตุ (ไม่บังคับ)...' },
  invNamePh:       { en: 'e.g. Rum (Bacardi)', th: 'เช่น รัม (Bacardi)' },
  invBrandPh:      { en: 'Brand, supplier notes...', th: 'ยี่ห้อ, บันทึกซัพพลายเออร์...' },

  // ── Floor page ──
  flTablePh:       { en: 'T7, VIP2, Gameroom…', th: 'T7, VIP2, Gameroom…' },

  // ── Users page ──
  usEnterName:     { en: 'Please enter a name', th: 'กรุณาใส่ชื่อ' },
  usPin4:          { en: 'Set a 4-digit PIN', th: 'กรุณาตั้ง PIN 4 หลัก' },
  usPinMismatch:   { en: 'PINs do not match', th: 'PIN ไม่ตรงกัน' },
  usCreated:       { en: 'User created ✓', th: 'สร้าง User สำเร็จ ✓' },
  usSavedOk:       { en: 'Saved ✓', th: 'บันทึกสำเร็จ ✓' },
  usPinChanged:    { en: 'PIN changed ✓', th: 'เปลี่ยน PIN สำเร็จ ✓' },
  usDeleted:       { en: 'User deleted', th: 'ลบ User แล้ว' },
  usNamePh:        { en: 'Staff name', th: 'ชื่อพนักงาน' },

  // ── Cash page (extra) ──
  cashNoCashIn:    { en: 'No cash in entries yet', th: 'ยังไม่มีรายการเงินเข้า' },
  cashNoExpenses:  { en: 'No expenses yet', th: 'ยังไม่มีค่าใช้จ่าย' },
  cashNoOrders:    { en: 'No orders for this date', th: 'ไม่มีออเดอร์ในวันนี้' },
  cashInAmount:    { en: 'Cash In Amount', th: 'จำนวนเงินเข้า' },
  cashExpenseAmount:{ en: 'Expense Amount', th: 'จำนวนค่าใช้จ่าย' },
  cashOrdersPaid:  { en: 'paid', th: 'ชำระแล้ว' },
  cashOrdersCount: { en: 'orders', th: 'ออเดอร์' },
  // Order detail modal
  cashOrderDetail: { en: 'Order Details', th: 'รายละเอียดบิล' },
  cashVoid:        { en: 'Void', th: 'ยกเลิกบิล' },
  cashVoided:      { en: 'Voided', th: 'ยกเลิกแล้ว' },
  cashConfirmVoid: { en: 'Void this order? This cannot be undone.', th: 'ยกเลิกบิลนี้? การกระทำนี้ย้อนกลับไม่ได้' },
  cashPrintReceipt:{ en: 'Print Receipt', th: 'พิมพ์ใบเสร็จ' },
  cashClose:       { en: 'Close', th: 'ปิด' },
  cashPrinting:    { en: 'Printing…', th: 'กำลังพิมพ์…' },

  // ── POS screen · drawer + print ──
  posOpenDrawerConfirm:{ en: 'Open the cash drawer?', th: 'เปิดลิ้นชักเก็บเงิน?' },
  posDrawerOpened:     { en: 'Cash drawer opened', th: 'เปิดลิ้นชักแล้ว' },
  posPrintCheckConn:   { en: 'Print failed — check the printer connection', th: 'พิมพ์ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อเครื่องพิมพ์' },

  // ── Notification bell (alerts) ──
  alertsTitle:      { en: 'Alerts', th: 'แจ้งเตือน' },
  alertsTooltip:    { en: 'Notifications & alerts', th: 'การแจ้งเตือน' },
  alertsToReview:   { en: 'to review', th: 'รอตรวจสอบ' },
  alertsAllClear:   { en: 'All clear — no alerts', th: 'เคลียร์หมด — ไม่มีแจ้งเตือน' },
  alertsHealthy:    { en: 'Stock, targets, and sales look healthy', th: 'สต๊อก เป้าหมาย และยอดขายปกติดี' },
  alertsAutoRefresh:{ en: 'Auto-refreshes every 90s', th: 'รีเฟรชอัตโนมัติทุก 90 วินาที' },
  alertsRefresh:    { en: 'Refresh', th: 'รีเฟรช' },
  posBillHeld:      { en: 'Bill held — sent to kitchen/bar ✓', th: 'พักบิลแล้ว — ส่งไปครัว/บาร์ ✓' },
  posHoldBillNetFail:{ en: 'Hold bill failed — network error', th: 'พักบิลไม่สำเร็จ — เครือข่ายผิดพลาด' },
  posEnterDrawerPin: { en: 'Enter drawer PIN', th: 'ใส่รหัสเปิดลิ้นชัก' },
  posWrongPin:       { en: 'Wrong PIN', th: 'รหัสไม่ถูกต้อง' },
  invLow:            { en: 'Low', th: 'ใกล้หมด' },
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
