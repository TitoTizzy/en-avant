/* Extrait de membre.html (Content-Security-Policy : aucun script inline). */
(() => {
  "use strict";

  const env = window.EA_ENV || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !window.supabase) {
    window.location.href = "/login.html";
    return;
  }

  const client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  // Vérifier la session, afficher les infos et détecter le rôle superadmin
  client.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) {
      window.location.href = "/login.html";
      return;
    }

    const meta    = session.user?.user_metadata || {};
    const pseudo  = meta.pseudo
      || meta.nom?.trim().split(/\s+/)[0]
      || session.user?.email?.split("@")[0]
      || "Membre";
    const nom     = meta.nom || pseudo;

    const initial = pseudo.trim()[0]?.toUpperCase() || "M";
    document.getElementById("mb-avatar").textContent   = initial;
    document.getElementById("mb-greeting").textContent = `Bonjour, ${pseudo} !`;
    document.title = `${pseudo} — Espace membre | En Avant`;

    // Vérifier rôle + permissions → afficher la carte Dashboard si autorisé
    try {
      const { data: profile } = await client
        .from("profiles")
        .select("role, permissions")
        .eq("id", session.user.id)
        .maybeSingle();

      // Adhésion pas encore approuvée : pas d'espace membre.
      if (profile?.role === "pending") {
        await client.auth.signOut();
        window.location.href = "/login.html?attente=1";
        return;
      }

      loadAdhesion();

      const isSuperAdmin = profile?.role === "superadmin";
      const perms = Array.isArray(profile?.permissions) ? profile.permissions : [];
      const hasAdminAccess = isSuperAdmin || perms.includes("acces_dashboard");

      if (hasAdminAccess) {
        const badge = document.querySelector(".membre-role-badge");
        if (badge) {
          if (isSuperAdmin) {
            badge.innerHTML = '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> SuperAdmin';
          } else {
            badge.innerHTML = '<i class="fa-solid fa-user-shield" aria-hidden="true"></i> Administrateur';
          }
        }

        const grid = document.querySelector(".membre-grid");
        if (grid) {
          const card = document.createElement("a");
          card.href = "/admin.html";
          card.className = "membre-card membre-card--admin";
          card.innerHTML = `
            <div class="membre-card-icon">
              <i class="fa-solid fa-gauge-high" aria-hidden="true"></i>
            </div>
            <h3>Dashboard Admin</h3>
            <p>Gérez les articles, l'équipe, le trivia, les médias et la sécurité.</p>`;
          grid.appendChild(card);
        }
      }
    } catch { /* Silencieux — accès profil indisponible */ }
  });

  // ─── Fiche d'adhésion (comptes créés avant le formulaire unique) ─────
  async function loadAdhesion() {
    try {
      const { status } = await memberApi("/api/member/adhesion");
      if (status === "none") document.getElementById("mb-adhesion").hidden = false;
      if (status === "pending") document.getElementById("mb-adhesion-pending").hidden = false;
    } catch { /* Silencieux : la bannière est facultative */ }
  }

  const adhesionForm = document.getElementById("mb-adhesion-form");
  adhesionForm?.elements.ninu.addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 10);
  });
  adhesionForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("mb-adhesion-status");
    const f = adhesionForm.elements;
    const show = (msg, type) => { status.textContent = msg; status.className = `membre-form-status ${type}`; };

    if (!f.sexe.value || !/^1\d{9}$/.test(f.ninu.value) || f.telephone.value.replace(/\D/g, "").length < 8
      || f.ville.value.trim().length < 2) {
      show("Vérifiez les champs : NINU à 10 chiffres commençant par 1, téléphone et ville requis.", "error");
      return;
    }
    if (!f.consent.checked) {
      show("Merci de cocher la case de consentement.", "error");
      return;
    }

    const button = adhesionForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      await memberApi("/api/member/adhesion", {
        method: "POST",
        body: JSON.stringify({
          sexe: f.sexe.value,
          ninu: f.ninu.value,
          telephone: f.telephone.value.trim(),
          ville: f.ville.value.trim(),
          consent: true,
        }),
      });
      document.getElementById("mb-adhesion").hidden = true;
      document.getElementById("mb-adhesion-pending").hidden = false;
    } catch (error) {
      show(error.message || "Envoi impossible pour le moment.", "error");
    } finally {
      button.disabled = false;
    }
  });

  // Déconnexion
  document.getElementById("mb-logout").addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "/index.html";
  });

  // ─── Panneau rédaction article ───────────────────────────────────────
  let currentSession = null;

  async function getToken() {
    const { data } = await client.auth.getSession();
    currentSession = data.session;
    return data.session?.access_token || null;
  }

  async function memberApi(path, opts = {}) {
    const token = await getToken();
    const res = await fetch(path, {
      ...opts,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...(opts.headers || {}) },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
    return payload;
  }

  function setStatus(msg, type = "") {
    const el = document.getElementById("member-article-status");
    if (!el) return;
    el.textContent = msg;
    el.className = `membre-form-status ${type}`;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  }

  function statusLabel(review_status) {
    if (review_status === "approved") return { cls: "approved", txt: "Approuvé" };
    if (review_status === "rejected") return { cls: "rejected", txt: "Rejeté" };
    return { cls: "pending", txt: "En attente" };
  }

  function renderSubmissions(articles) {
    const list = document.getElementById("member-submissions-list");
    if (!list) return;
    if (!articles.length) {
      list.innerHTML = '<p class="membre-loading">Aucune soumission pour le moment.</p>';
      return;
    }
    const el = (tag, cls, text, style) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (style) n.style.cssText = style;
      if (text != null) n.textContent = text;
      return n;
    };
    list.replaceChildren(...articles.map((a) => {
      const st = statusLabel(a.review_status);
      const card = el("div", "membre-submission-card");
      const meta = el("div", "membre-submission-meta");
      meta.append(el("span", `mbadge ${st.cls}`, st.txt),
        el("span", null, fmtDate(a.updated_at), "font-size:.78rem;color:rgba(255,255,255,.4);"));
      card.append(meta,
        el("p", "membre-submission-title", a.titre || ""),
        el("p", null, a.excerpt || "", "font-size:.82rem;color:rgba(255,255,255,.45);margin:0;"));
      if (a.review_note) card.append(el("p", "membre-submission-note", `Note admin : ${a.review_note}`));
      return card;
    }));
  }

  async function loadMySubmissions() {
    try {
      const payload = await memberApi("/api/member/articles");
      renderSubmissions(payload.articles || []);
    } catch {
      const list = document.getElementById("member-submissions-list");
      if (list) list.innerHTML = '<p class="membre-loading">Impossible de charger vos soumissions.</p>';
    }
  }

  function showArticlePanel() {
    document.querySelector(".membre-grid").hidden = true;
    document.getElementById("mb-logout").hidden = true;
    document.getElementById("member-article-section").hidden = false;
    document.getElementById("member-article-form").reset();
    document.getElementById("m-article-id").value = "";
    document.getElementById("m-submit-label").textContent = "Soumettre l'article";
    setStatus("");
    loadMySubmissions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function hideArticlePanel() {
    document.querySelector(".membre-grid").hidden = false;
    document.getElementById("mb-logout").hidden = false;
    document.getElementById("member-article-section").hidden = true;
  }

  document.getElementById("mb-write-article")?.addEventListener("click", showArticlePanel);
  document.getElementById("member-back-btn")?.addEventListener("click", hideArticlePanel);
  document.getElementById("member-article-cancel")?.addEventListener("click", hideArticlePanel);

  document.getElementById("member-article-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = document.getElementById("member-article-submit");
    const titre    = document.getElementById("m-article-title").value.trim();
    const categorie = document.getElementById("m-article-category").value;
    const excerpt  = document.getElementById("m-article-excerpt").value.trim();
    const contenu  = document.getElementById("m-article-content").value.trim();

    if (!titre)   { setStatus("Le titre est obligatoire.", "error"); return; }
    if (!contenu || contenu.length < 20) { setStatus("Le contenu est trop court (20 caractères minimum).", "error"); return; }

    submitBtn.disabled = true;
    setStatus("Envoi en cours…");
    try {
      const id = document.getElementById("m-article-id").value;
      if (id) {
        await memberApi("/api/member/articles", {
          method: "PATCH",
          body: JSON.stringify({ id, titre, categorie, excerpt, contenu }),
        });
        setStatus("Article mis à jour et re-soumis.", "success");
      } else {
        await memberApi("/api/member/articles", {
          method: "POST",
          body: JSON.stringify({ titre, categorie, excerpt, contenu }),
        });
        setStatus("Article soumis avec succès ! Les administrateurs l'examineront prochainement.", "success");
      }
      document.getElementById("member-article-form").reset();
      document.getElementById("m-article-id").value = "";
      await loadMySubmissions();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();

