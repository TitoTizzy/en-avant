// Google Analytics 4 (Data API) — lecture seule, via le compte de service du projet Google Cloud
// « en-avant-stats ». Variables Vercel : GA_PROPERTY_ID (identifiant de propriété) et
// GA_CREDENTIALS (contenu du fichier JSON de la clé, secret). Aucune dépendance : le jeton est
// signé avec node:crypto (RS256) puis échangé contre un jeton d'accès Google.
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://analyticsdata.googleapis.com/v1beta';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export class GaError extends Error {
  constructor(message, status = 502, code = 'ga') { super(message); this.status = status; this.code = code; }
}

/** Lit la configuration ; renvoie null si GA n'est pas branché. */
export function gaConfig(env = process.env) {
  const propertyId = String(env.GA_PROPERTY_ID || '').trim();
  const raw = String(env.GA_CREDENTIALS || '').trim();
  if (!propertyId || !raw) return null;
  if (!/^\d{5,15}$/.test(propertyId)) throw new GaError('GA_PROPERTY_ID doit être le numéro de la propriété (pas le code G-…).', 500, 'config');
  let creds;
  try { creds = JSON.parse(raw); } catch { throw new GaError('GA_CREDENTIALS n’est pas un JSON valide : recopiez tout le fichier de la clé.', 500, 'config'); }
  if (!creds.client_email || !creds.private_key) throw new GaError('GA_CREDENTIALS incomplet : client_email ou private_key manquant.', 500, 'config');
  return { propertyId, clientEmail: creds.client_email, privateKey: String(creds.private_key).replace(/\\n/g, '\n') };
}

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/** Assertion JWT signée (exportée pour les tests). */
export function signAssertion({ clientEmail, privateKey }, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64url({ alg: 'RS256', typ: 'JWT' });
  const body = b64url({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${head}.${body}`);
  return `${head}.${body}.${signer.sign(privateKey).toString('base64url')}`;
}

let tokenCache = null;
export function resetGaCache() { tokenCache = null; reportCache.clear(); }

async function accessToken(cfg, fetchImpl) {
  if (tokenCache && tokenCache.email === cfg.clientEmail && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  let assertion;
  try { assertion = signAssertion(cfg); } catch { throw new GaError('La clé privée de GA_CREDENTIALS est illisible : recréez une clé JSON.', 500, 'config'); }
  const r = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    throw new GaError('Google refuse la clé du compte de service (clé supprimée ou désactivée ?). Recréez une clé et mettez à jour GA_CREDENTIALS.', 502, 'auth');
  }
  tokenCache = { email: cfg.clientEmail, token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

const reportCache = new Map();
const CACHE_MS = 5 * 60_000;

/** Appel à l'API Data ; met en cache 5 min (sauf temps réel). */
export async function gaCall(cfg, method, body, { fetchImpl = fetch, cache = true } = {}) {
  const key = `${method}:${JSON.stringify(body)}`;
  const hit = cache && reportCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const token = await accessToken(cfg, fetchImpl);
  const r = await fetchImpl(`${API}/properties/${cfg.propertyId}:${method}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || '';
    if (r.status === 403) throw new GaError('Le compte de service n’a pas accès à cette propriété Google Analytics : ajoutez-le comme « Lecteur » dans Gestion des accès à la propriété.', 502, 'acces');
    if (r.status === 429) throw new GaError('Quota Google Analytics atteint pour l’heure en cours. Réessayez un peu plus tard.', 503, 'quota');
    if (/has not been used|is disabled/i.test(msg)) throw new GaError('L’API « Google Analytics Data » n’est pas activée dans le projet Google Cloud.', 502, 'api');
    throw new GaError(`Google Analytics a répondu une erreur (${r.status}).`, 502, 'ga');
  }
  if (cache) {
    reportCache.set(key, { data, exp: Date.now() + CACHE_MS });
    if (reportCache.size > 200) reportCache.delete(reportCache.keys().next().value);
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Requêtes et mise en forme (fonctions pures, testées)                */
/* ------------------------------------------------------------------ */

export const PERIODES_GA = { 1: 'Aujourd’hui', 7: '7 derniers jours', 30: '30 derniers jours', 90: '3 derniers mois', 365: '12 derniers mois' };

export function dateRanges(days) {
  if (days === 1) return [{ startDate: 'today', endDate: 'today', name: 'cur' }, { startDate: 'yesterday', endDate: 'yesterday', name: 'prev' }];
  return [
    { startDate: `${days - 1}daysAgo`, endDate: 'today', name: 'cur' },
    { startDate: `${2 * days - 1}daysAgo`, endDate: `${days}daysAgo`, name: 'prev' },
  ];
}

export const TOTAL_METRICS = ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'userEngagementDuration', 'engagementRate', 'bounceRate', 'averageSessionDuration'];

const exactPath = (path) => ({ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: path } } });

