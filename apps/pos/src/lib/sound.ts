// ─── Payment / alert sounds (synthesised, no asset files) ────────────────────
// Short chimes generated with the Web Audio API so there is nothing to bundle
// or fetch — works on the web and inside the Android WebView alike. Mobile
// browsers gate audio behind a user gesture, so call primeAudio() from the tap
// that starts the flow (the "verify slip" / "confirm payment" button); the
// success chime then plays when verification returns, still within that
// interaction. All calls are best-effort and never throw.

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    return ctx
  } catch {
    return null
  }
}

// Resume the AudioContext from within a user gesture so later programmatic
// plays (which are NOT gestures) are allowed. Safe to call repeatedly.
export function primeAudio(): void {
  const c = getCtx()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

// Play a sequence of notes: [frequencyHz, startSec, durationSec].
function playNotes(notes: [number, number, number][], type: OscillatorType = 'sine'): void {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  const t0 = c.currentTime
  for (const [freq, start, dur] of notes) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.value = freq
    // Soft attack + exponential release so it reads as a chime, not a beep.
    const startAt = t0 + start
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur)
    osc.connect(gain).connect(c.destination)
    osc.start(startAt)
    osc.stop(startAt + dur + 0.02)
  }
}

// Rising three-note chime (C5 → E5 → G5) — "payment received".
export function playPaymentSuccess(): void {
  playNotes([
    [523.25, 0.0,  0.16],
    [659.25, 0.12, 0.16],
    [783.99, 0.24, 0.34],
  ])
}

// Low two-note buzz — "verification failed / slip rejected".
export function playPaymentError(): void {
  playNotes([
    [311.13, 0.0,  0.18],
    [233.08, 0.16, 0.28],
  ], 'square')
}
