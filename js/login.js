/* ==========================================================================
   EN AVANT — CONNEXION (dual-mode)
   · Membre (role = "member")    → email + password → /membre.html
   · SuperAdmin (role = "superadmin") → email + password + PIN → /admin.html
   ========================================================================== */

(() => {
  "use strict";

  const form           = document.getElementById("login-form");
  if (!form) return;

  const pinForm        = document.getElementById("pin-form");
  const statusBox      = document.getElementById("login-status");
  const submitBtn      = document.getElementById("login-submit");
  const identifierInput = document.getElementById("login-identifier");
  const passwordInput  = document.getElementById("login-password");
  const pinInput       = document.getElementById("login-pin");

  const env = window.EA_ENV || {};
  const configured = env.SUPABASE_URL && env.SUPABASE_ANON_KEY && window.supabase;

  const showStatus = (type, message) => {
    statusBox.className = `ea-form-status ${type}`;
    statusBox.textContent = message;
  };

  const params = new URLSearchParams(window.location.search);
  if (params.get("confirme") === "1") {
    showStatus("success", "Adresse email confirmée. Si votre adhésion est déjà approuvée, vous pouvez vous connecter ; sinon, vous recevrez un email dès son approbation.");
  } else if (params.get("attente") === "1") {
    showStatus("error", "Votre adhésion est en cours d'examen. Vous recevrez un email dès qu'elle sera approuvée.");
  }

  if (!configured) {
    showStatus("error", "Connexion non configurée. Renseignez SUPABASE_URL et SUPABASE_ANON_KEY dans js/env.js.");
    form.querySelectorAll("input, button").forEach(el => { el.disabled = true; });
    return;
  }

  const client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  let accessToken = "";

  /* ── Étape 1 : identifiants ──────────────────────────────────────────── */
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusBox.className = "ea-form-status";

    const identifier = identifierInput.value.trim();
    const password   = passwordInput.value;

    if (!identifier || !password) {
      showStatus("error", "Vérifiez votre identifiant et votre mot de passe.");
      return;
    }

    submitBtn.classList.add("btn-loading");
    submitBtn.textContent = "Connexion…";

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ||
          ([404, 405, 501].includes(response.status)
            ? "Les fonctions /api ne tournent pas sur ce serveur. Utilisez le site déployé."
            : "Connexion impossible.")
        );
      }

      const { data, error } = await client.auth.setSession(payload.session);
      if (error || !data.session) throw error || new Error("Session invalide.");

      accessToken = data.session.access_token;
      const role  = payload.role || "readonly";

      if (role === "member" || role === "readonly" || role === "editor") {
        // Pas de PIN — retour à la page d'origine (ex. lien de duel du quiz), sinon espace membre.
        let retour = null;
        try {
          retour = sessionStorage.getItem("ea-retour");
          sessionStorage.removeItem("ea-retour");
        } catch { /* stockage indisponible */ }
        window.location.href = retour && /^\/(?!\/)[\w\-./?=&%]*$/.test(retour) ? retour : "/membre.html";
        return;
      }

      // SuperAdmin → étape PIN
      form.hidden    = true;
      pinForm.hidden = false;
      passwordInput.value = "";
      pinInput.focus();
    } catch (error) {
      console.error(error);
      showStatus("error", error.message || "Identifiants incorrects.");
    } finally {
      submitBtn.classList.remove("btn-loading");
      submitBtn.innerHTML = '<i class="fa-solid fa-lock" aria-hidden="true"></i> Se connecter';
    }
  });

  /* ── Étape 2 : PIN (SuperAdmin uniquement) ───────────────────────────── */
  pinInput.addEventListener("input", () => {
    pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 8);
  });

  pinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusBox.className = "ea-form-status";

    const pin = pinInput.value.trim();
    if (!/^\d{4,8}$/.test(pin) || !accessToken) {
      showStatus("error", "Entrez votre PIN de 4 à 8 chiffres.");
      return;
    }

    const button = pinForm.querySelector("button[type='submit']");
    button.classList.add("btn-loading");
    button.textContent = "Vérification…";

    try {
      const response = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ pin }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "PIN incorrect.");

      localStorage.setItem("ea-is-admin", "1");
      localStorage.setItem("ea-last-activity", String(Date.now()));
      window.location.href = "/admin.html";
    } catch (error) {
      console.error(error);
      pinInput.value = "";
      pinInput.focus();
      showStatus("error", error.message || "PIN incorrect.");
    } finally {
      button.classList.remove("btn-loading");
      button.textContent = "Vérifier";
    }
  });

  // ─── Mot de passe oublié ────────────────────────────────────────────
  const forgotForm = document.getElementById("forgot-form");
  const forgotOpen = document.getElementById("forgot-open");
  const forgotBack = document.getElementById("forgot-back");
  const forgotEmail = document.getElementById("forgot-email");
  const forgotSubmit = document.getElementById("forgot-submit");

  const showForgot = (open) => {
    if (!forgotForm) return;
    forgotForm.hidden = !open;
    form.hidden = open;
    statusBox.className = "ea-form-status";
    statusBox.textContent = "";
    if (open) {
      const typed = identifierInput.value.trim();
      if (typed.includes("@")) forgotEmail.value = typed;
      forgotEmail.focus();
    } else {
      identifierInput.focus();
    }
  };

  forgotOpen?.addEventListener("click", () => showForgot(true));
  forgotBack?.addEventListener("click", () => showForgot(false));

  forgotForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = forgotEmail.value.trim();
    const field = forgotEmail.closest(".ea-field");
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    field.classList.toggle("is-invalid", !valid);
    if (!valid) return;

    forgotSubmit.disabled = true;
    forgotSubmit.classList.add("btn-loading");
    try {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website: document.getElementById("forgot-website").value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 429) {
        showStatus("error", "Trop de demandes. Réessayez dans quelques minutes.");
      } else if (!response.ok) {
        showStatus("error", payload.error || "Envoi impossible pour le moment.");
      } else {
        showStatus("success", payload.message);
        forgotForm.reset();
      }
    } catch {
      showStatus("error", "Connexion impossible. Vérifiez votre réseau.");
    } finally {
      forgotSubmit.disabled = false;
      forgotSubmit.classList.remove("btn-loading");
    }
  });
})();
