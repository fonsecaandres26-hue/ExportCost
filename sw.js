/* ExportCost · service worker.
   - La app (HTML, íconos) se guarda para abrir sin conexión.
   - Las páginas se piden primero a la red (así llegan las actualizaciones) con respaldo al guardado.
   - La TRM (datos.gov.co) NO se intercepta ni se guarda aquí: la app maneja su propio respaldo
     y así nunca se muestra una tasa vieja por error. */
const VERSION = 'b9908dfd70';
const SHELL = 'exportcost-shell-' + VERSION;
const FONTS = 'exportcost-fonts';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('exportcost-shell-') && k !== SHELL) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

// Red primero con tope de 3,5 s; si falla o tarda, usa lo guardado.
async function networkFirst(req) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3500);
  try {
    const res = await fetch(req, { signal: ctl.signal, cache: 'no-cache' });
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('./index.html', copy)); }
    return res;
  } catch (err) {
    const hit = await caches.match('./index.html');
    if (hit) return hit;
    throw err;
  } finally { clearTimeout(timer); }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'www.datos.gov.co') return; // TRM: siempre directo a la red
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
    e.respondWith(caches.match(req).then((m) => m || fetch(req)));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req));
  }
});
