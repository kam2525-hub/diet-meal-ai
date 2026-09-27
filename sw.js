// MealAI - Self-destruct Service Worker to prevent caching bugs during development
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});

// Always fetch directly from network without cache
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
