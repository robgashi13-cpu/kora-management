// PWA service worker registration + iOS install helpers
// Skips registration inside Lovable preview iframes to avoid stale caches.

export function registerPWA() {
  if (typeof window === 'undefined') return;

  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const host = window.location.hostname;
  const isPreviewHost =
    host.includes('id-preview--') ||
    host.includes('lovableproject.com') ||
    host.includes('lovable.app') && host.includes('preview');

  if (isInIframe || isPreviewHost) {
    // Clean up any prior SW in preview to avoid serving stale builds
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      }).catch(() => {});
    }
    return;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[PWA] SW registration failed:', err);
      });
    });
  }
}
