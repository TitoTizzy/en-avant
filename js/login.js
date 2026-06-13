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

  // Message de succès après une inscription réussie
  if (sessionStorage.getItem("ea-register-success")) {
    sessionStorage.removeItem("ea-register-success");
    showStatus("success", "Compte créé avec succès. Connectez-vous dès maintenant.");
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
        // Pas de PIN — redirection directe vers l'espace membre
        window.location.href = "/membre.html";
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
})();
