// Géographie partagée : pays, départements d'Haïti, communes → département.
// Sert aux filtres de la newsletter et de la liste des adhérents, et à la
// validation des formulaires (adhésion, inscription à la newsletter).
// La même liste est copiée côté navigateur dans js/geo.js (test d'égalité).

export const HAITI = 'Haïti';

export const DEPARTEMENTS = [
  'Artibonite', 'Centre', 'Grand’Anse', 'Nippes', 'Nord',
  'Nord-Est', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Est',
];

// Pays proposés (saisie libre possible pour les autres).
export const PAYS = [
  'Haïti', 'États-Unis', 'Canada', 'France', 'République dominicaine', 'Chili', 'Brésil',
  'Mexique', 'Bahamas', 'Belgique', 'Suisse', 'Espagne', 'Royaume-Uni', 'Allemagne',
  'Cuba', 'Jamaïque', 'Îles Turques-et-Caïques', 'Panama', 'Venezuela', 'Argentine',
];

/** Clé de comparaison : sans accents, minuscules, ponctuation réduite à des espaces. */
export function geoKey(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Communes (et grands quartiers) d'Haïti par département.
const COMMUNES = {
  Ouest: ['Port-au-Prince', 'Pétion-Ville', 'Petionville', 'Delmas', 'Carrefour', 'Tabarre', 'Cité Soleil',
    'Croix-des-Bouquets', 'Kenscoff', 'Gressier', 'Léogâne', 'Petit-Goâve', 'Grand-Goâve', 'Arcahaie',
    'Cabaret', 'Ganthier', 'Thomazeau', 'Cornillon', 'Fonds-Verrettes', 'Anse-à-Galets', 'Pointe-à-Raquette',
    'La Gonâve', 'Laboule', 'Thomassin', 'Martissant', 'Bon Repos', 'Canaan', 'Fermathe',
    'Pèlerin', 'Métivier', 'Frères', 'Route de Frères', 'Puits Blain', 'Bourdon', 'Juvénat', 'Tabarre Issa',
    'Croix-des-Missions', 'Carrefour-Feuilles', 'Bel-Air', 'Turgeau', 'Pacot', 'Christ-Roi', 'Lalue'],
  Nord: ['Cap-Haïtien', 'Cap Haitien', 'Okap', 'Limonade', 'Milot', 'Quartier-Morin', 'Plaine-du-Nord',
    'Acul-du-Nord', 'Grande-Rivière-du-Nord', 'Limbé', 'Bas-Limbé', 'Borgne', 'Port-Margot', 'Plaisance',
    'Pilate', 'Dondon', 'Saint-Raphaël', 'Pignon', 'Ranquitte', 'La Victoire', 'Bahon', 'Labadie'],
  'Nord-Est': ['Fort-Liberté', 'Ouanaminthe', 'Trou-du-Nord', 'Terrier-Rouge', 'Caracol', 'Sainte-Suzanne',
    'Vallières', 'Mombin-Crochu', 'Ferrier', 'Perches', 'Capotille', 'Mont-Organisé', 'Carice'],
  'Nord-Ouest': ['Port-de-Paix', 'Saint-Louis-du-Nord', 'Jean-Rabel', 'Môle-Saint-Nicolas', 'Bombardopolis',
    'Baie-de-Henne', 'Anse-à-Foleur', 'Bassin-Bleu', 'Chansolme', 'La Tortue', 'Île de la Tortue'],
  Artibonite: ['Gonaïves', 'Saint-Marc', 'Verrettes', 'Petite-Rivière-de-l’Artibonite', 'Dessalines',
    'Gros-Morne', 'Ennery', 'Marmelade', 'L’Estère', 'Anse-Rouge', 'Terre-Neuve', 'Saint-Michel-de-l’Attalaye',
    'Desdunes', 'Grande-Saline', 'Liancourt', 'La Chapelle', 'Montrouis', 'Pont-Sondé'],
  Centre: ['Hinche', 'Mirebalais', 'Lascahobas', 'Belladère', 'Cerca-la-Source', 'Thomassique', 'Thomonde',
    'Maïssade', 'Cerca-Carvajal', 'Boucan-Carré', 'Saut-d’Eau', 'Savanette'],
  'Sud-Est': ['Jacmel', 'Marigot', 'Cayes-Jacmel', 'Bainet', 'Belle-Anse', 'Thiotte', 'Anse-à-Pitres',
    'Côtes-de-Fer', 'La Vallée', 'La Vallée-de-Jacmel', 'Grand-Gosier'],
  Sud: ['Les Cayes', 'Cayes', 'Aux Cayes', 'Aquin', 'Saint-Louis-du-Sud', 'Cavaillon', 'Camp-Perrin', 'Torbeck',
    'Port-Salut', 'Chantal', 'Les Anglais', 'Tiburon', 'Port-à-Piment', 'Coteaux', 'Chardonnières',
    'Maniche', 'Île-à-Vache', 'Roche-à-Bateau', 'Arniquet', 'Saint-Jean-du-Sud'],
  'Grand’Anse': ['Jérémie', 'Anse-d’Hainault', 'Dame-Marie', 'Les Irois', 'Corail', 'Pestel', 'Roseaux',
    'Abricots', 'Beaumont', 'Moron', 'Chambellan', 'Bonbon', 'Marfranc'],
  Nippes: ['Miragoâne', 'Anse-à-Veau', 'Petit-Trou-de-Nippes', 'Baradères', 'Fond-des-Nègres',
    'Petite-Rivière-de-Nippes', 'L’Asile', 'Paillant', 'Plaisance-du-Sud', 'Arnaud', 'Grand-Boucan'],
};

// Grandes villes de la diaspora → pays.
const VILLES_ETRANGERES = {
  'États-Unis': ['Miami', 'North Miami', 'Miami Gardens', 'Fort Lauderdale', 'Orlando', 'Tampa', 'Boston',
    'Brockton', 'Cambridge', 'Somerville', 'Malden', 'Everett', 'Medford', 'Randolph', 'New York', 'Brooklyn',
    'Queens', 'Bronx', 'Manhattan', 'Spring Valley', 'Newark', 'Irvington', 'East Orange', 'Elizabeth',
    'Atlanta', 'Chicago', 'Philadelphie', 'Philadelphia', 'Washington', 'Houston', 'Delray Beach',
    'Boynton Beach', 'West Palm Beach', 'Pompano Beach', 'Naples', 'Stamford', 'Omaha', 'St Augustine',
    'Saint Augustine', 'Jacksonville', 'Dallas', 'Los Angeles', 'Las Vegas', 'Charlotte', 'Providence'],
  Canada: ['Montréal', 'Laval', 'Longueuil', 'Québec', 'Gatineau', 'Ottawa', 'Toronto', 'Sherbrooke',
    'Trois-Rivières', 'Terrebonne', 'Repentigny', 'Brossard'],
  France: ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Lille', 'Toulouse', 'Nantes', 'Strasbourg',
    'Cayenne', 'Fort-de-France', 'Pointe-à-Pitre', 'Saint-Denis', 'Créteil', 'Montreuil'],
  'République dominicaine': ['Saint-Domingue', 'Santo Domingo', 'Puerto Plata', 'Dajabón', 'Punta Cana',
    'La Romana', 'San Pedro de Macorís'],
  Chili: ['Santiago du Chili'],
  Brésil: ['São Paulo', 'Sao Paulo', 'Rio de Janeiro', 'Curitiba', 'Manaus', 'Porto Alegre'],
  Bahamas: ['Nassau', 'Freeport'],
  Belgique: ['Bruxelles', 'Liège', 'Anvers'],
  Suisse: ['Genève', 'Lausanne', 'Zurich', 'Berne'],
};

