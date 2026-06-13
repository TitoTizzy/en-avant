/* ==========================================================================
   EN AVANT — BLOG
   Charge les articles depuis /api/articles (publiés, paginés).
   Repli silencieux sur le contenu statique HTML si l'API est indisponible.
   ========================================================================== */

(() => {
  "use strict";

  const grid        = document.getElementById("articles-grid");
  const filterTags  = document.querySelectorAll(".quick-tag");
  const searchForm  = document.getElementById("blog-search-form");
  const searchInput = document.getElementById("blog-search-input");
  const pagination  = document.querySelector(".blog-pagination");

  if (!grid) return;

  const LIMIT = 12;

  const CAT_LABELS = {
    actualite:  "Actualité",
    politique:  "Politique",
    economie:   "Économie",
    societe:    "Société",
    diaspora:   "Diaspora",
    programme:  "Programme",
    communique: "Communiqué",
  };

  // ── État ────────────────────────────────────────────────────────────────
  let isDynamic    = false;
  let articles     = [];
  let totalCount   = 0;
  let offset       = 0;
  let activeFilter = "all";
  let searchQuery  = "";

  // ── Helpers ─────────────────────────────────────────────────────────────
  const esc = (str) => {
    const d = document.createElement("div");
    d.textContent = str ?? "";
    return d.innerHTML;
  };

  const fmtDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
      });
    } catch { return ""; }
  };

  const readingTime = (excerpt) => {
    const words = (excerpt || "").split(/\s+/).filter(Boolean).length;
    return `${Math.max(1, Math.round(words / 200))} min de lecture`;
  };

  // ── Construction d'une carte article ───────────────────────────────────
  function buildCard(article) {
    const { titre, slug, categorie, excerpt, image_url, published_at } = article;
    const cat   = CAT_LABELS[categorie] || categorie || "Actualité";
    const href  = `/article-details.html?slug=${encodeURIComponent(slug)}`;
    const share = `${window.location.origin}/article-details.html?slug=${encodeURIComponent(slug)}`;

    const art = document.createElement("article");
    art.className = "premium-blog-card article-card";
    art.dataset.category = categorie || "actualite";
    art.dataset.title    = titre || "";

    art.innerHTML = `
      <div class="card-image-box">
        ${image_url
          ? `<img src="${esc(image_url)}" alt="${esc(titre)}" loading="lazy">`
          : `<div class="card-image-placeholder" aria-hidden="true"><i class="fa-solid fa-newspaper"></i></div>`
        }
        <span class="card-badge">${esc(cat)}</span>
      </div>
      <div class="card-content-box">
        <div class="card-meta">
          <span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${fmtDate(published_at)}</span>
          <span>${readingTime(excerpt)}</span>
        </div>
        <h3 class="card-title"><a href="${href}">${esc(titre)}</a></h3>
        <p class="card-excerpt">${esc(excerpt || "")}</p>
        <div class="card-actions-bar">
          <a href="${href}" class="read-more-link">
            Lire l'article <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </a>
          <div class="share-tools">
            <button class="btn-share-direct btn-copy-link" type="button" title="Copier le lien" data-url="${share}">
              <i class="fa-solid fa-link" aria-hidden="true"></i>
            </button>
            <button class="btn-share-direct btn-share-whatsapp" type="button" title="Partager sur WhatsApp" data-url="${share}">
              <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
            </button>
            <button class="btn-share-direct btn-share-x" type="button" title="Partager sur X" data-url="${share}">
              <i class="fa-brands fa-x-twitter" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>`;

    wireShareButtons(art);
    return art;
  }

  // ── Partage (réutilisé pour cartes dynamiques et statiques) ────────────
  function wireShareButtons(container) {
    container.querySelectorAll(".btn-copy-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.url);
          const saved = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
          btn.classList.add("is-copied");
          setTimeout(() => { btn.classList.remove("is-copied"); btn.innerHTML = saved; }, 1800);
        } catch {}
      });
    });
    container.querySelectorAll(".btn-share-whatsapp").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent("Lisez ceci ! " + btn.dataset.url)}`, "_blank", "noopener");
      });
    });
    container.querySelectorAll(".btn-share-x").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(btn.dataset.url)}`, "_blank", "noopener");
      });
    });
  }

  // ── Rendu de la grille ─────────────────────────────────────────────────
  function renderArticles(list) {
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:3rem 0;color:var(--ink-400);">
        <i class="fa-solid fa-inbox" aria-hidden="true"></i>&nbsp; Aucun article trouvé.
      </p>`;
      return;
    }
    list.forEach((a) => grid.appendChild(buildCard(a)));
  }

  // ── Pagination (mode dynamique uniquement) ─────────────────────────────
  function renderPagination() {
    if (!pagination || !isDynamic) { if (pagination) pagination.hidden = true; return; }

    const totalPages  = Math.ceil(totalCount / LIMIT);
    const currentPage = Math.floor(offset / LIMIT) + 1;

    if (totalPages <= 1) { pagination.hidden = true; return; }
    pagination.hidden = false;

    let html = "";
    if (currentPage > 1) {
      html += `<button class="page-link" data-action="prev" type="button">
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Précédent</button>`;
    }
    const start = Math.max(1, currentPage - 2);
    const end   = Math.min(totalPages, currentPage + 2);
    for (let p = start; p <= end; p++) {
      html += `<button class="page-link${p === currentPage ? " active" : ""}" data-page="${p}" type="button">${p}</button>`;
    }
    if (currentPage < totalPages) {
      html += `<button class="page-link" data-action="next" type="button">
        Suivant <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`;
    }
    pagination.innerHTML = html;

    pagination.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        offset = (parseInt(btn.dataset.page) - 1) * LIMIT;
        fetchAndRender();
      });
    });
    pagination.querySelector("[data-action='prev']")?.addEventListener("click", () => {
      offset = Math.max(0, offset - LIMIT);
      fetchAndRender();
    });
    pagination.querySelector("[data-action='next']")?.addEventListener("click", () => {
      offset += LIMIT;
      fetchAndRender();
    });
  }

  // ── Filtre côté client (mode statique) ────────────────────────────────
  function filterStatic() {
    const q = searchQuery.toLowerCase();
    grid.querySelectorAll(".article-card").forEach((card) => {
      const matchCat = activeFilter === "all" || card.dataset.category === activeFilter;
      const matchQ   = !q
        || (card.dataset.title || "").toLowerCase().includes(q)
        || (card.querySelector(".card-excerpt")?.textContent || "").toLowerCase().includes(q);
      card.style.display = matchCat && matchQ ? "" : "none";
    });
  }

  // ── Fetch API ──────────────────────────────────────────────────────────
  async function fetchAndRender() {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:2rem 0;">
      <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Chargement des articles…
    </p>`;

    const params = new URLSearchParams({ limit: LIMIT, offset });
    if (activeFilter !== "all") params.set("categorie", activeFilter);

    try {
      const res     = await fetch(`/api/articles?${params}`, { signal: AbortSignal.timeout(5000) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "API indisponible");

      articles   = payload.articles || [];
      totalCount = payload.total ?? articles.length;

      renderArticles(articles);
      renderPagination();
      window.scrollTo({ top: grid.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" });
    } catch {
      if (isDynamic) {
        grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:3rem 0;color:var(--ink-400);">
          <i class="fa-solid fa-wifi" aria-hidden="true"></i>&nbsp; Articles momentanément indisponibles.
        </p>`;
      }
    }
  }

  // ── Gestionnaires de filtres et recherche (communs aux deux modes) ──────
  filterTags.forEach((tag) => {
    tag.addEventListener("click", () => {
      filterTags.forEach((t) => t.classList.remove("active"));
      tag.classList.add("active");
      activeFilter  = tag.dataset.filter;
      searchQuery   = "";
      offset        = 0;
      if (searchInput) searchInput.value = "";

      if (isDynamic) fetchAndRender();
      else           filterStatic();
    });
  });

  searchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    searchQuery = searchInput?.value.trim() ?? "";

    if (isDynamic) {
      const filtered = articles.filter((a) => {
        const q        = searchQuery.toLowerCase();
        const matchCat = activeFilter === "all" || a.categorie === activeFilter;
        const matchQ   = !q
          || (a.titre   || "").toLowerCase().includes(q)
          || (a.excerpt || "").toLowerCase().includes(q);
        return matchCat && matchQ;
      });
      renderArticles(filtered);
      if (pagination) pagination.hidden = true;
    } else {
      filterStatic();
    }
  });

  // ── Init : tentative API, repli statique ───────────────────────────────
  (async () => {
    try {
      const res     = await fetch(`/api/articles?limit=${LIMIT}&offset=0`, {
        signal: AbortSignal.timeout(4000),
      });
      const payload = await res.json().catch(() => ({}));

      if (res.ok && payload.articles?.length) {
        articles   = payload.articles;
        totalCount = payload.total ?? articles.length;
        isDynamic  = true;
        renderArticles(articles);
        renderPagination();
        return;
      }
    } catch { /* API indisponible — repli silencieux */ }

    // Mode statique : le HTML de la page reste intact, on câble juste les boutons
    wireShareButtons(grid);
  })();
})();
