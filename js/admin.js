/* ==========================================================================
   EN AVANT — DASHBOARD SUPERADMIN
   Toutes les données sensibles passent par /api/admin/dashboard, qui exige
   la session Supabase et le cookie PIN HttpOnly signé.
   ========================================================================== */

(() => {
  "use strict";

  const guard = document.getElementById("adm-guard");
  if (!guard) return;

  const guardMsg = document.getElementById("adm-guard-msg");
  const guardAction = document.getElementById("adm-guard-action");
  const app = document.getElementById("adm-app");
  const env = window.EA_ENV || {};

  function deny(message, withLogin = true) {
    guard.hidden = false;
    app.hidden = true;
    guardMsg.innerHTML = `<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${message}`;
    guardAction.hidden = !withLogin;
  }

  if (!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && window.supabase)) {
    deny("Dashboard non configuré : renseignez js/env.js.", false);
    return;
  }

  const client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  let session = null;
  const PIN_IDLE_MS = 15 * 60 * 1000;
  const PIN_REFRESH_MS = 4 * 60 * 1000;
  const ACTIVITY_KEY = "ea-last-activity";
  const pinLock = document.getElementById("adm-pin-lock");
  const pinLockForm = document.getElementById("adm-pin-lock-form");
  const pinLockInput = document.getElementById("adm-pin-lock-input");
  const pinLockSubmit = document.getElementById("adm-pin-lock-submit");
  const pinLockStatus = document.getElementById("adm-pin-lock-status");
  const pinLockLogout = document.getElementById("adm-pin-lock-logout");
  let lastActivity = Number(localStorage.getItem(ACTIVITY_KEY)) || Date.now();
  let lastPinRefresh = Date.now();
  let pinSecurityActive = false;
  let pinRefreshPromise = null;
  let pinLockPromise = null;
  let resolvePinLock = null;

  const esc = (value) => {
    const span = document.createElement("span");
    span.textContent = value ?? "";
    return span.innerHTML;
  };

  const fmtDate = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

  const fmtMoney = (cents, currency = "usd") =>
    `${(cents / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
    })} ${currency.toUpperCase()}`;

  function isPinRequired(message, statusCode) {
    return statusCode === 401 &&
      /PIN SuperAdmin requis|PIN.+expir|v[ée]rification PIN/i.test(message || "");
  }

  function setPinLockStatus(type = "", message = "") {
    if (!pinLockStatus) return;
    pinLockStatus.className = `ea-form-status${type ? ` ${type}` : ""}`;
    pinLockStatus.textContent = message;
  }

  function openPinLock(message = "Votre session sécurisée a expiré après 15 minutes d'inactivité.") {
    if (!pinLock) return Promise.reject(new Error("Fenêtre PIN indisponible."));
    if (pinLockPromise) return pinLockPromise;

    pinLock.hidden = false;
    document.body.classList.add("adm-is-locked");
    pinLockInput.value = "";
    setPinLockStatus("info", message);
    window.setTimeout(() => pinLockInput.focus(), 50);

    pinLockPromise = new Promise((resolve) => {
      resolvePinLock = resolve;
    });
    return pinLockPromise;
  }

  function closePinLock() {
    pinLock.hidden = true;
    document.body.classList.remove("adm-is-locked");
    pinLockInput.value = "";
    setPinLockStatus();
    lastActivity = Date.now();
    lastPinRefresh = lastActivity;
    localStorage.setItem(ACTIVITY_KEY, String(lastActivity));
    const resolve = resolvePinLock;
    resolvePinLock = null;
    pinLockPromise = null;
    resolve?.(true);
  }

  async function rawAuthenticatedFetch(path, options = {}) {
    const sessionResult = await client.auth.getSession();
    session = sessionResult.data.session;
    if (!session) {
      const error = new Error("Session expirée.");
      error.status = 401;
      throw error;
    }

    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${session.access_token}`,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  async function api(path, options = {}, canRetryPin = true) {
    const { response, payload } = await rawAuthenticatedFetch(path, options);
    if (!response.ok) {
      if (canRetryPin && isPinRequired(payload.error, response.status)) {
        await openPinLock();
        return api(path, options, false);
      }
      const error = new Error(payload.error || "Requête impossible.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function refreshPinSession() {
    if (!pinSecurityActive || pinLockPromise || pinRefreshPromise) return pinRefreshPromise;
    pinRefreshPromise = (async () => {
      try {
        const { response, payload } = await rawAuthenticatedFetch("/api/auth/touch-pin", {
          method: "POST",
        });
        if (response.ok) {
          lastPinRefresh = Date.now();
          return;
        }
        if (isPinRequired(payload.error, response.status)) await openPinLock();
      } catch (error) {
        console.warn("Renouvellement du PIN indisponible.", error);
      } finally {
        pinRefreshPromise = null;
      }
    })();
    return pinRefreshPromise;
  }

  function registerActivity() {
    if (!pinSecurityActive || pinLockPromise) return;
    const now = Date.now();
    if (now - lastActivity >= PIN_IDLE_MS) {
      openPinLock();
      return;
    }
    lastActivity = now;
    localStorage.setItem(ACTIVITY_KEY, String(now));
    if (now - lastPinRefresh >= PIN_REFRESH_MS) refreshPinSession();
  }

  function startPinSecurity() {
    pinSecurityActive = true;

    ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
      document.addEventListener(eventName, registerActivity, { passive: true });
    });
    window.addEventListener("scroll", registerActivity, { passive: true });
    window.addEventListener("focus", registerActivity);
    window.addEventListener("storage", (event) => {
      if (event.key !== ACTIVITY_KEY || pinLockPromise) return;
      const sharedActivity = Number(event.newValue);
      if (!Number.isFinite(sharedActivity) || sharedActivity <= lastActivity) return;
      lastActivity = sharedActivity;
      if (Date.now() - lastPinRefresh >= PIN_REFRESH_MS) refreshPinSession();
    });

    window.setInterval(() => {
      if (!pinLockPromise && Date.now() - lastActivity >= PIN_IDLE_MS) openPinLock();
    }, 5000);

    if (Date.now() - lastActivity >= PIN_IDLE_MS) {
      openPinLock();
    } else {
      lastPinRefresh = 0;
      refreshPinSession();
    }
  }

  pinLockInput?.addEventListener("input", () => {
    pinLockInput.value = pinLockInput.value.replace(/\D/g, "").slice(0, 8);
  });

  pinLockForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pin = pinLockInput.value.trim();
    if (!/^\d{4,8}$/.test(pin)) {
      setPinLockStatus("error", "Entrez votre PIN de 4 à 8 chiffres.");
      pinLockInput.focus();
      return;
    }

    pinLockSubmit.classList.add("btn-loading");
    pinLockSubmit.disabled = true;
    setPinLockStatus("info", "Vérification en cours...");

    try {
      const { response, payload } = await rawAuthenticatedFetch("/api/auth/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) throw new Error(payload.error || "PIN incorrect.");
      closePinLock();
    } catch (error) {
      pinLockInput.value = "";
      pinLockInput.focus();
      setPinLockStatus("error", error.message || "PIN incorrect.");
    } finally {
      pinLockSubmit.classList.remove("btn-loading");
      pinLockSubmit.disabled = false;
    }
  });

  pinLockLogout?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await client.auth.signOut();
    localStorage.removeItem("ea-is-admin");
    localStorage.removeItem(ACTIVITY_KEY);
    window.location.href = "/login.html";
  });

  const PANEL_TITLES = {
    "panel-home":         "Tableau de bord",
    "panel-articles":     "Articles",
    "panel-events":       "Événements",
    "panel-gallery":      "Galerie",
    "panel-organisation": "Organisation",
    "panel-members":      "Membres",
    "panel-donations":    "Dons",
    "panel-leads":        "Leads",
    "panel-trivia":       "Trivia IA",
    "panel-integrations": "Intégrations",
    "panel-equipe":       "Utilisateurs",
    "panel-security":     "Sécurité",
    "panel-settings":     "Paramètres",
    "panel-logs":         "Journal d'activité",
  };

  function switchPanel(panelId) {
    document.querySelectorAll(".adm-nav-item[data-panel]").forEach((item) => {
      item.classList.toggle("active", item.dataset.panel === panelId);
    });
    document.querySelectorAll(".adm-panel").forEach((panel) => {
      panel.hidden = panel.id !== panelId;
    });
    const title = PANEL_TITLES[panelId] || "Dashboard";
    const titleEl = document.getElementById("adm-topbar-title");
    const sectionEl = document.getElementById("adm-topbar-section");
    if (titleEl) titleEl.textContent = title;
    if (sectionEl) sectionEl.textContent = title;
  }

  document.querySelectorAll(".adm-nav-item[data-panel]").forEach((item) => {
    item.addEventListener("click", () => {
      switchPanel(item.dataset.panel);
      if (item.dataset.panel === "panel-articles") showArticleList();
      if (item.dataset.panel === "panel-events") showEventList();
      if (item.dataset.panel === "panel-gallery") showGalleryList();
      if (item.dataset.panel === "panel-equipe") showUserList();
    });
  });
  document.querySelectorAll(".adm-quick-btn[data-panel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchPanel(btn.dataset.panel);
      if (btn.hasAttribute("data-article-new")) openArticleEditor();
      if (btn.hasAttribute("data-event-new")) openEventEditor();
    });
  });

  function renderMembers(members) {
    const tbody = document.getElementById("tbl-members");
    if (!members.length) {
      tbody.innerHTML = '<tr><td colspan="7">Aucune adhésion pour le moment.</td></tr>';
      return;
    }

    tbody.innerHTML = members.map((member) => `
      <tr data-id="${esc(member.id)}">
        <td>${esc(member.nom)}</td>
        <td style="font-variant-numeric:tabular-nums;">${esc(member.ninu || "—")}</td>
        <td>${esc(member.email)}</td>
        <td>${esc(member.ville)}</td>
        <td>${fmtDate(member.created_at)}</td>
        <td><span class="badge ${esc(member.status)}">${esc(member.status)}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-xs" data-action="approved" type="button">Approuver</button>
          <button class="btn btn-ghost btn-xs" data-action="rejected" type="button">Rejeter</button>
        </td>
      </tr>
    `).join("");
  }

  function renderDonations(donations) {
    const tbody = document.getElementById("tbl-donations");
    if (!donations.length) {
      tbody.innerHTML = '<tr><td colspan="6">Aucun don enregistré pour le moment.</td></tr>';
      return;
    }

    tbody.innerHTML = donations.map((donation) => `
      <tr>
        <td><strong>${fmtMoney(donation.montant, donation.devise)}</strong></td>
        <td>${esc(donation.provider)}</td>
        <td>${esc(donation.email || "—")}</td>
        <td style="font-size:0.8rem; opacity:0.7;">${esc((donation.transaction_id || "").slice(0, 18))}…</td>
        <td>${fmtDate(donation.created_at)}</td>
        <td><span class="badge ${esc(donation.statut)}">${esc(donation.statut)}</span></td>
      </tr>
    `).join("");
  }

  function renderLeads(leads) {
    const tbody = document.getElementById("tbl-leads");
    if (!leads.length) {
      tbody.innerHTML = '<tr><td colspan="4">Aucun lead pour le moment.</td></tr>';
      return;
    }

    tbody.innerHTML = leads.map((lead) => `
      <tr>
        <td>${esc(lead.nom)}</td>
        <td>${esc(lead.email)}</td>
        <td>${esc(lead.ville || "—")}</td>
        <td>${fmtDate(lead.downloaded_at)}</td>
      </tr>
    `).join("");
  }

  function renderDashboard(payload) {
    document.getElementById("adm-email").textContent = payload.profile.email;
    const roleBadge = document.getElementById("adm-role");
    roleBadge.textContent = payload.profile.role;
    roleBadge.hidden = false;

    document.getElementById("st-members").textContent = payload.stats.members;
    document.getElementById("st-donations").textContent =
      fmtMoney(payload.stats.donations_cents, "usd");
    document.getElementById("st-leads").textContent = payload.stats.leads;
    document.getElementById("st-trivia").textContent = payload.stats.trivia;
    document.getElementById("st-articles").textContent = payload.stats.articles;
    document.getElementById("st-events").textContent = payload.stats.events;
    document.getElementById("st-media").textContent = payload.stats.media;

    renderMembers(payload.members);
    renderDonations(payload.donations);
    renderLeads(payload.leads);
  }

  const listRenderers = {
    members: renderMembers,
    donations: renderDonations,
    leads: renderLeads,
  };

  const exportColumns = {
    members: [
      ["Nom", "nom"],
      ["NINU", "ninu"],
      ["Email", "email"],
      ["Ville", "ville"],
      ["Statut", "status"],
      ["Date", "created_at"],
    ],
    donations: [
      ["Montant centimes", "montant"],
      ["Devise", "devise"],
      ["Fournisseur", "provider"],
      ["Email", "email"],
      ["Transaction", "transaction_id"],
      ["Statut", "statut"],
      ["Date", "created_at"],
    ],
    leads: [
      ["Nom", "nom"],
      ["Email", "email"],
      ["Ville", "ville"],
      ["Téléchargé le", "downloaded_at"],
    ],
  };

  const csvCell = (value) => {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };

  function downloadCsv(dataset, records) {
    const columns = exportColumns[dataset];
    const lines = [
      columns.map(([label]) => csvCell(label)).join(","),
      ...records.map((record) =>
        columns.map(([, key]) => csvCell(record[key])).join(",")
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `en-avant-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  function bindListTools() {
    document.querySelectorAll(".adm-list-tools").forEach((tools) => {
      const dataset = tools.dataset.dataset;
      const input = tools.querySelector("input[type='search']");
      const prev = tools.querySelector(".list-prev");
      const next = tools.querySelector(".list-next");
      const pageLabel = tools.querySelector(".list-page");
      let page = 1;
      let total = 0;
      const pageSize = 25;

      const load = async () => {
        const params = new URLSearchParams({
          dataset,
          page: String(page),
          page_size: String(pageSize),
          search: input.value.trim(),
        });
        try {
          const payload = await api(`/api/admin/dashboard?${params}`);
          total = payload.total;
          listRenderers[dataset](payload.records);
          const pages = Math.max(1, Math.ceil(total / pageSize));
          pageLabel.textContent = `Page ${page}/${pages}`;
          prev.disabled = page <= 1;
          next.disabled = page >= pages;
        } catch (error) {
          console.error(error);
        }
      };

      tools.querySelector(".list-search").addEventListener("click", () => {
        page = 1;
        load();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          page = 1;
          load();
        }
      });
      prev.addEventListener("click", () => {
        if (page > 1) {
          page -= 1;
          load();
        }
      });
      next.addEventListener("click", () => {
        if (page * pageSize < total) {
          page += 1;
          load();
        }
      });
      tools.querySelector(".list-export").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.classList.add("btn-loading");
        try {
          const params = new URLSearchParams({
            dataset,
            export: "1",
            search: input.value.trim(),
          });
          const payload = await api(`/api/admin/dashboard?${params}`);
          downloadCsv(dataset, payload.records);
          if (payload.truncated) {
            window.alert("L'export est limité aux 1 000 premiers résultats du filtre.");
          }
        } catch (error) {
          window.alert(error.message);
        } finally {
          button.classList.remove("btn-loading");
        }
      });
    });
  }

  function setModuleStatus(id, type, message) {
    const status = document.getElementById(id);
    if (!status) return;
    status.className = `ea-form-status ${type || ""}`.trim();
    status.textContent = message || "";
  }

  const toLocalDateTime = (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const fromLocalDateTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  };

  function articleCard(article) {
    const card = document.createElement("article");
    card.className = "u-card adm-record";
    card.dataset.id = article.id;
    card.innerHTML = `
      <div class="adm-record-head">
        <div>
          <span class="badge ${article.published ? "approved" : "pending"}">
            ${article.published ? "Publié" : "Brouillon"}
          </span>
          ${article.is_featured ? '<span class="badge" style="background:rgba(255,165,0,.18);color:#ffa500;"><i class="fa-solid fa-star" style="font-size:.7em;"></i> À la une</span>' : ""}
          <small>${fmtDate(article.updated_at)}</small>
        </div>
        <div class="adm-record-actions">
          <label class="btn btn-ghost btn-xs" title="Image de couverture">
            <i class="fa-solid fa-image" aria-hidden="true"></i>
            <input class="article-image" type="file" accept="image/jpeg,image/png,image/webp" hidden>
          </label>
          <button class="btn btn-ghost btn-xs article-feature" type="button" title="${article.is_featured ? "Retirer de la une" : "Mettre à la une"}">
            <i class="fa-${article.is_featured ? "solid" : "regular"} fa-star" aria-hidden="true"></i>
          </button>
          <button class="btn btn-ghost btn-xs article-publish" type="button">
            ${article.published ? "Dépublier" : "Publier"}
          </button>
          <button class="btn btn-primary btn-xs article-save" type="button">Enregistrer</button>
          <button class="btn btn-ghost btn-xs article-delete" type="button" title="Supprimer">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      ${article.image_url ? `<img class="adm-record-cover" src="${esc(article.image_url)}" alt="">` : ""}
      <div class="ea-field">
        <label>Titre</label>
        <input class="article-title" maxlength="200" value="${esc(article.titre)}">
      </div>
      <div class="ea-field">
        <label>Catégorie</label>
        <select class="article-category">
          ${["actualite", "politique", "economie", "societe", "diaspora", "programme", "communique"]
            .map((category) => `<option value="${category}" ${article.categorie === category ? "selected" : ""}>${category}</option>`)
            .join("")}
        </select>
      </div>
      <div class="ea-field">
        <label>Résumé</label>
        <textarea class="article-excerpt" rows="3" maxlength="300">${esc(article.excerpt || "")}</textarea>
      </div>
      <div class="ea-field">
        <label>Contenu</label>
        <textarea class="article-content" rows="9">${esc(article.contenu || "")}</textarea>
      </div>`;
    return card;
  }

  async function loadArticles() {
    const host = document.getElementById("articles-admin");
    if (!host) return;
    try {
      const { articles } = await api("/api/admin/articles");
      host.innerHTML = "";
      if (!articles.length) {
        host.innerHTML = '<div class="u-card adm-empty">Aucun article. Créez votre premier brouillon.</div>';
        return;
      }
      articles.forEach((article) => host.appendChild(articleCard(article)));
    } catch (error) {
      console.error(error);
      host.innerHTML = `<div class="u-card adm-empty">${esc(error.message)}</div>`;
    }
  }

  function bindArticles() {
    const form = document.getElementById("article-create-form");
    const host = document.getElementById("articles-admin");
    if (!form || !host) return;

    // Quill rich text editor
    let quill = null;
    try {
      quill = new Quill("#article-content-editor", {
        theme: "snow",
        placeholder: "Rédigez votre article ici…",
        modules: {
          toolbar: [
            [{ font: [] }, { size: ["small", false, "large", "huge"] }],
            ["bold", "italic", "underline", "strike"],
            [{ color: [] }, { background: [] }],
            [{ list: "ordered" }, { list: "bullet" }],
            [{ align: [] }],
            ["link", "image"],
            ["clean"],
          ],
        },
      });
    } catch (_) {}

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.getElementById("article-create-submit");
      button.classList.add("btn-loading");
      const contenu = quill ? quill.root.innerHTML : "";
      if (quill && quill.getText().trim().length === 0) {
        setModuleStatus("article-status", "error", "Le contenu de l'article est vide.");
        button.classList.remove("btn-loading");
        return;
      }
      try {
        await api("/api/admin/articles", {
          method: "POST",
          body: JSON.stringify({
            titre: document.getElementById("article-title").value,
            categorie: document.getElementById("article-category").value,
            excerpt: document.getElementById("article-excerpt").value,
            contenu,
            is_featured: document.getElementById("article-featured")?.checked || false,
          }),
        });
        form.reset();
        if (quill) quill.setContents([]);
        setModuleStatus("article-status", "success", "Brouillon créé.");
        await loadArticles();
        document.getElementById("st-articles").textContent =
          String(Number(document.getElementById("st-articles").textContent) + 1);
      } catch (error) {
        setModuleStatus("article-status", "error", error.message);
      } finally {
        button.classList.remove("btn-loading");
      }
    });

    host.addEventListener("click", async (event) => {
      const card = event.target.closest(".adm-record");
      if (!card) return;
      const save    = event.target.closest(".article-save");
      const publish = event.target.closest(".article-publish");
      const remove  = event.target.closest(".article-delete");
      const feature = event.target.closest(".article-feature");
      if (!save && !publish && !remove && !feature) return;

      try {
        if (feature) {
          const currentlyFeatured = feature.querySelector(".fa-solid") !== null;
          await api("/api/admin/articles", {
            method: "PATCH",
            body: JSON.stringify({ id: card.dataset.id, is_featured: !currentlyFeatured }),
          });
          setModuleStatus("article-status", "success", currentlyFeatured ? "Retiré de la une." : "Article mis à la une.");
          await loadArticles();
          return;
        }

        if (remove) {
          if (!window.confirm("Supprimer définitivement cet article ?")) return;
          await api("/api/admin/articles", {
            method: "DELETE",
            body: JSON.stringify({ id: card.dataset.id }),
          });
          card.remove();
          document.getElementById("st-articles").textContent =
            String(Math.max(0, Number(document.getElementById("st-articles").textContent) - 1));
          return;
        }

        const body = save
          ? {
              id: card.dataset.id,
              titre: card.querySelector(".article-title").value,
              categorie: card.querySelector(".article-category").value,
              excerpt: card.querySelector(".article-excerpt").value,
              contenu: card.querySelector(".article-content").value,
            }
          : {
              id: card.dataset.id,
              published: publish.textContent.trim() === "Publier",
            };
        await api("/api/admin/articles", { method: "PATCH", body: JSON.stringify(body) });
        setModuleStatus("article-status", "success", save ? "Article enregistré." : "Statut de publication mis à jour.");
        await loadArticles();
      } catch (error) {
        setModuleStatus("article-status", "error", error.message);
      }
    });

    host.addEventListener("change", (event) => {
      const input = event.target.closest(".article-image");
      if (!input?.files[0]) return;
      const file = input.files[0];
      const card = input.closest(".adm-record");
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
      if (!ext || file.size > 2 * 1024 * 1024) {
        setModuleStatus("article-status", "error", "Image JPG, PNG ou WebP de 2 Mo maximum.");
        input.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await api("/api/admin/articles", {
            method: "PATCH",
            body: JSON.stringify({
              id: card.dataset.id,
              image_base64: String(reader.result).split(",")[1],
              image_ext: ext,
            }),
          });
          setModuleStatus("article-status", "success", "Image de couverture mise à jour.");
          await loadArticles();
        } catch (error) {
          setModuleStatus("article-status", "error", error.message);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  const ARTICLE_CATEGORIES = {
    actualite: "Actualité",
    politique: "Politique",
    economie: "Économie",
    societe: "Société",
    diaspora: "Diaspora",
    programme: "Programme",
    communique: "Communiqué",
  };

  let articlesCache = [];
  let articleQuill = null;

  function articleLibraryCard(article) {
    const card = document.createElement("article");
    card.className = "u-card adm-record adm-article-card";
    card.dataset.id = article.id;
    const cover = article.image_url
      ? `<img class="adm-article-card-cover" src="${esc(article.image_url)}" alt="">`
      : '<div class="adm-article-card-cover adm-article-cover-empty"><i class="fa-regular fa-newspaper" aria-hidden="true"></i></div>';
    card.innerHTML = `
      ${cover}
      <div class="adm-article-card-body">
        <div class="adm-article-card-meta">
          <span class="badge ${article.published ? "approved" : "pending"}">${article.published ? "Publié" : "Brouillon"}</span>
          ${article.is_featured ? '<span class="badge adm-featured-badge"><i class="fa-solid fa-star" aria-hidden="true"></i> À la une</span>' : ""}
          <span>${esc(ARTICLE_CATEGORIES[article.categorie] || article.categorie)}</span>
          <span>${fmtDate(article.updated_at)}</span>
        </div>
        <h4>${esc(article.titre)}</h4>
        <p>${esc(article.excerpt || "Aucun résumé pour cet article.")}</p>
        <div class="adm-record-actions adm-article-card-actions">
          <button class="btn btn-primary btn-xs article-edit" type="button">
            <i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier
          </button>
          <button class="btn btn-ghost btn-xs article-feature" type="button" title="${article.is_featured ? "Retirer de la une" : "Mettre à la une"}">
            <i class="fa-${article.is_featured ? "solid" : "regular"} fa-star" aria-hidden="true"></i>
          </button>
          <button class="btn btn-ghost btn-xs article-publish" type="button">${article.published ? "Dépublier" : "Publier"}</button>
          <button class="btn btn-ghost btn-xs article-delete" type="button" title="Supprimer">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>`;
    return card;
  }

  function getFilteredArticles() {
    const search = document.getElementById("article-filter-search")?.value.trim().toLocaleLowerCase("fr") || "";
    const category = document.getElementById("article-filter-category")?.value || "";
    const fromValue = document.getElementById("article-filter-from")?.value;
    const toValue = document.getElementById("article-filter-to")?.value;
    const from = fromValue ? new Date(`${fromValue}T00:00:00`) : null;
    const to = toValue ? new Date(`${toValue}T23:59:59.999`) : null;

    return articlesCache.filter((article) => {
      const text = `${article.titre || ""} ${article.excerpt || ""}`.toLocaleLowerCase("fr");
      const date = new Date(article.updated_at || article.published_at || 0);
      return (!search || text.includes(search))
        && (!category || article.categorie === category)
        && (!from || date >= from)
        && (!to || date <= to);
    });
  }

  function renderArticleLibrary() {
    const host = document.getElementById("articles-admin");
    const count = document.getElementById("article-results-count");
    if (!host) return;
    const articles = getFilteredArticles();
    host.innerHTML = "";
    if (count) count.textContent = `${articles.length} article${articles.length > 1 ? "s" : ""} affiché${articles.length > 1 ? "s" : ""}`;
    if (!articles.length) {
      host.innerHTML = '<div class="u-card adm-empty">Aucun article ne correspond à ces filtres.</div>';
      return;
    }
    articles.forEach((article) => host.appendChild(articleLibraryCard(article)));
  }

  async function loadArticleLibrary() {
    const host = document.getElementById("articles-admin");
    if (!host) return;
    try {
      const payload = await api("/api/admin/articles");
      articlesCache = payload.articles || [];
      renderArticleLibrary();
    } catch (error) {
      host.innerHTML = `<div class="u-card adm-empty">${esc(error.message)}</div>`;
    }
  }

  function showArticleList() {
    document.getElementById("articles-list-view").hidden = false;
    document.getElementById("article-editor-view").hidden = true;
    setModuleStatus("article-status", "", "");
  }

  function openArticleEditor(articleId = "") {
    const article = articleId ? articlesCache.find((item) => item.id === articleId) : null;
    const form = document.getElementById("article-editor-form");
    if (!form) return;

    form.reset();
    document.getElementById("article-id").value = article?.id || "";
    document.getElementById("article-title").value = article?.titre || "";
    document.getElementById("article-category").value = article?.categorie || "actualite";
    document.getElementById("article-excerpt").value = article?.excerpt || "";
    document.getElementById("article-featured").checked = article?.is_featured === true;
    document.getElementById("article-editor-title").textContent = article ? "Modifier l'article" : "Nouvel article";
    document.getElementById("article-editor-subtitle").textContent = article
      ? "Mettez à jour le contenu, l'image et les informations de publication."
      : "Créez un brouillon avant sa publication.";
    document.getElementById("article-save-label").textContent = article ? "Enregistrer les modifications" : "Créer le brouillon";

    const preview = document.getElementById("article-image-preview");
    preview.src = article?.image_url || "";
    preview.hidden = !article?.image_url;
    if (articleQuill) {
      articleQuill.setContents([]);
      if (article?.contenu) articleQuill.clipboard.dangerouslyPasteHTML(article.contenu);
    }

    document.getElementById("articles-list-view").hidden = true;
    document.getElementById("article-editor-view").hidden = false;
    setModuleStatus("article-status", "", "");
    document.getElementById("article-title").focus();
    document.querySelector(".adm-main")?.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  async function readArticleImage(input) {
    const file = input?.files?.[0];
    if (!file) return {};
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
    if (!ext || file.size > 2 * 1024 * 1024) {
      throw new Error("Image JPG, PNG ou WebP de 2 Mo maximum.");
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Image illisible."));
      reader.readAsDataURL(file);
    });
    return { image_base64: dataUrl.split(",")[1], image_ext: ext };
  }

  function bindArticleLibrary() {
    const form = document.getElementById("article-editor-form");
    const host = document.getElementById("articles-admin");
    if (!form || !host) return;

    try {
      articleQuill = new Quill("#article-content-editor", {
        theme: "snow",
        placeholder: "Rédigez votre article ici…",
        modules: {
          toolbar: [
            [{ font: [] }, { size: ["small", false, "large", "huge"] }],
            ["bold", "italic", "underline", "strike"],
            [{ color: [] }, { background: [] }],
            [{ list: "ordered" }, { list: "bullet" }],
            [{ align: [] }],
            ["link", "image"],
            ["clean"],
          ],
        },
      });
    } catch (_) {}

    document.getElementById("article-new-button")?.addEventListener("click", () => openArticleEditor());
    document.getElementById("article-editor-back")?.addEventListener("click", showArticleList);
    document.getElementById("article-editor-cancel")?.addEventListener("click", showArticleList);

    ["article-filter-search", "article-filter-category", "article-filter-from", "article-filter-to"].forEach((id) => {
      const input = document.getElementById(id);
      input?.addEventListener(id === "article-filter-search" ? "input" : "change", renderArticleLibrary);
    });
    document.getElementById("article-filter-reset")?.addEventListener("click", () => {
      ["article-filter-search", "article-filter-category", "article-filter-from", "article-filter-to"].forEach((id) => {
        document.getElementById(id).value = "";
      });
      renderArticleLibrary();
    });

    document.getElementById("article-image")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const preview = document.getElementById("article-image-preview");
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.getElementById("article-save-submit");
      const content = articleQuill?.root.innerHTML || "";
      if (articleQuill && articleQuill.getText().trim().length === 0) {
        setModuleStatus("article-status", "error", "Le contenu de l'article est vide.");
        return;
      }

      button.classList.add("btn-loading");
      try {
        const id = document.getElementById("article-id").value;
        const articleBody = {
          titre: document.getElementById("article-title").value,
          categorie: document.getElementById("article-category").value,
          excerpt: document.getElementById("article-excerpt").value,
          contenu: content,
          is_featured: document.getElementById("article-featured").checked,
        };
        const imageBody = await readArticleImage(document.getElementById("article-image"));

        if (id) {
          await api("/api/admin/articles", {
            method: "PATCH",
            body: JSON.stringify({ id, ...articleBody, ...imageBody }),
          });
        } else {
          const created = await api("/api/admin/articles", {
            method: "POST",
            body: JSON.stringify(articleBody),
          });
          if (imageBody.image_base64) {
            await api("/api/admin/articles", {
              method: "PATCH",
              body: JSON.stringify({ id: created.article.id, ...imageBody }),
            });
          }
          const counter = document.getElementById("st-articles");
          counter.textContent = String((Number.parseInt(counter.textContent, 10) || articlesCache.length) + 1);
        }

        await loadArticleLibrary();
        showArticleList();
        setModuleStatus("article-list-status", "success", id ? "Article modifié." : "Brouillon créé.");
      } catch (error) {
        setModuleStatus("article-status", "error", error.message);
      } finally {
        button.classList.remove("btn-loading");
      }
    });

    host.addEventListener("click", async (event) => {
      const card = event.target.closest(".adm-article-card");
      if (!card) return;
      const edit = event.target.closest(".article-edit");
      const publish = event.target.closest(".article-publish");
      const remove = event.target.closest(".article-delete");
      const feature = event.target.closest(".article-feature");
      if (!edit && !publish && !remove && !feature) return;

      if (edit) {
        openArticleEditor(card.dataset.id);
        return;
      }

      try {
        if (feature) {
          const article = articlesCache.find((item) => item.id === card.dataset.id);
          await api("/api/admin/articles", {
            method: "PATCH",
            body: JSON.stringify({ id: card.dataset.id, is_featured: !article?.is_featured }),
          });
          setModuleStatus("article-list-status", "success", article?.is_featured ? "Retiré de la une." : "Article mis à la une.");
        } else if (remove) {
          if (!window.confirm("Supprimer définitivement cet article ?")) return;
          await api("/api/admin/articles", {
            method: "DELETE",
            body: JSON.stringify({ id: card.dataset.id }),
          });
          const counter = document.getElementById("st-articles");
          counter.textContent = String(Math.max(0, (Number.parseInt(counter.textContent, 10) || articlesCache.length) - 1));
          setModuleStatus("article-list-status", "success", "Article supprimé.");
        } else if (publish) {
          const article = articlesCache.find((item) => item.id === card.dataset.id);
          await api("/api/admin/articles", {
            method: "PATCH",
            body: JSON.stringify({ id: card.dataset.id, published: !article?.published }),
          });
          setModuleStatus("article-list-status", "success", "Statut de publication mis à jour.");
        }
        await loadArticleLibrary();
      } catch (error) {
        setModuleStatus("article-list-status", "error", error.message);
      }
    });
  }

  function eventCard(item) {
    const card = document.createElement("article");
    card.className = "u-card adm-record";
    card.dataset.id = item.id;
    card.innerHTML = `
      <div class="adm-record-head">
        <strong>${fmtDate(item.date_cible)}</strong>
        <div class="adm-record-actions">
          <button class="btn btn-primary btn-xs event-save" type="button">Enregistrer</button>
          <button class="btn btn-ghost btn-xs event-delete" type="button" title="Supprimer">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="ea-field"><label>Titre</label><input class="event-title" maxlength="160" value="${esc(item.titre)}"></div>
      <div class="ea-field"><label>Date et heure</label><input class="event-date" type="datetime-local" value="${toLocalDateTime(item.date_cible)}"></div>
      <div class="ea-field"><label>Lieu</label><input class="event-place" maxlength="160" value="${esc(item.lieu || "")}"></div>
      <div class="ea-field"><label>Description</label><textarea class="event-description" rows="4" maxlength="500">${esc(item.description || "")}</textarea></div>`;
    return card;
  }

  async function loadEvents() {
    const host = document.getElementById("events-admin");
    if (!host) return;
    try {
      const { events } = await api("/api/admin/events");
      host.innerHTML = "";
      if (!events.length) {
        host.innerHTML = '<div class="u-card adm-empty">Aucun événement planifié.</div>';
        return;
      }
      events.forEach((item) => host.appendChild(eventCard(item)));
    } catch (error) {
      host.innerHTML = `<div class="u-card adm-empty">${esc(error.message)}</div>`;
    }
  }

  function bindEvents() {
    const form = document.getElementById("event-create-form");
    const host = document.getElementById("events-admin");
    if (!form || !host) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.getElementById("event-create-submit");
      button.classList.add("btn-loading");
      try {
        await api("/api/admin/events", {
          method: "POST",
          body: JSON.stringify({
            titre: document.getElementById("event-title").value,
            date_cible: fromLocalDateTime(document.getElementById("event-date").value),
            lieu: document.getElementById("event-place").value,
            description: document.getElementById("event-description").value,
          }),
        });
        form.reset();
        setModuleStatus("event-status", "success", "Événement ajouté.");
        await loadEvents();
        document.getElementById("st-events").textContent =
          String(Number(document.getElementById("st-events").textContent) + 1);
      } catch (error) {
        setModuleStatus("event-status", "error", error.message);
      } finally {
        button.classList.remove("btn-loading");
      }
    });

    host.addEventListener("click", async (event) => {
      const card = event.target.closest(".adm-record");
      if (!card) return;
      const save = event.target.closest(".event-save");
      const remove = event.target.closest(".event-delete");
      if (!save && !remove) return;
      try {
        if (remove) {
          if (!window.confirm("Supprimer cet événement ?")) return;
          await api("/api/admin/events", {
            method: "DELETE",
            body: JSON.stringify({ id: card.dataset.id }),
          });
          card.remove();
          document.getElementById("st-events").textContent =
            String(Math.max(0, Number(document.getElementById("st-events").textContent) - 1));
          return;
        }
        await api("/api/admin/events", {
          method: "PATCH",
          body: JSON.stringify({
            id: card.dataset.id,
            titre: card.querySelector(".event-title").value,
            date_cible: fromLocalDateTime(card.querySelector(".event-date").value),
            lieu: card.querySelector(".event-place").value,
            description: card.querySelector(".event-description").value,
          }),
        });
        setModuleStatus("event-status", "success", "Événement enregistré.");
        await loadEvents();
      } catch (error) {
        setModuleStatus("event-status", "error", error.message);
      }
    });
  }

  let eventsCache = [];

  function eventLibraryCard(item) {
    const card = document.createElement("article");
    card.className = "u-card adm-record adm-entity-card";
    card.dataset.id = item.id;
    const target = new Date(item.date_cible);
    const isPast = target.getTime() < Date.now();
    card.innerHTML = `
      <div class="adm-entity-icon"><i class="fa-solid fa-calendar-day" aria-hidden="true"></i></div>
      <div class="adm-entity-card-body">
        <div class="adm-article-card-meta">
          <span class="badge ${isPast ? "pending" : "approved"}">${isPast ? "Passé" : "À venir"}</span>
          <span>${fmtDate(item.date_cible)}</span>
        </div>
        <h4>${esc(item.titre)}</h4>
        <p>${esc(item.description || "Aucune description.")}</p>
        ${item.lieu ? `<small><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(item.lieu)}</small>` : ""}
        <div class="adm-record-actions adm-article-card-actions">
          <button class="btn btn-primary btn-xs event-edit" type="button">
            <i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier
          </button>
          <button class="btn btn-ghost btn-xs event-delete" type="button" title="Supprimer">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>`;
    return card;
  }

  async function loadEventLibrary() {
    const host = document.getElementById("events-admin");
    if (!host) return;
    try {
      const payload = await api("/api/admin/events");
      eventsCache = payload.events || [];
      host.innerHTML = "";
      if (!eventsCache.length) {
        host.innerHTML = '<div class="u-card adm-empty">Aucun événement planifié.</div>';
        return;
      }
      eventsCache.forEach((item) => host.appendChild(eventLibraryCard(item)));
    } catch (error) {
      host.innerHTML = `<div class="u-card adm-empty">${esc(error.message)}</div>`;
    }
  }

  function showEventList() {
    document.getElementById("events-list-view").hidden = false;
    document.getElementById("event-editor-view").hidden = true;
    setModuleStatus("event-status", "", "");
  }

  function openEventEditor(eventId = "") {
    const item = eventId ? eventsCache.find((event) => event.id === eventId) : null;
    const form = document.getElementById("event-editor-form");
    if (!form) return;
    form.reset();
    document.getElementById("event-id").value = item?.id || "";
    document.getElementById("event-title").value = item?.titre || "";
    document.getElementById("event-date").value = item ? toLocalDateTime(item.date_cible) : "";
    document.getElementById("event-place").value = item?.lieu || "";
    document.getElementById("event-description").value = item?.description || "";
    document.getElementById("event-editor-title").textContent = item ? "Modifier l'événement" : "Nouvel événement";
    document.getElementById("event-editor-subtitle").textContent = item
      ? "Mettez à jour les informations de cet événement."
      : "Ajoutez un événement au calendrier public.";
    document.getElementById("event-save-label").textContent = item ? "Enregistrer les modifications" : "Créer l'événement";
    document.getElementById("events-list-view").hidden = true;
    document.getElementById("event-editor-view").hidden = false;
    document.getElementById("event-title").focus();
  }

  function bindEventLibrary() {
    const form = document.getElementById("event-editor-form");
    const host = document.getElementById("events-admin");
    if (!form || !host) return;
    document.getElementById("event-new-button")?.addEventListener("click", () => openEventEditor());
    document.getElementById("event-editor-back")?.addEventListener("click", showEventList);
    document.getElementById("event-editor-cancel")?.addEventListener("click", showEventList);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.getElementById("event-save-submit");
      button.classList.add("btn-loading");
      try {
        const id = document.getElementById("event-id").value;
        const body = {
          titre: document.getElementById("event-title").value,
          date_cible: fromLocalDateTime(document.getElementById("event-date").value),
          lieu: document.getElementById("event-place").value,
          description: document.getElementById("event-description").value,
        };
        await api("/api/admin/events", {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify(id ? { id, ...body } : body),
        });
        await loadEventLibrary();
        showEventList();
        setModuleStatus("event-list-status", "success", id ? "Événement modifié." : "Événement créé.");
      } catch (error) {
        setModuleStatus("event-status", "error", error.message);
      } finally {
        button.classList.remove("btn-loading");
      }
    });

    host.addEventListener("click", async (event) => {
      const card = event.target.closest(".adm-entity-card");
      if (!card) return;
      if (event.target.closest(".event-edit")) {
        openEventEditor(card.dataset.id);
        return;
      }
      if (!event.target.closest(".event-delete")) return;
      if (!window.confirm("Supprimer cet événement ?")) return;
      try {
        await api("/api/admin/events", {
          method: "DELETE",
          body: JSON.stringify({ id: card.dataset.id }),
        });
        await loadEventLibrary();
        setModuleStatus("event-list-status", "success", "Événement supprimé.");
      } catch (error) {
        setModuleStatus("event-list-status", "error", error.message);
      }
    });
  }

  async function loadTriviaBank() {
    const host = document.getElementById("trivia-admin");
    const scoresHost = document.getElementById("trivia-scores-admin");
    if (!host) return;
    try {
      const { questions, scores } = await api("/api/admin/trivia");
      host.innerHTML = "";
      if (!questions.length) {
        host.innerHTML = '<div class="adm-empty">Aucune question dans la banque.</div>';
        return;
      }
      questions.forEach((item) => {
        const row = document.createElement("div");
        row.className = "adm-question-row";
        row.dataset.id = item.id;
        row.innerHTML = `
          <div>
            <strong>${esc(item.question)}</strong>
            <small>Réponse : ${esc(item.correct_answer)} · ${fmtDate(item.created_at)}</small>
          </div>
          <button class="btn btn-ghost btn-xs trivia-delete" type="button" title="Supprimer">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>`;
        host.appendChild(row);
      });

      if (scoresHost) {
        scoresHost.innerHTML = "";
        if (!scores.length) {
          scoresHost.innerHTML = '<div class="adm-empty">Aucun score enregistré.</div>';
        } else {
          scores.forEach((item) => {
            const row = document.createElement("div");
            row.className = "adm-question-row";
            row.dataset.id = item.id;
            row.innerHTML = `
              <div>
                <strong>${esc(item.pseudo || "Anonyme")}</strong>
                <small>${item.score}/${item.total} · ${fmtDate(item.completed_at)}</small>
              </div>
              <button class="btn btn-ghost btn-xs trivia-score-delete" type="button" title="Supprimer">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>`;
            scoresHost.appendChild(row);
          });
        }
      }
    } catch (error) {
      host.innerHTML = `<div class="adm-empty">${esc(error.message)}</div>`;
      if (scoresHost) scoresHost.innerHTML = `<div class="adm-empty">${esc(error.message)}</div>`;
    }
  }

  function bindTriviaBank() {
    const host = document.getElementById("trivia-admin");
    const scoresHost = document.getElementById("trivia-scores-admin");
    const refresh = document.getElementById("trivia-refresh");
    if (!host || !refresh) return;
    refresh.addEventListener("click", loadTriviaBank);
    host.addEventListener("click", async (event) => {
      const button = event.target.closest(".trivia-delete");
      if (!button) return;
      const row = button.closest(".adm-question-row");
      if (!window.confirm("Supprimer cette question du quiz ?")) return;
      try {
        await api("/api/admin/trivia", {
          method: "DELETE",
          body: JSON.stringify({ id: row.dataset.id }),
        });
        row.remove();
        document.getElementById("st-trivia").textContent =
          String(Math.max(0, Number(document.getElementById("st-trivia").textContent) - 1));
      } catch (error) {
        setModuleStatus("tv-status", "error", error.message);
      }
    });

    scoresHost?.addEventListener("click", async (event) => {
      const button = event.target.closest(".trivia-score-delete");
      if (!button) return;
      const row = button.closest(".adm-question-row");
      if (!window.confirm("Supprimer ce score du classement ?")) return;
      try {
        await api("/api/admin/trivia", {
          method: "DELETE",
          body: JSON.stringify({ id: row.dataset.id, kind: "score" }),
        });
        row.remove();
      } catch (error) {
        setModuleStatus("tv-status", "error", error.message);
      }
    });
  }

  let galleryCache = [];

  function galleryCard(item) {
    const card = document.createElement("article");
    card.className = "u-card adm-media-card adm-gallery-card";
    card.dataset.id = item.id;
    card.innerHTML = `
      <img src="${esc(item.url)}" alt="${esc(item.caption || "")}">
      <div class="adm-gallery-card-body">
        <p>${esc(item.caption || "Sans légende")}</p>
        <div class="adm-record-actions">
          <button class="btn btn-primary btn-xs gallery-edit" type="button">
            <i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier
          </button>
          <button class="btn btn-ghost btn-xs gallery-delete" type="button">
            <i class="fa-solid fa-trash" aria-hidden="true"></i> Supprimer
          </button>
        </div>
      </div>`;
    return card;
  }

  async function loadGallery() {
    const host = document.getElementById("gallery-admin");
    if (!host) return;
    try {
      const payload = await api("/api/admin/media");
      galleryCache = payload.media || [];
      host.innerHTML = "";
      if (!galleryCache.length) {
        host.innerHTML = '<div class="u-card adm-empty">Aucune photo enregistrée.</div>';
        return;
      }
      galleryCache.forEach((item) => host.appendChild(galleryCard(item)));
    } catch (error) {
      host.innerHTML = `<div class="u-card adm-empty">${esc(error.message)}</div>`;
    }
  }

  function showGalleryList() {
    document.getElementById("gallery-list-view").hidden = false;
    document.getElementById("gallery-editor-view").hidden = true;
    setModuleStatus("gallery-editor-status", "", "");
  }

  function openGalleryEditor(mediaId = "") {
    const item = mediaId ? galleryCache.find((media) => media.id === mediaId) : null;
    const form = document.getElementById("gallery-editor-form");
    if (!form) return;
    form.reset();
    document.getElementById("gallery-id").value = item?.id || "";
    document.getElementById("gallery-caption").value = item?.caption || "";
    document.getElementById("gallery-editor-title").textContent = item ? "Modifier la photo" : "Ajouter une photo";
    document.getElementById("gallery-editor-subtitle").textContent = item
      ? "Modifiez la légende de cette photo."
      : "JPG, PNG ou WebP, 3 Mo maximum.";
    document.getElementById("gallery-save-label").textContent = item ? "Enregistrer les modifications" : "Ajouter la photo";
    document.getElementById("gallery-image-field").hidden = Boolean(item);
    const preview = document.getElementById("gallery-image-preview");
    preview.src = item?.url || "";
    preview.hidden = !item?.url;
    document.getElementById("gallery-list-view").hidden = true;
    document.getElementById("gallery-editor-view").hidden = false;
    (item ? document.getElementById("gallery-caption") : document.getElementById("gallery-image")).focus();
  }

  function bindGallery() {
    const form = document.getElementById("gallery-editor-form");
    const host = document.getElementById("gallery-admin");
    const imageInput = document.getElementById("gallery-image");
    if (!form || !host || !imageInput) return;

    document.getElementById("gallery-new-button")?.addEventListener("click", () => openGalleryEditor());
    document.getElementById("gallery-editor-back")?.addEventListener("click", showGalleryList);
    document.getElementById("gallery-editor-cancel")?.addEventListener("click", showGalleryList);
    imageInput.addEventListener("change", () => {
      const file = imageInput.files?.[0];
      if (!file) return;
      const preview = document.getElementById("gallery-image-preview");
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.getElementById("gallery-save-submit");
      const id = document.getElementById("gallery-id").value;
      button.classList.add("btn-loading");
      try {
        if (id) {
          await api("/api/admin/media", {
            method: "PATCH",
            body: JSON.stringify({
              id,
              caption: document.getElementById("gallery-caption").value,
            }),
          });
        } else {
          const file = imageInput.files?.[0];
          const ext = file && { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
          if (!file || !ext || file.size > 3 * 1024 * 1024) {
            throw new Error("Sélectionnez une image JPG, PNG ou WebP de 3 Mo maximum.");
          }
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
            reader.readAsDataURL(file);
          });
          await api("/api/admin/media", {
            method: "POST",
            body: JSON.stringify({
              caption: document.getElementById("gallery-caption").value,
              image_base64: dataUrl.split(",")[1],
              image_ext: ext,
            }),
          });
        }
        await loadGallery();
        showGalleryList();
        setModuleStatus("gallery-status", "success", id ? "Photo modifiée." : "Photo ajoutée.");
      } catch (error) {
        setModuleStatus("gallery-editor-status", "error", error.message);
      } finally {
        button.classList.remove("btn-loading");
      }
    });

    host.addEventListener("click", async (event) => {
      const card = event.target.closest(".adm-gallery-card");
      if (!card) return;
      if (event.target.closest(".gallery-edit")) {
        openGalleryEditor(card.dataset.id);
        return;
      }
      if (!event.target.closest(".gallery-delete")) return;
      if (!window.confirm("Supprimer définitivement cette photo ?")) return;
      try {
        await api("/api/admin/media", {
          method: "DELETE",
          body: JSON.stringify({ id: card.dataset.id }),
        });
        await loadGallery();
        setModuleStatus("gallery-status", "success", "Photo supprimée.");
      } catch (error) {
        setModuleStatus("gallery-status", "error", error.message);
      }
    });
  }

  async function loadIntegrations() {
    const host = document.getElementById("integrations-admin");
    const site = document.getElementById("integrations-site-url");
    if (!host) return;
    try {
      const payload = await api("/api/admin/integrations");
      host.innerHTML = "";
      payload.integrations.forEach((item) => {
        const card = document.createElement("article");
        card.className = `u-card adm-integration ${item.configured ? "is-ready" : "is-missing"}`;
        card.innerHTML = `
          <div class="adm-integration-icon">
            <i class="fa-solid ${item.configured ? "fa-circle-check" : "fa-triangle-exclamation"}" aria-hidden="true"></i>
          </div>
          <div>
            <h4>${esc(item.label)}</h4>
            <span class="badge ${item.configured ? "approved" : "pending"}">
              ${item.configured ? "Configuré" : "À configurer"}
            </span>
            <p>${esc(item.detail)}</p>
          </div>`;
        host.appendChild(card);
      });
      site.textContent = `SITE_URL : ${payload.site_url || "non configurée"}`;
    } catch (error) {
      host.innerHTML = `<div class="u-card adm-empty">${esc(error.message)}</div>`;
    }
  }

  function bindIntegrations() {
    document.getElementById("integrations-refresh")?.addEventListener("click", loadIntegrations);
  }

  document.getElementById("tbl-members").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const row = button.closest("tr");
    const status = button.dataset.action;
    button.classList.add("btn-loading");

    try {
      await api("/api/admin/dashboard", {
        method: "PATCH",
        body: JSON.stringify({ member_id: row.dataset.id, status }),
      });
      const badge = row.querySelector(".badge");
      badge.className = `badge ${status}`;
      badge.textContent = status;
    } catch (error) {
      console.error(error);
    } finally {
      button.classList.remove("btn-loading");
    }
  });

  function bindTrivia() {
    const button = document.getElementById("tv-generate");
    const status = document.getElementById("tv-status");
    const list = document.getElementById("tv-result");

    button.addEventListener("click", async () => {
      status.className = "ea-form-status";
      list.innerHTML = "";
      button.classList.add("btn-loading");
      button.textContent = "Génération en cours… (jusqu'à 60 s)";

      try {
        const payload = await api("/api/trivia/generate", {
          method: "POST",
          body: JSON.stringify({
            count: parseInt(document.getElementById("tv-count").value, 10) || 8,
            source_text: document.getElementById("tv-source").value.trim() || undefined,
          }),
        });

        status.className = "ea-form-status success";
        status.textContent = `${payload.inserees} questions insérées dans Supabase.`;
        payload.questions.forEach((question) => {
          const item = document.createElement("li");
          item.textContent = question.question;
          list.appendChild(item);
        });
        document.getElementById("st-trivia").textContent =
          String(Number(document.getElementById("st-trivia").textContent) + payload.inserees);
        await loadTriviaBank();
      } catch (error) {
        console.error(error);
        status.className = "ea-form-status error";
        status.textContent = error.message;
      } finally {
        button.classList.remove("btn-loading");
        button.innerHTML =
          '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Générer les questions';
      }
    });
  }

  function bindPinChange() {
    const form = document.getElementById("pin-change-form");
    const currentInput = document.getElementById("pin-current");
    const newInput = document.getElementById("pin-new");
    const confirmInput = document.getElementById("pin-confirm");
    const button = document.getElementById("pin-change-submit");
    const status = document.getElementById("pin-change-status");

    [currentInput, newInput, confirmInput].forEach((input) => {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 8);
      });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "ea-form-status";

      const currentPin = currentInput.value;
      const newPin = newInput.value;
      const confirmation = confirmInput.value;

      if (!/^\d{4,8}$/.test(currentPin) || !/^\d{4,8}$/.test(newPin)) {
        status.className = "ea-form-status error";
        status.textContent = "Les PIN doivent contenir entre 4 et 8 chiffres.";
        return;
      }
      if (newPin !== confirmation) {
        status.className = "ea-form-status error";
        status.textContent = "La confirmation ne correspond pas au nouveau PIN.";
        return;
      }

      button.classList.add("btn-loading");
      button.textContent = "Modification…";

      try {
        const payload = await api("/api/auth/change-pin", {
          method: "POST",
          body: JSON.stringify({
            current_pin: currentPin,
            new_pin: newPin,
          }),
        });
        form.reset();
        status.className = "ea-form-status success";
        status.textContent = payload.message;
      } catch (error) {
        console.error(error);
        status.className = "ea-form-status error";
        status.textContent = error.message;
      } finally {
        button.classList.remove("btn-loading");
        button.innerHTML =
          '<i class="fa-solid fa-key" aria-hidden="true"></i> Modifier le PIN';
      }
    });
  }

  function bindPseudoChange() {
    const form   = document.getElementById("pseudo-change-form");
    if (!form) return;

    const input  = document.getElementById("pseudo-new");
    const button = document.getElementById("pseudo-change-submit");
    const status = document.getElementById("pseudo-change-status");

    // Pré-remplir avec le pseudo actuel si disponible
    client.auth.getSession().then(({ data: { session } }) => {
      const current = session?.user?.user_metadata?.pseudo
        || session?.user?.user_metadata?.nom?.trim().split(/\s+/)[0]
        || "";
      if (current) input.placeholder = current;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "ea-form-status";

      const pseudo = input.value.trim();
      if (pseudo.length < 2 || pseudo.length > 30) {
        status.className = "ea-form-status error";
        status.textContent = "Le pseudo doit faire entre 2 et 30 caractères.";
        return;
      }

      button.classList.add("btn-loading");
      button.textContent = "Mise à jour…";

      try {
        const { error } = await client.auth.updateUser({ data: { pseudo } });
        if (error) throw error;

        form.reset();
        input.placeholder = pseudo;
        status.className = "ea-form-status success";
        status.textContent = `Pseudo mis à jour : "${pseudo}". Il apparaîtra dans la nav à votre prochaine visite.`;
      } catch (err) {
        console.error(err);
        status.className = "ea-form-status error";
        status.textContent = "Mise à jour impossible pour le moment.";
      } finally {
        button.classList.remove("btn-loading");
        button.innerHTML = '<i class="fa-solid fa-circle-user" aria-hidden="true"></i> Mettre à jour le pseudo';
      }
    });
  }

  function bindPasswordChange() {
    const form = document.getElementById("pwd-change-form");
    if (!form) return;

    const newInput = document.getElementById("pwd-new");
    const confirmInput = document.getElementById("pwd-confirm");
    const button = document.getElementById("pwd-change-submit");
    const status = document.getElementById("pwd-change-status");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "ea-form-status";

      const password = newInput.value;
      if (password.length < 10) {
        status.className = "ea-form-status error";
        status.textContent = "10 caractères minimum.";
        return;
      }
      if (password !== confirmInput.value) {
        status.className = "ea-form-status error";
        status.textContent = "La confirmation ne correspond pas au nouveau mot de passe.";
        return;
      }

      button.classList.add("btn-loading");
      button.textContent = "Modification…";

      try {
        // Session active : Supabase autorise la mise à jour directe du mot de passe.
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;

        form.reset();
        status.className = "ea-form-status success";
        status.textContent = "Mot de passe modifié. Utilisez-le dès votre prochaine connexion.";
      } catch (error) {
        console.error(error);
        status.className = "ea-form-status error";
        status.textContent = /weak|short|password/i.test(error.message || "")
          ? "Mot de passe refusé par Supabase (trop faible)."
          : "Modification impossible pour le moment.";
      } finally {
        button.classList.remove("btn-loading");
        button.innerHTML =
          '<i class="fa-solid fa-lock" aria-hidden="true"></i> Changer le mot de passe';
      }
    });
  }

  /* ----- Équipe / Organigramme (table team_members via /api/admin/team) ----- */
  const TEAM_SECTIONS = [
    ["coordination-nationale", "Coordination Nationale"],
    ["conseil-strategique", "Conseil Stratégique"],
    ["coordonnateurs-adjoints", "Coordonnateurs Nationaux Adjoints"],
    ["coordonnateurs-departementaux", "Coordonnateurs Départementaux"],
    ["branches-exterieures", "Branches Extérieures (diaspora)"],
  ];

  const teamInitials = (member) =>
    (member.nom || member.poste || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0] || "")
      .join("")
      .toUpperCase();

  const teamNote = (type, message) => {
    const status = document.getElementById("team-status");
    if (!status) return;
    status.className = `ea-form-status ${type}`;
    status.textContent = message;
  };

  function teamRow(member) {
    const row = document.createElement("div");
    row.className = "adm-team-row";
    row.dataset.id = member.id;
    row.dataset.ordre = member.ordre ?? 0;
    row.setAttribute("draggable", "true");
    row.innerHTML = `
      <span class="drag-handle" title="Glisser pour réordonner">
        <i class="fa-solid fa-grip-vertical" aria-hidden="true"></i>
      </span>
      <div class="adm-team-thumb"></div>
      <input class="ti-nom" placeholder="Nom (vide = vacant)" maxlength="120">
      <input class="ti-poste" placeholder="Poste / zone" maxlength="120">
      <label class="btn btn-ghost btn-xs" title="Photo : JPG, PNG ou WebP — 2 Mo max">
        <i class="fa-solid fa-camera" aria-hidden="true"></i>
        <input type="file" class="ti-photo" accept="image/jpeg,image/png,image/webp" hidden>
      </label>
      <button type="button" class="btn btn-primary btn-xs ti-save" title="Enregistrer">
        <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
      </button>
      <button type="button" class="btn btn-ghost btn-xs ti-del" title="Supprimer">
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
      </button>`;

    const thumb = row.querySelector(".adm-team-thumb");
    if (member.photo_url) {
      const img = document.createElement("img");
      img.src = member.photo_url;
      img.alt = "";
      thumb.appendChild(img);
    } else {
      thumb.textContent = teamInitials(member);
    }

    row.querySelector(".ti-nom").value = member.nom || "";
    row.querySelector(".ti-poste").value = member.poste || "";
    return row;
  }

  // Sections stockées en localStorage pour permettre renommage/ajout sans DB
  function getSections() {
    try {
      const stored = localStorage.getItem("ea-org-sections");
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return TEAM_SECTIONS.map(([k, l]) => ({ key: k, label: l }));
  }
  function saveSections(sections) {
    localStorage.setItem("ea-org-sections", JSON.stringify(sections));
  }

  async function loadTeam() {
    const host = document.getElementById("team-admin");
    if (!host) return;

    try {
      const { members } = await api("/api/admin/team");
      host.innerHTML = "";

      const sections = getSections();
      // Sections déduites de la DB qui n'existent pas encore dans la liste locale
      const knownKeys = new Set(sections.map((s) => s.key));
      members.forEach((m) => {
        if (m.section && !knownKeys.has(m.section)) {
          sections.push({ key: m.section, label: m.section });
          knownKeys.add(m.section);
        }
      });

      sections.forEach((sec) => {
        const block = document.createElement("div");
        block.className = "adm-team-section";
        block.dataset.sectionKey = sec.key;
        block.innerHTML = `
          <div class="adm-team-head" style="align-items:center; gap:.5rem;">
            <input type="text" class="adm-section-title-edit" value="${sec.label}"
                   title="Cliquez pour renommer la section" data-orig="${sec.key}">
            <button type="button" class="btn btn-ghost btn-xs ti-rename-section" data-section="${sec.key}" title="Renommer">
              <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn btn-ghost btn-xs ti-add" data-section="${sec.key}" style="margin-left:auto;">
              <i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter une carte
            </button>
          </div>`;
        members
          .filter((member) => member.section === sec.key)
          .forEach((member) => block.appendChild(teamRow(member)));
        host.appendChild(block);
      });
    } catch (error) {
      console.error(error);
      const host2 = document.getElementById("team-admin");
      if (host2) host2.innerHTML = "";
      teamNote("error", error.message);
    }
  }

  function bindTeam() {
    const host = document.getElementById("team-admin");
    if (!host) return;

    /* ── Drag-and-drop : réorganisation des membres ────────────────────── */
    let dragSrc = null;
    let dragDropTarget = null;

    function clearDragState() {
      if (dragSrc) dragSrc.classList.remove("is-dragging");
      host.querySelectorAll(".drop-before, .drop-after").forEach((el) => {
        el.classList.remove("drop-before", "drop-after");
      });
      host.querySelectorAll(".drop-empty").forEach((el) => el.classList.remove("drop-empty"));
      dragSrc = null;
      dragDropTarget = null;
    }

    async function reindexSection(sectionEl) {
      const rows = [...sectionEl.querySelectorAll(".adm-team-row")];
      await Promise.all(rows.map((row, idx) =>
        api("/api/admin/team", {
          method: "PATCH",
          body: JSON.stringify({ id: row.dataset.id, ordre: idx }),
        })
      ));
    }

    host.addEventListener("dragstart", (event) => {
      if (!event.target.closest(".drag-handle")) {
        event.preventDefault();
        return;
      }
      const row = event.target.closest(".adm-team-row");
      if (!row) return;
      dragSrc = row;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", row.dataset.id);
      window.setTimeout(() => row.classList.add("is-dragging"), 0);
    });

    host.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const targetRow = event.target.closest(".adm-team-row");
      const targetSection = event.target.closest(".adm-team-section");
      if (!targetRow && !targetSection) return;

      if (targetRow && targetRow !== dragSrc) {
        if (dragDropTarget && dragDropTarget !== targetRow) {
          dragDropTarget.classList.remove("drop-before", "drop-after");
        }
        dragDropTarget = targetRow;
        const rect = targetRow.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        targetRow.classList.toggle("drop-before", before);
        targetRow.classList.toggle("drop-after", !before);
        if (targetSection) targetSection.classList.remove("drop-empty");
      } else if (targetSection) {
        const hasRows = targetSection.querySelector(".adm-team-row");
        if (!hasRows) targetSection.classList.add("drop-empty");
      }
    });

    host.addEventListener("dragleave", (event) => {
      const row = event.target.closest(".adm-team-row");
      if (row && !row.contains(event.relatedTarget)) {
        row.classList.remove("drop-before", "drop-after");
      }
      const section = event.target.closest(".adm-team-section");
      if (section && !section.contains(event.relatedTarget)) {
        section.classList.remove("drop-empty");
      }
    });

    host.addEventListener("drop", async (event) => {
      event.preventDefault();
      if (!dragSrc) return;

      const targetRow = event.target.closest(".adm-team-row");
      const targetSection = event.target.closest(".adm-team-section");
      const srcSection = dragSrc.closest(".adm-team-section");

      let dropped = false;

      if (targetRow && targetRow !== dragSrc) {
        const rect = targetRow.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        if (before) {
          targetRow.parentElement.insertBefore(dragSrc, targetRow);
        } else {
          targetRow.parentElement.insertBefore(dragSrc, targetRow.nextSibling);
        }
        dropped = true;
      } else if (targetSection && !targetSection.querySelector(".adm-team-row")) {
        targetSection.appendChild(dragSrc);
        dropped = true;
      }

      const newSection = dragSrc.closest(".adm-team-section");
      const movedId = dragSrc.dataset.id;
      clearDragState();

      if (!dropped || !newSection) return;

      const sectionChanged = srcSection !== newSection;
      try {
        if (sectionChanged) {
          const newKey = newSection.dataset.sectionKey;
          await api("/api/admin/team", {
            method: "PATCH",
            body: JSON.stringify({ id: movedId, section: newKey }),
          });
        }
        await reindexSection(newSection);
        if (sectionChanged) await reindexSection(srcSection);
        teamNote("success", "Ordre mis à jour.");
      } catch (error) {
        teamNote("error", error.message);
        await loadTeam();
      }
    });

    host.addEventListener("dragend", clearDragState);

    /* ── Clics : ajout / sauvegarde / suppression ──────────────────────── */
    host.addEventListener("click", async (event) => {
      const addBtn = event.target.closest(".ti-add");
      const saveBtn = event.target.closest(".ti-save");
      const delBtn = event.target.closest(".ti-del");
      if (!addBtn && !saveBtn && !delBtn) return;

      const row = event.target.closest(".adm-team-row");

      try {
        if (addBtn) {
          addBtn.classList.add("btn-loading");
          await api("/api/admin/team", {
            method: "POST",
            body: JSON.stringify({ section: addBtn.dataset.section, ordre: 99 }),
          });
          await loadTeam();
          teamNote("success", "Carte ajoutée — remplissez le nom ou le poste puis enregistrez.");
          return;
        }

        if (saveBtn && row) {
          saveBtn.classList.add("btn-loading");
          await api("/api/admin/team", {
            method: "PATCH",
            body: JSON.stringify({
              id: row.dataset.id,
              nom: row.querySelector(".ti-nom").value,
              poste: row.querySelector(".ti-poste").value,
            }),
          });
          teamNote("success", "Carte enregistrée — la page Organisation est à jour.");
        }

        if (delBtn && row) {
          if (!window.confirm("Supprimer cette carte de l'organigramme ?")) return;
          delBtn.classList.add("btn-loading");
          await api("/api/admin/team", {
            method: "DELETE",
            body: JSON.stringify({ id: row.dataset.id }),
          });
          row.remove();
          teamNote("success", "Carte supprimée.");
        }
      } catch (error) {
        console.error(error);
        teamNote("error", error.message);
      } finally {
        host.querySelectorAll(".btn-loading").forEach((b) => b.classList.remove("btn-loading"));
      }
    });

    host.addEventListener("change", (event) => {
      const input = event.target.closest(".ti-photo");
      if (!input || !input.files[0]) return;

      const row = input.closest(".adm-team-row");
      const file = input.files[0];

      if (file.size > 2 * 1024 * 1024) {
        teamNote("error", "Photo trop lourde (2 Mo maximum).");
        input.value = "";
        return;
      }

      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
      if (!ext) {
        teamNote("error", "Format accepté : JPG, PNG ou WebP.");
        input.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = String(reader.result).split(",")[1];
          const { member } = await api("/api/admin/team", {
            method: "PATCH",
            body: JSON.stringify({ id: row.dataset.id, photo_base64: base64, photo_ext: ext }),
          });
          const thumb = row.querySelector(".adm-team-thumb");
          thumb.innerHTML = "";
          const img = document.createElement("img");
          img.src = member.photo_url;
          img.alt = "";
          thumb.appendChild(img);
          teamNote("success", "Photo mise à jour.");
        } catch (error) {
          console.error(error);
          teamNote("error", error.message);
        } finally {
          input.value = "";
        }
      };
      reader.readAsDataURL(file);
    });
  }

  (async () => {
    const sessionResult = await client.auth.getSession();
    session = sessionResult.data.session;
    if (!session) {
      deny("Vous devez être connecté pour accéder au Dashboard.");
      return;
    }

    const membreLink = document.getElementById("adm-membre-link");
    if (membreLink) membreLink.hidden = false;

    const logout = document.getElementById("adm-logout");
    logout.hidden = false;
    logout.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      await client.auth.signOut();
      localStorage.removeItem("ea-is-admin");
      window.location.href = "/login.html";
    });

    // Vérifie le rôle directement via Supabase (fonctionne sans API Vercel)
    const { data: profileRow, error: profileErr } = await client
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileErr || profileRow?.role !== "superadmin") {
      deny("Accès réservé aux administrateurs.", false);
      return;
    }

    // Affichage immédiat — rôle confirmé par Supabase
    const meta = session.user.user_metadata || {};
    const display =
      meta.pseudo ||
      meta.nom?.trim().split(/\s+/)[0] ||
      session.user.email;

    const emailEl = document.getElementById("adm-email");
    if (emailEl) emailEl.textContent = display;

    const emailTopEl = document.getElementById("adm-email-top");
    if (emailTopEl) emailTopEl.textContent = display;

    const roleBadge = document.getElementById("adm-role");
    if (roleBadge) { roleBadge.textContent = "superadmin"; roleBadge.hidden = false; }

    // Initiales pour avatar
    const nameWords = (meta.nom || meta.pseudo || display).trim().split(/\s+/).filter(Boolean);
    const initials = nameWords.length >= 2
      ? (nameWords[0][0] + nameWords[nameWords.length - 1][0]).toUpperCase()
      : display.slice(0, 2).toUpperCase();
    document.querySelectorAll(".adm-avatar").forEach((el) => { el.textContent = initials; });

    // Date du jour dans le panel accueil
    const todayEl = document.getElementById("adm-today");
    if (todayEl) {
      todayEl.textContent = new Date().toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
    }

    guard.hidden = true;
    app.hidden = false;
    startPinSecurity();

    // Wire des interactions UI
    bindListTools();
    bindArticleLibrary();
    bindEventLibrary();
    bindGallery();
    bindIntegrations();
    bindTrivia();
    bindTriviaBank();
    bindPseudoChange();
    bindPinChange();
    bindPasswordChange();
    bindTeam();
    bindOrgSections();
    bindSettings();
    bindStaffPanel();
    bindLogsPanel();

    // Chargement des données API (optionnel — silencieux si API indisponible)
    try {
      const payload = await api("/api/admin/dashboard");
      // Enrichit les stats si l'API répond
      document.getElementById("st-members").textContent = payload.stats?.members ?? "—";
      document.getElementById("st-donations").textContent = payload.stats
        ? fmtMoney(payload.stats.donations_cents, "usd") : "—";
      document.getElementById("st-leads").textContent = payload.stats?.leads ?? "—";
      document.getElementById("st-trivia").textContent = payload.stats?.trivia ?? "—";
      document.getElementById("st-articles").textContent = payload.stats?.articles ?? "—";
      document.getElementById("st-events").textContent = payload.stats?.events ?? "—";
      document.getElementById("st-media").textContent = payload.stats?.media ?? "—";
      if (payload.members) renderMembers(payload.members);
      if (payload.donations) renderDonations(payload.donations);
      if (payload.leads) renderLeads(payload.leads);
    } catch (_) { /* API indisponible localement — statistiques vides */ }

    loadArticleLibrary();
    loadEventLibrary();
    loadGallery();
    loadIntegrations();
    loadTriviaBank();
    loadTeam();
  })();

  /* ─── Organigramme : sections éditables ──────────────────────────── */
  function bindOrgSections() {
    // Bouton "Nouvelle section"
    const addSectionBtn = document.getElementById("org-add-section");
    if (addSectionBtn) {
      addSectionBtn.addEventListener("click", async () => {
        const name = prompt("Nom de la nouvelle section :");
        if (!name?.trim()) return;
        const key = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const sections = getSections();
        if (sections.find((s) => s.key === key)) {
          teamNote("error", "Une section avec ce nom existe déjà.");
          return;
        }
        sections.push({ key, label: name.trim() });
        saveSections(sections);
        await loadTeam();
        teamNote("success", `Section « ${name.trim()} » ajoutée.`);
      });
    }

    // Renommage inline : délégation sur team-admin
    const host = document.getElementById("team-admin");
    if (!host) return;

    host.addEventListener("click", async (event) => {
      const renameBtn = event.target.closest(".ti-rename-section");
      if (!renameBtn) return;
      const sectionKey = renameBtn.dataset.section;
      const block = renameBtn.closest(".adm-team-section");
      const input = block?.querySelector(".adm-section-title-edit");
      const newLabel = input?.value?.trim();
      if (!newLabel || !sectionKey) return;

      const sections = getSections();
      const sec = sections.find((s) => s.key === sectionKey);
      if (sec) {
        const oldLabel = sec.label;
        sec.label = newLabel;
        saveSections(sections);
        teamNote("success", `Section renommée « ${newLabel} ».`);
        // Mettre à jour le data-orig pour cohérence
        if (input) input.dataset.orig = sectionKey;
        if (newLabel !== oldLabel) {
          renameBtn.classList.add("btn-loading");
          try { await loadTeam(); } finally { renameBtn.classList.remove("btn-loading"); }
        }
      }
    });
  }

  /* ─── Panel Paramètres (popups + contact + clés API) ─────────────── */
  function bindSettings() {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val === true; };
    const status = (id, type, msg) => {
      const el = document.getElementById(id);
      if (el) { el.className = `ea-form-status ${type}`; el.textContent = msg; }
    };

    // Charge les réglages depuis l'API (une fois, puis à chaque ouverture du panel).
    let loaded = false;
    async function loadSettings() {
      try {
        const { settings } = await api("/api/admin/settings");
        const v = settings?.popup_video || {};
        setChk("popup-video-enabled", v.enabled);
        setVal("popup-video-url", v.url || "");
        setVal("popup-video-headline", v.headline || "");
        setVal("popup-video-subtext", v.subtext || "");

        const f = settings?.popup_football || {};
        setChk("popup-football-enabled", f.enabled !== false);
        setVal("popup-football-interval", f.intervalSec || 60);

        const c = settings?.contact || {};
        setVal("set-address", c.address || "44, Impasse Lescot, Laboule 12, Pétionville, Haïti");
        setVal("set-phone",   c.phone   || "+509 4621-2121");
        setVal("set-email",   c.email   || "contact@enavant.org");
        loaded = true;
      } catch (error) {
        status("popup-video-status", "error",
          error.status === 404 || /site_settings|relation/i.test(error.message)
            ? "Table site_settings absente — exécutez supabase/site-settings.sql."
            : error.message);
      }
    }
    document.querySelector("[data-panel='panel-settings']")?.addEventListener("click", () => { if (!loaded) loadSettings(); });
    loadSettings();

    const saveSetting = (key, value) => api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ key, value }) });

    // Popup vidéo
    document.getElementById("settings-video-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("popup-video-submit");
      btn.classList.add("btn-loading");
      try {
        await saveSetting("popup_video", {
          enabled:  document.getElementById("popup-video-enabled").checked,
          url:      document.getElementById("popup-video-url").value.trim(),
          headline: document.getElementById("popup-video-headline").value.trim(),
          subtext:  document.getElementById("popup-video-subtext").value.trim(),
        });
        status("popup-video-status", "success", "Popup vidéo enregistrée.");
      } catch (error) {
        status("popup-video-status", "error", error.message);
      } finally { btn.classList.remove("btn-loading"); }
    });

    // Popup Grenadiers
    document.getElementById("settings-football-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("popup-football-submit");
      btn.classList.add("btn-loading");
      try {
        await saveSetting("popup_football", {
          enabled:     document.getElementById("popup-football-enabled").checked,
          intervalSec: parseInt(document.getElementById("popup-football-interval").value, 10) || 60,
        });
        status("popup-football-status", "success", "Popup Grenadiers enregistrée.");
      } catch (error) {
        status("popup-football-status", "error", error.message);
      } finally { btn.classList.remove("btn-loading"); }
    });

    // Infos de contact
    document.getElementById("settings-contact-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("settings-contact-submit");
      btn.classList.add("btn-loading");
      try {
        await saveSetting("contact", {
          address: document.getElementById("set-address").value.trim(),
          phone:   document.getElementById("set-phone").value.trim(),
          email:   document.getElementById("set-email").value.trim(),
        });
        status("settings-contact-status", "success", "Informations de contact enregistrées.");
      } catch (error) {
        status("settings-contact-status", "error", error.message);
      } finally { btn.classList.remove("btn-loading"); }
    });

    // Clés API : gérées via les variables d'environnement Vercel.
    document.getElementById("settings-apikeys-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      status("settings-apikeys-status", "info", "Les clés API se modifient dans Vercel → Settings → Environment Variables (jamais exposées au navigateur).");
    });
  }

  /* ─── Panel Équipe staff ──────────────────────────────────────────── */
  function bindStaffPanel() {
    const host = document.getElementById("staff-list");
    const form = document.getElementById("user-create-form");
    if (!host) return;

    const ROLE_LABELS = { superadmin: "SuperAdmin", editor: "Éditeur", readonly: "Lecture seule", member: "Membre" };
    const ROLE_KEYS = ["editor", "readonly", "member", "superadmin"];
    const PERMISSIONS = {
      superadmin: [
        "Accès complet au dashboard", "Créer et gérer les utilisateurs", "Gérer les articles",
        "Gérer les événements", "Gérer la galerie", "Gérer l'organigramme",
        "Gérer le Trivia", "Voir et traiter les membres", "Voir les dons et les leads",
        "Gérer les paramètres et la sécurité",
      ],
      editor: [
        "Accès à l'espace membre", "Consulter les contenus publics",
        "Aucun accès au dashboard administratif actuellement",
      ],
      readonly: [
        "Accès à l'espace membre", "Consulter les contenus publics",
        "Aucun accès au dashboard administratif actuellement",
      ],
      member: [
        "Accès à l'espace membre", "Participer au Trivia",
        "Consulter les contenus réservés aux membres",
      ],
    };
    let meId = null;

    const status = (type, msg) => setModuleStatus("user-status", type, msg);
    const listStatus = (type, msg) => setModuleStatus("user-list-status", type, msg);

    function permissionMarkup(role) {
      return (PERMISSIONS[role] || []).map((permission) => `
        <span class="adm-permission-chip">
          <i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(permission)}
        </span>`).join("");
    }

    function userRow(u) {
      const name = u.nom || u.username || u.email || "?";
      const isMe = u.id === meId;
      return `<article class="u-card adm-user-card" data-id="${esc(u.id)}">
        <div class="adm-staff-row">
          <div class="adm-staff-avatar">${esc(String(name)[0].toUpperCase())}</div>
          <div class="adm-staff-info">
            <strong>${esc(name)}${isMe ? ' <span class="badge approved">vous</span>' : ""}</strong>
            <span>${esc(u.email || "")}</span>
          </div>
          <select class="ea-select-sm user-role-select" data-id="${esc(u.id)}" aria-label="Rôle">
            ${ROLE_KEYS.map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}
          </select>
          <button class="btn btn-ghost btn-xs user-delete" data-id="${esc(u.id)}" title="Supprimer le compte" ${isMe ? "disabled" : ""}>
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </div>
        <div class="adm-user-permissions">
          <strong>Permissions</strong>
          <div class="adm-permission-list">${permissionMarkup(u.role)}</div>
        </div>
      </article>`;
    }

    async function loadUsers() {
      host.innerHTML = '<p class="adm-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement des comptes…</p>';
      try {
        const { users, me } = await api("/api/admin/users");
        meId = me;
        if (!users?.length) { host.innerHTML = '<p class="adm-empty">Aucun utilisateur.</p>'; return; }
        host.innerHTML = users.map(userRow).join("");
      } catch (error) {
        host.innerHTML = `<p class="adm-empty">${esc(error.message)}</p>`;
      }
    }

    function renderPermissionPreview() {
      const role = document.getElementById("user-role")?.value || "editor";
      const preview = document.getElementById("user-permissions-preview");
      if (preview) preview.innerHTML = permissionMarkup(role);
    }

    function showEditor() {
      form?.reset();
      renderPermissionPreview();
      document.getElementById("users-list-view").hidden = true;
      document.getElementById("user-editor-view").hidden = false;
      document.getElementById("user-nom")?.focus();
    }

    document.getElementById("user-new-button")?.addEventListener("click", showEditor);
    document.getElementById("user-editor-back")?.addEventListener("click", showUserList);
    document.getElementById("user-editor-cancel")?.addEventListener("click", showUserList);
    document.getElementById("user-role")?.addEventListener("change", renderPermissionPreview);

    // Création d'un utilisateur
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.getElementById("user-create-submit");
      button.classList.add("btn-loading");
      try {
        await api("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            nom: document.getElementById("user-nom").value.trim(),
            username: document.getElementById("user-pseudo").value.trim(),
            email: document.getElementById("user-email").value.trim(),
            password: document.getElementById("user-password").value,
            role: document.getElementById("user-role").value,
          }),
        });
        form.reset();
        await loadUsers();
        showUserList();
        listStatus("success", "Utilisateur créé.");
      } catch (error) {
        status("error", error.message);
      } finally {
        button.classList.remove("btn-loading");
      }
    });

    // Générateur de mot de passe provisoire
    document.getElementById("user-gen-pw")?.addEventListener("click", () => {
      const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%";
      const pw = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map((b) => chars[b % chars.length]).join("");
      const field = document.getElementById("user-password");
      field.value = pw;
      field.focus();
    });

    // Changement de rôle (délégation)
    host.addEventListener("change", async (event) => {
      const select = event.target.closest(".user-role-select");
      if (!select) return;
      try {
        await api("/api/admin/users", { method: "PATCH", body: JSON.stringify({ id: select.dataset.id, role: select.value }) });
        listStatus("success", "Rôle et permissions mis à jour.");
        await loadUsers();
      } catch (error) {
        listStatus("error", error.message);
        await loadUsers();
      }
    });

    // Suppression (délégation)
    host.addEventListener("click", async (event) => {
      const del = event.target.closest(".user-delete");
      if (!del) return;
      if (!window.confirm("Supprimer définitivement ce compte ? Cette action est irréversible.")) return;
      try {
        await api("/api/admin/users", { method: "DELETE", body: JSON.stringify({ id: del.dataset.id }) });
        listStatus("success", "Compte supprimé.");
        await loadUsers();
      } catch (error) {
        listStatus("error", error.message);
      }
    });

    // Chargement à la première ouverture du panneau
    document.querySelector("[data-panel='panel-equipe']")?.addEventListener("click", () => {
      if (!host.dataset.loaded) { loadUsers(); host.dataset.loaded = "1"; }
    });
  }

  function showUserList() {
    const list = document.getElementById("users-list-view");
    const editor = document.getElementById("user-editor-view");
    if (list) list.hidden = false;
    if (editor) editor.hidden = true;
    setModuleStatus("user-status", "", "");
  }

  /* ─── Panel Journal d'activité ───────────────────────────────────── */
  function bindLogsPanel() {
    const host = document.getElementById("logs-list");
    const refreshBtn = document.getElementById("logs-refresh");
    const applyBtn  = document.getElementById("logs-filter-apply");
    if (!host) return;

    const render = (logs) => {
      if (!logs?.length) { host.innerHTML = '<p class="adm-empty">Aucune entrée dans le journal.</p>'; return; }
      host.innerHTML = `<div class="u-card">${logs.map((l) => `
        <div class="adm-log-row">
          <span class="adm-log-cat">${l.categorie || "—"}</span>
          <span class="adm-log-msg">${l.message || ""}</span>
          <span class="adm-log-meta">${l.username ? l.username + " · " : ""}${l.created_at ? new Date(l.created_at).toLocaleString("fr-FR") : ""}</span>
        </div>`).join("")}</div>`;
    };

    const load = async () => {
      host.innerHTML = '<p class="adm-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement…</p>';
      try {
        const cat  = document.getElementById("logs-filter-cat")?.value  || "";
        const user = document.getElementById("logs-filter-user")?.value || "";
        const from = document.getElementById("logs-filter-from")?.value || "";
        const to   = document.getElementById("logs-filter-to")?.value   || "";
        const params = new URLSearchParams({ ...(cat && { cat }), ...(user && { user }), ...(from && { from }), ...(to && { to }) });
        const { logs } = await api(`/api/admin/dashboard?dataset=logs&${params}`);
        render(logs);
      } catch (_) {
        host.innerHTML = '<p class="adm-empty">Journal non disponible (table activity_logs à créer côté DB).</p>';
      }
    };

    refreshBtn?.addEventListener("click", load);
    applyBtn?.addEventListener("click", load);
    document.querySelector("[data-panel='panel-logs']")?.addEventListener("click", () => { if (!host.dataset.loaded) { load(); host.dataset.loaded = "1"; } });
  }
})();
