import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { gaConfig, signAssertion, gaCall, resetGaCache, overviewRequests, dateRanges, pagesTable, pagesAttention, buildAudience, buildRealtime, series, GaError } from '../api/_lib/ga.js';
import { validPath } from '../api/_admin/audience.js';
import { PERMISSIONS } from '../api/_lib/permissions.js';

// Clé générée pour le test uniquement (jamais la vraie clé).
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const env = { GA_PROPERTY_ID: '123456789', GA_CREDENTIALS: JSON.stringify({ client_email: 'test@demo.iam.gserviceaccount.com', private_key: pem }) };

test('configuration : absente, invalide, complète', () => {
  assert.equal(gaConfig({}), null);
  assert.throws(() => gaConfig({ GA_PROPERTY_ID: 'G-NJEJ3FDKXY', GA_CREDENTIALS: '{}' }), /numéro de la propriété/);
  assert.throws(() => gaConfig({ GA_PROPERTY_ID: '123456789', GA_CREDENTIALS: 'pas du json' }), /JSON valide/);
  const cfg = gaConfig(env);
  assert.equal(cfg.propertyId, '123456789');
  assert.equal(cfg.clientEmail, 'test@demo.iam.gserviceaccount.com');
});

test('jeton signé RS256 vérifiable avec la clé publique, portée lecture seule', () => {
  const jwt = signAssertion(gaConfig(env), 1000);
  const [h, b, sig] = jwt.split('.');
  const v = crypto.createVerify('RSA-SHA256'); v.update(`${h}.${b}`);
  assert.ok(v.verify(publicKey, Buffer.from(sig, 'base64url')));
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/analytics.readonly');
  assert.equal(claims.exp - claims.iat, 3600);
});

function fakeFetch(handlers) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const h = handlers.find(([m]) => url.includes(m));
    const [status, body] = h ? h[1](url, init) : [404, {}];
    return { ok: status < 400, status, json: async () => body };
  };
  f.calls = calls;
  return f;
}

test('appel API : jeton réutilisé, cache 5 min, erreurs expliquées', async () => {
  resetGaCache();
  const cfg = gaConfig(env);
  const f = fakeFetch([
    ['oauth2.googleapis.com', () => [200, { access_token: 'tok', expires_in: 3600 }]],
    [':runReport', () => [200, { rows: [] }]],
    [':batchRunReports', () => [403, { error: { message: 'User does not have sufficient permissions' } }]],
  ]);
  await gaCall(cfg, 'runReport', { a: 1 }, { fetchImpl: f });
  await gaCall(cfg, 'runReport', { a: 1 }, { fetchImpl: f });
  assert.equal(f.calls.filter((c) => c.url.includes('oauth2')).length, 1);
  assert.equal(f.calls.filter((c) => c.url.includes(':runReport')).length, 1, 'deuxième appel servi par le cache');
  assert.equal(f.calls[1].init.headers.authorization, 'Bearer tok');
  assert.match(f.calls[1].url, /properties\/123456789:runReport$/);
  await assert.rejects(gaCall(cfg, 'batchRunReports', {}, { fetchImpl: f }), (e) => e instanceof GaError && /Lecteur/.test(e.message));
  resetGaCache();
  const bad = fakeFetch([['oauth2.googleapis.com', () => [400, { error: 'invalid_grant' }]]]);
  await assert.rejects(gaCall(cfg, 'runReport', {}, { fetchImpl: bad }), /refuse la clé/);
});

test('requêtes : périodes, 5 rapports par lot, filtre de page exact', () => {
  assert.deepEqual(dateRanges(7).map((r) => [r.startDate, r.endDate]), [['6daysAgo', 'today'], ['13daysAgo', '7daysAgo']]);
  assert.equal(dateRanges(1)[1].startDate, 'yesterday');
  const [l1, l2] = overviewRequests(30);
  assert.equal(l1.length, 5); assert.equal(l2.length, 5);
  const [p1] = overviewRequests(30, '/don');
  assert.equal(p1[0].dimensionFilter.filter.stringFilter.value, '/don');
  assert.equal(p1[0].dimensionFilter.filter.stringFilter.matchType, 'EXACT');
});

