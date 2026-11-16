// Charge chaque fonction serverless comme le fait Vercel, avec require(esm) désactivé.
// Détecte une dépendance incompatible avant le déploiement.
// Lancer : node --no-experimental-require-module --test scripts/test-imports.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir } from 'node:fs/promises';

const entries = [
  ...(await readdir(new URL('../api/', import.meta.url))).filter((f) => f.endsWith('.js')).map((f) => `../api/${f}`),
  '../api/webhooks/stripe.js',
];

for (const entry of entries) {
  test(`charge ${entry.replace('../', '')}`, async () => {
    const mod = await import(entry);
    assert.equal(typeof mod.default, 'function');
  });
}
