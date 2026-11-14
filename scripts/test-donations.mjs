// Tests isolés des dons : aucun appel réseau, aucune transaction Stripe.
// Lancer : node --test scripts/test-donations.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import handler, { availablePrices, donationsEnabled } from '../api/create-checkout.js';

const PRICE = (n) => `price_TEST${String(n).padStart(8, '0')}`;
const fullEnv = () => ({
  DONATIONS_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  SITE_URL: 'https://enavant.org',
  STRIPE_PRICE_UNIQUE_10: PRICE(1), STRIPE_PRICE_UNIQUE_LIBRE: PRICE(2),
  STRIPE_PRICE_MENSUEL_10: PRICE(3), STRIPE_PRICE_MENSUEL_LIBRE: PRICE(4),
});

function call(method, body = {}, headers = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(p) { resolve({ status: this.statusCode, body: p }); },
    };
    handler({ method, body, headers: { 'x-forwarded-for': `10.0.0.${Math.random() * 250 | 0}`, ...headers } }, res);
  });
}

function withEnv(env, fn) {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (/^(STRIPE_|DONATIONS_|SITE_URL)/.test(k)) delete process.env[k];
  Object.assign(process.env, env);
  return fn().finally(() => { process.env = saved; });
}

test('Liste blanche : seules les clés prévues avec un id price_ valide sont retenues', () => {
  const p = availablePrices({ ...fullEnv(), STRIPE_PRICE_UNIQUE_25: 'https://evil.example', STRIPE_PRICE_UNIQUE_999: PRICE(9) });
  assert.deepEqual(Object.keys(p.unique).sort(), ['10', 'libre']);
  assert.deepEqual(Object.keys(p.mensuel), ['10']); // montant libre mensuel jamais accepté
});

test('Dons désactivés tant que DONATIONS_ENABLED, la clé et SITE_URL ne sont pas tous présents', () => {
  assert.equal(donationsEnabled(fullEnv()), true);
  assert.equal(donationsEnabled({ ...fullEnv(), DONATIONS_ENABLED: 'false' }), false);
  assert.equal(donationsEnabled({ ...fullEnv(), STRIPE_SECRET_KEY: '' }), false);
  assert.equal(donationsEnabled({ ...fullEnv(), SITE_URL: 'http://enavant.org' }), false);
});

test('GET désactivé : aucun montant exposé', () => withEnv({ ...fullEnv(), DONATIONS_ENABLED: 'false' }, async () => {
  const r = await call('GET');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { enabled: false, amounts: { unique: [], mensuel: [] } });
}));

test('POST refusé (503) quand les dons sont fermés', () => withEnv({ ...fullEnv(), DONATIONS_ENABLED: 'false' }, async () => {
  const r = await call('POST', { frequency: 'unique', amount: '10' });
  assert.equal(r.status, 503);
}));

test('POST : clé inconnue ou fréquence invalide → 422, sans appel Stripe', () => withEnv(fullEnv(), async () => {
  for (const body of [{ frequency: 'unique', amount: '25' }, { frequency: 'mensuel', amount: 'libre' },
    { frequency: 'annuel', amount: '10' }, { frequency: 'unique', amount: '1e9' }]) {
    const r = await call('POST', body, { origin: 'https://enavant.org' });
    assert.equal(r.status, 422, JSON.stringify(body));
  }
}));

test('POST depuis une autre origine → 403', () => withEnv(fullEnv(), async () => {
  const r = await call('POST', { frequency: 'unique', amount: '10' }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
}));
