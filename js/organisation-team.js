/* ==========================================================================
   EN AVANT — ORGANIGRAMME DYNAMIQUE
   Reconstruit les sections de la page Organisation depuis GET /api/team
   (table `team_members`, éditée via le Dashboard SuperAdmin).
   Si l'API est absente ou la table vide → la version statique reste affichée.
   ========================================================================== */

(() => {
  "use strict";

  const SECTION_KEYS = [
    "coordination-nationale",
    "conseil-strategique",
    "coordonnateurs-adjoints",
    "coordonnateurs-departementaux",
    "branches-exterieures",
  ];

  const initials = (label) =>
    label
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0] || "")
      .join("")
      .toUpperCase();

  function buildCard(member) {
    const card = document.createElement("div");
    card.className = "orga-card";

    if (member.poste) {
      const poste = document.createElement("span");
      poste.textContent = member.poste;
      card.appendChild(poste);
    }

    const avatar = document.createElement("div");
    avatar.className = "orga-avatar";
    avatar.setAttribute("data-team-slot", member.nom || member.poste || "");

    if (member.photo_url) {
      const img = document.createElement("img");
      img.src = member.photo_url;
      img.alt = member.nom || member.poste || "Membre En Avant";
      img.loading = "lazy";
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials(member.nom || member.poste || "?");
    }
    card.appendChild(avatar);

    if (member.nom) {
      const nom = document.createElement("p");
      nom.textContent = member.nom;
      card.appendChild(nom);
    }

    return card;
  }

  (async () => {
    try {
      const response = await fetch("/api/team", { signal: AbortSignal.timeout(4000) });
      const payload = await response.json().catch(() => ({}));
      const members = payload.members || [];
      if (!response.ok || members.length === 0) return; // repli : HTML statique

      SECTION_KEYS.forEach((key) => {
        const grid = document.querySelector(
          `.orga-section[data-section="${key}"] .orga-grid`
        );
        const rows = members
          .filter((member) => member.section === key)
          .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

        if (!grid || rows.length === 0) return;

        grid.innerHTML = "";
        rows.forEach((member) => grid.appendChild(buildCard(member)));
      });
    } catch {
      /* API indisponible (ex. aperçu statique) : on garde l'organigramme du HTML. */
    }
  })();
})();
