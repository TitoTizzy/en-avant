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

  async function api(path, options = {}) {
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
    if (!response.ok) {
      const error = new Error(payload.error || "Requête impossible.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  const PANEL_TITLES = {
    "panel-home":         "Tableau de bord",
    "panel-articles":     "Articles",
    "panel-events":       "Événements",
    "panel-media":        "Médiathèque",
    "panel-gallery":      "Galerie",
    "panel-organisation": "Organisation",
    "panel-members":      "Membres",
    "panel-donations":    "Dons",
    "panel-leads":        "Leads",
    "panel-trivia":       "Trivia IA",
    "panel-integrations": "Intégrations",
    "panel-equipe":       "Équipe (staff)",
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
    item.addEventListener("click", () => switchPanel(item.dataset.panel));
  });
  document.querySelectorAll(".adm-quick-btn[data-panel]").forEach((btn) => {
    btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
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

  function mediaCard(item) {
    const card = document.createElement("article");
    card.className = "u-card adm-media-card";
    card.dataset.id = item.id;
    card.innerHTML = `
      <img src="${esc(item.url)}" alt="">
      <div class="ea-field">
        <label>Légende</label>
        <input class="media-caption" maxlength="180" value="${esc(item.caption || "")}">
      </div>
      <div class="adm-record-actions">
        <button class="btn btn-primary btn-xs media-save" type="button">Enregistrer</button>
        <button class="btn btn-ghost btn-xs media-delete" type="button">
          <i class="fa-solid fa-trash" aria-hidden="true"></i> Supprimer
        </button>
      </div>`;
    return card;
  }

  async function loadMedia() {
    const host = document.getElementById("media-admin");
    if (!host) return;
    try {
      const { media } = await api("/api/admin/media");
      host.innerHTML = "";
      if (!media.length) {
        host.innerHTML = '<div class="u-card adm-empty">Aucune photo enregistrée. La galerie publique conserve ses images de secours.</div>';
        return;
      }
      media.forEach((item) => host.appendChild(mediaCard(item)));
    } catch (error) {
      host.innerHTML = `<div class="u-card adm-empty">${esc(error.message)}</div>`;
    }
  }

  function bindMedia() {
    const form = document.getElementById("media-create-form");
    const host = document.getElementById("media-admin");
    const input = document.getElementById("media-image");
    if (!form || !host || !input) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const file = input.files[0];
      const ext = file && { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
      if (!file || !ext || file.size > 3 * 1024 * 1024) {
        setModuleStatus("media-status", "error", "Sélectionnez une image JPG, PNG ou WebP de 3 Mo maximum.");
        return;
      }

      const button = document.getElementById("media-create-submit");
      const reader = new FileReader();
      button.classList.add("btn-loading");
      reader.onload = async () => {
        try {
          await api("/api/admin/media", {
            method: "POST",
            body: JSON.stringify({
              caption: document.getElementById("media-caption").value,
              image_base64: String(reader.result).split(",")[1],
              image_ext: ext,
            }),
          });
          form.reset();
          setModuleStatus("media-status", "success", "Photo ajoutée à la galerie.");
          await loadMedia();
          document.getElementById("st-media").textContent =
            String(Number(document.getElementById("st-media").textContent) + 1);
        } catch (error) {
          setModuleStatus("media-status", "error", error.message);
        } finally {
          button.classList.remove("btn-loading");
        }
      };
      reader.onerror = () => {
        button.classList.remove("btn-loading");
        setModuleStatus("media-status", "error", "Lecture du fichier impossible.");
      };
      reader.readAsDataURL(file);
    });

    host.addEventListener("click", async (event) => {
      const card = event.target.closest(".adm-media-card");
      if (!card) return;
      const save = event.target.closest(".media-save");
      const remove = event.target.closest(".media-delete");
      if (!save && !remove) return;

      try {
        if (remove) {
          if (!window.confirm("Supprimer définitivement cette photo ?")) return;
          await api("/api/admin/media", {
            method: "DELETE",
            body: JSON.stringify({ id: card.dataset.id }),
          });
          card.remove();
          document.getElementById("st-media").textContent =
            String(Math.max(0, Number(document.getElementById("st-media").textContent) - 1));
          setModuleStatus("media-status", "success", "Photo supprimée.");
          return;
        }

        await api("/api/admin/media", {
          method: "PATCH",
          body: JSON.stringify({
            id: card.dataset.id,
            caption: card.querySelector(".media-caption").value,
          }),
        });
        setModuleStatus("media-status", "success", "Légende enregistrée.");
      } catch (error) {
        setModuleStatus("media-status", "error", error.message);
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
      if (error.status === 401) deny("Votre vérification PIN a expiré. Reconnectez-vous.");
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
    row.innerHTML = `
      <div class="adm-team-thumb"></div>
      <input class="ti-nom" placeholder="Nom (vide = vacant)" maxlength="120">
      <input class="ti-poste" placeholder="Poste / zone" maxlength="120">
      <input class="ti-ordre" type="number" min="0" max="999" title="Ordre d'affichage">
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
    row.querySelector(".ti-ordre").value = member.ordre ?? 0;
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
              ordre: parseInt(row.querySelector(".ti-ordre").value, 10) || 0,
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

    // Wire des interactions UI
    bindListTools();
    bindArticles();
    bindEvents();
    bindMedia();
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

    loadArticles();
    loadEvents();
    loadMedia();
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

  /* ─── Panel Paramètres (contact + clés API) ──────────────────────── */
  function bindSettings() {
    // Pré-remplir depuis localStorage
    const stored = (() => { try { return JSON.parse(localStorage.getItem("ea-contact-info") || "{}"); } catch { return {}; } })();
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    setVal("set-address", stored.address || "44, Impasse Lescot, Laboule 12, Pétionville, Haïti");
    setVal("set-phone",   stored.phone   || "+509 4621-2121");
    setVal("set-email",   stored.email   || "contact@enavant.org");

    const form = document.getElementById("settings-contact-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const info = {
          address: document.getElementById("set-address")?.value.trim(),
          phone:   document.getElementById("set-phone")?.value.trim(),
          email:   document.getElementById("set-email")?.value.trim(),
        };
        localStorage.setItem("ea-contact-info", JSON.stringify(info));
        const st = document.getElementById("settings-contact-status");
        if (st) { st.className = "ea-form-status success"; st.textContent = "Informations sauvegardées (table settings à connecter côté API)."; }
      });
    }

    const apiForm = document.getElementById("settings-apikeys-form");
    if (apiForm) {
      apiForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const st = document.getElementById("settings-apikeys-status");
        if (st) { st.className = "ea-form-status info"; st.textContent = "La mise à jour des clés API se fait via les variables d'environnement Vercel (Settings > Environment Variables)."; }
      });
    }
  }

  /* ─── Panel Équipe staff ──────────────────────────────────────────── */
  function bindStaffPanel() {
    const host = document.getElementById("staff-list");
    if (!host) return;

    // S'affiche quand on arrive sur le panel
    document.querySelector("[data-panel='panel-equipe']")?.addEventListener("click", loadStaff);

    async function loadStaff() {
      if (host.dataset.loaded) return;
      try {
        const { members } = await api("/api/admin/dashboard?dataset=members&limit=100");
        const admins = (members || []).filter((m) => m.role === "superadmin" || m.role === "editor");
        if (!admins.length) { host.innerHTML = '<p class="adm-empty">Aucun membre staff pour l\'instant.</p>'; return; }
        host.innerHTML = `<div class="u-card">${admins.map((m) => `
          <div class="adm-staff-row">
            <div class="adm-staff-avatar">${(m.pseudo || m.email || "?")[0].toUpperCase()}</div>
            <div class="adm-staff-info">
              <strong>${m.pseudo || m.email}</strong>
              <span>${m.email} · <span class="badge ${m.role === "superadmin" ? "approved" : "pending"}">${m.role}</span></span>
            </div>
          </div>`).join("")}</div>`;
        host.dataset.loaded = "1";
      } catch (_) {
        host.innerHTML = '<p class="adm-empty">Données non disponibles localement.</p>';
      }
    }
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
