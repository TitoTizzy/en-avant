// Tests isolés des notifications : aucun email réel envoyé.
import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, notifyTeam } from '../api/_lib/notify.js';
import digest from '../api/_admin/digest.js';

const call = (headers = {}) => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; },
    json(p) { resolve({ status: this.statusCode, body: p }); } };
  digest({ method: 'GET', headers }, res);
});

test('escapeHtml neutralise balises et attributs', () => {
  assert.equal(escapeHtml('<a href="x" onclick=\'y\'>&</a>'),
    '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
});

test('notifyTeam ne fait rien et ne lève pas sans clé Resend', async () => {
  const saved = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  assert.equal(await notifyTeam({ subject: 's', title: 't' }), false);
  if (saved) process.env.RESEND_API_KEY = saved;
});

test('Résumé : fermé sans CRON_SECRET, refusé avec un mauvais jeton', async () => {
  delete process.env.CRON_SECRET;
  assert.equal((await call()).status, 503);
  process.env.CRON_SECRET = 'x'.repeat(32);
  assert.equal((await call()).status, 401);
  assert.equal((await call({ authorization: 'Bearer faux' })).status, 401);
  assert.equal((await call({ authorization: `Bearer ${'y'.repeat(32)}` })).status, 401);
  delete process.env.CRON_SECRET;
});
