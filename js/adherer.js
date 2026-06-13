/* ==========================================================================
   EN AVANT — ADHÉSION
   Validation temps réel + envoi sécurisé vers /api/members (Vercel Function).
   Aucune clé ni accès direct à la base : tout passe par le backend.
   ========================================================================== */

(() => {
  "use strict";

  const form = document.getElementById("adhesion-form");
  if (!form) return;

  const statusBox = document.getElementById("adh-status");
  const submitBtn = document.getElementById("adh-submit");
  const modal = document.getElementById("adh-modal");
  const modalClose = document.getElementById("adh-modal-close");
  const ninuInput = document.getElementById("adh-ninu");

  const RULES = {
    nom: (v) => v.trim().length >= 2 && v.trim().length <= 120,
    sexe: (v) => ["femme", "homme", "autre"].includes(v),
    ninu: (v) => /^1\d{9}$/.test(v.replace(/\D/g, "")), // NINU = 10 chiffres commençant par 1 (carte ONI)
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    telephone: (v) => (v.replace(/\D/g, "").length >= 8 && v.trim().length <= 25),
    ville: (v) => v.trim().length >= 2 && v.trim().length <= 80,
  };

  const fieldOf = (input) => input.closest(".ea-field");

  function validateInput(input) {
    const rule = RULES[input.name];
    if (!rule) return true;

    const ok = rule(input.value);
    const field = fieldOf(input);
    if (field) {
      field.classList.toggle("is-valid", ok);
      field.classList.toggle("is-invalid", !ok);
    }
    input.setAttribute("aria-invalid", String(!ok));
    return ok;
  }

  // Le NINU est strictement numérique et long de 10 chiffres.
  ninuInput.addEventListener("input", () => {
    ninuInput.value = ninuInput.value.replace(/\D/g, "").slice(0, 10);
  });

  // Validation au blur (pas à chaque frappe), nettoyage à la saisie
  form.querySelectorAll("input[name], select[name]").forEach((input) => {
    if (input.type === "checkbox" || input.classList.contains("ea-hp")) return;

    input.addEventListener("blur", () => validateInput(input));
    input.addEventListener("input", () => {
      const field = fieldOf(input);
      if (field && field.classList.contains("is-invalid")) validateInput(input);
    });
  });

  function showStatus(type, message) {
    statusBox.className = `ea-form-status ${type}`;
    statusBox.textContent = message;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusBox.className = "ea-form-status";

    const data = Object.fromEntries(new FormData(form).entries());

    // Honeypot rempli → robot, on ignore silencieusement
    if (data.website) return;

    let allValid = true;
    form.querySelectorAll("input[name], select[name]").forEach((input) => {
      if (input.type === "checkbox" || input.classList.contains("ea-hp")) return;
      if (!validateInput(input)) allValid = false;
    });

    if (!document.getElementById("adh-consent").checked) {
      allValid = false;
      showStatus("error", "Merci de cocher la case de consentement pour continuer.");
    }

    if (!allValid) return;

    submitBtn.classList.add("btn-loading");
    submitBtn.textContent = "Envoi en cours…";

    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: data.nom.trim(),
          sexe: data.sexe,
          ninu: data.ninu.replace(/\D/g, ""),
          email: data.email.trim().toLowerCase(),
          telephone: data.telephone.trim(),
          ville: data.ville.trim(),
          consent: true,
          website: data.website || "",
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 409) {
        if (/ninu/i.test(payload.error || "")) {
          const field = fieldOf(ninuInput);
          field.classList.add("is-invalid");
          ninuInput.setAttribute("aria-invalid", "true");
        }
        showStatus(
          "error",
          payload.error || "Une candidature existe déjà avec ces informations."
        );
        return;
      }

      if (response.status === 422 && payload.fields) {
        Object.entries(payload.fields).forEach(([name, message]) => {
          const input = form.elements.namedItem(name);
          const field = input && fieldOf(input);
          if (!field) return;
          field.classList.add("is-invalid");
          input.setAttribute("aria-invalid", "true");
          const error = field.querySelector(".ea-error");
          if (error) error.textContent = message;
        });
        showStatus("error", payload.error || "Vérifiez les champs indiqués.");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || "Réponse inattendue du serveur.");
      }

      form.reset();
      form.querySelectorAll(".ea-field").forEach((f) =>
        f.classList.remove("is-valid", "is-invalid")
      );
      modal.classList.add("open");
    } catch (error) {
      console.error(error);
      showStatus(
        "error",
        "Impossible d'envoyer votre candidature pour le moment. Réessayez dans quelques instants."
      );
    } finally {
      submitBtn.classList.remove("btn-loading");
      submitBtn.textContent = "Soumettre ma candidature";
    }
  });

  modalClose.addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.remove("open");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") modal.classList.remove("open");
  });
})();
