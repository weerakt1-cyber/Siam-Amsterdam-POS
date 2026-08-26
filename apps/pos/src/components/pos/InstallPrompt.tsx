'use client'

import { useEffect, useState } from 'react'
import { usePosLang } from '@/lib/pos-i18n'
import { isNativePlatform } from '@/lib/printer'

// Chrome's beforeinstallprompt event (not in the standard TS lib).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pos_install_dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(/(crios|fxios)/i.test(navigator.userAgent))
}

// A small, dismissable "Install app" affordance for Owner / Manager / staff to
// add the POS to their home screen — a floating pill on Android (via the native
// install prompt) and an instruction sheet on iOS Safari (which has no prompt API).
export default function InstallPrompt() {
  const { t } = usePosLang()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [iosSheet, setIosSheet] = useState(false)

  useEffect(() => {
    // Never inside the installed native app, or when already installed.
    if (isNativePlatform() || isStandalone()) return
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return
    } catch { /* ignore */ }

    // Android / desktop Chrome: capture the install prompt.
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iOS Safari has no prompt event — offer manual instructions instead.
    if (isIos()) setShow(true)

    const onInstalled = () => setShow(false)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    setShow(false)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  async function install() {
    if (isIos()) { setIosSheet(true); return }
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    setShow(false)
    if (choice.outcome === 'dismissed') {
      try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    }
  }

  if (!show) return null

  return (
    <>
      {/* Floating install pill */}
      <div className="fixed z-40 bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 w-[min(92vw,26rem)]">
        <div className="flex items-center gap-3 bg-stone-900 text-white rounded-2xl shadow-2xl px-4 py-3 border border-white/10">
          <div className="text-2xl shrink-0">📲</div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight">{t('installTitle')}</p>
            <p className="text-xs text-white/60 leading-snug mt-0.5 truncate">{t('installDesc')}</p>
          </div>
          <button
            onClick={install}
            className="shrink-0 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-sm px-4 py-2 rounded-xl transition"
          >
            {t('installBtn')}
          </button>
          <button
            onClick={dismiss}
            aria-label={t('installLater')}
            className="shrink-0 w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center text-lg leading-none transition"
          >
            ✕
          </button>
        </div>
      </div>

      {/* iOS instruction sheet */}
      {iosSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setIosSheet(false)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md p-6 pb-8 flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg text-stone-900">{t('installIosTitle')}</h3>
              <button onClick={() => setIosSheet(false)} className="text-stone-400 hover:text-stone-800 text-xl leading-none">✕</button>
            </div>
            <ol className="flex flex-col gap-4">
              {[
                { icon: '⬆️', text: t('installIosStep1') },
                { icon: '➕', text: t('installIosStep2') },
                { icon: '✅', text: t('installIosStep3') },
              ].map((s, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="shrink-0 w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-black flex items-center justify-center">{i + 1}</span>
                  <span className="text-2xl shrink-0">{s.icon}</span>
                  <span className="text-sm text-stone-700 font-medium">{s.text}</span>
                </li>
              ))}
            </ol>
            <button
              onClick={() => { setIosSheet(false); dismiss() }}
              className="w-full h-12 bg-stone-900 text-white font-bold rounded-2xl transition active:scale-[0.98]"
            >
              {t('installClose')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
