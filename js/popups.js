/* ==========================================================================
   EN AVANT — VIDÉO D'ACCUEIL (intro plein écran dans un téléphone)
   Chargé dans le <head> (sans defer) : masque le site dès le premier rendu
   tant que la vidéo d'accueil doit être montrée, puis l'affiche dans une
   maquette de téléphone. Le visiteur entre ensuite sur le site.

   Réglage : Admin → Paramètres → Popup vidéo (table site_settings, lecture publique).
   · Vidéo TikTok (lecteur officiel) ou MP4 hébergé sur Supabase Storage.
   · Une seule fois par visiteur et par vidéo (nouvelle vidéo = nouvel accueil).
   · Aucun cookie, aucun traceur : seulement le stockage local du navigateur.
   ========================================================================== */

(() => {
  "use strict";

  const html = document.documentElement;
  const CFG_KEY = "ea_intro_video_cfg";       // dernier réglage connu (évite d'attendre le réseau)
  const seenKey = (url) => `ea_popup_video_vu:${url}`;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
  };
  const readCfg = () => { try { return JSON.parse(store.get(CFG_KEY) || "null"); } catch { return null; } };

  // 1. Dès le <head> : faut-il cacher le site en attendant la vidéo ?
  //    Premier passage (réglage inconnu) ou vidéo connue pas encore vue.
  const cached = readCfg();
  const mustHide = !cached || (cached.enabled && cached.url && !store.get(seenKey(cached.url)));
  if (mustHide) html.classList.add("ea-intro-pending");
  const reveal = () => html.classList.remove("ea-intro-pending");
  // Filet de sécurité : jamais plus de 3 s d'écran d'attente si le réseau est lent.
  const safety = setTimeout(reveal, 3000);

  /** Source lisible (lecteur TikTok ou MP4 Supabase), sinon null. */
  function videoSource(url) {
    const tiktok = String(url || "").match(/^https:\/\/(?:www\.|m\.)?tiktok\.com\/@[\w.-]+\/video\/(\d{8,25})/i);
    if (tiktok) {
      const params = "autoplay=1&music_info=0&description=0&rel=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=0&timestamp=0";
      return { kind: "tiktok", src: `https://www.tiktok.com/player/v1/${tiktok[1]}?${params}`, page: url };
    }
    if (/^https:\/\/[\w.-]+\/storage\/v1\/object\/public\/.+\.(mp4|webm|mov)(\?.*)?$/i.test(url)) {
      return { kind: "file", src: url };
    }
    return null;
  }

  async function loadSetting(env) {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/site_settings?select=value&key=eq.popup_video`, {
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
    const overlay = el("div", { class: "ea-intro", role: "dialog", "aria-modal": "true", "aria-labelledby": "ea-intro-title" });

    const skip = el("button", { class: "ea-intro-skip", type: "button" });
    skip.innerHTML = 'Entrer sur le site <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';

    // Maquette de téléphone
    const phone = el("div", { class: "ea-phone" });
    phone.appendChild(el("span", { class: "ea-phone-island", "aria-hidden": "true" }));
    const screen = el("div", { class: "ea-phone-screen" });
    if (source.kind === "tiktok") {
      screen.appendChild(el("iframe", {
        src: source.src,
        title: setting.headline || "Vidéo En Avant",
        allow: "autoplay; encrypted-media; picture-in-picture",
        referrerpolicy: "strict-origin-when-cross-origin",
      }));
    } else {
      const video = el("video", { src: source.src, controls: "", autoplay: "", playsinline: "", muted: "", preload: "auto" });
      video.muted = true;
      screen.appendChild(video);
    }
    phone.appendChild(screen);

    const text = el("div", { class: "ea-intro-text" });
    text.appendChild(el("img", { src: "/pictures/logo/logo.png", alt: "En Avant", class: "ea-intro-logo", width: "180", height: "66" }));
    text.appendChild(el("h1", { id: "ea-intro-title" }, setting.headline || "En Avant — Pour changer Haïti ensemble"));
    if (setting.subtext) text.appendChild(el("p", {}, setting.subtext));
    const actions = el("div", { class: "ea-intro-actions" });
    const enter = el("button", { class: "btn btn-primary btn-lg", type: "button" }, "Découvrir le site");
    actions.appendChild(enter);
    actions.appendChild(el("a", { href: "/adherer", class: "btn btn-ghost btn-lg" }, "Rejoindre le mouvement"));
    text.appendChild(actions);

    overlay.append(skip, phone, text);
    document.body.appendChild(overlay);
    document.body.classList.add("ea-intro-open");
    reveal(); // le site existe derrière, mais l'intro opaque le recouvre
    requestAnimationFrame(() => overlay.classList.add("is-visible"));
    enter.focus({ preventScroll: true });

    const dismiss = () => {
      overlay.classList.add("is-leaving");
      document.body.classList.remove("ea-intro-open");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => overlay.remove(), 450); // retire aussi le lecteur (arrête le son)
    };
    const onKey = (event) => {
      if (event.key === "Escape") dismiss();
      if (event.key === "Tab") {
        const items = [...overlay.querySelectorAll("button, a, iframe, video")];
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    skip.addEventListener("click", dismiss);
    enter.addEventListener("click", dismiss);
    document.addEventListener("keydown", onKey);
  }

  // 2. Après le chargement du HTML : lit le réglage (env.js est en bas de page).
  async function start() {
    const env = window.EA_ENV || {};
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error("config");
      const setting = await loadSetting(env);
      store.set(CFG_KEY, JSON.stringify({ enabled: Boolean(setting?.enabled), url: setting?.url || "" }));
      const source = setting?.enabled && setting.url ? videoSource(setting.url) : null;
      if (!source || store.get(seenKey(setting.url))) { clearTimeout(safety); reveal(); return; }
      store.set(seenKey(setting.url), new Date().toISOString());
      clearTimeout(safety);
      open(setting, source);
    } catch {
      clearTimeout(safety);
      reveal();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
