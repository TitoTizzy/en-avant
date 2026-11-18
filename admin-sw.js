/* Service worker des notifications push du tableau de bord En Avant.
   Rôle unique : afficher les notifications et ouvrir l'admin au clic.
   Aucun cache, aucune interception des requêtes. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data?.text() }; }
  const title = data.title || "En Avant — tableau de bord";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/pictures/logo/logo.png",
    badge: "/pictures/logo/logo.png",
    tag: data.tag || "enavant-admin",
    renotify: true,
    data: { url: data.url || "/admin.html" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/admin.html", self.location.origin);
  if (target.origin !== self.location.origin) return; // jamais d'ouverture hors du site
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const admin = windows.find((w) => new URL(w.url).pathname.startsWith("/admin"));
    if (admin) {
      await admin.navigate(target.href).catch(() => {});
      return admin.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
