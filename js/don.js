/* EN AVANT — Dons en ligne (Stripe Checkout via /api/create-checkout).
 * Le navigateur n'envoie qu'une fréquence et une clé de montant ; le serveur
 * choisit le prix Stripe dans sa liste blanche. Aucun montant libre n'est
 * transmis par le site : le montant libre se saisit sur la page Stripe. */
(() => {
  "use strict";

  const buttons = [...document.querySelectorAll("[data-donation]")];
  const freqButtons = [...document.querySelectorAll("[data-frequency]")];
  const submit = document.getElementById("don-payment-submit");
  const selection = document.getElementById("don-payment-selection");
  const notice = document.getElementById("don-payment-notice");
  if (!buttons.length || !submit || !selection || !notice) return;

  const API = "/api/create-checkout";
  const state = { enabled: false, amounts: { unique: [], mensuel: [] }, frequency: "unique", key: null, busy: false };

  const label = (key) => key === "libre" ? "un montant libre" : `${Number(key).toLocaleString("fr-FR")} $ US`;
  const available = (key) => state.enabled && state.amounts[state.frequency]?.includes(key);

  function render() {
    for (const b of freqButtons) b.setAttribute("aria-pressed", String(b.dataset.frequency === state.frequency));
    for (const b of buttons) {
      const key = b.dataset.donation;
      b.hidden = state.frequency === "mensuel" && key === "libre";
      b.setAttribute("aria-pressed", String(key === state.key));
      const small = b.querySelector("small");
      if (small) small.textContent = available(key)
        ? (key === "libre" ? "À saisir sur Stripe" : state.frequency === "mensuel" ? "Chaque mois" : "Une fois")
        : "Bientôt disponible";
    }
    notice.hidden = state.enabled;

    if (!state.key) {
      submit.disabled = true;
      submit.textContent = state.enabled ? "Choisissez un montant" : "Dons en ligne bientôt disponibles";
      return;
    }
    const ok = available(state.key);
    submit.disabled = !ok || state.busy;
    if (!ok) {
      selection.textContent = "Ce montant n'est pas encore disponible en ligne.";
      submit.textContent = "Dons en ligne bientôt disponibles";
    } else if (state.busy) {
      submit.textContent = "Redirection vers Stripe…";
    } else {
      const monthly = state.frequency === "mensuel";
      selection.textContent = state.key === "libre"
        ? "Vous choisirez votre montant (1 à 10 000 $ US) sur la page sécurisée de Stripe."
        : `Votre contribution : ${label(state.key)}${monthly ? " par mois, résiliable à tout moment" : ""}.`;
      submit.textContent = state.key === "libre"
        ? "Choisir mon montant sur Stripe"
        : `Donner ${label(state.key)}${monthly ? " / mois" : ""}`;
    }
  }

  for (const b of freqButtons) b.addEventListener("click", () => {
    state.frequency = b.dataset.frequency === "mensuel" ? "mensuel" : "unique";
    if (state.frequency === "mensuel" && state.key === "libre") state.key = null;
    render();
  });

  for (const b of buttons) b.addEventListener("click", () => { state.key = b.dataset.donation; render(); });

  submit.addEventListener("click", async () => {
    if (submit.disabled || !available(state.key)) return;
    state.busy = true; render();
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: state.frequency, amount: state.key }),
      });
      const data = await res.json().catch(() => ({}));
      const url = typeof data.url === "string" ? new URL(data.url) : null;
      if (!res.ok || !url || url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") {
        throw new Error(data.error || "Paiement indisponible.");
      }
      window.location.assign(url.href);
    } catch (error) {
      state.busy = false; render();
      selection.textContent = `${error.message} Réessayez dans quelques minutes.`;
    }
  });

  // Un paramètre d'URL ne prouve jamais qu'un don a été encaissé.
  const statut = new URLSearchParams(window.location.search).get("statut");
  if (statut === "succes") {
    selection.textContent = "Merci ! Stripe vous envoie la confirmation de votre paiement par email.";
  } else if (statut === "annule") {
    selection.textContent = "Le paiement a été annulé. Aucun montant n'a été prélevé.";
  }

  render();
  fetch(API, { headers: { Accept: "application/json" } })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data || data.enabled !== true) return;
      state.enabled = true;
      state.amounts = {
        unique: Array.isArray(data.amounts?.unique) ? data.amounts.unique.map(String) : [],
        mensuel: Array.isArray(data.amounts?.mensuel) ? data.amounts.mensuel.map(String) : [],
      };
      render();
    })
    .catch(() => {});
})();
