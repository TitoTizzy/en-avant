/* ==========================================================================
   EN AVANT — POPUP VIDÉO DU SITE VITRINE
   Réglage piloté depuis l'admin (Paramètres → Popup vidéo, table site_settings).
   · Vidéo TikTok (lecteur officiel) ou MP4 hébergé sur Supabase Storage.
   · S'affiche une seule fois par visiteur et par vidéo (nouvelle vidéo = nouvel affichage).
   · Fermeture : bouton ×, touche Échap ou clic à côté. Aucun cookie, aucun traceur.
   ========================================================================== */

(() => {
  "use strict";

  const env = window.EA_ENV || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return;
  if (window.matchMedia?.("print").matches) return;

  const DELAY_MS = 3500;
  const seenKey = (url) => `ea_popup_video_vu:${url}`;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
  };

  /** Source lisible par la popup (lecteur TikTok ou MP4 Supabase), sinon null. */
  function videoSource(url) {
    const tiktok = String(url || "").match(/^https:\/\/(?:www\.|m\.)?tiktok\.com\/@[\w.-]+\/video\/(\d{8,25})/i);
    if (tiktok) {
      const params = "autoplay=1&music_info=0&description=0&rel=0&closed_caption=1&progress_bar=1";
      return { kind: "tiktok", src: `https://www.tiktok.com/player/v1/${tiktok[1]}?${params}`, page: url };
    }
    if (/^https:\/\/[\w.-]+\/storage\/v1\/object\/public\/.+\.(mp4|webm|mov)(\?.*)?$/i.test(url)) {
      return { kind: "file", src: url };
    }
    return null;
  }

  async function loadSetting() {
    const endpoint = `${env.SUPABASE_URL}/rest/v1/site_settings?select=value&key=eq.popup_video`;
    const response = await fetch(endpoint, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
    });
    if (!response.ok) return null;
    const rows = await response.json();
    return rows?.[0]?.value || null;
  }

  function el(tag, attrs = {}, text = "") {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text) node.textContent = text;
    return node;
  }

  function open(setting, source) {
    const previousFocus = document.activeElement;
    const overlay = el("div", { class: "ea-vpop", role: "dialog", "aria-modal": "true", "aria-labelledby": "ea-vpop-title" });
    const card = el("div", { class: "ea-vpop-card" });
    const close = el("button", { class: "ea-vpop-close", type: "button", "aria-label": "Fermer la vidéo" });
    close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';

    const frame = el("div", { class: "ea-vpop-frame" });
    if (source.kind === "tiktok") {
      frame.appendChild(el("iframe", {
        src: source.src,
        title: setting.headline || "Vidéo En Avant",
        allow: "autoplay; encrypted-media; fullscreen; picture-in-picture",
        allowfullscreen: "",
        referrerpolicy: "strict-origin-when-cross-origin",
      }));
    } else {
      const video = el("video", { src: source.src, controls: "", autoplay: "", playsinline: "", muted: "", preload: "metadata" });
      video.muted = true;
      frame.appendChild(video);
    }

    const body = el("div", { class: "ea-vpop-body" });
    body.appendChild(el("h2", { id: "ea-vpop-title" }, setting.headline || "En Avant — Pour changer Haïti ensemble"));
    if (setting.subtext) body.appendChild(el("p", {}, setting.subtext));
    const actions = el("div", { class: "ea-vpop-actions" });
    actions.appendChild(el("a", { href: "/adherer", class: "btn btn-primary" }, "Rejoindre le mouvement"));
    if (source.page) actions.appendChild(el("a", { href: source.page, class: "btn btn-ghost", target: "_blank", rel: "noopener" }, "Voir sur TikTok"));
    body.appendChild(actions);

    card.append(close, frame, body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.classList.add("ea-vpop-open");
    requestAnimationFrame(() => overlay.classList.add("is-visible"));
    close.focus();

    const dismiss = () => {
      overlay.classList.remove("is-visible");
      document.body.classList.remove("ea-vpop-open");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => overlay.remove(), 250); // retire aussi le lecteur (arrête le son)
      if (previousFocus?.focus) previousFocus.focus();
    };
    const onKey = (event) => {
      if (event.key === "Escape") dismiss();
      if (event.key === "Tab") { // garde le focus dans la fenêtre
        const items = [...card.querySelectorAll("button, a, iframe, video")];
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    close.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) dismiss(); });
    document.addEventListener("keydown", onKey);
  }

  async function start() {
    try {
      const setting = await loadSetting();
      if (!setting?.enabled || !setting.url) return;
      const source = videoSource(setting.url);
      if (!source || store.get(seenKey(setting.url))) return;
      setTimeout(() => {
        if (document.querySelector(".ea-vpop")) return;
        store.set(seenKey(setting.url), new Date().toISOString());
        open(setting, source);
      }, DELAY_MS);
    } catch { /* popup facultative : silencieux */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
