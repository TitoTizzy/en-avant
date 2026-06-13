/* ==========================================================================
   EN AVANT — COMPTE À REBOURS (DAT Branche 3 §5)
   Le prochain événement est lu depuis Supabase via GET /api/events.
   Sans API ou sans événement à venir, la section reste masquée.
   ========================================================================== */

(() => {
  "use strict";

  const section = document.getElementById("agenda");
  if (!section) return;

  const els = {
    title: document.getElementById("cd-title"),
    meta: document.getElementById("cd-meta"),
    j: document.getElementById("cd-j"),
    h: document.getElementById("cd-h"),
    m: document.getElementById("cd-m"),
    s: document.getElementById("cd-s"),
  };

  const pad = (n) => String(Math.max(0, n)).padStart(2, "0");

  function start(event) {
    const target = new Date(event.date_cible).getTime();
    if (Number.isNaN(target)) return;

    els.title.textContent = event.titre;
    els.meta.textContent = [
      event.lieu,
      new Date(event.date_cible).toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      }),
    ].filter(Boolean).join(" · ");

    section.hidden = false;

    const tick = () => {
      const diff = target - Date.now();

      if (diff <= 0) {
        els.j.textContent = els.h.textContent = els.m.textContent = els.s.textContent = "00";
        els.meta.textContent = "C'est aujourd'hui !";
        clearInterval(timer);
        return;
      }

      els.j.textContent = pad(Math.floor(diff / 86400000));
      els.h.textContent = pad(Math.floor(diff / 3600000) % 24);
      els.m.textContent = pad(Math.floor(diff / 60000) % 60);
      els.s.textContent = pad(Math.floor(diff / 1000) % 60);
    };

    tick();
    const timer = setInterval(tick, 1000);
  }

  (async () => {
    try {
      const response = await fetch("/api/events", { signal: AbortSignal.timeout(4000) });
      const payload = await response.json();
      const next = payload.events?.[0];
      if (response.ok && next?.date_cible) start(next);
    } catch {
      /* API absente (ex. préviews statiques) : section masquée, aucune erreur. */
    }
  })();
})();
