// Keeps what you have opened so the site works offline. Pages and scripts are fetched fresh when you are online.
const CACHE = 'obs-loot-map-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const put = (req, res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(u.pathname)) {          // pictures: cache first
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => put(r, res))));
    return;
  }
  e.respondWith(fetch(r).then(res => put(r, res)).catch(() => caches.match(r).then(hit => hit || caches.match(r.mode === 'navigate' ? './' : r))));
});
