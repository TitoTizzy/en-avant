// Maintenance : bilan de santé en clair (sans appeler les services quand une clé manque).
// Lancer : node --test scripts/test-maintenance.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { healthReport } from '../api/_admin/maintenance.js';

/** Faux client : chaque table renvoie le résultat fourni, quelle que soit la chaîne de filtres. */
function fake(results) {
  const q = (table) => {
    const res = results[table] || { data: [], count: 0, error: null };
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (ok, ko) => Promise.resolve(res).then(ok, ko);
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ ...res, data: Array.isArray(res.data) ? res.data[0] || null : res.data });
        return () => chain;
      },
    });
    return chain;
  };
  return { from: q };
}

const old = new Date(Date.now() - 60 * 60000).toISOString();

test('Bilan : clés absentes expliquées, envoi bloqué et échecs détectés, réparation proposée', async () => {
  const report = await healthReport(fake({
    profiles: { count: 57, error: null },
    newsletters: { data: [{ id: 'n1', sujet: 'Lettre de novembre', started_at: old, updated_at: old }], error: null },
    newsletter_deliveries: { count: 3, error: null },
    api_rate_limits: { count: 2, error: null },
    site_settings: { data: [{ value: { actif: true, message: 'Mise à jour en cours' } }], error: null },
    activity_logs: { data: [], error: null },
  }), {});
  const by = Object.fromEntries(report.checks.map((c) => [c.cle, c]));
  assert.equal(report.etat, 'erreur');
  assert.match(report.resume, /en panne/);
  assert.equal(by.base.etat, 'ok');
  assert.match(by.base.explication, /57 comptes/);
  assert.equal(by.emails.etat, 'erreur');
  assert.match(by.emails.explication, /aucun email ne peut partir/);
  assert.equal(by.paiements.etat, 'erreur');
  assert.equal(by.ia.etat, 'erreur');
  assert.equal(by.taches.etat, 'erreur');
  assert.equal(by.envois.etat, 'attention');
  assert.equal(by.envois.reparation, 'reprendre_envois');
  assert.match(by.envois.explication, /« Lettre de novembre »/);
  assert.equal(by.anti_abus.reparation, 'debloquer_compteurs');
  assert.equal(by.maintenance.etat, 'attention');
  assert.match(by.maintenance.explication, /Mise à jour en cours/);
  // Aucune explication technique brute.
  for (const c of report.checks) assert.doesNotMatch(c.explication, /undefined|null|\[object/);
});

test('Bilan : base inaccessible → contrôle en erreur avec une cause lisible, sans planter', async () => {
  const report = await healthReport(fake({ profiles: { count: null, error: { message: 'fetch failed' } } }), {});
  const base = report.checks.find((c) => c.cle === 'base');
  assert.equal(base.etat, 'erreur');
  assert.match(base.explication, /n’a pas répondu à temps/);
});
