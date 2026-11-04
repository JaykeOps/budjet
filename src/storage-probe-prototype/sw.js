// PROTOTYPE, throwaway. Exists only to find out whether Chrome on Android needs
// a service worker before it offers to install the storage probe. Caches nothing.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) =>
  event.respondWith(fetch(event.request)),
);
