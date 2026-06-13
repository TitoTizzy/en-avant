/* EN AVANT — DON */
(() => {
  "use strict";
  const params = new URLSearchParams(window.location.search);
  if (params.get("statut") === "succes") {
    const note = document.querySelector(".don-note");
    if (note) {
      note.style.color = "var(--green, #4ade80)";
      note.innerHTML = '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Merci du fond du cœur ! Votre don a bien été enregistré. 🇭🇹';
    }
  }
})();
