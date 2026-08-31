// ─── Units & unit conversion ──────────────────────────────────────────────────
// Central place for the measurement units the POS understands, their bilingual
// labels, and the conversion maths that lets a recipe consume stock in a
// *different* unit than the one the item is stocked in.
//
// Why this exists: a bar buys Rum by the bottle (700 ml) but pours a cocktail in
// ml — 30, 40, 50, 60 ml per drink. To deduct stock correctly we must convert
// the recipe's "50 ml" into the item's stock unit ("bottle") using the bottle's
// content size (700 ml). Mass works the same way (a 1 kg bag used 20 g at a
// time). See toStockQuantity() below — it is the single source of truth used by
// both the UI preview and the server-side deduction (order-payment.ts).

import type { PosLang } from '@/lib/pos-i18n'

// Bilingual label for every unit the app offers. The stored value is always the
// English key (data + CSV export stay stable); only the display is localised.
export const UNIT_LABELS: Record<string, { en: string; th: string }> = {
  // ── Fine measures — for precise ML / G level tracking ──
  ml:      { en: 'ml',      th: 'มล.' },
  cl:      { en: 'cl',      th: 'ซล.' },
  liter:   { en: 'Liter',   th: 'ลิตร' },
  g:       { en: 'g',       th: 'ก.' },
  kg:      { en: 'Kg',      th: 'กก.' },
  // ── Whole containers / counts ──
  bottle:  { en: 'Bottle',  th: 'ขวด' },
  can:     { en: 'Can',     th: 'กระป๋อง' },
  shot:    { en: 'Shot',    th: 'ช็อต' },
  glass:   { en: 'Glass',   th: 'แก้ว' },
  pcs:     { en: 'Pcs',     th: 'ชิ้น' },
  portion: { en: 'Portion', th: 'ที่' },
  bag:     { en: 'Bag',     th: 'ถุง' },
  box:     { en: 'Box',     th: 'กล่อง' },
}

// Every unit key, in display order.
export const UNITS = Object.keys(UNIT_LABELS)

// Units that represent a precise physical measure (ml / g etc). These are the
// good choices for a recipe that pours or weighs (Rum 50 ml, Sugar 20 g).
export const MEASURE_UNITS = ['ml', 'cl', 'liter', 'g', 'kg']

export function unitLabel(unit: string, lang: PosLang): string {
  return UNIT_LABELS[unit]?.[lang] ?? unit
}

// ─── Conversion tables ─────────────────────────────────────────────────────────
// Each measurement unit maps to a physical dimension and a factor to the
// dimension's base unit (ml for volume, g for mass). Container / count units
// (bottle, can, pcs, …) have no intrinsic measure and are absent here.
type Dimension = 'volume' | 'mass'
const MEASURE: Record<string, { dim: Dimension; toBase: number }> = {
  ml:    { dim: 'volume', toBase: 1 },
  cl:    { dim: 'volume', toBase: 10 },
  liter: { dim: 'volume', toBase: 1000 },
  g:     { dim: 'mass',   toBase: 1 },
  kg:    { dim: 'mass',   toBase: 1000 },
}

// 'volume' | 'mass' for a fine measure, otherwise 'count' (a container / piece).
export function unitDimension(unit: string): Dimension | 'count' {
  return MEASURE[unit]?.dim ?? 'count'
}

// Convert a quantity between two units of the SAME physical dimension.
// Returns null when the units aren't directly convertible (different dimension,
// or one of them is a count/container unit).
export function convertMeasure(qty: number, from: string, to: string): number | null {
  if (from === to) return qty
  const f = MEASURE[from]
  const t = MEASURE[to]
  if (!f || !t || f.dim !== t.dim) return null
  return (qty * f.toBase) / t.toBase
}

// Shape of the inventory data needed to convert into stock units.
export type StockUnitInfo = {
  unit: string             // the unit the item's stock is counted in
  contentAmount?: number   // how much `contentUnit` is inside one stock unit
  contentUnit?: string     // the measure a container holds (e.g. 700 ml / bottle)
}

// Convert a recipe quantity (given in `recipeUnit`) into the number of the
// item's *stock units* to deduct. This is the heart of accurate stock cutting.
//
// Resolution order:
//   1. Same unit as stock                         → use as-is.
//   2. Both are the same fine dimension            → direct measure conversion
//      (recipe ml ↔ stock liter, recipe g ↔ kg).
//   3. Recipe is a fine measure and the stock unit
//      is a container with a known content size    → convert the recipe amount
//      into the container's content measure, then divide by the content size
//      (50 ml ÷ 700 ml/bottle = 0.0714 bottle).
//   4. No known conversion                         → fall back to the raw number
//      (legacy behaviour: treat recipe unit == stock unit). Never throws.
export function toStockQuantity(qty: number, recipeUnit: string, inv: StockUnitInfo): number {
  if (recipeUnit === inv.unit) return qty

  const direct = convertMeasure(qty, recipeUnit, inv.unit)
  if (direct != null) return direct

  if (inv.contentUnit && inv.contentAmount && inv.contentAmount > 0) {
    const inContent = convertMeasure(qty, recipeUnit, inv.contentUnit)
    if (inContent != null) return inContent / inv.contentAmount
  }

  return qty
}

// True when a recipe quantity in `recipeUnit` can be converted into the item's
// stock unit without falling back to the raw-number assumption. Used by the UI
// to warn when a chosen unit won't cut stock correctly.
export function canConvert(recipeUnit: string, inv: StockUnitInfo): boolean {
  if (recipeUnit === inv.unit) return true
  if (convertMeasure(1, recipeUnit, inv.unit) != null) return true
  if (inv.contentUnit && inv.contentAmount && inv.contentAmount > 0) {
    return convertMeasure(1, recipeUnit, inv.contentUnit) != null
  }
  return false
}
