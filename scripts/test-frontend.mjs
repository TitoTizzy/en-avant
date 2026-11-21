import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createRegisterHandler } from '../api/_auth/register.js';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

async function page(file, path = '/') {
  const dom = new JSDOM(await read(file), { url: 'https://enavant.org' + path, runScripts: 'outside-only' });
  dom.window.scrollTo = () => {};
  dom.window.matchMedia = () => ({ matches: true });
  return dom;
}

test('Article : absence et panne donnent des états distincts, sans démonstration', async () => {
  for (const status of [404, 500]) {
    const dom = await page('article-details.html', '/article-details?slug=inexistant');
    dom.window.fetch = async () => response(status, {});
    dom.window.eval(await read('js/article.js'));
    await settle();
    const title = dom.window.document.getElementById('art-title').textContent;
    assert.match(title, status === 404 ? /introuvable/ : /temporairement indisponible/);
    assert.doesNotMatch(dom.window.document.getElementById('art-body').textContent, /présente à la nation/);
    dom.window.close();
  }
});

test('Blog : les guillemets d’un titre ne peuvent pas créer un attribut actif', async () => {
  const dom = await page('blog.html', '/blog');
  dom.window.fetch = async () => response(200, { articles: [{
    titre: 'Titre " onerror="alert(1)', slug: 'test', categorie: 'actualite',
    excerpt: '<img src=x onerror=alert(1)>', image_url: '/pictures/test.jpg', published_at: '2026-01-01',
  }], total: 1 });
  dom.window.eval(await read('js/blog.js'));
  await settle();
  assert.equal(dom.window.document.querySelector('.article-card img').hasAttribute('onerror'), false);
  assert.match(dom.window.document.querySelector('.card-title').textContent, /onerror/);
  dom.window.close();
});

test('Don : un retour succès ne confirme pas le paiement et un échec permet la même tentative', async () => {
  const dom = await page('don.html', '/don?statut=succes');
  const sent = [];
  dom.window.fetch = async (_url, options = {}) => {
    if (options.method === 'POST') { sent.push(JSON.parse(options.body)); return response(503, { error: 'Indisponible' }); }
    return response(200, { enabled: true, amounts: { unique: ['10'], mensuel: ['10'] } });
  };
  dom.window.eval(await read('js/don.js'));
  await settle();
  const doc = dom.window.document;
  assert.match(doc.getElementById('don-payment-selection').textContent, /Seule la confirmation de Stripe/);
  doc.querySelector('[data-donation="10"]').click();
  doc.getElementById('don-payment-submit').click();
  await settle();
  assert.equal(doc.getElementById('don-payment-submit').disabled, false);
  doc.getElementById('don-payment-submit').click();
  await settle();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].request_id, sent[1].request_id);
  assert.match(sent[0].request_id, /^[a-f0-9-]{36}$/);
  dom.window.close();
});

test('Quiz : le parcours utilise les réponses serveur et soumet uniquement la partie', async () => {
  const dom = await page('trivia.html', '/trivia');
  const sent = [];
  dom.window.fetch = async (url, options = {}) => {
    if (url.includes('questions')) return response(200, {
      session_id: '11111111-1111-4111-8111-111111111111',
      questions: [{ question: 'Première', options: ['A','B'] }, { question: 'Seconde', options: ['C','D'] }],
    });
    if (url.includes('answer')) {
      const body = JSON.parse(options.body); sent.push(body);
      return response(200, { correct_answer: body.index === 0 ? 'A' : 'C', explication: 'Explication', score: body.index + 1 });
    }
    if (options.method === 'POST') { sent.push(JSON.parse(options.body)); return response(201, { ok: true }); }
    return response(200, { leaderboard: [] });
  };
  dom.window.eval(await read('js/trivia.js'));
  const doc = dom.window.document;
  doc.getElementById('tq-begin').click(); await settle();
  for (const option of ['A','C']) {
    const button = [...doc.querySelectorAll('.tq-opt')].find(btn => btn.lastElementChild.textContent === option);
    button.click(); await settle();
    doc.getElementById('tq-next').click(); await settle();
  }
  assert.equal(doc.getElementById('tq-trophy').textContent, '2/2');
  doc.getElementById('tq-pseudo').value = 'Joueur';
  doc.getElementById('tq-save-score').click(); await settle();
  assert.deepEqual(Object.keys(sent.at(-1)).sort(), ['pseudo','session_id']);
  dom.window.close();
});

test('Inscription : confirmation email requise et configuration sans confirmation refusée', async () => {
  const original = process.env.SITE_URL;
  process.env.SITE_URL = 'https://enavant.org';
  try {
    for (const session of [null, { access_token: 'token' }]) {
      let deleted = false;
      const handler = createRegisterHandler({ rateLimit: async () => true,
        anonClient: () => ({ auth: { signUp: async params => {
          assert.equal(params.options.data.nom, 'Test');
          assert.equal(params.email_confirm, undefined);
          return { data: { user: { id: 'new-user' }, session }, error: null };
        } } }),
        serviceClient: () => ({ auth: { admin: { deleteUser: async () => { deleted = true; return {}; } } } }),
      });
      let status, payload;
      const res = { status(code) { status = code; return this; }, setHeader() {}, json(body) { payload = body; } };
      await handler({ method: 'POST', headers: {}, body: { nom: 'Test', pseudo: 'Test', email: 'test@example.com', password: 'example123' } }, res);
      assert.equal(status, session ? 503 : 201);
      assert.equal(deleted, Boolean(session));
      if (!session) assert.equal(payload.confirmation_required, true);
    }
  } finally {
    if (original === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = original;
  }
});

test('Serveur local : URLs propres, dispatchers et fichiers internes protégés', async t => {
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Serveur local non démarré')), 15000);
    child.once('error', reject);
    child.stdout.on('data', data => { if (data.toString().includes('dev sur')) { clearTimeout(timer); resolve(); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Serveur arrêté : ' + code)); });
  });
  const origin = `http://127.0.0.1:${port}`;
  for (const [path, status] of [['/don', 200], ['/login', 200], ['/api/auth/login', 405],
    ['/api/trivia/answer', 405], ['/.env', 404], ['/.git/config', 404], ['/supabase/schema.sql', 404],
    ['/api/_auth/login', 404], ['/api/_lib/supabase', 404]]) {
    const result = await fetch(origin + path);
    assert.equal(result.status, status, path);
    await result.arrayBuffer();
  }
});
