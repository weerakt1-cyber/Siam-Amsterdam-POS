// Client-side daily report PDF using jsPDF (browser only)
// Note: built-in Helvetica font doesn't support the Thai ฿ glyph —
// amounts are formatted as "B.<number>" (Baht abbreviation).

import jsPDF from 'jspdf'
import type { DailyReport, Order } from '@/lib/types'

// ─── Page geometry ────────────────────────────────────────────────────────────

const PW  = 210       // A4 width  (mm)
const PH  = 297       // A4 height (mm)
const MAR = 14        // left / right margin
const CW  = PW - MAR * 2   // content width = 182mm

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function fmtAmt(n: number): string {
  return 'B.' + Math.round(n).toLocaleString('en-US')
}

function fmtDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Bar settings from localStorage ──────────────────────────────────────────

type StoredSettings = { barName?: string; address?: string }

function readBarSettings(): { barName: string; address: string } {
  try {
    const raw = typeof window !== 'undefined'
      ? localStorage.getItem('pos_bar_settings')
      : null
    const obj = raw ? (JSON.parse(raw) as StoredSettings) : {}
    return {
      barName: obj.barName ?? 'SIAM AMSTERDAM',
      address: obj.address ?? '',
    }
  } catch {
    return { barName: 'SIAM AMSTERDAM', address: '' }
  }
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

function sectionBar(doc: jsPDF, title: string, y: number): void {
  doc.setFillColor(254, 243, 199)     // amber-100
  doc.rect(MAR, y, CW, 6.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(146, 64, 14)       // amber-800
  doc.text(title.toUpperCase(), MAR + 3, y + 4.6)
}

type Col = { label: string; width: number; right?: boolean }

function drawTable(doc: jsPDF, cols: Col[], rows: string[][], y: number): number {
  const ROW_H  = 6
  const totalW = cols.reduce((s, c) => s + c.width, 0)

  // Header
  doc.setFillColor(246, 246, 246)
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.2)
  doc.rect(MAR, y, totalW, ROW_H, 'FD')

  let cx = MAR + 2
  for (const col of cols) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(90, 90, 90)
    col.right
      ? doc.text(col.label, cx + col.width - 3, y + 4.2, { align: 'right' })
      : doc.text(col.label, cx, y + 4.2)
    cx += col.width
  }
  y += ROW_H

  // Rows
  rows.forEach((row, ri) => {
    if (ri % 2 === 0) {
      doc.setFillColor(252, 252, 252)
      doc.rect(MAR, y, totalW, ROW_H, 'F')
    }
    doc.setDrawColor(235, 235, 235)
    doc.setLineWidth(0.15)
    doc.line(MAR, y + ROW_H, MAR + totalW, y + ROW_H)

    cx = MAR + 2
    cols.forEach((col, i) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(40, 40, 40)
      const cell = row[i] ?? ''
      col.right
        ? doc.text(cell, cx + col.width - 3, y + 4.2, { align: 'right' })
        : doc.text(cell, cx, y + 4.2)
      cx += col.width
    })
    y += ROW_H
  })

  return y + 3
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function generateDailyReportPDF(
  date:   string,
  report: DailyReport,
  orders: Order[],
): void {
  const doc      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const settings = readBarSettings()

  const paidOrders   = orders.filter(o => o.status === 'paid')
  const orderRevenue = paidOrders.reduce((s, o) => s + o.total, 0)
  const cashInTotal  = report.cashIns.reduce((s, e) => s + e.amount, 0)
  const expenseTotal = report.expenses.reduce((s, e) => s + e.amount, 0)
  const closing      = report.openingCash + cashInTotal + orderRevenue - expenseTotal

  let y = MAR

  // ── Page header ──────────────────────────────────────────────────────────────

  // Accent bar (amber strip at top)
  doc.setFillColor(251, 191, 36)    // amber-400
  doc.rect(0, 0, PW, 3, 'F')

  y += 4

  // Title (left)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(20, 20, 20)
  doc.text('Daily Report', MAR, y + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(110, 110, 110)
  doc.text(fmtDate(date), MAR, y + 15)

  // Business name + address (right)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text(settings.barName, PW - MAR, y + 8, { align: 'right' })

  if (settings.address) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(130, 130, 130)
    doc.text(settings.address, PW - MAR, y + 14, { align: 'right' })
  }

  y += 21

  // Divider
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.4)
  doc.line(MAR, y, PW - MAR, y)
  y += 7

  // ── Cash Summary ─────────────────────────────────────────────────────────────

  sectionBar(doc, 'Cash Summary', y)
  y += 9

  const BOX_W = (CW - 4 * 2) / 5
  const summaryItems = [
    { label: 'Opening',       value: fmtAmt(report.openingCash), r: 60,  g: 60,  b: 60  },
    { label: 'Order Revenue', value: fmtAmt(orderRevenue),       r: 5,   g: 150, b: 105 },
    { label: 'Cash In',       value: fmtAmt(cashInTotal),        r: 37,  g: 99,  b: 235 },
    { label: 'Expenses',      value: fmtAmt(expenseTotal),       r: 220, g: 38,  b: 38  },
    {
      label: 'Closing',
      value: fmtAmt(closing),
      r: closing >= 0 ? 161 : 220,
      g: closing >= 0 ? 120 : 38,
      b: closing >= 0 ? 20  : 38,
    },
  ] as const

  summaryItems.forEach((item, i) => {
    const bx = MAR + i * (BOX_W + 2)
    doc.setFillColor(252, 252, 252)
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.3)
    doc.roundedRect(bx, y, BOX_W, 17, 2, 2, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(item.r, item.g, item.b)
    doc.text(item.value, bx + BOX_W / 2, y + 8, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(140, 140, 140)
    doc.text(item.label, bx + BOX_W / 2, y + 13.5, { align: 'center' })
  })
  y += 21

  // ── Cash In ───────────────────────────────────────────────────────────────────

  if (report.cashIns.length > 0) {
    sectionBar(doc, `Cash In  —  ${report.cashIns.length} entr${report.cashIns.length === 1 ? 'y' : 'ies'}`, y)
    y += 8

    y = drawTable(doc, [
      { label: 'Note',   width: 112 },
      { label: 'Time',   width: 30  },
      { label: 'Amount', width: 40, right: true },
    ], report.cashIns.map(e => [e.note || '-', fmtTime(e.createdAt), fmtAmt(e.amount)]), y)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(37, 99, 235)
    doc.text(`Cash In Total:  ${fmtAmt(cashInTotal)}`, PW - MAR, y, { align: 'right' })
    y += 8
  }

  // ── Expenses by category ─────────────────────────────────────────────────────

  sectionBar(doc, `Expenses  —  ${report.expenses.length} entr${report.expenses.length === 1 ? 'y' : 'ies'}`, y)
  y += 8

  if (report.expenses.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(190, 190, 190)
    doc.text('No expenses recorded', MAR + CW / 2, y + 5, { align: 'center' })
    y += 13
  } else {
    const catMap: Record<string, { total: number; count: number }> = {}
    for (const e of report.expenses) {
      if (!catMap[e.category]) catMap[e.category] = { total: 0, count: 0 }
      catMap[e.category].total += e.amount
      catMap[e.category].count++
    }

    y = drawTable(doc, [
      { label: 'Category', width: 110 },
      { label: 'Entries',  width: 32  },
      { label: 'Total',    width: 40, right: true },
    ], Object.entries(catMap)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([cat, d]) => [capitalize(cat), String(d.count), fmtAmt(d.total)]),
      y)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(220, 38, 38)
    doc.text(`Expenses Total:  ${fmtAmt(expenseTotal)}`, PW - MAR, y, { align: 'right' })
    y += 8
  }

  // ── Orders summary ────────────────────────────────────────────────────────────

  sectionBar(doc, `Orders Summary  —  ${paidOrders.length} paid order${paidOrders.length === 1 ? '' : 's'}`, y)
  y += 8

  const avgOrder = paidOrders.length > 0 ? Math.round(orderRevenue / paidOrders.length) : 0
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(60, 60, 60)
  doc.text(
    `Revenue: ${fmtAmt(orderRevenue)}     Orders: ${paidOrders.length}     Avg: ${fmtAmt(avgOrder)}`,
    MAR, y,
  )
  y += 6

  const payMap: Record<string, number> = {}
  for (const o of paidOrders) {
    const m = o.paymentMethod ?? 'cash'
    payMap[m] = (payMap[m] ?? 0) + o.total
  }

  const PAY_LABELS: Record<string, string> = {
    cash: 'Cash', card: 'Credit / Debit Card', promptpay: 'QR PromptPay',
  }

  if (Object.keys(payMap).length > 0) {
    y = drawTable(doc, [
      { label: 'Payment Method', width: 142 },
      { label: 'Revenue',        width: 40, right: true },
    ], Object.entries(payMap)
      .sort((a, b) => b[1] - a[1])
      .map(([m, rev]) => [PAY_LABELS[m] ?? capitalize(m), fmtAmt(rev)]),
      y)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(5, 150, 105)
    doc.text(`Total Revenue:  ${fmtAmt(orderRevenue)}`, PW - MAR, y, { align: 'right' })
    y += 8
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(190, 190, 190)
    doc.text('No paid orders for this date', MAR + CW / 2, y + 5, { align: 'center' })
    y += 13
  }

  // ── Footer ────────────────────────────────────────────────────────────────────

  doc.setDrawColor(210, 210, 210)
  doc.setLineWidth(0.4)
  doc.line(MAR, PH - 14, PW - MAR, PH - 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(170, 170, 170)
  doc.text('Generated by SIAM AMSTERDAM POS', MAR, PH - 9)

  const genTime = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  doc.text(genTime, PW - MAR, PH - 9, { align: 'right' })

  doc.save(`SIAM-AMSTERDAM-report-${date}.pdf`)
}
