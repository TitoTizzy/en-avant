/* ==========================================================================
   EN AVANT — GÉOGRAPHIE (pays, départements d'Haïti)
   Copie navigateur de api/_lib/geo.js (listes vérifiées identiques par les tests).
   EA_GEO.bindLocation(form) : champ pays avec suggestions + liste des
   départements affichée et obligatoire seulement pour Haïti.
   ========================================================================== */
(() => {
  "use strict";

  const HAITI = "Haïti";
  const DEPARTEMENTS = [
    "Artibonite", "Centre", "Grand’Anse", "Nippes", "Nord",
    "Nord-Est", "Nord-Ouest", "Ouest", "Sud", "Sud-Est",
  ];
  const PAYS = [
    "Haïti", "États-Unis", "Canada", "France", "République dominicaine", "Chili", "Brésil",
    "Mexique", "Bahamas", "Belgique", "Suisse", "Espagne", "Royaume-Uni", "Allemagne",
    "Cuba", "Jamaïque", "Îles Turques-et-Caïques", "Panama", "Venezuela", "Argentine",
  ];

  const geoKey = (value) => String(value ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[’'`]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const isHaiti = (value) => ["haiti", "ayiti"].includes(geoKey(value));

  let datalistCount = 0;

  /** Relie les champs pays / département / ville d'un formulaire. */
  function bindLocation(form) {
    const pays = form?.elements?.namedItem("pays");
    const dep = form?.elements?.namedItem("departement");
    if (!pays || !dep) return null;
    const depField = dep.closest("[data-departement-field]") || dep.closest(".ea-field") || dep.parentElement;

    if (!pays.getAttribute("list")) {
      datalistCount += 1;
      const list = document.createElement("datalist");
      list.id = `ea-pays-${datalistCount}`;
      PAYS.forEach((p) => list.append(new Option(p)));
      form.append(list);
      pays.setAttribute("list", list.id);
    }
    if (dep.options.length <= 1) {
      DEPARTEMENTS.forEach((d) => dep.append(new Option(d, d)));
    }

    const sync = () => {
      const haiti = isHaiti(pays.value);
      if (depField) depField.hidden = !haiti;
      dep.required = haiti;
      if (!haiti) dep.value = "";
    };
    pays.addEventListener("input", sync);
    pays.addEventListener("change", () => {
      if (isHaiti(pays.value)) pays.value = HAITI;
      sync();
    });
    sync();
    return { sync };
  }

  window.EA_GEO = { HAITI, DEPARTEMENTS, PAYS, geoKey, isHaiti, bindLocation };
})();
