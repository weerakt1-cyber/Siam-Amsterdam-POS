// Business-day boundaries for sales/cash reconciliation.
//
// Many bars trade past midnight, so a calendar day cuts a single night's bills
// into two — the closing cash count then never matches "today's" orders. A
// "business day" instead runs from a configurable cutoff time to the same cutoff
// the next day (e.g. 05:00 → orders from 05:00 today until 05:00 tomorrow all
// count as today's business day). Cutoff "00:00" = the plain local calendar day.
//
// The venue is in Thailand, so day boundaries are computed in Bangkok time
// (UTC+7). created_at is stored as UTC — these helpers convert between them.

const BKK_OFFSET_MIN = 7 * 60

// "HH:MM" → minutes past midnight (0–1439). Invalid/blank → 0.
export function cutoffMinutes(cutoff?: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((cutoff ?? '').trim())
  if (!m) return 0
  return Math.min(23, +m[1]) * 60 + Math.min(59, +m[2])
}

// The business-day date (YYYY-MM-DD, Bangkok) that a UTC instant belongs to.
export function businessDayOf(ts: Date | string | number, cutoff?: string): string {
  const cm = cutoffMinutes(cutoff)
  const shifted = new Date(new Date(ts).getTime() + BKK_OFFSET_MIN * 60000 - cm * 60000)
  return shifted.toISOString().slice(0, 10)
}

// UTC [start, end) ISO range covering the business day labelled `date`.
export function businessDayRange(date: string, cutoff?: string): { start: string; end: string } {
  const cm = cutoffMinutes(cutoff)
  // `date` 00:00 taken as a wall-clock, converted BKK→UTC, then shifted by cutoff.
  const startMs = new Date(`${date}T00:00:00Z`).getTime() - BKK_OFFSET_MIN * 60000 + cm * 60000
  return {
    start: new Date(startMs).toISOString(),
    end:   new Date(startMs + 24 * 3600000).toISOString(),
  }
}
