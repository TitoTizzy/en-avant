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

  function render(article) {
    document.title = `${article.titre} | En Avant`;
    titleEl.textContent = article.titre;
    catEl.textContent = article.categorie || "Actualité";
    dateEl.textContent = fmtDate(article.published_at);

    // Contenu : éditorial maîtrisé (rédigé par les éditeurs du parti via le Dashboard).
    bodyEl.innerHTML = window.EASecurity.article(article.contenu) || "<p>Contenu indisponible.</p>";

    const words = bodyEl.textContent.trim().split(/\s+/).length;
    readingEl.textContent = `${Math.max(1, Math.round(words / 200))} min de lecture`;

    if (article.image_url) {
      coverImg.src = article.image_url;
      coverImg.alt = article.titre;
      coverEl.hidden = false;
    }

  }

  async function loadRecent() {
    let items = [];
    try {
      const response = await fetch("/api/articles?limit=4", { signal: AbortSignal.timeout(4000) });
      const payload = await response.json();
      if (response.ok && payload.articles?.length) {
        items = payload.articles.map((a) => ({
          titre: a.titre,
          href: `/article-details.html?slug=${encodeURIComponent(a.slug)}`,
        }));
      }
    } catch { /* fallback silencieux */ }

    recentEl.innerHTML = "";
    items.forEach(({ titre, href }) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = href;
      a.textContent = titre;
      li.appendChild(a);
      recentEl.appendChild(li);
    });
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
  loadRecent();
})();
