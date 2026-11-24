/* ==========================================================================
   EN AVANT — NEWSLETTER (page publique /newsletter)
   Inscription (email, pays, département pour Haïti, ville) et désinscription
   via le lien personnel reçu dans chaque email (?desinscription=<jeton>).
   ========================================================================== */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const token = params.get("desinscription");

  async function call(url, options) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Service indisponible pour le moment.");
    return data;
  }

  function status(id, type, message) {
    const box = $(id);
    box.className = `ea-form-status ${type}`;
    box.textContent = message;
  }

  /* ---------- Désinscription ---------- */
  if (token) {
    $("nl-inscription").hidden = true;
    $("nl-desinscription").hidden = false;
    const text = $("nl-unsub-text");
    const button = $("nl-unsub-btn");
    call(`/api/newsletter?op=jeton&t=${encodeURIComponent(token)}`)
      .then((data) => {
        if (data.desinscrit) {
          text.textContent = `L’adresse ${data.email} est déjà désinscrite. Vous ne recevrez plus la newsletter.`;
          return;
        }
        text.textContent = `Vous ne recevrez plus la newsletter d’En Avant à l’adresse ${data.email}.`;
        button.hidden = false;
      })
      .catch((error) => { text.textContent = error.message; });
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await call("/api/newsletter", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "desinscription", t: token }),
        });
        button.hidden = true;
        text.textContent = "C’est fait : vous êtes désinscrit·e. Vous pouvez vous réinscrire à tout moment sur cette page.";
        status("nl-unsub-status", "success", "Désinscription enregistrée.");
      } catch (error) {
        button.disabled = false;
        status("nl-unsub-status", "error", error.message);
      }
    });
    return;
  }

  /* ---------- Inscription ---------- */
  const form = $("nl-form");
  if (!form) return;
  window.EA_GEO?.bindLocation(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const f = form.elements;
    const email = f.email.value.trim();
    const haiti = window.EA_GEO?.isHaiti(f.pays.value);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return status("nl-status", "error", "Adresse email invalide.");
    if (f.pays.value.trim().length < 2) return status("nl-status", "error", "Indiquez votre pays.");
    if (haiti && !f.departement.value) return status("nl-status", "error", "Choisissez votre département.");
    if (f.ville.value.trim().length < 2) return status("nl-status", "error", "Indiquez votre ville.");
    if (!f.consent.checked) return status("nl-status", "error", "Merci de cocher la case pour recevoir la newsletter.");

    const button = $("nl-submit");
    button.disabled = true;
    status("nl-status", "", "Inscription en cours…");
    try {
      await call("/api/newsletter", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "inscription", email, nom: f.nom.value.trim(), pays: f.pays.value.trim(),
          departement: f.departement.value, ville: f.ville.value.trim(), consent: true, site: f.site.value,
        }),
      });
      form.hidden = true;
      $("nl-success").hidden = false;
    } catch (error) {
      status("nl-status", "error", error.message);
    } finally {
      button.disabled = false;
    }
  });
})();
