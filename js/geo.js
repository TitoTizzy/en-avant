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

  // Départements d'Haïti puis régions de la diaspora (copie de api/_lib/geo.js REGIONS).
  const REGIONS = ["Artibonite", "Centre", "Grand’Anse", "Nippes", "Nord", "Nord-Est", "Nord-Ouest", "Ouest", "Sud", "Sud-Est", "Floride", "Massachusetts", "New York", "New Jersey", "Géorgie", "Illinois", "Pennsylvanie", "Texas", "Californie", "Nevada", "Caroline du Nord", "Rhode Island", "Connecticut", "Nebraska", "Maryland", "Virginie", "Ohio", "Michigan", "District de Columbia", "Québec", "Ontario", "Île-de-France", "Auvergne-Rhône-Alpes", "Provence-Alpes-Côte d’Azur", "Nouvelle-Aquitaine", "Hauts-de-France", "Occitanie", "Pays de la Loire", "Grand Est", "Guyane", "Martinique", "Guadeloupe"];

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

  /**
   * Remplit une liste de suggestions (<datalist>) : d'abord les valeurs présentes
   * dans la base (avec leur effectif), puis la liste de référence. `pays` limite
   * les régions et les villes au pays choisi.
   */
  function fillSuggestions(datalist, dbRows = [], reference = [], { pays = "" } = {}) {
    if (!datalist) return;
    const wanted = geoKey(pays);
    const seen = new Set();
    const options = [];
    for (const row of dbRows) {
      if (wanted && row.pays && geoKey(row.pays) !== wanted) continue;
      const key = geoKey(row.nom);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const option = document.createElement("option");
      option.value = row.nom;
      option.label = `${row.nom} — ${row.total} personne${row.total > 1 ? "s" : ""}`;
      options.push(option);
    }
    for (const value of reference) {
      const key = geoKey(value);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(new Option(value));
    }
    datalist.replaceChildren(...options);
  }

  window.EA_GEO = { HAITI, DEPARTEMENTS, PAYS, REGIONS, geoKey, isHaiti, bindLocation, fillSuggestions };
})();
