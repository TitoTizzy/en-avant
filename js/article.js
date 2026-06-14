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

  /* Démonstration (statique / API absente) — texte issu des pages du site. */
  const FALLBACK_ARTICLE = {
    id: null,
    titre: "Le parti En Avant annonce ses 20 chantiers prioritaires",
    categorie: "Programme",
    published_at: "2026-03-12T12:00:00Z",
    image_url: "/pictures/foule-Assise.jpg",
    contenu: [
      "<p>Le parti En Avant présente à la nation son programme des vingt chantiers prioritaires : une architecture de relèvement national couvrant la sécurité, la justice, la production, la jeunesse, les institutions, l'énergie, les territoires et la dignité collective.</p>",
      "<p>Cette annonce ne présente pas une simple liste. Le slogan « Pour changer Haïti ensemble » appelle à une mobilisation large : jeunesse, femmes, diaspora, enseignants, agriculteurs, policiers, artistes, ouvriers, cadres, entrepreneurs et collectivités.</p>",
      "<blockquote>« La reconstruction d'Haïti ne peut pas reposer sur un homme providentiel. Elle suppose une alliance entre la jeunesse, l'expérience, la diaspora, les territoires et les forces vives du pays. »</blockquote>",
      "<h2>Trois piliers, un cap</h2>",
      "<p>Les vingt chantiers s'organisent autour de trois piliers : l'ordre public et la sécurité, l'État de droit et la confiance, la production et la prospérité. Le cap est posé : faire d'Haïti une économie émergente à l'horizon 2054, année des 250 ans de l'indépendance.</p>",
      "<p>Parmi les mesures phares : rétablir la sécurité sur l'ensemble du territoire, garantir l'accès gratuit à l'école primaire, associer la diaspora aux décisions d'avenir, établir un pouvoir judiciaire fort et indépendant, et lancer un plan ambitieux d'infrastructures.</p>",
      "<p>Le détail des vingt chantiers est disponible sur la page dédiée et dans le Livre blanc, qui présente un synopsis d'état des lieux ainsi que la feuille de route complète du redressement national.</p>",
    ].join(""),
  };

  const FALLBACK_RECENT = [
    { titre: "Rencontre historique avec la diaspora haïtienne à Boston", href: "blog.html" },
    { titre: "Lancement officiel de la grande campagne de recrutement nationale", href: "blog.html" },
    { titre: "Renforcement des coordinations régionales", href: "blog.html" },
  ];

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
    bodyEl.innerHTML = article.contenu || "<p>Contenu indisponible.</p>";

    const words = bodyEl.textContent.trim().split(/\s+/).length;
    readingEl.textContent = `${Math.max(1, Math.round(words / 200))} min de lecture`;

    if (article.image_url) {
      coverImg.src = article.image_url;
      coverImg.alt = article.titre;
      coverEl.hidden = false;
    }

  }

  async function loadRecent() {
    let items = FALLBACK_RECENT;
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
    const slug = new URLSearchParams(window.location.search).get("slug");

    if (slug) {
      try {
        const response = await fetch(`/api/articles?slug=${encodeURIComponent(slug)}`, {
          signal: AbortSignal.timeout(5000),
        });
        const payload = await response.json();
        if (response.ok && payload.article) {
          render(payload.article);
          return;
        }
      } catch { /* on retombe sur la démo */ }
    }

    render(FALLBACK_ARTICLE);
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
