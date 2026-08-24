// ─── Time-of-day greeting + daily rotating quote (TH / EN) ───────────────────
// Used on the POS header: "อรุณสวัสดิ์ Siam Amsterdam !" / "Good morning …" plus
// a daily power quote. Follows the POS language setting.

type Lang = 'th' | 'en'

const GREETINGS: Record<Lang, { morning: string; afternoon: string; evening: string; night: string }> = {
  th: { morning: 'อรุณสวัสดิ์', afternoon: 'สวัสดีตอนบ่าย', evening: 'สวัสดียามเย็น', night: 'สวัสดียามค่ำคืน' },
  en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good evening' },
}

// lang is first (optional) so existing no-arg calls keep working.
export function getThaiGreeting(lang: Lang = 'th', d: Date = new Date()): { text: string; emoji: string } {
  const g = GREETINGS[lang]
  const h = d.getHours()
  if (h >= 5 && h < 12)  return { text: g.morning,   emoji: '🌅' }
  if (h >= 12 && h < 16) return { text: g.afternoon, emoji: '☀️' }
  if (h >= 16 && h < 19) return { text: g.evening,   emoji: '🌇' }
  return { text: g.night, emoji: '🌙' }
}

// 10 power quotes — rotated by day of year so each day shows a different one.
export const DAILY_QUOTES: Record<Lang, string[]> = {
  th: [
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
  ],
  en: [
    "Success isn't luck — it's showing up every single day.",
    'Today is a fresh chance. Give it everything you have.',
    'Every glass served is a smile passed on to a guest.',
    "Obstacles don't block the way — they're the steps to strength.",
    'Rest if you must, but never stop chasing the dream.',
    'Do your best today, and tomorrow takes care of itself.',
    'The greatest power of all is a heart that never quits.',
    "A guest's smile is a profit you can't put a price on.",
    'A journey of a thousand miles always starts with one step.',
    'Be proud of every small step that brought you here.',
  ],
}

export function getDailyQuote(lang: Lang = 'th', d: Date = new Date()): string {
  // Day-of-year index → same quote all day, changes at midnight
  const start = new Date(d.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / 86_400_000)
  const list = DAILY_QUOTES[lang]
  return list[dayOfYear % list.length]
}
