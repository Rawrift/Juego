// Service worker de RIFTFALL: el juego abre al instante y funciona sin conexión (modo práctica).
// - Archivos con hash (/assets/…): primero la caché (nunca cambian).
// - La página: primero la red (para recibir actualizaciones) y, sin red, la última versión guardada.
// - API, configuración del token y redes de blockchain: siempre la red, nunca la caché.
const CACHE = 'riftfall-v2';
const SHELL = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

/** Guarda la página y todos los archivos que carga (JS, CSS, fuentes) para jugar sin red. */
async function cacheShell() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const res = await fetch('/', { cache: 'no-store' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put('/', res);
  const assets = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])];
  await cache.addAll(assets);
}

self.addEventListener('install', (e) => {
  e.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function store(req, res) {
  if (res.ok) {
    const copy = res.clone(); // se copia antes de devolverla: una respuesta solo se puede leer una vez
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname === '/deployment.json') return;

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => store(req, res))));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => store('/', res))
        .catch(() => caches.match('/'))
    );
  }
});
