/* ==========================================================================
   EN AVANT — PAGE ARTICLE
   · Charge l'article via /api/articles?slug=… (Supabase, contenu publié)
   · Fallback hors API : communiqué de démonstration (contenu du site)
   ========================================================================== */

(() => {
  "use strict";

  const titleEl = document.getElementById("art-title");
  if (!titleEl) return;

  const catEl = document.getElementById("art-cat");
  const dateEl = document.getElementById("art-date");
  const readingEl = document.getElementById("art-reading");
  const bodyEl = document.getElementById("art-body");
  const coverEl = document.getElementById("art-cover");
  const coverImg = document.getElementById("art-cover-img");
  const recentEl = document.getElementById("art-recent");

  const fmtDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    } catch { return ""; }
  };

  /** Met à jour une balise meta (créée au besoin). */
  function setMeta(attr, key, value) {
    if (!value) return;
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", value);
  }

  /** SEO de l'article : titre, description, canonique, aperçu de partage, données structurées. */
  function applySeo(article) {
    const url = `https://enavant.org/article-details?slug=${encodeURIComponent(article.slug || "")}`;
    const desc = (article.excerpt || bodyEl.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
    const image = /^https:\/\//.test(article.image_url || "") ? article.image_url : "https://enavant.org/pictures/og-banner.jpg";
    setMeta("name", "description", desc);
    setMeta("property", "og:type", "article");
    setMeta("property", "og:title", `${article.titre} | En Avant`);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", image);
    setMeta("name", "twitter:title", `${article.titre} | En Avant`);
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:image", image);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: String(article.titre || "").slice(0, 110),
      description: desc,
      image: [image],
      datePublished: article.published_at || undefined,
      articleSection: article.categorie || undefined,
      inLanguage: "fr",
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "En Avant", url: "https://enavant.org/" },
      publisher: {
        "@type": "Organization",
        name: "En Avant",
        logo: { "@type": "ImageObject", url: "https://enavant.org/pictures/logo/logo.png" },
      },
    });
    document.head.appendChild(ld);
  }

  function render(article) {
    document.title = `${article.titre} | En Avant`;
    titleEl.textContent = article.titre;
    catEl.textContent = article.categorie || "Actualité";
    dateEl.textContent = fmtDate(article.published_at);

    // Contenu : éditorial maîtrisé (rédigé par les éditeurs du parti via le Dashboard).
    bodyEl.innerHTML = window.EA_sanitizeHTML
      ? window.EA_sanitizeHTML(article.contenu || "<p>Contenu indisponible.</p>")
      : "";
    if (!window.EA_sanitizeHTML) bodyEl.textContent = "Contenu indisponible.";

    const words = bodyEl.textContent.trim().split(/\s+/).length;
    readingEl.textContent = `${Math.max(1, Math.round(words / 200))} min de lecture`;

    if (article.image_url) {
      // Couverture affichée en entier, fond flou de la même photo autour.
      const [blur] = fullPhoto(article.image_url, "");
      blur.loading = "eager";
      coverEl.querySelector(".photo-blur")?.remove();
      coverEl.classList.add("photo-fill");
      coverImg.classList.add("photo-main");
      coverImg.loading = "eager";
      coverImg.src = article.image_url;
      coverImg.alt = article.titre;
      coverEl.prepend(blur);
      coverEl.hidden = false;
    }

    applySeo(article);
  }

  /* Autres articles : miniature + date + titre, sans l'article en cours de lecture.
     Image toujours créée neuve (aucun srcset hérité), avec repli si elle manque. */
  /* Photo ENTIÈRE : nette en « contain », fond comblé par la même photo floutée (.photo-fill). */
  const FALLBACK_IMG = "/pictures/foule-Assise-800.webp";
  function fullPhoto(url, alt) {
    const make = (cls) => {
      const img = document.createElement("img");
      img.className = cls; img.loading = "lazy"; img.decoding = "async";
      img.src = url || FALLBACK_IMG;
      return img;
    };
    const blur = make("photo-blur"); blur.alt = ""; blur.setAttribute("aria-hidden", "true");
    const main = make("photo-main"); main.alt = alt || "";
    main.addEventListener("error", () => {
      if (main.dataset.fallback) return;
      main.dataset.fallback = "1"; main.src = FALLBACK_IMG; blur.src = FALLBACK_IMG;
    });
    return [blur, main];
  }

  async function loadRecent(currentSlug) {
    let items = [];
    try {
      const response = await fetch("/api/articles?limit=5", { signal: AbortSignal.timeout(6000) });
      const payload = await response.json();
      if (response.ok && payload.articles?.length) {
        items = payload.articles.filter((a) => a.slug !== currentSlug).slice(0, 4);
      }
    } catch { /* repli : seul le lien « Voir toute l'actualité » reste */ }

    const fmt = (iso) => { try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } };
    recentEl.replaceChildren(...items.map((a) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.className = "art-other";
      link.href = `/article-details.html?slug=${encodeURIComponent(a.slug)}`;
      const thumb = document.createElement("div");
      thumb.className = "art-other-thumb photo-fill";
      thumb.append(...fullPhoto(a.image_url, ""));
      const body = document.createElement("div");
      body.className = "art-other-body";
      const date = document.createElement("small");
      date.textContent = fmt(a.published_at);
      const title = document.createElement("strong");
      title.textContent = a.titre;
      body.append(date, title);
      link.append(thumb, body);
      li.appendChild(link);
      return li;
    }));
    recentEl.hidden = !items.length;
  }

  async function load() {
    const slug = new URLSearchParams(window.location.search).get('slug');
    const showError = (title, message) => {
      document.title = title + ' | En Avant';
      titleEl.textContent = title;
      bodyEl.textContent = message;
      catEl.textContent = ''; dateEl.textContent = ''; readingEl.textContent = '';
      coverEl.hidden = true;
      document.querySelectorAll('[id^="share-"]').forEach(el => { el.hidden = true; });
    };
    if (!slug) { showError('Article introuvable', 'Choisissez un article depuis la page Actualités.'); return; }
    try {
      const response = await fetch('/api/articles?slug=' + encodeURIComponent(slug), { signal: AbortSignal.timeout(5000) });
      if (response.status === 404) { showError('Article introuvable', 'Cet article est absent ou n’est plus publié.'); return; }
      if (!response.ok) throw new Error();
      const payload = await response.json();
      if (!payload.article) throw new Error();
      render(payload.article);
    } catch { showError('Article temporairement indisponible', 'Le chargement a échoué. Réessayez dans quelques instants.'); }
  }

  function setupShare() {
    const url = window.location.href;
    const text = titleEl.textContent;
    const copyButton = document.getElementById("share-copy");
    const whatsapp = document.getElementById("share-whatsapp");
    const facebook = document.getElementById("share-facebook");
    const x = document.getElementById("share-x");

    whatsapp.href = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
    facebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    x.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

    copyButton.addEventListener("click", async () => {
      const icon = copyButton.innerHTML;
      copyButton.classList.remove("is-copied");
      try {
        await navigator.clipboard.writeText(url);
        copyButton.classList.add("is-copied");
        copyButton.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
        setTimeout(() => {
          copyButton.classList.remove("is-copied");
          copyButton.innerHTML = icon;
        }, 2200);
      } catch { /* clipboard refusé */ }
    });
  }

  load().finally(setupShare);
  loadRecent(new URLSearchParams(window.location.search).get("slug"));
})();
