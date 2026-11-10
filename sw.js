/* Bailleul Super Bon Plan : cache de l'application + notifications de la version web. */
var VERSION = 'bonplan-6.5.0';
var PHOTOS = 'bonplan-photos';
var FICHIERS = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'demo.js', 'vendor/qrcode.js', 'manifest.webmanifest',
  'fonts/bricolage-grotesque-latin-400-normal.woff2', 'fonts/bricolage-grotesque-latin-600-normal.woff2', 'fonts/bricolage-grotesque-latin-800-normal.woff2',
  'icones/icone-192.png', 'icones/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FICHIERS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k !== VERSION && k !== PHOTOS; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Photos des articles : gardées sur le téléphone, affichées instantanément à la visite suivante
  if (e.request.method === 'GET' && (url.hostname === 'lh3.googleusercontent.com' || (url.hostname === 'drive.google.com' && url.pathname === '/thumbnail'))) {
    e.respondWith(caches.open(PHOTOS).then(function (c) {
      return c.match(e.request).then(function (enCache) {
        if (enCache) return enCache;
        return fetch(e.request).then(function (r) {
          if (r && (r.ok || r.type === 'opaque')) { c.put(e.request, r.clone()); c.keys().then(function (k) { if (k.length > 400) k.slice(0, k.length - 400).forEach(function (x) { c.delete(x); }); }); }
          return r;
        });
      });
    }));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // moteur Google et Firebase : jamais en cache ici
  if (url.pathname.indexOf('/donnees/') >= 0) return; // copie du catalogue : toujours la plus récente
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (enCache) {
      var reseau = fetch(e.request).then(function (r) { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(function () { return enCache; });
      return enCache || reseau;
    });
  }));
});

// ----- Notifications (envoyées par le moteur via Firebase Cloud Messaging) -----
self.addEventListener('push', function (e) {
  var m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { notification: { title: 'Bailleul Super Bon Plan', body: e.data ? e.data.text() : '' } }; }
  var n = m.notification || {}, data = m.data || {};
  var lien = (m.fcmOptions && m.fcmOptions.link) || n.click_action || (m.webpush && m.webpush.fcm_options && m.webpush.fcm_options.link) || './';
  e.waitUntil(self.registration.showNotification(n.title || 'Bailleul Super Bon Plan', {
    body: n.body || '', icon: n.icon || 'icones/icone-192.png', badge: 'icones/icone-192.png', data: { lien: lien, ouvrir: data }, tag: data.type || undefined
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var d = e.notification.data || {};
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (fenetres) {
    var f = fenetres[0];
    if (f) { f.postMessage({ ouvrir: d.ouvrir }); return f.focus(); }
    return self.clients.openWindow(d.lien || './');
  }));
});