/** Les rapports d'une période (2 lots de 5, limite de l'API). */
export function overviewRequests(days, path = null) {
  const cur = dateRanges(days).slice(0, 1);
  const both = dateRanges(days);
  const f = path ? { dimensionFilter: exactPath(path) } : {};
  const m = (names) => names.map((name) => ({ name }));
  const top = (dim, metric, limit) => ({ dateRanges: cur, dimensions: [{ name: dim }], metrics: m([metric]), orderBys: [{ metric: { metricName: metric }, desc: true }], limit, ...f });
  const lot1 = [
    { dateRanges: both, metrics: m(TOTAL_METRICS), ...f },
    { dateRanges: cur, dimensions: [{ name: days === 1 ? 'hour' : 'date' }], metrics: m(['activeUsers', 'screenPageViews']), orderBys: [{ dimension: { dimensionName: days === 1 ? 'hour' : 'date' } }], limit: 400, ...f },
    path ? top('pageTitle', 'screenPageViews', 3)
      : { dateRanges: cur, dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }], metrics: m(['screenPageViews', 'activeUsers', 'userEngagementDuration']), orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 250 },
    top('sessionDefaultChannelGroup', 'sessions', 10),
    top('sessionSource', 'sessions', 12),
  ];
  const lot2 = [
    top('country', 'activeUsers', 15),
    top('city', 'activeUsers', 15),
    top('deviceCategory', 'activeUsers', 5),
    top('language', 'activeUsers', 10),
    path ? top('sessionCampaignName', 'sessions', 10) : top('landingPage', 'sessions', 15),
  ];
  return [lot1, lot2];
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const rowsOf = (rep) => rep?.rows || [];
const pair = (rep, metric = 0, labels = {}) => rowsOf(rep)
  .map((r) => ({ label: labels[r.dimensionValues[0].value] || r.dimensionValues[0].value || '(non défini)', value: num(r.metricValues[metric].value) }))
  .filter((x) => x.value > 0);

const CHANNELS = {
  'Organic Search': 'Recherche Google / Bing', Direct: 'Accès direct', 'Organic Social': 'Réseaux sociaux',
  Referral: 'Autres sites', Email: 'Emails', 'Paid Search': 'Publicité (recherche)', 'Paid Social': 'Publicité (réseaux)',
  Unassigned: 'Non attribué', 'Organic Video': 'Vidéo', Display: 'Bannières', 'Cross-network': 'Campagnes Google',
};
const DEVICES = { mobile: 'Téléphone', desktop: 'Ordinateur', tablet: 'Tablette', 'smart tv': 'Télévision' };
const COUNTRIES = { Haiti: 'Haïti', 'United States': 'États-Unis', Canada: 'Canada', France: 'France', 'Dominican Republic': 'République dominicaine', Chile: 'Chili', Brazil: 'Brésil', Mexico: 'Mexique', Belgium: 'Belgique', Switzerland: 'Suisse', Germany: 'Allemagne', Spain: 'Espagne', 'United Kingdom': 'Royaume-Uni', Bahamas: 'Bahamas', 'Turks and Caicos Islands': 'Îles Turques-et-Caïques', Guadeloupe: 'Guadeloupe', Martinique: 'Martinique', 'French Guiana': 'Guyane', Ireland: 'Irlande', Netherlands: 'Pays-Bas', Italy: 'Italie' };
const LANGS = { French: 'Français', English: 'Anglais', Spanish: 'Espagnol', 'Haitian Creole': 'Créole haïtien', Portuguese: 'Portugais', German: 'Allemand' };

function totals(rep) {
  const out = { cur: {}, prev: {} };
  const names = (rep?.metricHeaders || []).map((h) => h.name);
  for (const r of rowsOf(rep)) {
    const which = r.dimensionValues?.find((d) => d.value === 'cur' || d.value === 'prev')?.value || 'cur';
    names.forEach((n, i) => { out[which][n] = num(r.metricValues[i].value); });
  }
  return out;
}

const haitiDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Port-au-Prince' });

/** Courbe : un point par heure (aujourd'hui) ou par jour, jours sans visite compris. */
export function series(rep, days, now = Date.now()) {
  const map = new Map(rowsOf(rep).map((r) => [r.dimensionValues[0].value, r]));
  const keys = [];
  if (days === 1) for (let h = 0; h < 24; h += 1) keys.push(String(h).padStart(2, '0'));
  else for (let i = days - 1; i >= 0; i -= 1) keys.push(haitiDay.format(new Date(now - i * 864e5)).replace(/-/g, ''));
  return {
    keys, horaire: days === 1,
    visiteurs: keys.map((k) => num(map.get(k)?.metricValues[0].value)),
    vues: keys.map((k) => num(map.get(k)?.metricValues[1].value)),
  };
}