// Variantes et quartiers → commune (pour regrouper « Delmas 40 B » et « Delmas75 » sous « Delmas »).
const COMMUNE_DE = {
  Petionville: 'Pétion-Ville', 'Cap Haitien': 'Cap-Haïtien', Okap: 'Cap-Haïtien', Cayes: 'Les Cayes',
  'Aux Cayes': 'Les Cayes', Laboule: 'Pétion-Ville', Pèlerin: 'Pétion-Ville', Métivier: 'Pétion-Ville',
  Frères: 'Pétion-Ville', 'Route de Frères': 'Pétion-Ville', Juvénat: 'Pétion-Ville', Thomassin: 'Kenscoff',
  Fermathe: 'Kenscoff', 'Puits Blain': 'Delmas', Martissant: 'Port-au-Prince', Bourdon: 'Port-au-Prince',
  'Bel-Air': 'Port-au-Prince', Turgeau: 'Port-au-Prince', Pacot: 'Port-au-Prince', 'Christ-Roi': 'Port-au-Prince',
  Lalue: 'Port-au-Prince', 'Carrefour-Feuilles': 'Port-au-Prince', 'Croix-des-Missions': 'Tabarre',
  'Tabarre Issa': 'Tabarre', 'Bon Repos': 'Croix-des-Bouquets', Canaan: 'Croix-des-Bouquets',
  'La Gonâve': 'Anse-à-Galets', 'La Vallée-de-Jacmel': 'La Vallée', Labadie: 'Cap-Haïtien',
  Montrouis: 'Saint-Marc', 'Pont-Sondé': 'Saint-Marc', 'Île de la Tortue': 'La Tortue',
};

