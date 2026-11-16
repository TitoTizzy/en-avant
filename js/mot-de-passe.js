/* ==========================================================================
   EN AVANT — CHOIX DU MOT DE PASSE
   Arrivée depuis le lien sécurisé envoyé à l'approbation d'une adhésion
   (invitation ou réinitialisation). Supabase ouvre une session temporaire à
   partir du lien ; le membre choisit alors son mot de passe.
   ========================================================================== */

(() => {
  "use strict";

  const env = window.EA_ENV || {};
  const checking = document.getElementById("pw-checking");
  const form = document.getElementById("pw-form");
  const statusBox = document.getElementById("pw-status");
  const submitBtn = document.getElementById("pw-submit");
  const passwordInput = document.getElementById("pw-password");
  const confirmInput = document.getElementById("pw-confirm");

  const showStatus = (type, message) => {
    statusBox.className = `ea-form-status ${type}`;
    statusBox.textContent = message;
  };

  const expired = () => {
    checking.hidden = true;
    showStatus(
      "error",
      "Ce lien n'est plus valide (il expire rapidement). Répondez à l'email reçu ou écrivez à contact@enavant.org pour en recevoir un nouveau."
    );
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !window.supabase) {
    expired();
    return;
  }

  // Erreur renvoyée par Supabase dans l'URL (lien expiré ou déjà utilisé).
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.get("error") || hash.get("error_code")) {
    expired();
    return;
  }

  const client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  client.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      expired();
      return;
    }
    checking.hidden = true;
    form.hidden = false;
    passwordInput.focus();
  });

  const fieldOf = (input) => input.closest(".ea-field");
  const mark = (input, ok) => {
    fieldOf(input).classList.toggle("is-invalid", !ok);
    input.setAttribute("aria-invalid", String(!ok));
    return ok;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusBox.className = "ea-form-status";

    const okLength = mark(passwordInput, passwordInput.value.length >= 10 && passwordInput.value.length <= 200);
    const okSame = mark(confirmInput, confirmInput.value === passwordInput.value && confirmInput.value !== "");
    if (!okLength || !okSame) return;

    submitBtn.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password: passwordInput.value });
      if (error) throw error;
      form.hidden = true;
      showStatus("success", "Mot de passe enregistré. Ouverture de votre espace membre…");
      setTimeout(() => { window.location.href = "/membre.html"; }, 1200);
    } catch (error) {
      console.error(error);
      showStatus(
        "error",
        /weak|password/i.test(error?.message || "")
          ? "Mot de passe refusé : choisissez-en un plus robuste."
          : "Enregistrement impossible. Le lien a peut-être expiré : demandez-en un nouveau à contact@enavant.org."
      );
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
