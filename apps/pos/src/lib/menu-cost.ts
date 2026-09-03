// ─── Recipe costing ──────────────────────────────────────────────────────────
// Turn a menu item's tracked ingredients (inventory item + quantity per serving)
// into a per-serving cost, and from that suggest a sale price for a target food
// cost %. The maths reuses toStockQuantity() — the same conversion the stock
// deduction uses — so "cost" and "stock cut" always agree: an ingredient's
// per-serving cost is (stock units consumed) × (cost per stock unit).
//
// Example — Margarita = Tequila 50ml + Triple Sec 20ml + Lime 20ml + Syrup 15ml:
// each pour is converted into the bottle/each it's stocked in, multiplied by that
// item's purchase cost per bottle/each, and summed → the drink's cost. Feed that
// to suggestedPrice(cost, 30) and you get the price that keeps cost at 30% of sales.

import { toStockQuantity, type StockUnitInfo } from './units'

export type CostIngredient = { inventoryItemId: string; quantityPerServing: number; unit: string }
export type CostInventoryItem = StockUnitInfo & { id: string; costPerUnit?: number }

export type RecipeCost = {
  cost: number      // total per-serving cost in ฿ (of the priced ingredients)
  priced: number    // how many ingredients contributed a cost
  unpriced: number  // ingredients skipped — no cost-per-unit set on the inventory item
  hasAny: boolean   // the recipe has at least one ingredient
  complete: boolean // every ingredient had a usable cost (nothing skipped)
}

// Per-serving cost of a recipe. Ingredients whose inventory item has no
// cost_per_unit (or is missing) are skipped and counted in `unpriced`, so the
// UI can flag that the shown cost is only a partial total.
export function recipeCostPerServing(
  ingredients: CostIngredient[],
  inventory: CostInventoryItem[],
): RecipeCost {
  let cost = 0
  let priced = 0
  let unpriced = 0
  for (const ing of ingredients) {
    const inv = inventory.find(i => i.id === ing.inventoryItemId)
    const perUnit = inv?.costPerUnit
    if (!inv || perUnit == null || !(perUnit > 0)) { unpriced++; continue }
    const stockQty = toStockQuantity(ing.quantityPerServing || 0, ing.unit, inv)
    if (!Number.isFinite(stockQty) || stockQty < 0) { unpriced++; continue }
    cost += stockQty * perUnit
    priced++
  }
  return {
    cost,
    priced,
    unpriced,
    hasAny: ingredients.length > 0,
    complete: ingredients.length > 0 && unpriced === 0,
  }
}

// Suggested sale price so that cost / price = targetPct%. Rounded UP to the
// nearest `roundTo` baht (menus price in round numbers), so a ฿12.30 cost at 30%
// (raw ฿41) rounds to ฿45 with roundTo=5. roundTo=0 disables rounding.
export function suggestedPrice(cost: number, targetPct: number, roundTo = 5): number {
  if (!(cost > 0) || !(targetPct > 0)) return 0
  const raw = cost / (targetPct / 100)
  if (!(roundTo > 0)) return Math.round(raw)
  return Math.ceil(raw / roundTo) * roundTo
}
