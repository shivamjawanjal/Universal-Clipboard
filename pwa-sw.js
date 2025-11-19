const CACHE = 'universal-clipboard-v1';
const OFFLINE = [ '/', '/index.html', '/styles.css', '/app.js' ];
self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(OFFLINE)));
  self.skipWaiting();
});
self.addEventListener('activate', (e)=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e)=>{
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r=>r || fetch(e.request).then(resp=>{ caches.open(CACHE).then(c=>c.put(e.request, resp.clone())); return resp; })));
});