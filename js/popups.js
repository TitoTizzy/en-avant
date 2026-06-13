/* ==========================================================================
   EN AVANT — MODULES POPUP (vitrine publique)
   1) Popup vidéo « TikTok » 9:16 — au premier arrivage (1× par session)
   2) Popup soutien Grenadiers (Coupe du Monde 2026) — récurrent, couleurs d'Haïti

   · Réglages lus depuis Supabase `site_settings` (anon key, lecture publique).
   · 100 % autonome : injecte son CSS + son DOM. Aucune clé secrète ici.
   · Activation / désactivation depuis le Dashboard SuperAdmin → Paramètres.
   ========================================================================== */
(() => {
  "use strict";

  // Couleurs officielles du drapeau haïtien
  const HT_BLUE = "#00209F";
  const HT_RED  = "#D21034";

  /* ─── Lecture des réglages (PostgREST direct, zéro fonction serverless) ── */
  async function loadSettings() {
    const env = window.EA_ENV || {};
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return {};
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/site_settings?select=key,value`,
        {
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (!res.ok) return {};
      const rows = await res.json();
      const map = {};
      for (const row of rows) map[row.key] = row.value;
      return map;
    } catch {
      return {};
    }
  }

  /* ─── Styles (injectés une seule fois) ─────────────────────────────── */
  function injectStyles() {
    if (document.getElementById("ea-popups-style")) return;
    const css = `
      .ea-pop-video-overlay{
        position:fixed; inset:0; z-index:10060;
        display:flex; align-items:center; justify-content:center;
        padding:max(18px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom));
        background:rgba(3,7,18,.82); backdrop-filter:blur(14px) saturate(120%);
        opacity:0; visibility:hidden; transition:opacity .45s ease, visibility .45s ease;
      }
      .ea-pop-video-overlay.is-open{ opacity:1; visibility:visible; }

      .ea-pop-video-frame{
        position:relative; aspect-ratio:9/16;
        height:min(86vh, 760px); max-width:94vw;
        border-radius:26px; overflow:hidden;
        background:#05060a;
        /* liseré drapeau : bleu → blanc → rouge */
        box-shadow:0 0 0 3px rgba(255,255,255,.06),
                   0 24px 80px rgba(0,0,0,.6),
                   0 0 60px rgba(0,32,159,.25);
        transform:translateY(26px) scale(.96); opacity:0;
        transition:transform .55s cubic-bezier(.22,1,.36,1), opacity .55s ease;
      }
      .ea-pop-video-overlay.is-open .ea-pop-video-frame{ transform:none; opacity:1; }
      .ea-pop-video-frame::before{
        content:""; position:absolute; inset:0; padding:3px; border-radius:26px;
        background:linear-gradient(150deg, ${HT_BLUE} 0%, #ffffff 50%, ${HT_RED} 100%);
        -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; z-index:3;
      }
      .ea-pop-video-frame video{
        position:absolute; inset:0; width:100%; height:100%;
        object-fit:cover; background:#05060a; display:block;
      }
      .ea-pop-badge{
        position:absolute; top:14px; left:14px; z-index:4;
        display:flex; align-items:center; gap:7px;
        padding:7px 12px; border-radius:999px;
        background:rgba(5,11,29,.55); backdrop-filter:blur(8px);
        border:1px solid rgba(255,255,255,.14);
        color:#fff; font:700 12px/1 "Space Grotesk", system-ui, sans-serif;
        letter-spacing:.04em;
      }
      .ea-flag-chip{
        display:inline-block; width:18px; height:12px; border-radius:2px; vertical-align:-1px;
        background:linear-gradient(to bottom, ${HT_BLUE} 0 50%, ${HT_RED} 50% 100%);
        box-shadow:0 0 0 1px rgba(255,255,255,.3) inset;
      }
      .ea-pop-close{
        position:absolute; top:12px; right:12px; z-index:5;
        width:40px; height:40px; border-radius:50%; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        background:rgba(5,11,29,.55); backdrop-filter:blur(8px);
        border:1px solid rgba(255,255,255,.16); color:#fff; font-size:17px;
        transition:transform .2s, background .2s;
      }
      .ea-pop-close:hover{ transform:rotate(90deg) scale(1.06); background:${HT_RED}; }
      .ea-pop-video-caption{
        position:absolute; left:0; right:0; bottom:0; z-index:4;
        padding:48px 18px 18px;
        background:linear-gradient(to top, rgba(3,6,12,.92) 12%, rgba(3,6,12,.45) 60%, transparent);
        color:#fff; text-align:left;
      }
      .ea-pop-video-caption h3{
        margin:0 0 4px; font:700 18px/1.2 "Space Grotesk", system-ui, sans-serif;
      }
      .ea-pop-video-caption p{ margin:0 0 12px; font-size:13.5px; color:rgba(255,255,255,.82); }
      .ea-pop-actions{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .ea-pop-cta{
        display:inline-flex; align-items:center; gap:8px;
        padding:11px 18px; border-radius:999px; cursor:pointer; border:none;
        background:linear-gradient(135deg,#ff7a3d,#ff5a1f);
        color:#fff; font:700 13.5px/1 "Space Grotesk", system-ui, sans-serif;
        box-shadow:0 8px 22px rgba(255,90,31,.34); transition:transform .2s, box-shadow .2s;
        text-decoration:none;
      }
      .ea-pop-cta:hover{ transform:translateY(-2px); box-shadow:0 12px 28px rgba(255,90,31,.45); }
      .ea-pop-mute{
        display:inline-flex; align-items:center; justify-content:center; gap:7px;
        width:auto; height:42px; padding:0 15px; border-radius:999px; cursor:pointer;
        background:rgba(255,255,255,.12); backdrop-filter:blur(8px);
        border:1px solid rgba(255,255,255,.2); color:#fff; font-size:13px; font-weight:600;
        transition:background .2s, transform .2s;
      }
      .ea-pop-mute:hover{ background:rgba(255,255,255,.2); transform:translateY(-1px); }

      /* ── Toast Grenadiers ────────────────────────────────────────── */
      .ea-grenadiers{
        position:fixed; z-index:9600; right:22px; bottom:22px; width:370px; max-width:calc(100vw - 32px);
        border-radius:20px; overflow:hidden; color:#fff;
        background:#0a1330; border:1px solid rgba(255,255,255,.1);
        box-shadow:0 22px 60px rgba(0,0,0,.5);
        transform:translateY(140%); opacity:0;
        transition:transform .6s cubic-bezier(.22,1,.36,1), opacity .5s ease;
        font-family:"Manrope", system-ui, sans-serif;
      }
      .ea-grenadiers.is-open{ transform:none; opacity:1; }
      /* bandes drapeau haïtien en tête */
      .ea-gren-flag{ height:8px; background:linear-gradient(to bottom, ${HT_BLUE} 0 50%, ${HT_RED} 50% 100%); }
      .ea-gren-body{ position:relative; padding:18px 18px 17px; }
      .ea-gren-body::before{
        content:""; position:absolute; inset:0; pointer-events:none; opacity:.5;
        background:radial-gradient(120% 100% at 0% 0%, rgba(0,32,159,.45), transparent 55%),
                   radial-gradient(120% 100% at 100% 100%, rgba(210,16,52,.4), transparent 55%);
      }
      .ea-gren-row{ position:relative; display:flex; gap:14px; align-items:flex-start; }
      .ea-gren-emblem{
        flex:0 0 auto; width:50px; height:50px; border-radius:14px;
        display:flex; align-items:center; justify-content:center; font-size:24px;
        background:linear-gradient(150deg, ${HT_BLUE}, ${HT_RED});
        box-shadow:0 8px 20px rgba(0,32,159,.4); animation:eaGrenPulse 2.4s ease-in-out infinite;
      }
      @keyframes eaGrenPulse{ 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      .ea-gren-kicker{
        display:inline-flex; align-items:center; gap:6px; margin:0 0 4px;
        font:800 10.5px/1 "Space Grotesk", system-ui, sans-serif; letter-spacing:.14em;
        text-transform:uppercase; color:#ffd24a;
      }
      .ea-gren-title{ margin:0 0 4px; font:800 17px/1.15 "Space Grotesk", system-ui, sans-serif; }
      .ea-gren-text{ margin:0; font-size:13px; line-height:1.45; color:rgba(255,255,255,.82); }
      .ea-gren-motto{
        position:relative; margin-top:12px; padding-top:11px; border-top:1px solid rgba(255,255,255,.1);
        display:flex; align-items:center; gap:8px; font-size:11.5px; color:rgba(255,255,255,.6);
      }
      .ea-gren-motto strong{ color:#fff; }
      .ea-gren-close{
        position:absolute; top:10px; right:10px; z-index:2; width:30px; height:30px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:13px;
        background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); color:#fff;
        transition:background .2s, transform .2s;
      }
      .ea-gren-close:hover{ background:${HT_RED}; transform:scale(1.08); }
      /* éclat qui balaie */
      .ea-gren-shine{ position:absolute; inset:0; overflow:hidden; pointer-events:none; }
      .ea-grenadiers.is-open .ea-gren-shine::after{
        content:""; position:absolute; top:0; left:-60%; width:40%; height:100%;
        background:linear-gradient(100deg, transparent, rgba(255,255,255,.16), transparent);
        animation:eaGrenShine 1.6s ease .35s 1;
      }
      @keyframes eaGrenShine{ to{ left:130%; } }

      @media (max-width:560px){
        .ea-grenadiers{ left:12px; right:12px; bottom:max(12px, env(safe-area-inset-bottom)); width:auto; }
        .ea-pop-video-frame{ height:min(82vh, 680px); border-radius:22px; }
        .ea-pop-video-caption h3{ font-size:16.5px; }
      }
      @media (prefers-reduced-motion:reduce){
        .ea-pop-video-overlay, .ea-pop-video-frame, .ea-grenadiers{ transition-duration:.001ms; }
        .ea-gren-emblem{ animation:none; }
      }
    `;
    const style = document.createElement("style");
    style.id = "ea-popups-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ─── Popup vidéo ──────────────────────────────────────────────────── */
  function initVideoPopup(cfg) {
    if (!cfg || cfg.enabled !== true || !cfg.url) return Promise.resolve();
    // 1× par session (réapparait sur une nouvelle visite / nouvel onglet)
    if (sessionStorage.getItem("ea-video-seen")) return Promise.resolve();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "ea-pop-video-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Vidéo de présentation En Avant");

      const headline = (cfg.headline || "En Avant").replace(/</g, "&lt;");
      const subtext  = (cfg.subtext || "").replace(/</g, "&lt;");

      overlay.innerHTML = `
        <div class="ea-pop-video-frame">
          <span class="ea-pop-badge"><span class="ea-flag-chip" role="img" aria-label="Haïti"></span> EN AVANT</span>
          <button class="ea-pop-close" type="button" aria-label="Fermer">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <video playsinline muted preload="metadata"></video>
          <div class="ea-pop-video-caption">
            <h3>${headline}</h3>
            ${subtext ? `<p>${subtext}</p>` : ""}
            <div class="ea-pop-actions">
              <a class="ea-pop-cta" href="/adherer.html">
                <i class="fa-solid fa-bolt"></i> Rejoindre le mouvement
              </a>
              <button class="ea-pop-mute" type="button">
                <i class="fa-solid fa-volume-xmark"></i> <span>Activer le son</span>
              </button>
            </div>
          </div>
        </div>`;

      document.body.appendChild(overlay);
      const frame  = overlay.querySelector(".ea-pop-video-frame");
      const video  = overlay.querySelector("video");
      const muteBtn = overlay.querySelector(".ea-pop-mute");

      video.src = cfg.url;
      sessionStorage.setItem("ea-video-seen", "1");

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        overlay.classList.remove("is-open");
        try { video.pause(); } catch {}
        document.body.style.overflow = "";
        document.removeEventListener("keydown", onKey);
        setTimeout(() => { overlay.remove(); resolve(); }, 480);
      };
      const onKey = (e) => { if (e.key === "Escape") close(); };

      overlay.querySelector(".ea-pop-close").addEventListener("click", close);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
      document.addEventListener("keydown", onKey);

      // Tap sur la vidéo : lecture / pause
      video.addEventListener("click", () => {
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      });

      // Bouton son
      muteBtn.addEventListener("click", () => {
        video.muted = !video.muted;
        const icon = muteBtn.querySelector("i");
        const label = muteBtn.querySelector("span");
        if (video.muted) {
          icon.className = "fa-solid fa-volume-xmark";
          label.textContent = "Activer le son";
        } else {
          icon.className = "fa-solid fa-volume-high";
          label.textContent = "Couper le son";
          video.play().catch(() => {});
        }
      });

      // Ouverture + autoplay muet
      requestAnimationFrame(() => {
        overlay.classList.add("is-open");
        document.body.style.overflow = "hidden";
        video.play().catch(() => {});
      });
    });
  }

  /* ─── Popup Grenadiers (récurrent) ─────────────────────────────────── */
  function initFootballPopup(cfg, startDelayMs) {
    if (!cfg || cfg.enabled !== true) return;
    const intervalMs = Math.max(20, Number(cfg.intervalSec) || 60) * 1000;

    const toast = document.createElement("aside");
    toast.className = "ea-grenadiers";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.innerHTML = `
      <div class="ea-gren-flag"></div>
      <div class="ea-gren-shine"></div>
      <div class="ea-gren-body">
        <button class="ea-gren-close" type="button" aria-label="Fermer">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="ea-gren-row">
          <div class="ea-gren-emblem"><i class="fa-solid fa-futbol"></i></div>
          <div>
            <p class="ea-gren-kicker"><i class="fa-solid fa-star"></i> Coupe du Monde 2026</p>
            <h3 class="ea-gren-title">Ann sipòte Grenadye yo&nbsp;! <span class="ea-flag-chip" role="img" aria-label="Haïti"></span></h3>
            <p class="ea-gren-text">Toute une nation derrière sa sélection. En Avant soutient fièrement les Grenadiers d'Haïti.</p>
          </div>
        </div>
        <div class="ea-gren-motto">
          <i class="fa-solid fa-hand-fist" style="color:#ffd24a;"></i>
          <span><strong>L'Union fait la force</strong> — Men anpil, chay pa lou.</span>
        </div>
      </div>`;

    document.body.appendChild(toast);

    let hideTimer = null;
    const show = () => {
      if (document.hidden) return; // ne pas déclencher onglet caché
      toast.classList.add("is-open");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 9000);
    };
    const hide = () => { toast.classList.remove("is-open"); clearTimeout(hideTimer); };

    toast.querySelector(".ea-gren-close").addEventListener("click", hide);

    setTimeout(() => {
      show();
      setInterval(show, intervalMs);
    }, startDelayMs);
  }

  /* ─── Orchestration ────────────────────────────────────────────────── */
  async function boot() {
    injectStyles();
    const settings = await loadSettings();
    // Défauts : vidéo OFF (tant qu'aucune URL), Grenadiers ON par fierté.
    const video    = settings.popup_video    || { enabled: false };
    const football  = settings.popup_football || { enabled: true, intervalSec: 60 };

    // La vidéo passe en premier ; le toast Grenadiers démarre ensuite.
    await initVideoPopup(video);
    initFootballPopup(football, sessionStorage.getItem("ea-video-seen") ? 6000 : 12000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
