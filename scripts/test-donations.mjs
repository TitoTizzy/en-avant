// Tests isolés des dons : aucun appel réseau, aucune transaction Stripe.
// Lancer : node --test scripts/test-donations.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckoutHandler, availablePrices, donationsEnabled, validDonationPrice } from '../api/create-checkout.js';

const handler = createCheckoutHandler({ rateLimit: async () => true });
const PRICE = (n) => `price_TEST${String(n).padStart(8, '0')}`;
const fullEnv = () => ({
  DONATIONS_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
  SITE_URL: 'https://enavant.org',
  STRIPE_PRICE_UNIQUE_10: PRICE(1), STRIPE_PRICE_UNIQUE_LIBRE: PRICE(2),
  STRIPE_PRICE_MENSUEL_10: PRICE(3), STRIPE_PRICE_MENSUEL_LIBRE: PRICE(4),
});

function call(method, body = {}, headers = {}, endpoint = handler) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(p) { resolve({ status: this.statusCode, body: p }); },
    };
    Promise.resolve(endpoint({ method, body, headers: { 'x-forwarded-for': `10.0.0.${Math.random() * 250 | 0}`, ...headers } }, res))
      .catch(error => resolve({ status: 500, body: { error: error.message } }));
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

test('Dons uniques et mensuels : paramètres Stripe et clé d’idempotence', () => withEnv(fullEnv(), async () => {
  const calls = [];
  const endpoint = createCheckoutHandler({ rateLimit: async () => true,
    createStripe: () => ({ prices: { retrieve: async id => ({ active: true, currency: 'usd', unit_amount: 1000,
      type: id === PRICE(3) ? 'recurring' : 'one_time', recurring: { interval: 'month', interval_count: 1 } }) },
      checkout: { sessions: { create: async (params, options) => {
      calls.push({ params, options }); return { url: 'https://checkout.stripe.com/test' };
    } } } }),
  });
  const request_id = '11111111-1111-4111-8111-111111111111';
  for (const frequency of ['unique', 'mensuel']) {
    const result = await call('POST', { frequency, amount: '10', request_id }, {}, endpoint);
    assert.equal(result.status, 200);
    assert.equal(result.body.url, 'https://checkout.stripe.com/test');
  }
  assert.equal(calls[0].params.mode, 'payment');
  assert.equal(calls[0].params.payment_intent_data.metadata.source, 'enavant.org');
  assert.equal(calls[1].params.mode, 'subscription');
  assert.equal(calls[1].params.subscription_data.metadata.source, 'enavant.org');
  assert.equal(calls[0].options.idempotencyKey, `don:${request_id}`);
}));

test('Un prix Stripe mal configuré ne peut pas facturer un autre montant ou une autre périodicité', () => {
  const price = { active: true, currency: 'usd', type: 'one_time', unit_amount: 1000 };
  assert.equal(validDonationPrice(price, 'unique', '10'), true);
  assert.equal(validDonationPrice({ ...price, unit_amount: 2500 }, 'unique', '10'), false);
  assert.equal(validDonationPrice({ ...price, currency: 'eur' }, 'unique', '10'), false);
  assert.equal(validDonationPrice(price, 'mensuel', '10'), false);
  assert.equal(validDonationPrice({ ...price, custom_unit_amount: { minimum: 100, maximum: 1000000 } }, 'unique', 'libre'), true);
  assert.equal(validDonationPrice({ ...price, custom_unit_amount: { minimum: 0 } }, 'unique', 'libre'), false);
});

test('Un quota dépassé bloque Stripe ; une tentative sans identifiant est refusée', () => withEnv(fullEnv(), async () => {
  const endpoint = createCheckoutHandler({ rateLimit: async (_req, res) => {
    res.status(429).json({ error: 'Limite atteinte.' }); return false;
  }, createStripe: () => { throw new Error('Stripe ne doit pas être appelé'); } });
  assert.equal((await call('POST', { frequency: 'unique', amount: '10' }, {}, endpoint)).status, 429);
  assert.equal((await call('POST', { frequency: 'unique', amount: '10' })).status, 422);
}));
