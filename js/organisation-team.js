/* ==========================================================================
   EN AVANT — ORGANIGRAMME DYNAMIQUE
   Reconstruit les sections de la page Organisation depuis GET /api/team
   (tables `team_members` + `team_sections`, éditées via le Dashboard).
   Si l'API est absente ou la table vide → la version statique reste affichée.
   ========================================================================== */

(() => {
  "use strict";

  // Sections par défaut (utilisées si team_sections table absente)
  const DEFAULT_SECTIONS = [
    { key: "coordination-nationale",          label: "Coordination Nationale" },
    { key: "conseil-strategique",             label: "Conseil Stratégique" },
    { key: "coordonnateurs-adjoints",         label: "Les Coordonnateurs Nationaux Adjoints" },
    { key: "coordonnateurs-departementaux",   label: "Les Coordonnateurs Départementaux" },
    { key: "branches-exterieures",            label: "Les Coordonnateurs des Branches Extérieures" },
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

  function colClass(count) {
    if (count === 1) return "orga-grid-1";
    if (count <= 3) return "orga-grid-3";
    if (count <= 6) return "orga-grid-6";
    return "orga-grid-10";
  }

  function buildSectionEl(key, label, rows) {
    const sec = document.createElement("div");
    sec.className = "orga-section";
    sec.dataset.section = key;

    const h3 = document.createElement("h3");
    h3.textContent = label;
    sec.appendChild(h3);

    const grid = document.createElement("div");
    grid.className = `orga-grid ${colClass(rows.length || 1)}`;
    rows.forEach((m) => grid.appendChild(buildCard(m)));
    sec.appendChild(grid);

    return sec;
  }

  (async () => {
    try {
      const response = await fetch("/api/team", { signal: AbortSignal.timeout(4000) });
      const payload = await response.json().catch(() => ({}));
      const members = payload.members || [];
      if (!response.ok || members.length === 0) return; // repli : HTML statique

      const sections = Array.isArray(payload.sections) && payload.sections.length
        ? payload.sections
        : null;

      if (sections) {
        // Reconstruction complète de l'organigramme selon l'ordre DB
        const root = document.querySelector("#structure .container");
        if (!root) return;

        root.querySelectorAll(".orga-section, .orga-divider").forEach((el) => el.remove());

        sections.forEach((sec, i) => {
          const rows = members
            .filter((m) => m.section === sec.key)
            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

          if (i > 0) {
            const divider = document.createElement("div");
            divider.className = "orga-divider";
            root.appendChild(divider);
          }
          root.appendChild(buildSectionEl(sec.key, sec.label, rows));
        });
      } else {
        // Fallback : remplir les sections existantes dans le HTML statique
        DEFAULT_SECTIONS.forEach(({ key }) => {
          const grid = document.querySelector(
            `.orga-section[data-section="${key}"] .orga-grid`
          );
          const rows = members
            .filter((m) => m.section === key)
            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

          if (!grid || rows.length === 0) return;
          grid.innerHTML = "";
          rows.forEach((m) => grid.appendChild(buildCard(m)));
        });
      }
    } catch {
      /* API indisponible → organigramme HTML statique */
    }
  })();
})();