const row = (dims, mets) => ({ dimensionValues: dims.map((value) => ({ value })), metricValues: mets.map((value) => ({ value: String(value) })) });

test('pages : regroupées par adresse, temps moyen, pages « où l’on reste »', () => {
  const pages = pagesTable({ rows: [
    row(['/', 'Accueil | En Avant'], [100, 80, 3000]),
    row(['/', '(not set)'], [10, 5, 300]),
    row(['/vingt-chantiers/sante', 'Santé | En Avant'], [40, 30, 4800]),
    row(['/rare', 'Rare'], [2, 2, 1000]),
  ] });
  assert.equal(pages[0].chemin, '/'); assert.equal(pages[0].vues, 110); assert.equal(pages[0].titre, 'Accueil');
  assert.equal(pages[0].temps_moyen, 30);
  const att = pagesAttention(pages);
  assert.equal(att[0].chemin, '/vingt-chantiers/sante');
  assert.ok(!att.some((p) => p.chemin === '/rare'), 'page trop peu vue écartée');
});

test('vue d’ensemble : chiffres comparés, libellés en français', () => {
  const tot = { metricHeaders: ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'userEngagementDuration', 'engagementRate', 'bounceRate', 'averageSessionDuration'].map((name) => ({ name })),
    rows: [row(['cur'], [50, 40, 70, 200, 9000, 0.6, 0.4, 95.4]), row(['prev'], [25, 20, 30, 90, 3000, 0.5, 0.5, 60])] };
  const out = buildAudience([{ reports: [tot, { rows: [] }, { rows: [] }, { rows: [row(['Organic Search'], [30]), row(['Direct'], [0])] }, { rows: [] }] },
    { reports: [{ rows: [row(['Haiti'], [20]), row(['United States'], [15])] }, { rows: [row(['(not set)'], [3]), row(['Miami'], [4])] }, { rows: [row(['mobile'], [40])] }, { rows: [] }, { rows: [] }] }], { days: 30 });
  const k = Object.fromEntries(out.kpis.map((x) => [x.label, x]));
  assert.equal(k.Visiteurs.value, 50); assert.equal(k.Visiteurs.previous, 25);
  assert.equal(k['Temps moyen par visite'].value, 95); assert.equal(k['Temps moyen par visite'].format, 'duree');
  assert.equal(k['Taux de rebond'].value, 40); assert.equal(k['Taux de rebond'].inverse, true);
  assert.deepEqual(out.canaux, [{ label: 'Recherche Google / Bing', value: 30 }]);
  assert.deepEqual(out.pays.map((p) => p.label), ['Haïti', 'États-Unis']);
  assert.deepEqual(out.villes.map((p) => p.label), ['Miami']);
  assert.equal(out.appareils[0].label, 'Téléphone');
  assert.equal(out.serie.keys.length, 30);
});

test('courbe : jours sans visite à zéro, 24 heures pour aujourd’hui', () => {
  const now = Date.parse('2026-11-24T17:00:00Z');
  const s = series({ rows: [row(['20261124'], [3, 9]), row(['20261120'], [1, 2])] }, 7, now);
  assert.deepEqual(s.keys, ['20261118', '20261119', '20261120', '20261121', '20261122', '20261123', '20261124']);
  assert.deepEqual(s.vues, [0, 0, 2, 0, 0, 0, 9]);
  assert.equal(series({ rows: [] }, 1, now).keys.length, 24);
});

test('temps réel et sécurité des paramètres', () => {
  const r = buildRealtime({ rows: [row(['Accueil'], [2]), row(['Don'], [5])] });
  assert.equal(r.en_ligne, 7); assert.equal(r.pages[0].label, 'Don');
  assert.equal(validPath(''), null);
  assert.equal(validPath('/don'), '/don');
  assert.throws(() => validPath('https://evil.test/'), /invalide/);
  assert.throws(() => validPath('/a\nb'), /invalide/);
  assert.ok(PERMISSIONS.includes('voir_statistiques'));
});
