const CACHE_VERSION = 'baigong-pwa-v2026-12-sec-hardened';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// 核心页面入口兜底预缓存（所有拆分后的 JS/CSS 模块由下方 Network-First 运行时缓存自动接管）
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/driver.html',
  '/hq.html',
  '/mall.html',
  '/suppliers.html',
  '/join.html',
  '/platform.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((oldKey) => caches.delete(oldKey))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. 跳过跨域请求、Supabase 实时数据与 RPC 安全调用，确保账本/库存/核身永远实时
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/rpc/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/storage/')
  ) {
    return;
  }

  // 2. HTML 页面导航 & JS / CSS 源码：严格网络优先 (Network-First)
  const isDocument = req.mode === 'navigate' || req.destination === 'document' || url.pathname.endsWith('.html');
  const isCodeAsset = req.destination === 'script' || req.destination === 'style' || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isDocument || isCodeAsset) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            if (cached) return cached;
            if (isDocument) return caches.match('/index.html');
          });
        })
    );
    return;
  }

  // 3. 图片与字体资源：缓存优先 (Cache-First)
  if (req.destination === 'image' || req.destination === 'font') {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        });
      })
    );
  }
});
