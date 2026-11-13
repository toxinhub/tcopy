const CACHE = "tcopy-shell-v91";
const SHELL = ["./", "./index.html", "./style.css?v=91", "./app.js?v=67", "./manifest.webmanifest", "./icon.svg"];
const SHARE_DB = "tcopy-share";
const SCOPE_PATH = new URL("./", self.location.href).pathname;
function storeIncoming(text) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains("incoming")) open.result.createObjectStore("incoming", { keyPath: "id", autoIncrement: true });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction("incoming", "readwrite");
      tx.objectStore("incoming").add({ text, receivedAt: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("tcopy-shell-") && key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method === "POST" && url.pathname === new URL("share/", self.registration.scope).pathname) {
    event.respondWith((async () => {
      try {
        const form = await request.formData();
        const content = [form.get("title"), form.get("text"), form.get("url")].filter(value => typeof value === "string" && value.trim()).join("\n");
        if (content) await storeIncoming(content);
        return Response.redirect(new URL("?shared=1", self.registration.scope), 303);
      } catch {
        return Response.redirect(new URL("?shared=1", self.registration.scope), 303);
      }
    })());
    return;
  }
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;
  const isDocument = request.mode === "navigate" || url.pathname.endsWith("/tcopy/") || url.pathname.endsWith("/tcopy/index.html");
  if (isDocument) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("./index.html"))));
    return;
  }
  if (/\.(css|js|webmanifest|svg)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => {
      const fresh = fetch(request).then(response => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
        return response;
      });
      return cached || fresh;
    }));
  }
});
