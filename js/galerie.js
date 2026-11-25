/* ==========================================================================
   EN AVANT — GALERIE (albums photos)
   /galerie               → liste des albums
   /galerie?album=<slug>  → photos d'un album + visionneuse plein écran
   Photos toujours affichées en entier (.photo-fill : photo nette + fond flou).
   ========================================================================== */
(() => {
  const root = document.querySelector("[data-gal-root]");
  if (!root) return;

  const $ = (sel) => document.querySelector(sel);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  const photoFill = (url, alt, eager = false) =>
    `<img class="photo-blur" src="${esc(url)}" alt="" aria-hidden="true" loading="${eager ? "eager" : "lazy"}" decoding="async">` +
    `<img class="photo-main" src="${esc(url)}" alt="${esc(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async">`;

  const showError = (message, retry = true) => {
    root.innerHTML = `<p class="blog-status">${esc(message)}${retry ? ' <button type="button" class="btn btn-ghost" data-gal-retry>Réessayer</button>' : ""}</p>`;
    root.querySelector("[data-gal-retry]")?.addEventListener("click", () => window.location.reload());
  };

  async function getJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  /* ---------------------------- Liste des albums ---------------------------- */
  async function renderAlbums() {
    try {
      const { res, data } = await getJson("/api/media?albums=1");
      if (!res.ok) throw new Error("api");
      const albums = data.albums || [];
      if (!albums.length) {
        root.innerHTML = '<p class="blog-status">Aucun album photo publié pour le moment.</p>';
        return;
      }
      root.classList.add("gal-grid--albums");
      root.innerHTML = albums.map((a, i) => `
        <a class="gal-album" href="/galerie?album=${encodeURIComponent(a.slug)}">
          <span class="gal-album-cover photo-fill">${photoFill(a.cover_url, "", i < 3)}
            <span class="gal-album-count"><i class="fa-regular fa-images" aria-hidden="true"></i> ${esc(plural(a.nb_photos, "photo"))}</span></span>
          <span class="gal-album-body">
            ${a.date_album ? `<small>${esc(fmtDate(a.date_album))}</small>` : ""}
            <strong>${esc(a.titre)}</strong>
            ${a.description ? `<span class="gal-album-desc">${esc(a.description)}</span>` : ""}
            <span class="gal-album-more">Voir l’album <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
          </span>
        </a>`).join("");
    } catch {
      showError("La galerie n’a pas pu être chargée.");
    }
  }

  /* ------------------------------ Un album ------------------------------ */
  let photos = [];
  let index = 0;
  let lastFocus = null;
  const viewer = $("[data-gal-viewer]");
  const vImg = $("[data-gal-img]");

  function setMeta(album) {
    const title = `${album.titre} — Galerie photos | En Avant`;
    document.title = title;
    const desc = album.description || `${plural(album.nb_photos, "photo")} de l’album « ${album.titre} ».`;
    const url = `https://enavant.org/galerie?album=${encodeURIComponent(album.slug)}`;
    const set = (sel, attr, val) => { const el = document.head.querySelector(sel); if (el) el.setAttribute(attr, val); };
    set('meta[name="description"]', "content", desc);
    set('link[rel="canonical"]', "href", url);
    set('meta[property="og:title"]', "content", title);
    set('meta[property="og:description"]', "content", desc);
    set('meta[property="og:url"]', "content", url);
    if (photos[0]) { set('meta[property="og:image"]', "content", photos[0].url); set('meta[name="twitter:image"]', "content", photos[0].url); }
    set('meta[name="twitter:title"]', "content", title);
    set('meta[name="twitter:description"]', "content", desc);
  }

  async function renderAlbum(slug) {
    try {
      const { res, data } = await getJson(`/api/media?album=${encodeURIComponent(slug)}`);
      if (res.status === 404) {
        $("[data-gal-title]").textContent = "Album introuvable";
        $("[data-gal-lead]").textContent = "Cet album n’existe pas ou n’a plus de photos.";
        root.innerHTML = '<p class="blog-status"><a class="btn btn-ghost" href="/galerie">Voir tous les albums</a></p>';
        return;
      }
      if (!res.ok) throw new Error("api");
      const { album } = data;
      photos = data.photos || [];
      $("[data-gal-crumbs]").hidden = false;
      $("[data-gal-crumb-current]").textContent = album.titre;
      $("[data-gal-title]").textContent = album.titre;
      $("[data-gal-lead]").textContent = [fmtDate(album.date_album), plural(album.nb_photos, "photo")].filter(Boolean).join(" · ")
        + (album.description ? ` — ${album.description}` : "");
      setMeta(album);
      root.classList.add("gal-grid--photos");
      root.innerHTML = photos.map((p, i) => `
        <button type="button" class="gal-photo" data-index="${i}" aria-label="Agrandir la photo ${i + 1}${p.caption ? ` : ${esc(p.caption)}` : ""}">
          <span class="gal-photo-img photo-fill">${photoFill(p.url, p.caption || "", i < 6)}</span>
          ${p.caption ? `<span class="gal-photo-cap">${esc(p.caption)}</span>` : ""}
        </button>`).join("")
        + '<p class="gal-back"><a class="btn btn-ghost" href="/galerie"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Tous les albums</a></p>';
      root.addEventListener("click", (event) => {
        const btn = event.target.closest(".gal-photo");
        if (btn) open(Number(btn.dataset.index), btn);
      });
    } catch {
      showError("Cet album n’a pas pu être chargé.");
    }
  }

  /* ---------------------------- Visionneuse ---------------------------- */
  function show(i) {
    index = (i + photos.length) % photos.length;
    const p = photos[index];
    vImg.src = p.url;
    vImg.alt = p.caption || `Photo ${index + 1}`;
    $("[data-gal-caption]").textContent = p.caption || "";
    $("[data-gal-count]").textContent = `${index + 1} / ${photos.length}`;
    const single = photos.length < 2;
    $("[data-gal-prev]").hidden = single;
    $("[data-gal-next]").hidden = single;
    // Précharge les voisines pour un défilement fluide.
    [index + 1, index - 1].forEach((j) => { const n = photos[(j + photos.length) % photos.length]; if (n) { const im = new Image(); im.src = n.url; } });
  }
  function open(i, from) {
    lastFocus = from || document.activeElement;
    viewer.hidden = false;
    document.body.classList.add("gal-open");
    show(i);
    $("[data-gal-close]").focus();
  }
  function close() {
    viewer.hidden = true;
    document.body.classList.remove("gal-open");
    vImg.removeAttribute("src");
    lastFocus?.focus?.();
  }
  if (viewer) {
    $("[data-gal-close]").addEventListener("click", close);
    $("[data-gal-prev]").addEventListener("click", () => show(index - 1));
    $("[data-gal-next]").addEventListener("click", () => show(index + 1));
    viewer.addEventListener("click", (event) => { if (event.target === viewer) close(); });
    document.addEventListener("keydown", (event) => {
      if (viewer.hidden) return;
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft") show(index - 1);
      else if (event.key === "ArrowRight") show(index + 1);
      else if (event.key === "Tab") {
        // Garde le focus dans la visionneuse.
        const items = [...viewer.querySelectorAll("button:not([hidden])")];
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    let startX = null;
    viewer.addEventListener("touchstart", (event) => { startX = event.touches[0].clientX; }, { passive: true });
    viewer.addEventListener("touchend", (event) => {
      if (startX === null) return;
      const dx = event.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) show(index + (dx < 0 ? 1 : -1));
      startX = null;
    });
  }

  const slug = new URLSearchParams(window.location.search).get("album");
  if (slug) renderAlbum(slug); else renderAlbums();
})();
