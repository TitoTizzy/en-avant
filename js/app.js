/* ==========================================================================
   EN AVANT — APP.JS
   Comportements propres aux pages utilisant style.css (accueil, à propos,
   historique). Les interactions globales (reveal, header intelligent,
   retour en haut, transitions de page…) vivent dans js/premium.js.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  initLoader();
  initMobileMenu();
  await hydrateGallery();
  initSlider();
  hydrateNews();
  hydrateLeaderboard();
});

async function hydrateGallery() {
  const slider = document.getElementById("gallery-slider");
  const track = slider?.querySelector(".slider-track");
  if (!track) return;

  try {
    const response = await fetch("/api/media", { signal: AbortSignal.timeout(4000) });
    const payload = await response.json();
    if (!response.ok || !payload.media?.length) return;

    track.innerHTML = "";
    payload.media.forEach((item, index) => {
      const slide = document.createElement("article");
      slide.className = `slide${index === 0 ? " active" : ""}`;

      const image = document.createElement("img");
      image.src = item.url;
      image.alt = item.caption || `Photo du mouvement En Avant ${index + 1}`;
      if (index > 0) image.loading = "lazy";
      slide.appendChild(image);

      if (item.caption) {
        const overlay = document.createElement("div");
        overlay.className = "slide-overlay";
        const kicker = document.createElement("span");
        kicker.textContent = "En Avant";
        const title = document.createElement("h3");
        title.textContent = item.caption;
        overlay.append(kicker, title);
        slide.appendChild(overlay);
      }

      track.appendChild(slide);
    });
  } catch {
    // Repli volontaire : les images statiques du HTML restent affichées.
  }
}

function initLoader() {
  const loader = document.getElementById("page-loader");
  if (!loader) return;

  // Intro logo : uniquement à la TOUTE PREMIÈRE visite du site (accueil).
  // Les visites suivantes (classe ea-returning posée dès le <head>) : aucun loader.
  if (document.documentElement.classList.contains("ea-returning")) {
    loader.remove();
    return;
  }
  try { localStorage.setItem("ea-visited", "1"); } catch (e) {}

  const hide = () => loader.classList.add("hidden");
  window.addEventListener("load", () => setTimeout(hide, 750));

  // Filet de sécurité : ne jamais bloquer la page derrière le loader
  setTimeout(hide, 4000);
}

function initMobileMenu() {
  const btn = document.getElementById("btn-mobile-menu");
  const nav = document.getElementById("main-nav");

  // premium.js (chargé avant) gère déjà le menu unifié.
  if (!btn || !nav || btn.dataset.eaBound) return;

  btn.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    btn.classList.toggle("is-active", isOpen);
    btn.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("menu-open", isOpen);
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      btn.classList.remove("is-active");
      btn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    });
  });
}

/* Photo d'article : on crée TOUJOURS une image neuve (jamais de srcset/sizes hérités du HTML,
   qui l'emporteraient sur src et afficheraient une autre photo). Repli si l'image manque ou casse. */
const NEWS_FALLBACK_IMG = "/pictures/foule-Assise-800.webp";
/* Photo ENTIÈRE (jamais rognée) : l'image nette est affichée en « contain » et l'espace
   restant est comblé par la même photo floutée et assombrie (classe .photo-fill).
   Renvoie [fond flou, photo nette] à placer dans un conteneur .photo-fill. */
function newsPhoto(url, alt, { eager = false } = {}) {
  const make = (cls) => {
    const img = document.createElement("img");
    img.className = cls;
    img.decoding = "async";
    img.loading = eager ? "eager" : "lazy";
    img.src = url || NEWS_FALLBACK_IMG;
    return img;
  };
  const blur = make("photo-blur");
  blur.alt = "";
  blur.setAttribute("aria-hidden", "true");
  const main = make("photo-main");
  main.alt = alt || "";
  main.addEventListener("error", () => {
    if (main.dataset.fallback) return;
    main.dataset.fallback = "1";
    main.src = NEWS_FALLBACK_IMG;
    blur.src = NEWS_FALLBACK_IMG;
  });
  return [blur, main];
}

