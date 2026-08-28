import Link from 'next/link'
import { PLANS, TRIAL_DAYS, INTRO_MONTHLY } from '@/lib/plans'
import LandingGate from '@/components/LandingGate'

// Public marketing landing. This is where an affiliate's "ลิงก์ชวนร้าน"
// (…/?ref=CODE or …/signup?ref=CODE) can safely land: the ref is read here and
// carried into /signup so attribution survives. Logged-in staff never see this —
// the installed app (APK / PWA) boots straight to /pos.
export const dynamic = 'force-dynamic'

const pro = PLANS.pro
const free = PLANS.free

const HERO_POINTS = [
  { icon: '🧾', title: 'ขายหน้าร้าน + ใบเสร็จ', desc: 'จิ้มขายไว ปริ้นใบเสร็จผ่านเครื่องพิมพ์ Bluetooth' },
  { icon: '📱', title: 'QR ลูกค้าสั่งเอง', desc: 'ลูกค้าสแกนสั่งจากโต๊ะ ไม่ต้องเดินรับออเดอร์' },
  { icon: '🍳', title: 'จอครัว (KDS)', desc: 'ออเดอร์เด้งเข้าครัวทันที ไม่ตกหล่น' },
  { icon: '📦', title: 'สต็อก + เดลิเวอรี', desc: 'ตัดสต็อกอัตโนมัติ จัดการออเดอร์เดลิเวอรีในบอร์ดเดียว' },
]

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const { ref } = await searchParams
  const code = (ref ?? '').trim()
  const signupHref = code ? `/signup?ref=${encodeURIComponent(code)}` : '/signup'

  return (
    <LandingGate disabled={!!code}>
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <span className="font-black text-lg tracking-tight">🚀 BAZE<span className="text-amber-500"> POS</span></span>
        <Link href="/pos" className="text-sm text-gray-400 hover:text-white transition">เข้าสู่ระบบ</Link>
      </header>

      {/* hero */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 flex flex-col items-center text-center pt-10 pb-16">
        {code && (
          <p className="mb-5 text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-4 py-1.5">
            แนะนำโดยพาร์ทเนอร์ · โค้ด {code}
          </p>
        )}

        <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight max-w-2xl">
          ระบบขายหน้าร้าน<br />สำหรับร้านอาหาร &amp; บาร์
        </h1>
        <p className="mt-4 text-gray-400 text-base sm:text-lg max-w-xl">
          POS + QR สั่งเอง + จอครัว + สต็อก ครบในแอปเดียว
          ทดลองใช้ฟรี {TRIAL_DAYS} วัน ไม่ต้องใส่บัตร
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link href={signupHref}
            className="px-8 py-4 bg-amber-500 hover:bg-amber-400 rounded-2xl text-black font-black text-base transition-all active:scale-95 shadow-2xl shadow-amber-500/20">
            เปิดร้านฟรี {TRIAL_DAYS} วัน
          </Link>
          <Link href="/pos"
            className="px-8 py-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-2xl text-white font-semibold text-base transition-all active:scale-95">
            มีบัญชีแล้ว · เข้าสู่ระบบ
          </Link>
        </div>

        {/* features */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl text-left">
          {HERO_POINTS.map(f => (
            <div key={f.title} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex gap-4">
              <span className="text-3xl shrink-0">{f.icon}</span>
              <div>
                <p className="font-bold text-white text-sm">{f.title}</p>
                <p className="text-gray-400 text-[13px] mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* pricing */}
        <div className="mt-16 w-full max-w-3xl">
          <h2 className="text-2xl font-black">ราคาที่จับต้องได้</h2>
          <p className="text-gray-400 text-sm mt-1">เริ่มฟรี · อัปเกรดเมื่อพร้อม · ยกเลิกได้ทุกเมื่อ</p>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Free */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-left flex flex-col">
              <p className="font-black text-lg">{free.label}</p>
              <p className="mt-2"><span className="text-3xl font-black">฿0</span></p>
              <ul className="mt-4 space-y-2 text-sm text-gray-400 flex-1">
                {free.features.map(x => <li key={x}>✓ {x}</li>)}
              </ul>
            </div>
            {/* Pro */}
            <div className="bg-gray-900 border-2 border-amber-500 rounded-2xl p-6 text-left flex flex-col relative">
              <span className="absolute -top-3 left-6 text-[10px] font-black bg-amber-500 text-black px-3 py-1 rounded-full">แนะนำ</span>
              <p className="font-black text-lg">{pro.label}</p>
              <p className="mt-2">
                <span className="text-3xl font-black">฿{pro.monthly.toLocaleString()}</span>
                <span className="text-gray-400 text-sm">/เดือน</span>
              </p>
              <p className="text-[13px] text-amber-400 mt-1">
                เริ่มต้น ฿{INTRO_MONTHLY.price.toLocaleString()}/เดือน · {INTRO_MONTHLY.months} เดือนแรก
              </p>
              <p className="text-[12px] text-gray-500 mt-0.5">หรือรายปี ฿{pro.yearly.toLocaleString()}/ปี</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-300 flex-1">
                <li>✓ ทุกอย่างใน Free</li>
                {pro.features.map(x => <li key={x}>✓ {x}</li>)}
              </ul>
            </div>
          </div>
        </div>

        {/* bottom CTA */}
        <div className="mt-16">
          <Link href={signupHref}
            className="px-10 py-4 bg-amber-500 hover:bg-amber-400 rounded-2xl text-black font-black text-base transition-all active:scale-95 inline-block">
            เริ่มเปิดร้านเลย →
          </Link>
          <p className="text-gray-500 text-xs mt-3">ใช้ได้ทั้งบนมือถือ แท็บเล็ต และคอมพิวเตอร์</p>
        </div>
      </main>

      <footer className="w-full max-w-5xl mx-auto px-6 py-8 text-center text-gray-600 text-xs border-t border-gray-900">
        © PLOEN POS
      </footer>
    </div>
    </LandingGate>
  )
}
