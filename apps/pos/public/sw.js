// Baze POS — minimal service worker.
//
// Purpose: make the web app installable as a PWA (Chrome/Android need a SW to
// offer the "Install app" prompt) and give a light offline shell. This is a
// LIVE POS backed by server API routes + Supabase, so we never cache API/auth
// responses — only static, same-origin GET assets, network-first.

const CACHE = 'baze-pos-v1'

self.addEventListener('install', () => {
  // Activate this worker as soon as it finishes installing.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GETs. Everything else (POST, API, cross-origin,
  // Supabase, auth) goes straight to the network untouched.
  const bypass =
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth')

  if (bypass) return

  // Network-first: always prefer fresh content; fall back to cache offline.
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request)
        // Cache successful basic responses for offline fallback.
        if (fresh && fresh.ok && fresh.type === 'basic') {
          const cache = await caches.open(CACHE)
          cache.put(request, fresh.clone())
        }
        return fresh
      } catch {
        const cached = await caches.match(request)
        if (cached) return cached
        // Last resort for a navigation: whatever shell we have cached.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/pos')
          if (shell) return shell
        }
        throw new Error('offline and not cached')
      }
    })()
  )
})