async function hydrateNews() {
  const root = document.querySelector("[data-news]");
  if (!root) return;
  const featureCard = root.querySelector("[data-news-feature]");
  const list        = root.querySelector("[data-news-list]");
  const errorBox    = root.querySelector("[data-news-error]");
  const newsSection = root.closest("section");

  const CAT_LABELS = {
    actualite: "Actualité", politique: "Politique", economie: "Économie",
    societe: "Société",     diaspora:  "Diaspora",   programme: "Programme",
    communique: "Communiqué",
  };
  const catOf = (a) => CAT_LABELS[a.categorie] || a.categorie || "Actualité";
  const hrefOf = (a) => `/article-details.html?slug=${encodeURIComponent(a.slug)}`;
  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
    catch { return ""; }
  };
  const done = () => { root.classList.remove("is-loading"); root.removeAttribute("aria-busy"); };

  let arts = [];
  try {
    const res     = await fetch("/api/articles?limit=4", { signal: AbortSignal.timeout(6000) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error("api");
    arts = payload.articles || [];
  } catch {
    // Échec réseau : aucun faux article, seulement un message et le lien vers le blog.
    featureCard?.remove();
    list?.remove();
    root.querySelector(".news-stack-title")?.remove();
    if (errorBox) errorBox.hidden = false;
    root.classList.add("is-empty");
    done();
    return;
  }

  if (!arts.length) { if (newsSection) newsSection.hidden = true; return; }
  if (newsSection) newsSection.hidden = false;

  const featIdx = arts.findIndex((a) => a.is_featured);
  const ordered = featIdx > 0 ? [arts[featIdx], ...arts.filter((_, i) => i !== featIdx)] : arts;

  // Article à la une
  if (featureCard) {
    const a = ordered[0];
    const media = featureCard.querySelector(".feature-media");
    media.href = hrefOf(a);
    media.querySelectorAll("img, .news-skel").forEach((el) => el.remove());
    media.classList.add("photo-fill");
    media.prepend(...newsPhoto(a.image_url, a.titre, { eager: true }));
    const badge = media.querySelector(".feature-badge");
    if (badge) { badge.textContent = catOf(a); badge.hidden = false; }
    const meta = featureCard.querySelector(".meta-row");
    meta.replaceChildren(...[fmtDate(a.published_at), catOf(a)].filter(Boolean).map((t) => {
      const span = document.createElement("span"); span.textContent = t; return span;
    }));
    featureCard.querySelector("h3").textContent = a.titre;
    const p = featureCard.querySelector("p");
    p.textContent = a.excerpt || "";
    p.hidden = !a.excerpt;
    featureCard.querySelector("a.text-link").href = hrefOf(a);
  }

  // Autres articles : une carte par article, avec sa miniature
  if (list) {
    const others = ordered.slice(1);
    list.replaceChildren(...others.map((a) => {
      const card = document.createElement("a");
      card.className = "news-item";
      card.href = hrefOf(a);
      const thumb = document.createElement("div");
      thumb.className = "news-thumb photo-fill";
      thumb.append(...newsPhoto(a.image_url, ""));
      const body = document.createElement("div");
      body.className = "news-item-body";
      const meta = document.createElement("span");
      meta.className = "news-item-meta";
      meta.textContent = [fmtDate(a.published_at), catOf(a)].filter(Boolean).join(" · ");
      const title = document.createElement("h4");
      title.textContent = a.titre;
      const more = document.createElement("span");
      more.className = "news-item-more";
      more.textContent = "Lire l’article";
      body.append(meta, title, more);
      card.append(thumb, body);
      return card;
    }));
    if (!others.length) { list.remove(); root.querySelector(".news-stack-title")?.remove(); }
  }
  done();
}

async function hydrateLeaderboard() {
  const rows    = document.querySelector(".lb-lb-rows");
  const overlay = document.querySelector(".lb-lb-overlay");
  if (!rows || !overlay) return;

  try {
    const res     = await fetch("/api/trivia/score", { signal: AbortSignal.timeout(4000) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.leaderboard?.length) return;

    const RANKS = ["gold", "silver", "bronze"];
    const top5  = payload.leaderboard.slice(0, 5);

    rows.replaceChildren(...top5.map((entry, i) => {
      const row = document.createElement("div");
      row.className = "lb-lb-row";
      const rank = document.createElement("span");
      rank.className = `lb-lb-rank${RANKS[i] ? ` ${RANKS[i]}` : ""}`;
      rank.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "lb-lb-name";
      name.textContent = String(entry.pseudo || "—").slice(0, 20);
      const score = document.createElement("span");
      score.className = "lb-lb-score";
      score.textContent = `${Number(entry.score) || 0}/${Number(entry.total) || 8}`;
      row.append(rank, name, score);
      return row;
    }));

    overlay.hidden = true;
  } catch {
    /* API indisponible — l'overlay statique reste affiché */
  }
}

function initSlider() {
  const slider = document.getElementById("gallery-slider");
  if (!slider) return;

  const slides = slider.querySelectorAll(".slide");
  const dotsContainer = slider.querySelector(".slider-dots");
  const prevBtn = slider.querySelector(".slider-arrow-prev");
  const nextBtn = slider.querySelector(".slider-arrow-next");

  if (!slides.length || !dotsContainer || !prevBtn || !nextBtn) return;

  let currentIndex = 0;
  let autoplay = null;

  slides.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.className = "slider-dot";
    dot.type = "button";
    dot.setAttribute("aria-label", `Aller à la slide ${index + 1}`);

    if (index === 0) {
      dot.classList.add("active");
    }

    dot.addEventListener("click", () => {
      goToSlide(index);
      restartAutoplay();
    });

    dotsContainer.appendChild(dot);
  });

  const dots = dotsContainer.querySelectorAll(".slider-dot");

  function updateSlider() {
    slides.forEach((slide, index) => {
      slide.classList.toggle("active", index === currentIndex);
    });

    dots.forEach((dot, index) => {
      dot.classList.toggle("active", index === currentIndex);
    });
  }

  function goToSlide(index) {
    currentIndex = (index + slides.length) % slides.length;
    updateSlider();
  }

  function nextSlide() {
    goToSlide(currentIndex + 1);
  }

  function prevSlide() {
    goToSlide(currentIndex - 1);
  }

  function startAutoplay() {
    autoplay = setInterval(nextSlide, 5000);
  }

  function stopAutoplay() {
    clearInterval(autoplay);
  }

  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  prevBtn.addEventListener("click", () => {
    prevSlide();
    restartAutoplay();
  });

  nextBtn.addEventListener("click", () => {
    nextSlide();
    restartAutoplay();
  });

  slider.addEventListener("mouseenter", stopAutoplay);
  slider.addEventListener("mouseleave", startAutoplay);

  updateSlider();
  startAutoplay();
}


