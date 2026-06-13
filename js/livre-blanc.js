/* ==========================================================================
   EN AVANT — LIVRE BLANC (Lead Magnet)
   Formulaire → POST /api/leads-livreblanc → email du PDF via Resend.
   ========================================================================== */

(() => {
  "use strict";

  const form = document.getElementById("lb-form");
  if (!form) return;

  const statusBox = document.getElementById("lb-status");
  const submitBtn = document.getElementById("lb-submit");
  const defaultLabel = submitBtn.innerHTML;

  const fieldOf = (input) => input.closest(".ea-field");

  function setInvalid(input, invalid) {
    const field = fieldOf(input);
    if (field) field.classList.toggle("is-invalid", invalid);
    return !invalid;
  }

  function showStatus(type, message) {
    statusBox.className = `ea-form-status ${type}`;
    statusBox.textContent = message;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusBox.className = "ea-form-status";

    const nom = form.elements.nom.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();

    // Honeypot rempli → robot
    if (form.elements.website.value) return;

    const nomOk = setInvalid(form.elements.nom, nom.length < 2);
    const emailOk = setInvalid(
      form.elements.email,
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
    );
    if (!nomOk || !emailOk) return;

    submitBtn.classList.add("btn-loading");
    submitBtn.textContent = "Envoi en cours…";

    try {
      const response = await fetch("/api/leads-livreblanc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, email, website: "" }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Erreur serveur");

      form.reset();
      form.querySelectorAll(".ea-field").forEach((f) => f.classList.remove("is-invalid"));

      showStatus(
        "success",
        payload.email_envoye
          ? "C'est envoyé ! Vérifiez votre boîte email (et vos spams)."
          : "Inscription enregistrée. Le téléchargement direct reste disponible ci-dessus."
      );
    } catch (error) {
      console.error(error);
      showStatus(
        "error",
        "Impossible d'envoyer le document pour le moment. Utilisez le bouton « Télécharger » ci-dessus."
      );
    } finally {
      submitBtn.classList.remove("btn-loading");
      submitBtn.innerHTML = defaultLabel;
    }
  });
})();
