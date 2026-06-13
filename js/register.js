/* ==========================================================================
   EN AVANT — INSCRIPTION MEMBRE
   Validation + envoi vers /api/auth/register → redirection vers /login.html
   ========================================================================== */

(() => {
  "use strict";

  const form      = document.getElementById("register-form");
  if (!form) return;

  const statusBox = document.getElementById("reg-status");
  const submitBtn = document.getElementById("reg-submit");

  const nomInput      = document.getElementById("reg-nom");
  const pseudoInput   = document.getElementById("reg-pseudo");
  const emailInput    = document.getElementById("reg-email");
  const passwordInput = document.getElementById("reg-password");
  const confirmInput  = document.getElementById("reg-confirm");

  const showStatus = (type, msg) => {
    statusBox.className = `ea-form-status ${type}`;
    statusBox.textContent = msg;
  };

  const setFieldError = (input, errId, show) => {
    const field = input.closest(".ea-field");
    if (!field) return;
    field.classList.toggle("is-invalid", show);
    field.classList.toggle("is-valid",   !show);
    input.setAttribute("aria-invalid", String(show));
    const err = document.getElementById(errId);
    if (err) err.hidden = !show;
  };

  const validate = () => {
    let ok = true;
    const nom      = nomInput.value.trim();
    const pseudo   = pseudoInput ? pseudoInput.value.trim() : "";
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm  = confirmInput.value;

    const nomOk = nom.length >= 2 && nom.length <= 120;
    setFieldError(nomInput, "err-nom", !nomOk);
    if (!nomOk) ok = false;

    if (pseudoInput) {
      const pseudoOk = pseudo.length >= 2 && pseudo.length <= 30;
      setFieldError(pseudoInput, "err-pseudo", !pseudoOk);
      if (!pseudoOk) ok = false;
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    setFieldError(emailInput, "err-email", !emailOk);
    if (!emailOk) ok = false;

    const pwOk = password.length >= 8;
    setFieldError(passwordInput, "err-password", !pwOk);
    if (!pwOk) ok = false;

    const confOk = password === confirm && confirm.length > 0;
    setFieldError(confirmInput, "err-confirm", !confOk);
    if (!confOk) ok = false;

    return ok;
  };

  // Validation au blur
  [nomInput, pseudoInput, emailInput, passwordInput, confirmInput].filter(Boolean).forEach(input => {
    input.addEventListener("blur", validate);
    input.addEventListener("input", () => {
      const field = input.closest(".ea-field");
      if (field?.classList.contains("is-invalid")) validate();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusBox.className = "ea-form-status";

    if (!validate()) return;

    submitBtn.classList.add("btn-loading");
    submitBtn.textContent = "Création en cours…";

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom:      nomInput.value.trim(),
          pseudo:   pseudoInput ? pseudoInput.value.trim() : "",
          email:    emailInput.value.trim().toLowerCase(),
          password: passwordInput.value,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 409) {
        setFieldError(emailInput, "err-email", true);
        document.getElementById("err-email").textContent = "Cette adresse est déjà utilisée.";
        showStatus("error", "Un compte existe déjà avec cette adresse email.");
        return;
      }

      if (response.status === 422 && payload.fields) {
        Object.entries(payload.fields).forEach(([field, msg]) => {
          const input = form.elements.namedItem(field);
          const errId = `err-${field}`;
          if (input) {
            setFieldError(input, errId, true);
            const errEl = document.getElementById(errId);
            if (errEl) errEl.textContent = msg;
          }
        });
        showStatus("error", payload.error || "Vérifiez les champs indiqués.");
        return;
      }

      if (!response.ok) throw new Error(payload.error || "Inscription impossible.");

      // Succès → redirection vers login avec message
      sessionStorage.setItem("ea-register-success", "1");
      window.location.href = "/login.html";
    } catch (error) {
      console.error(error);
      showStatus("error", error.message || "Inscription momentanément indisponible. Réessayez.");
    } finally {
      submitBtn.classList.remove("btn-loading");
      submitBtn.innerHTML = '<i class="fa-solid fa-user-plus" aria-hidden="true"></i> Créer mon compte';
    }
  });
})();
