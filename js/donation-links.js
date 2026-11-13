/* CONFIGURATION PUBLIQUE : uniquement des URL Payment Links Stripe.
 * Jamais de cle secrete sk_* ou rk_* ici.
 * Un lien a prix fixe distinct par montant (USD, quantite 1 non modifiable).
 * Pour custom : lien Stripe « Le client choisit le montant ».
 * Une valeur vide conserve l'etat « Bientot disponible ».
 */
window.EA_DONATION_LINKS = Object.freeze({
  "10": "",
  "25": "",
  "50": "",
  "100": "",
  "250": "",
  "500": "",
  "1000": "",
  custom: "",
});