// Régions de la diaspora (États, provinces, régions) : mots qui les désignent et villes qui s'y trouvent.
const REGIONS_ETRANGERES = {
  'États-Unis': {
    Floride: [['florida', 'floride'], ['Miami', 'North Miami', 'Miami Gardens', 'Fort Lauderdale', 'Orlando', 'Tampa',
      'Delray Beach', 'Boynton Beach', 'West Palm Beach', 'Pompano Beach', 'Naples', 'St Augustine', 'Saint Augustine', 'Jacksonville']],
    Massachusetts: [['massachusetts'], ['Boston', 'Brockton', 'Cambridge', 'Somerville', 'Malden', 'Everett', 'Medford', 'Randolph']],
    'New York': [['new york state', 'etat de new york'], ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Manhattan', 'Spring Valley']],
    'New Jersey': [['new jersey'], ['Newark', 'Irvington', 'East Orange', 'Elizabeth']],
    Géorgie: [['georgia', 'georgie'], ['Atlanta']],
    Illinois: [['illinois'], ['Chicago']],
    Pennsylvanie: [['pennsylvania', 'pennsylvanie'], ['Philadelphie', 'Philadelphia']],
    Texas: [['texas'], ['Houston', 'Dallas']],
    Californie: [['california', 'californie'], ['Los Angeles']],
    Nevada: [['nevada'], ['Las Vegas']],
    'Caroline du Nord': [['north carolina', 'caroline du nord'], ['Charlotte']],
    'Rhode Island': [['rhode island'], ['Providence']],
    Connecticut: [['connecticut'], ['Stamford']],
    Nebraska: [['nebraska'], ['Omaha']],
    Maryland: [['maryland'], []],
    Virginie: [['virginia', 'virginie'], []],
    Ohio: [['ohio'], []],
    Michigan: [['michigan'], []],
    'District de Columbia': [['district of columbia'], ['Washington']],
  },
  Canada: {
    Québec: [['quebec', 'province de quebec'], ['Montréal', 'Laval', 'Longueuil', 'Québec', 'Gatineau', 'Sherbrooke',
      'Trois-Rivières', 'Terrebonne', 'Repentigny', 'Brossard']],
    Ontario: [['ontario'], ['Ottawa', 'Toronto']],
  },
  France: {
    'Île-de-France': [['ile de france'], ['Paris', 'Créteil', 'Montreuil']],
    'Auvergne-Rhône-Alpes': [['auvergne rhone alpes'], ['Lyon']],
    'Provence-Alpes-Côte d’Azur': [['provence alpes cote d azur', 'paca'], ['Marseille']],
    'Nouvelle-Aquitaine': [['nouvelle aquitaine'], ['Bordeaux']],
    'Hauts-de-France': [['hauts de france'], ['Lille']],
    Occitanie: [['occitanie'], ['Toulouse']],
    'Pays de la Loire': [['pays de la loire'], ['Nantes']],
    'Grand Est': [['grand est'], ['Strasbourg']],
    Guyane: [['guyane'], ['Cayenne']],
    Martinique: [['martinique'], ['Fort-de-France']],
    Guadeloupe: [['guadeloupe'], ['Pointe-à-Pitre']],
  },
};

const VILLE_REGION = new Map();
const REGION_INFO = new Map(); // clé → { region, pays }
for (const [pays, regions] of Object.entries(REGIONS_ETRANGERES)) {
  for (const [region, [mots, villes]] of Object.entries(regions)) {
    REGION_INFO.set(geoKey(region), { region, pays });
    for (const m of mots) REGION_INFO.set(geoKey(m), { region, pays });
    for (const v of villes) VILLE_REGION.set(geoKey(v), region);
  }
}

/** Toutes les régions connues : départements d'Haïti puis régions de la diaspora. */
export const REGIONS = [
  ...['Artibonite', 'Centre', 'Grand’Anse', 'Nippes', 'Nord', 'Nord-Est', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Est'],
  ...Object.values(REGIONS_ETRANGERES).flatMap((r) => Object.keys(r)),
];

const COMMUNE_INDEX = new Map();
const COMMUNE_NOM = new Map();
for (const [dep, list] of Object.entries(COMMUNES)) {
  for (const c of list) {
    COMMUNE_INDEX.set(geoKey(c), dep);
    COMMUNE_NOM.set(geoKey(c), COMMUNE_DE[c] || c);
  }
}
const ETRANGER_INDEX = new Map();
const ETRANGER_NOM = new Map();
for (const [pays, list] of Object.entries(VILLES_ETRANGERES)) {
  for (const v of list) {
    ETRANGER_INDEX.set(geoKey(v), pays);
    ETRANGER_NOM.set(geoKey(v), v);
  }
}
const PAYS_INDEX = new Map(PAYS.map((p) => [geoKey(p), p]));
for (const [alias, pays] of [['haiti', HAITI], ['ayiti', HAITI], ['usa', 'États-Unis'], ['us', 'États-Unis'],
  ['etats unis d amerique', 'États-Unis'], ['united states', 'États-Unis'], ['rd', 'République dominicaine'],
  ['dominican republic', 'République dominicaine'], ['uk', 'Royaume-Uni'], ['brazil', 'Brésil'], ['chile', 'Chili']]) {
  PAYS_INDEX.set(alias, pays);
}
const DEP_INDEX = new Map(DEPARTEMENTS.map((d) => [geoKey(d), d]));
DEP_INDEX.set('grande anse', 'Grand’Anse');
DEP_INDEX.set('grandanse', 'Grand’Anse');

/** Nom de pays canonique (« haiti » → « Haïti »), ou la saisie nettoyée, ou null. */
export function canonicalPays(value) {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (raw.length < 2) return null;
  return PAYS_INDEX.get(geoKey(raw)) || raw;
}

/** Département canonique, ou null s'il n'existe pas. */
export function canonicalDepartement(value) {
  return DEP_INDEX.get(geoKey(value)) || null;
}

// Mots qui désignent un pays (ou un État / une province) dans une adresse libre.
const PAYS_MOTS = [
  ['Haïti', ['haiti', 'ayiti', 'haïti']],
  ['États-Unis', ['usa', 'etats unis', 'united states', 'florida', 'floride', 'massachusetts', 'new york', 'new jersey',
    'georgia', 'texas', 'california', 'californie', 'connecticut', 'pennsylvania', 'maryland', 'nebraska', 'illinois',
    'virginia', 'carolina', 'ohio', 'michigan', 'rhode island']],
  ['Canada', ['canada', 'quebec', 'ontario']],
  ['France', ['france', 'guadeloupe', 'martinique', 'guyane']],
  ['République dominicaine', ['republique dominicaine', 'dominican republic']],
  ['Chili', ['chili', 'chile']],
  ['Brésil', ['bresil', 'brasil', 'brazil']],
];

/** Index des noms connus, du plus long au plus court (« cayes jacmel » avant « cayes »). */
const NOMS = [
  ...[...COMMUNE_INDEX.entries()].map(([key, dep]) => ({ key, pays: HAITI, departement: dep })),
  ...[...ETRANGER_INDEX.entries()].map(([key, pays]) => ({ key, pays })),
].sort((a, b) => b.key.length - a.key.length);
const DEP_MOTS = [...DEP_INDEX.keys()].sort((a, b) => b.length - a.length);

const hasWord = (text, word) => ` ${text} `.includes(` ${word} `);

/**
 * Pays et département déduits d'une ville, même saisie comme une adresse
 * (« Delmas 40 B, Imp Belot », « Naples, Florida, USA »).
 * Ne devine rien en cas de doute : renvoie {} si rien de connu n'est trouvé.
 */
export function inferFromVille(ville) {
  const key = geoKey(ville).replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2');
  if (!key) return {};
  const foreign = (cityKey) => {
    const pays = ETRANGER_INDEX.get(cityKey);
    const region = VILLE_REGION.get(cityKey) || regionWord(key, pays);
    return { pays, ...(region ? { region } : {}), commune: ETRANGER_NOM.get(cityKey) };
  };
  const exact = COMMUNE_INDEX.get(key);
  if (exact) return { pays: HAITI, departement: exact, region: exact, commune: COMMUNE_NOM.get(key) };
  if (ETRANGER_INDEX.has(key)) return foreign(key);
  const nom = NOMS.find((n) => hasWord(key, n.key));
  if (nom) {
    return nom.departement
      ? { pays: nom.pays, departement: nom.departement, region: nom.departement, commune: COMMUNE_NOM.get(nom.key) }
      : foreign(nom.key);
  }
  const dep = DEP_MOTS.find((d) => hasWord(key, d));
  if (dep) return { pays: HAITI, departement: DEP_INDEX.get(dep), region: DEP_INDEX.get(dep) };
  const regionKey = REGION_MOTS.find((m) => hasWord(key, m));
  if (regionKey) return { ...REGION_INFO.get(regionKey) };
  const pays = PAYS_MOTS.find(([, mots]) => mots.some((m) => hasWord(key, geoKey(m))));
  return pays ? { pays: pays[0] } : {};
}

const REGION_MOTS = [...REGION_INFO.keys()].sort((a, b) => b.length - a.length);
function regionWord(key, pays) {
  const m = REGION_MOTS.find((r) => hasWord(key, r) && REGION_INFO.get(r).pays === pays);
  return m ? REGION_INFO.get(m).region : null;
}

/** Région canonique (département d'Haïti ou région de la diaspora), ou null. */
export function canonicalRegion(value) {
  return canonicalDepartement(value) || REGION_INFO.get(geoKey(value))?.region || null;
}

/** Localisation effective : déclarée en priorité, sinon déduite de la ville. */
export function effectiveLocation({ pays, departement, ville } = {}) {
  const declaredPays = canonicalPays(pays);
  const declaredDep = canonicalDepartement(departement);
  const inferred = inferFromVille(ville);
  const finalPays = declaredPays || inferred.pays || null;
  const finalDep = finalPays === HAITI
    ? declaredDep || (inferred.pays === HAITI ? inferred.departement : null) || null
    : null;
  // Région : le département pour Haïti, sinon l'État / la province déduits de la ville.
  const region = finalDep || (finalPays && inferred.pays === finalPays ? inferred.region : null) || null;
  return {
    pays: finalPays,
    departement: finalDep,
    region,
    ville: String(ville ?? '').trim() || null,
    // Commune reconnue (« Delmas 40 B, Imp Belot » → « Delmas »), sinon la saisie.
    commune: inferred.commune || String(ville ?? '').trim() || null,
    deduit: !declaredPays && Boolean(inferred.pays),
  };
}

/**
 * Filtre géographique : listes vides = pas de filtre. Entre deux critères : ET ;
 * à l'intérieur d'un critère : OU. Comparaison sans accents ni majuscules.
 */
export function matchesGeo(location, { pays = [], departements = [], villes = [] } = {}) {
  const loc = effectiveLocation(location);
  if (pays.length && !pays.some((p) => geoKey(p) === geoKey(loc.pays))) return false;
  // « departements » accepte aussi les régions de la diaspora (Floride, Québec…).
  if (departements.length && !departements.some((d) => {
    const wanted = canonicalRegion(d);
    return wanted ? wanted === loc.region : geoKey(d) === geoKey(loc.region);
  })) return false;
  if (villes.length && !villes.some((v) => {
    const wanted = geoKey(v);
    return wanted && (wanted === geoKey(loc.commune) || hasWord(geoKey(loc.ville).replace(/([a-z])(\d)/g, '$1 $2'), wanted));
  })) return false;
  return true;
}

/** Valide et normalise une localisation saisie dans un formulaire. */
export function cleanLocation({ pays, departement, ville } = {}) {
  const p = canonicalPays(pays);
  if (!p) return { error: 'Pays requis.' };
  const v = String(ville ?? '').trim().replace(/\s+/g, ' ');
  if (v.length < 2 || v.length > 80) return { error: 'Ville invalide.' };
  if (p === HAITI) {
    const d = canonicalDepartement(departement);
    if (!d) return { error: 'Département requis pour Haïti.' };
    return { pays: p, departement: d, ville: v };
  }
  return { pays: p, departement: null, ville: v };
}

/**
 * Valeurs présentes dans la base (pays, régions, communes) avec leur nombre de
 * fiches, pour les suggestions de saisie. Une nouvelle ville apparaît d'elle-même.
 */
export function geoFacets(rows) {
  const maps = { pays: new Map(), region: new Map(), commune: new Map() };
  for (const m of rows || []) {
    const loc = effectiveLocation(m);
    for (const key of Object.keys(maps)) {
      const value = loc[key];
      if (!value) continue;
      const entry = maps[key].get(value) || { nom: value, total: 0, pays: loc.pays || null, region: loc.region || null };
      entry.total += 1;
      maps[key].set(value, entry);
    }
  }
  const sorted = (map) => [...map.values()].sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'));
  return {
    pays: sorted(maps.pays).map(({ nom, total }) => ({ nom, total })),
    regions: sorted(maps.region).map(({ nom, total, pays }) => ({ nom, total, pays })),
    communes: sorted(maps.commune).slice(0, 300),
    a_valider: (rows || []).filter((m) => !m.pays && inferFromVille(m.ville).pays).length,
  };
}

