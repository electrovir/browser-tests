/**
 * Minimal service worker used only to test whether a service-worker registration persists across
 * sessions. It activates immediately so registration completes quickly; it does not intercept
 * fetches.
 */
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
