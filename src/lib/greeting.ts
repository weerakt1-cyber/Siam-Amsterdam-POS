// ─── Thai time-of-day greeting + daily rotating quote ────────────────────────
// Used on the POS header: "อรุณสวัสดิ์ Siam Amsterdam !" + a daily power quote.

export function getThaiGreeting(d: Date = new Date()): { text: string; emoji: string } {
  const h = d.getHours()
  if (h >= 5 && h < 12)  return { text: 'อรุณสวัสดิ์',      emoji: '🌅' }
  if (h >= 12 && h < 16) return { text: 'สวัสดีตอนบ่าย',    emoji: '☀️' }
  if (h >= 16 && h < 19) return { text: 'สวัสดียามเย็น',    emoji: '🌇' }
  return { text: 'สวัสดียามค่ำคืน', emoji: '🌙' }
}

// 10 power quotes — rotated by day of year so each day shows a different one
export const DAILY_QUOTES: string[] = [
  'ความสำเร็จไม่ได้เกิดจากโชค แต่เกิดจากการลงมือทำทุกวัน',
  'วันนี้คือโอกาสใหม่ จงทำให้เต็มที่ที่สุด',
  'ทุกแก้วที่เสิร์ฟ คือรอยยิ้มที่ส่งต่อให้ลูกค้า',
  'อุปสรรคไม่ได้ขวางทาง มันคือบันไดสู่ความแข็งแกร่ง',
  'เหนื่อยได้ พักได้ แต่อย่าหยุดเดินตามความฝัน',
  'ทำวันนี้ให้ดีที่สุด แล้วพรุ่งนี้จะดีตามมาเอง',
  'พลังที่ยิ่งใหญ่ที่สุด คือใจที่ไม่ยอมแพ้',
  'รอยยิ้มของลูกค้า คือกำไรที่ประเมินค่าไม่ได้',
  'เส้นทางหมื่นลี้ เริ่มต้นจากก้าวแรกเสมอ',
  'จงภูมิใจในทุกก้าวเล็กๆ ที่เดินมาถึงวันนี้',
]

export function getDailyQuote(d: Date = new Date()): string {
  // Day-of-year index → same quote all day, changes at midnight
  const start = new Date(d.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / 86_400_000)
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length]
}
