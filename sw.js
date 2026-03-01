// ============================================================
//  Nexus Portal - Service Worker
//  Versi: 1.0.0
// ============================================================

const CACHE_NAME = 'nexus-portal-v1';
const STATIC_CACHE = 'nexus-static-v1';
const DYNAMIC_CACHE = 'nexus-dynamic-v1';

// File utama yang di-cache saat install
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // Icons
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  // Google Fonts (akan dicache saat pertama kali dimuat)
];

// ============================================================
//  INSTALL - Cache static assets
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[Nexus SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[Nexus SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      console.log('[Nexus SW] Install complete');
      return self.skipWaiting(); // Aktifkan SW langsung tanpa reload
    })
  );
});

// ============================================================
//  ACTIVATE - Hapus cache lama
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[Nexus SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map((name) => {
            console.log('[Nexus SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[Nexus SW] Activated & clients claimed');
      return self.clients.claim(); // Ambil alih semua tab tanpa reload
    })
  );
});

// ============================================================
//  FETCH - Strategi Cache
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension dan request lain yang tidak relevan
  if (!url.protocol.startsWith('http')) return;

  // Strategi untuk Google Fonts (Cache First)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Strategi untuk file lokal (Cache First, fallback Network)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Strategi untuk resource eksternal lainnya (Network First)
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ============================================================
//  Strategi: Cache First
//  - Cek cache dulu, kalau ada langsung return
//  - Kalau tidak ada, ambil dari network lalu simpan ke cache
// ============================================================
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Return offline fallback jika ada
    return offlineFallback(request);
  }
}

// ============================================================
//  Strategi: Network First
//  - Coba ambil dari network
//  - Kalau gagal (offline), ambil dari cache
// ============================================================
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineFallback(request);
  }
}

// ============================================================
//  Offline Fallback
// ============================================================
async function offlineFallback(request) {
  if (request.destination === 'document') {
    const cache = await caches.open(STATIC_CACHE);
    return cache.match('./index.html');
  }
  // Untuk gambar, bisa return placeholder jika ada
  return new Response('', { status: 408, statusText: 'Offline' });
}

// ============================================================
//  MESSAGE - Handle pesan dari halaman utama
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.source.postMessage({
      type: 'VERSION',
      version: CACHE_NAME
    });
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      return Promise.all(names.map((name) => caches.delete(name)));
    }).then(() => {
      event.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});
