/* מעקב צמחים — Service Worker: שומר את קבצי האפליקציה לזמינות לא מקוונת */
const CACHE_NAME = 'plant-tracker-v36';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './img/hero.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // רק בקשות מקומיות של האפליקציה עצמה עוברות דרך המטמון.
  // קריאות חיצוניות (למשל זיהוי פלנטנט) עוברות ישירות לרשת.
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  const isDoc = url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (isDoc) {
      // מסמכים: רשת תחילה כדי שעדכונים יופיעו מיד; מטמון כגיבוי לאופליין.
      try {
        const response = await fetch(event.request);
        if (response && response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (e) {
        const cached = await cache.match(event.request);
        return cached || Response.error();
      }
    }
    // נכסים סטטיים: מטמון תחילה, רענון ברקע.
    const cached = await cache.match(event.request);
    const network = fetch(event.request).then((response) => {
      if (response && response.ok) cache.put(event.request, response.clone());
      return response;
    }).catch(() => cached);
    return cached || network;
  })());
});

/* התראות דחיפה — תזכורת בוקר */
self.addEventListener('push', (event) => {
  let title = 'מעקב צמחים 🌱';
  let body = 'יש טיפולים שמחכים לך היום';
  try{
    if(event.data){
      const d = event.data.json();
      if(d.title) title = d.title;
      if(d.body) body = d.body;
    }
  }catch(e){}
  event.waitUntil(
    self.registration.showNotification(title, { body, icon: 'icon.svg', badge: 'icon.svg', dir: 'rtl', lang: 'he' })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for(const c of clients){ if('focus' in c) return c.focus(); }
      return self.clients.openWindow('./');
    })
  );
});
