import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverview, top, buckets } from '../api/_lib/overview.js';

const NOW = Date.parse('2026-11-24T15:00:00Z');
const ago = (d) => new Date(NOW - d * 864e5).toISOString();

const data = {
  members: [
    { status: 'approved', created_at: ago(2), pays: 'Haïti', departement: 'Ouest' },
    { status: 'approved', created_at: ago(5), pays: 'États-Unis' },
    { status: 'pending', created_at: ago(1), pays: 'Haïti' },
    { status: 'rejected', created_at: ago(10) },
    { status: 'approved', created_at: ago(40), pays: 'Haïti', departement: 'Nord' },
  ],
  donations: [
    { statut: 'completed', montant: 5000, created_at: ago(3), pays: 'Haïti', frequence: 'unique' },
    { statut: 'partially_refunded', montant: 2000, refunded_cents: 500, created_at: ago(4), frequence: 'mensuel', email: 'a@example.test' },
    { statut: 'completed', montant: 1000, created_at: ago(45) },
    { statut: 'refunded', montant: 900, created_at: ago(6) },
  ],
  leads: [{ downloaded_at: ago(1), ville: 'Miami' }, { downloaded_at: ago(50), ville: 'Jacmel' }],
  chat: [{ day: ago(1).slice(0, 10), langue: 'fr', questions: 4 }, { day: ago(2).slice(0, 10), langue: 'es', questions: 1 }],
};

test('indicateurs : période courante, période précédente et formats', () => {
  const o = buildOverview(data, { now: NOW, days: 30 });
  assert.equal(o.libelle, '30 derniers jours');
  assert.ok(o.maj);
  const adh = o.sections.find((s) => s.key === 'adhesions');
  const k = Object.fromEntries(adh.kpis.map((x) => [x.label, x]));
  assert.equal(k['Demandes reçues'].value, 4);
  assert.equal(k['Demandes reçues'].previous, 1);
  assert.equal(k['En attente d’examen'].value, 1);
  assert.equal(k['Taux d’approbation'].value, 67);
  assert.equal(k['Adhérents au total'].value, 3);
  const dons = o.sections.find((s) => s.key === 'dons');
  const d = Object.fromEntries(dons.kpis.map((x) => [x.label, x]));
  assert.equal(d['Montant reçu'].value, 65);
  assert.equal(d['Montant reçu'].previous, 10);
  assert.equal(d['Montant reçu'].format, 'money');
  assert.equal(d['Donateurs mensuels actifs'].value, 1);
  assert.equal(d['Remboursements et contestations'].value, 1);
  assert.equal(dons.series.values.reduce((a, b) => a + b, 0), 65);
  const ass = o.sections.find((s) => s.key === 'assistant');
  assert.equal(ass.kpis[0].value, 5);
  assert.deepEqual(ass.lists[0].items.map((i) => i.label), ['Français', 'Espagnol']);
});

test('indicateurs : sections limitées aux droits de la personne', () => {
  const o = buildOverview(data, { now: NOW, days: 7, sections: ['livre_blanc', 'assistant'] });
  assert.deepEqual(o.sections.map((s) => s.key), ['livre_blanc', 'assistant']);
});

test('courbes journalières ou mensuelles selon la période', () => {
  assert.equal(buckets([], 'x', { now: NOW, days: 30 }).keys.length, 30);
  const y = buckets([], 'x', { now: NOW, days: 365 });
  assert.equal(y.monthly, true);
  assert.ok(y.keys.length >= 12 && y.keys.length <= 13);
});

test('répartitions : non renseigné et regroupement « Autres »', () => {
  const rows = ['A', 'A', 'B', 'C', 'D', 'E', 'F', 'G', null].map((p) => ({ p }));
  const t = top(rows, (r) => r.p, 4);
  assert.equal(t.length, 4);
  assert.deepEqual(t[0], { label: 'A', value: 2 });
  assert.equal(t[3].label, 'Autres');
  assert.equal(t.reduce((a, b) => a + b.value, 0), 9);
});
