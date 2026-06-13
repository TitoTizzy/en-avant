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

  const hide = () => loader.classList.add("hidden");

  window.addEventListener("load", () => {
    setTimeout(hide, 450);
  });

  // Filet de sécurité : ne jamais bloquer la page derrière le loader
  setTimeout(hide, 3500);
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

async function hydrateNews() {
  const featureCard = document.querySelector(".feature-card");
  const miniCards   = document.querySelectorAll(".mini-news-card");
  const newsSection = featureCard?.closest("section") || null;
  if (!featureCard && !miniCards.length) return;

  const CAT_LABELS = {
    actualite: "Actualité", politique: "Politique", economie: "Économie",
    societe: "Société",     diaspora:  "Diaspora",   programme: "Programme",
    communique: "Communiqué",
  };

  const fmtDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
      });
    } catch { return ""; }
  };

  try {
    const res     = await fetch("/api/articles?limit=4", { signal: AbortSignal.timeout(4000) });
    const payload = await res.json().catch(() => ({}));

    // Cacher la section si aucun article publié
    if (!res.ok || !payload.articles?.length) {
      if (newsSection) newsSection.hidden = true;
      return;
    }

    if (newsSection) newsSection.hidden = false;

    // Featured article: prefer is_featured flag, fallback to most recent
    const arts    = payload.articles;
    const featIdx = arts.findIndex((a) => a.is_featured);
    const ordered = featIdx > 0 ? [arts[featIdx], ...arts.filter((_, i) => i !== featIdx)] : arts;

    // Article vedette
    if (featureCard && ordered[0]) {
      const a    = ordered[0];
      const cat  = CAT_LABELS[a.categorie] || a.categorie || "Actualité";
      const href = `/article-details.html?slug=${encodeURIComponent(a.slug)}`;

      const img    = featureCard.querySelector(".feature-media img");
      const badge  = featureCard.querySelector(".feature-badge");
      const spans  = featureCard.querySelectorAll(".meta-row span");
      const h3     = featureCard.querySelector("h3");
      const p      = featureCard.querySelector("p");
      const link   = featureCard.querySelector("a.text-link");

      if (img   && a.image_url) { img.src = a.image_url; img.alt = a.titre; }
      if (badge) badge.textContent = cat;
      if (spans[0]) spans[0].textContent = fmtDate(a.published_at);
      if (spans[1]) spans[1].textContent = cat;
      if (h3)   h3.textContent  = a.titre;
      if (p)    p.textContent   = a.excerpt || "";
      if (link) link.href       = href;
    }

    // Cartes secondaires (articles 2, 3, 4)
    miniCards.forEach((card, i) => {
      const a = ordered[i + 1];
      if (!a) return;
      const cat  = CAT_LABELS[a.categorie] || a.categorie || "Actualité";
      const href = `/article-details.html?slug=${encodeURIComponent(a.slug)}`;

      const spans = card.querySelectorAll(".mini-news-meta span");
      const h4    = card.querySelector("h4");
      const link  = card.querySelector("a");

      if (spans[0]) spans[0].textContent = fmtDate(a.published_at);
      if (spans[1]) spans[1].textContent = cat;
      if (h4)   h4.textContent = a.titre;
      if (link) link.href      = href;
    });
  } catch {
    /* Repli volontaire — le HTML statique reste affiché */
  }
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

    rows.innerHTML = top5.map((entry, i) => {
      const rankClass = RANKS[i] || "";
      const pseudo    = (entry.pseudo || "—").slice(0, 20);
      const score     = `${entry.score}/${entry.total || 8}`;
      return `<div class="lb-lb-row">
        <span class="lb-lb-rank${rankClass ? ` ${rankClass}` : ""}">${i + 1}</span>
        <span class="lb-lb-name">${pseudo}</span>
        <span class="lb-lb-score">${score}</span>
      </div>`;
    }).join("");

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
