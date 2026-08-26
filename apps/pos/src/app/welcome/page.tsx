'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Post-signup landing: the store already exists (created by /signup). This page
// tells the new owner how to get the app on their device — install as a home-
// screen app (PWA) for daily use, or download the Android APK when they need the
// Bluetooth thermal printer — then sends them into /pos.
const APK_URL = (process.env.NEXT_PUBLIC_APK_URL || '').trim()

type InstallPrompt = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> }

export default function WelcomePage() {
  const router = useRouter()
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent))
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallPrompt) }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!deferred) return
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <p className="text-5xl mb-3">🎉</p>
          <h1 className="text-2xl font-black tracking-tight">ร้านของคุณพร้อมแล้ว!</h1>
          <p className="text-gray-400 text-sm mt-1">ติดตั้งแอปลงเครื่องเพื่อใช้งานสะดวกขึ้น</p>
        </div>

        {/* Install as home-screen app (PWA) */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <p className="font-bold text-sm">ติดตั้งลงหน้าจอ (แนะนำ)</p>
          </div>

          {installed ? (
            <p className="text-emerald-400 text-sm">✓ ติดตั้งแล้ว เปิดจากไอคอนบนหน้าจอได้เลย</p>
          ) : deferred ? (
            <button onClick={install}
              className="w-full px-4 py-3 bg-white hover:bg-gray-100 rounded-xl text-gray-900 font-semibold text-sm transition-all active:scale-95">
              เพิ่มลงหน้าจอ
            </button>
          ) : isIOS ? (
            <p className="text-gray-400 text-[13px] leading-relaxed">
              บน iPhone/iPad: กดปุ่ม <span className="text-white font-semibold">แชร์</span> ⎋
              แล้วเลือก <span className="text-white font-semibold">เพิ่มไปยังหน้าจอโฮม</span>
            </p>
          ) : (
            <p className="text-gray-400 text-[13px] leading-relaxed">
              เปิดเมนูเบราว์เซอร์ (⋮) แล้วเลือก <span className="text-white font-semibold">ติดตั้งแอป</span> หรือ
              <span className="text-white font-semibold"> เพิ่มลงหน้าจอหลัก</span>
            </p>
          )}
        </div>

        {/* Android APK (for the Bluetooth printer) */}
        {APK_URL && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🖨️</span>
              <p className="font-bold text-sm">ใช้เครื่องพิมพ์ Bluetooth?</p>
            </div>
            <p className="text-gray-400 text-[13px] leading-relaxed">
              ดาวน์โหลดแอป Android (APK) เพื่อเชื่อมต่อเครื่องพิมพ์ใบเสร็จผ่าน Bluetooth
            </p>
            <a href={APK_URL}
              className="w-full text-center px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-white font-semibold text-sm transition-all active:scale-95">
              ดาวน์โหลดแอป Android
            </a>
          </div>
        )}

        <button onClick={() => router.replace('/pos')}
          className="w-full px-4 py-3.5 bg-amber-500 hover:bg-amber-400 rounded-xl text-black font-black text-sm transition-all active:scale-95">
          เข้าใช้งานเลย →
        </button>
      </div>
    </div>
  )
}
