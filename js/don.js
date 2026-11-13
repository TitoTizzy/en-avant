/* EN AVANT — Un Payment Link Stripe distinct par montant. */
(() => {
  "use strict";

  const buttons = [...document.querySelectorAll("[data-donation]")];
  const submit = document.getElementById("don-payment-submit");
  const selection = document.getElementById("don-payment-selection");
  const notice = document.getElementById("don-payment-notice");
  if (!buttons.length || !submit || !selection || !notice) return;

  const config = window.EA_DONATION_LINKS || {};
  let selectedKey = null;

  function paymentLink(key) {
    const value = config[key];
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.hostname !== "buy.stripe.com" ||
          url.username || url.password || url.port || url.pathname.length < 2) return null;
      return url.href;
    } catch { return null; }
  }

  const amountLabel = (key) => `${Number(key).toLocaleString("fr-FR")} $ US`;
  for (const button of buttons) {
    const key = button.dataset.donation;
    button.querySelector("small").textContent = paymentLink(key)
      ? (key === "custom" ? "À choisir sur Stripe" : "Paiement sur Stripe")
      : "Bientôt disponible";
    button.addEventListener("click", () => {
      selectedKey = key;
      for (const item of buttons) item.setAttribute("aria-pressed", String(item === button));
      const link = paymentLink(key);
      submit.disabled = !link;
      if (!link) {
        selection.textContent = key === "custom"
          ? "Le lien pour un montant libre sera bientôt disponible. Aucun paiement n'est possible pour cette option pour le moment."
          : `Don de ${amountLabel(key)} : le lien de paiement sera bientôt disponible.`;
        submit.textContent = "Lien de paiement bientôt disponible";
      } else {
        selection.textContent = key === "custom"
          ? "Vous choisirez votre montant en dollars américains directement sur Stripe."
          : `Votre contribution : ${amountLabel(key)}. Vérifiez ce montant sur la page Stripe avant de confirmer.`;
        submit.textContent = key === "custom" ? "Choisir mon montant sur Stripe" : `Donner ${amountLabel(key)} avec Stripe`;
      }
    });
  }
  notice.hidden = buttons.every(button => Boolean(paymentLink(button.dataset.donation)));
  submit.addEventListener("click", () => {
    const link = selectedKey && paymentLink(selectedKey);
    if (!submit.disabled && link) window.location.assign(link);
  });

  // Un parametre d'URL ne prouve jamais qu'un don a ete enregistre.
  const params = new URLSearchParams(window.location.search);
  if (params.get("statut") === "succes") {
    selection.textContent = "Vous êtes de retour sur le site. Consultez la confirmation de votre service de paiement pour connaître le statut de votre don.";
  } else if (params.get("statut") === "annule") {
    selection.textContent = "Le paiement a été annulé. Vous pouvez sélectionner un autre montant.";
  }
})();