/** Pages regroupées par chemin : vues, visiteurs, temps d'attention moyen par vue (secondes). */
export function pagesTable(rep) {
  const byPath = new Map();
  for (const r of rowsOf(rep)) {
    const path = r.dimensionValues[0].value || '/';
    const title = r.dimensionValues[1]?.value || '';
    const vues = num(r.metricValues[0].value);
    const p = byPath.get(path) || { chemin: path, titre: '', vues: 0, visiteurs: 0, engagement: 0, _best: -1 };
    p.vues += vues; p.visiteurs += num(r.metricValues[1].value); p.engagement += num(r.metricValues[2].value);
    if (vues > p._best && title && title !== '(not set)') { p.titre = title.replace(/\s*[|–-]\s*En Avant.*$/i, '').trim() || title; p._best = vues; }
    byPath.set(path, p);
  }
  return [...byPath.values()].map(({ _best, ...p }) => ({ ...p, temps_moyen: p.vues ? Math.round(p.engagement / p.vues) : 0 }))
    .sort((a, b) => b.vues - a.vues);
}

/** Pages où l'on reste le plus longtemps, parmi celles assez vues pour être significatives. */
export function pagesAttention(pages, limit = 15) {
  const total = pages.reduce((a, p) => a + p.vues, 0);
  const seuil = Math.max(5, Math.round(total * 0.002));
  return pages.filter((p) => p.vues >= seuil).sort((a, b) => b.temps_moyen - a.temps_moyen).slice(0, limit);
}

export function buildAudience([lot1, lot2], { days, path = null } = {}) {
  const [tot, ser, pages, canaux, sources] = lot1.reports || [];
  const [pays, villes, appareils, langues, entrees] = lot2.reports || [];
  const t = totals(tot);
  const k = (label, key, format = 'int', hint = '') => ({ label, value: t.cur[key] ?? 0, previous: t.prev[key] ?? null, format, hint });
  const table = path ? [] : pagesTable(pages);
  return {
    periode: days,
    libelle: PERIODES_GA[days] || `${days} derniers jours`,
    page: path,
    titre_page: path ? (rowsOf(pages)[0]?.dimensionValues[0].value || '') : null,
    kpis: [
      k('Visiteurs', 'activeUsers', 'int', 'personnes différentes'),
      k('Nouveaux visiteurs', 'newUsers'),
      k('Visites', 'sessions', 'int', 'sessions'),
      k('Pages vues', 'screenPageViews'),
      { label: 'Temps moyen par visite', value: Math.round(t.cur.averageSessionDuration || 0), previous: t.prev.averageSessionDuration != null ? Math.round(t.prev.averageSessionDuration) : null, format: 'duree', hint: '' },
      { label: 'Visites engagées', value: Math.round((t.cur.engagementRate || 0) * 100), previous: t.prev.engagementRate != null ? Math.round(t.prev.engagementRate * 100) : null, format: 'pct', hint: '> 10 s, 2 pages ou une action' },
      { label: 'Taux de rebond', value: Math.round((t.cur.bounceRate || 0) * 100), previous: t.prev.bounceRate != null ? Math.round(t.prev.bounceRate * 100) : null, format: 'pct', hint: 'plus bas = mieux', inverse: true },
    ],
    serie: series(ser, days),
    pages: table.slice(0, 100),
    attention: pagesAttention(table),
    canaux: pair(canaux, 0, CHANNELS),
    sources: pair(sources),
    pays: pair(pays, 0, COUNTRIES),
    villes: pair(villes).filter((v) => v.label !== '(not set)'),
    appareils: pair(appareils, 0, DEVICES),
    langues: pair(langues, 0, LANGS),
    entrees: path ? pair(entrees).filter((v) => v.label !== '(not set)') : pair(entrees),
  };
}

export function buildRealtime(rep) {
  const rows = rowsOf(rep);
  return {
    en_ligne: rows.reduce((a, r) => a + num(r.metricValues[0].value), 0),
    pages: rows.map((r) => ({ label: r.dimensionValues[0].value || '(sans titre)', value: num(r.metricValues[0].value) }))
      .sort((a, b) => b.value - a.value).slice(0, 10),
  };
}

export async function audience(cfg, { days, path = null }, opts = {}) {
  const [l1, l2] = overviewRequests(days, path);
  const [r1, r2] = await Promise.all([
    gaCall(cfg, 'batchRunReports', { requests: l1 }, opts),
    gaCall(cfg, 'batchRunReports', { requests: l2 }, opts),
  ]);
  return buildAudience([r1, r2], { days, path });
}

export async function realtime(cfg, opts = {}) {
  const rep = await gaCall(cfg, 'runRealtimeReport', {
    dimensions: [{ name: 'unifiedScreenName' }], metrics: [{ name: 'activeUsers' }], limit: 50,
  }, { ...opts, cache: false });
  return buildRealtime(rep);
}