/* Classement du quiz (accueil) : actif automatiquement dès que 10 adhérents ont joué. */
(() => {
  const box = document.getElementById("home-leaderboard");
  if (!box) return;
  fetch("/api/trivia/classement")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      const status = document.getElementById("home-lb-status");
      if (!data.actif || !data.top.length) {
        if (status) {
          status.textContent = `Classement global — s’ouvre à ${data.seuil} joueurs (${data.joueurs}/${data.seuil})`;
          const bar = document.createElement("div");
          bar.className = "lb-lb-progress";
          bar.innerHTML = `<span style="width:${Math.min(100, Math.round((data.joueurs / data.seuil) * 100))}%"></span>`;
          status.after(bar);
        }
        return;
      }
      const rows = box.querySelector(".lb-lb-rows");
      const medal = ["gold", "silver", "bronze"];
      rows.replaceChildren(...data.top.map((r) => {
        const row = document.createElement("div");
        row.className = "lb-lb-row";
        const rank = document.createElement("span");
        rank.className = `lb-lb-rank ${medal[r.rang - 1] || ""}`.trim();
        rank.textContent = String(r.rang);
        const name = document.createElement("span");
        name.className = "lb-lb-name";
        name.textContent = r.pseudo;
        const score = document.createElement("span");
        score.className = "lb-lb-score";
        score.textContent = `${Number(r.points).toLocaleString("fr-FR")} pts`;
        row.append(rank, name, score);
        return row;
      }));
      box.classList.add("is-live");
      box.removeAttribute("aria-hidden");
    })
    .catch(() => { /* le bloc reste en « bientôt » */ });
})();
