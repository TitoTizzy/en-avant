/* Si Supabase renvoie un lien de connexion vers l'accueil (adresse de retour
   refusée), on l'envoie vers la bonne page au lieu de laisser la personne
   bloquée sur l'accueil. Chargé dans le <head> de index.html. */
(() => {
  const hash = window.location.hash || "";
  if (!/access_token=|error_code=|type=(recovery|invite|signup|magiclink)/.test(hash)) return;
  const params = new URLSearchParams(hash.slice(1));
  const type = params.get("type");
  if (type === "signup" && !params.get("error_code")) {
    window.location.replace(`/login?confirme=1${hash}`);
    return;
  }
  window.location.replace(`/mot-de-passe${hash}`);
})();
