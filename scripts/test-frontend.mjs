import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
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

test('Quiz membre : score enregistré automatiquement sous le pseudo du compte, sans saisie', async () => {
  const dom = await page('trivia.html', '/trivia');
  dom.window.EA_ENV = { SUPABASE_URL: 'https://abcdefgh.supabase.co' };
  dom.window.localStorage.setItem('sb-abcdefgh-auth-token', JSON.stringify({ access_token: 'jeton-membre' }));
  const posts = [];
  dom.window.fetch = async (url, options = {}) => {
    assert.doesNotMatch(url, /generate-session/);
    if (url.includes('questions')) return response(200, {
      session_id: '33333333-3333-4333-8333-333333333333',
      questions: ['A', 'B', 'C', 'D'].map(q => ({ question: q, options: ['x', 'y'] })),
    });
    if (url.includes('answer')) return response(200, { correct_answer: 'x', explication: 'E', score: 1 });
    if (options.method === 'POST') {
      posts.push({ body: JSON.parse(options.body), auth: options.headers.Authorization });
      return response(201, { ok: true, score: 4, total: 4, pseudo: 'TitoTizzy' });
    }
    return response(200, { leaderboard: [] });
  };
  dom.window.eval(await read('js/trivia.js'));
  const doc = dom.window.document;
  doc.getElementById('tq-begin').click(); await settle();
  for (let i = 0; i < 4; i += 1) {
    doc.querySelector('.tq-opt').click(); await settle();
    doc.getElementById('tq-next').click(); await settle();
  }
  assert.equal(posts.length, 1, 'un seul enregistrement, sans clic');
  assert.equal(posts[0].auth, 'Bearer jeton-membre');
  assert.equal(posts[0].body.session_id, '33333333-3333-4333-8333-333333333333');
  assert.equal(doc.getElementById('tq-pseudo').parentElement.hidden, true);
  assert.match(doc.getElementById('tq-score-status').textContent, /TitoTizzy/);
  assert.equal(doc.getElementById('tq-mode-badge').hidden, false, 'lien vers le quiz des membres');
  assert.equal(doc.getElementById('tq-mode-badge').getAttribute('href'), '/quiz');
  assert.equal(doc.querySelector('[data-cta="membre"]').hidden, false);
  assert.equal(doc.querySelector('[data-cta="visiteur"]').hidden, true);
  dom.window.close();
});

test('Quiz visiteur : 8 questions au plus, puis invitation à adhérer et à donner', async () => {
  const dom = await page('trivia.html', '/trivia');
  dom.window.fetch = async (url, options = {}) => {
    if (url.includes('questions')) return response(200, {
      session_id: '44444444-4444-4444-8444-444444444444',
      questions: Array.from({ length: 10 }, (_, i) => ({ question: `Q${i}`, options: ['x', 'y'] })),
    });
    if (url.includes('answer')) return response(200, { correct_answer: 'x', explication: 'E', score: 1 });
    if (options.method === 'POST') return response(201, { ok: true });
    return response(200, { leaderboard: [] });
  };
  dom.window.eval(await read('js/trivia.js'));
  const doc = dom.window.document;
  assert.equal(doc.getElementById('tq-mode-badge').hidden, true);
  doc.getElementById('tq-begin').click(); await settle();
  let played = 0;
  while (!doc.getElementById('tq-game').hidden && played < 12) {
    doc.querySelector('.tq-opt').click(); await settle();
    doc.getElementById('tq-next').click(); await settle();
    played += 1;
  }
  assert.equal(played, 8);
  const cta = doc.querySelector('[data-cta="visiteur"]');
  assert.equal(doc.getElementById('tq-member-cta').hidden, false);
  assert.equal(cta.hidden, false);
  assert.match(cta.textContent, /adhérez/i);
  assert.ok(cta.querySelector('a[href="/adherer.html"]'));
  assert.ok(cta.querySelector('a[href="/don.html"]'));
  dom.window.close();
});

function quizPage(dom, handler) {
  const { window } = dom;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  const ctx = new Proxy({}, { get: (target, key) => (key in target ? target[key] : () => ({ addColorStop() {} })), set: (target, key, value) => { target[key] = value; return true; } });
  ctx.measureText = () => ({ width: 10 });
  window.HTMLCanvasElement.prototype.getContext = () => ctx;
  window.EA_ENV = { SUPABASE_URL: 'https://abcdefgh.supabase.co', SUPABASE_ANON_KEY: 'anon' };
  window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'jeton' } } }) } }) };
  const calls = [];
  window.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body, auth: options.headers?.Authorization });
    return handler(url, body);
  };
  return calls;
}

test('Quiz membres : partie libre, correction serveur, série et écran de fin', async () => {
  const dom = await page('quiz.html', '/quiz');
  const game = '55555555-5555-4555-8555-555555555555';
  let index = 0;
  const calls = quizPage(dom, (url, body) => {
    if (url.includes('op=profil')) return response(200, { pseudo: 'Tito', titre: 'Sympathisant', cumul: 120, parties: 1, meilleure_serie: 3, badges: [], defi: { joue: false } });
    if (url.includes('op=classement')) return response(200, { type: 'general', top: [{ rang: 1, pseudo: 'Tito', points: 120, cumul: 120, moi: true, titre: 'Sympathisant' }], moi: { rang: 1, points: 120 } });
    if (body?.op === 'start') return response(201, { game_id: game, mode: 'libre', total: 2, index: 0, points: 0 });
    if (body?.op === 'next') {
      if (index >= 2) return response(200, { finished: true, points: 25 });
      return response(200, { index, total: 2, points: index * 15, streak: index, question: `Q${index}`, format: index ? 'vrai_faux' : 'qcm', options: index ? ['Vrai', 'Faux'] : ['A', 'B', 'C', 'D'], chantier: 3, meta: {}, elapsed_ms: 0 });
    }
    if (body?.op === 'answer') {
      const ok = index === 0;
      index += 1;
      return response(200, { correct: ok, timed_out: false, fast: ok, points_gagnes: ok ? 15 : 0, streak: ok ? 1 : 0, points: 15, correct_answer: ok ? 'B' : 'Vrai', explication: 'Parce que.', source: 'Chantier 3', finished: index === 2, bonnes: 1, total: 2, meilleure_serie: 1 });
    }
    return response(404, { error: 'inconnu' });
  });
  dom.window.eval(await read('js/quiz.js'));
  await settle(); await settle();
  const doc = dom.window.document;
  assert.equal(doc.getElementById('qz-home').hidden, false);
  assert.equal(doc.getElementById('qz-pseudo').textContent, 'Tito');
  assert.match(doc.getElementById('qz-board').textContent, /Tito/);
  assert.equal(doc.querySelectorAll('.qz-badge').length, 9, '8 badges + expert');

  doc.querySelector('[data-mode="libre"]').click(); await settle(); await settle();
  assert.equal(doc.getElementById('qz-game').hidden, false);
  assert.equal(doc.querySelectorAll('.qz-option').length, 4);
  doc.querySelectorAll('.qz-option')[1].click(); await settle(); await settle();
  assert.equal(calls.find(c => c.body?.op === 'answer').body.answer, 'B');
  assert.ok(calls.every(c => c.auth === 'Bearer jeton'));
  assert.match(doc.getElementById('qz-gain').textContent, /\+15 pts/);
  assert.ok(doc.querySelectorAll('.qz-option')[1].classList.contains('is-correct'));

  doc.getElementById('qz-next').click(); await settle(); await settle();
  doc.querySelector('.qz-option').click(); await settle(); await settle();
  assert.match(doc.getElementById('qz-feedback').textContent, /aucune pénalité/);
  assert.match(doc.getElementById('qz-correct').textContent, /Vrai/);
  assert.equal(doc.getElementById('qz-next').textContent, 'Voir mon résultat');

  doc.getElementById('qz-next').click(); await settle(); await settle(); await settle();
  assert.equal(doc.getElementById('qz-end').hidden, false);
  assert.equal(doc.getElementById('qz-end-bonnes').textContent, '1/2');
  assert.match(doc.getElementById('qz-share-wa').href, /enavant\.org%2Ftrivia/);
  dom.window.close();
});

test('Quiz membres : formats chiffre et ordre envoient la bonne forme de réponse', async () => {
  const dom = await page('quiz.html', '/quiz');
  const game = '66666666-6666-4666-8666-666666666666';
  let index = 0;
  const answers = [];
  quizPage(dom, (url, body) => {
    if (url.includes('op=profil')) return response(200, { pseudo: 'Tito', titre: 'Sympathisant', cumul: 0, parties: 0, meilleure_serie: 0, badges: [], defi: { joue: false } });
    if (url.includes('op=classement')) return response(200, { top: [], moi: null });
    if (body?.op === 'start') return response(201, { game_id: game, mode: 'libre', total: 2, index: 0, points: 0 });
    if (body?.op === 'next') {
      if (index === 0) return response(200, { index: 0, total: 2, points: 0, streak: 0, question: 'Combien ?', format: 'chiffre', options: [], meta: { min: 0, max: 100, step: 10, unite: '%' }, elapsed_ms: 0 });
      return response(200, { index: 1, total: 2, points: 0, streak: 0, question: 'Ordre ?', format: 'ordre', options: ['B', 'A', 'C'], meta: {}, elapsed_ms: 0 });
    }
    if (body?.op === 'answer') {
      answers.push(body.answer);
      index += 1;
      return response(200, { correct: false, timed_out: false, fast: false, points_gagnes: 0, streak: 0, points: 0, correct_answer: index === 1 ? '30' : '["A","B","C"]', explication: '', source: '', finished: index === 2, bonnes: 0, total: 2, meilleure_serie: 0 });
    }
    return response(404, {});
  });
  dom.window.eval(await read('js/quiz.js'));
  await settle(); await settle();
  const doc = dom.window.document;
  doc.querySelector('[data-mode="libre"]').click(); await settle(); await settle();
  doc.querySelector('.qz-answers--chiffre [aria-label="Augmenter"]').click();
  doc.querySelector('.qz-validate').click(); await settle(); await settle();
  assert.equal(answers[0], '60');
  assert.match(doc.getElementById('qz-correct').textContent, /30 %/);
  doc.getElementById('qz-next').click(); await settle(); await settle();
  doc.querySelectorAll('.qz-order-item')[1].querySelector('[aria-label="Monter"]').click();
  doc.querySelector('.qz-validate').click(); await settle(); await settle();
  assert.deepEqual(JSON.parse(answers[1]), ['A', 'B', 'C']);
  assert.match(doc.getElementById('qz-correct').textContent, /1\. A/);
  dom.window.close();
});

test('Quiz membres : sans session, retour mémorisé puis redirection vers la connexion', async () => {
  const dom = await page('quiz.html', '/quiz?duel=77777777-7777-4777-8777-777777777777');
  quizPage(dom, () => response(500, {}));
  dom.window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) };
  try { dom.window.eval(await read('js/quiz.js')); await settle(); await settle(); } catch { /* navigation jsdom */ }
  assert.equal(dom.window.sessionStorage.getItem('ea-retour'), '/quiz?duel=77777777-7777-4777-8777-777777777777');
  dom.window.close();
});

test('Newsletter : inscription avec pays, département (Haïti) et ville ; département masqué hors Haïti', async () => {
  const dom = await page('newsletter.html', '/newsletter');
  const sent = [];
  dom.window.fetch = async (_url, options = {}) => { sent.push(JSON.parse(options.body)); return response(201, { ok: true }); };
  dom.window.eval(await read('js/geo.js'));
  dom.window.eval(await read('js/newsletter.js'));
  const doc = dom.window.document;
  const f = doc.getElementById('nl-form').elements;
  const depField = doc.querySelector('[data-departement-field]');
  assert.equal(depField.hidden, false, 'Haïti par défaut : département visible');
  f.pays.value = 'Canada'; f.pays.dispatchEvent(new dom.window.Event('input'));
  assert.equal(depField.hidden, true);
  f.pays.value = 'haiti'; f.pays.dispatchEvent(new dom.window.Event('change'));
  assert.equal(f.pays.value, 'Haïti');
  f.email.value = 'marie@example.org'; f.ville.value = 'Jacmel'; f.consent.checked = true;
  doc.getElementById('nl-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await settle();
  assert.equal(sent.length, 0, 'département manquant : rien n’est envoyé');
  f.departement.value = 'Sud-Est';
  doc.getElementById('nl-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await settle();
  assert.deepEqual(sent[0], { op: 'inscription', email: 'marie@example.org', nom: '', pays: 'Haïti', departement: 'Sud-Est', ville: 'Jacmel', consent: true, site: '' });
  assert.equal(doc.getElementById('nl-success').hidden, false);
  dom.window.close();
});

test('Newsletter : le lien de désinscription n’agit qu’après un clic (jamais à l’ouverture)', async () => {
  const dom = await page('newsletter.html', '/newsletter?desinscription=11111111-1111-4111-8111-111111111111');
  const calls = [];
  dom.window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    return url.includes('op=jeton') ? response(200, { email: 'ma•••@example.org', desinscrit: false }) : response(200, { ok: true });
  };
  dom.window.eval(await read('js/geo.js'));
  dom.window.eval(await read('js/newsletter.js'));
  await settle(); await settle();
  const doc = dom.window.document;
  assert.equal(doc.getElementById('nl-inscription').hidden, true);
  assert.deepEqual(calls.map((c) => c.method), ['GET']);
  assert.match(doc.getElementById('nl-unsub-text').textContent, /ma•••@example\.org/);
  doc.getElementById('nl-unsub-btn').click(); await settle(); await settle();
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].body), { op: 'desinscription', t: '11111111-1111-4111-8111-111111111111' });
  assert.match(doc.getElementById('nl-unsub-text').textContent, /désinscrit/);
  dom.window.close();
});

test('Adhésion : pays et département envoyés avec la fiche', async () => {
  const dom = await page('adherer.html', '/adherer');
  const sent = [];
  dom.window.fetch = async (_url, options = {}) => { sent.push(JSON.parse(options.body)); return response(201, { ok: true }); };
  dom.window.eval(await read('js/geo.js'));
  dom.window.eval(await read('js/adherer.js'));
  const doc = dom.window.document;
  const form = doc.getElementById('adhesion-form');
  const set = (name, value) => { form.elements.namedItem(name).value = value; };
  set('nom', 'Marie Joseph'); set('pseudo', 'marie'); set('sexe', 'femme'); set('ninu', '1234567890');
  set('email', 'marie@example.org'); set('telephone', '+509 3400 0000'); set('pays', 'Haïti');
  set('departement', 'Nord'); set('ville', 'Cap-Haïtien'); set('password', 'motdepasse-solide'); set('confirm', 'motdepasse-solide');
  doc.getElementById('adh-consent').checked = true;
  form.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].pays, 'Haïti');
  assert.equal(sent[0].departement, 'Nord');
  assert.equal(sent[0].ville, 'Cap-Haïtien');
  dom.window.close();
});

test('Pages publiques : en-tête fermé avant le contenu, contenu et pied de page au même niveau', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(new URL('..', import.meta.url))).filter((f) => f.endsWith('.html') && !['admin.html'].includes(f));
  for (const file of files) {
    const dom = new JSDOM(await read(file));
    const doc = dom.window.document;
    const main = doc.querySelector('main');
    const footer = doc.querySelector('footer');
    if (main && footer) assert.equal(main.parentElement, footer.parentElement, `${file} : <main> et <footer> doivent avoir le même parent`);
    if (main) assert.ok(['BODY'].includes(main.parentElement.tagName) || main.parentElement.className.includes('shell'), `${file} : <main> mal imbriqué`);
    const header = doc.querySelector('header.u-nav');
    if (header && main) assert.ok(!header.contains(main), `${file} : <main> ne doit pas être dans l’en-tête`);
    dom.window.close();
  }
});

test('Assistant : ouverture, question, réponse mise en forme sans lien dangereux, sources, historique envoyé', async () => {
  const dom = await page('index.html', '/');
  const { window } = dom;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  const sent = [];
  window.fetch = async (url, options = {}) => {
    if (url === '/api/chat') {
      sent.push(JSON.parse(options.body));
      return response(200, {
        reponse: 'Voici les **20 chantiers**.\n- Sécurité\n- Santé\n[Lire](/vingt-chantiers) [piège](javascript:alert(1)) <img src=x onerror=alert(1)> [externe](https://exemple.com)',
        sources: [{ titre: 'Livre blanc', url: '/livre-blanc' }, { titre: 'Piège', url: 'javascript:alert(2)' }],
      });
    }
    return response(200, {});
  };
  try { window.eval(await read('js/premium.js')); } catch { /* modules décoratifs non pris en charge par jsdom */ }
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await settle();
  const doc = window.document;
  const fab = doc.getElementById('chatbotFab');
  fab.click();
  const panel = doc.getElementById('eaChatPanel');
  assert.ok(panel && !panel.hidden, 'fenêtre ouverte');
  assert.equal(fab.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.querySelectorAll('.eac-suggest button').length, 4);

  panel.querySelector('.eac-suggest button').click();
  await settle(); await settle();
  assert.equal(sent[0].question, 'Que sont les 20 chantiers ?');
  assert.deepEqual(sent[0].history, []);
  const bot = [...panel.querySelectorAll('.eac-msg--bot')].at(-1);
  assert.equal(bot.querySelector('strong').textContent, '20 chantiers');
  assert.equal(bot.querySelectorAll('li').length, 2);
  assert.equal(bot.querySelector('a[href="/vingt-chantiers"]').textContent, 'Lire');
  assert.equal(bot.querySelector('img'), null, 'aucune image injectée');
  assert.ok(![...bot.querySelectorAll('a')].some((a) => /javascript:|exemple\.com/.test(a.getAttribute('href'))), 'aucun lien dangereux ou externe');
  assert.deepEqual([...bot.querySelectorAll('.eac-sources a')].map((a) => a.getAttribute('href')), ['/livre-blanc']);

  const input = panel.querySelector('textarea');
  input.value = 'Et pour la santé ?';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle(); await settle();
  assert.deepEqual(sent[1].history.map((m) => m.role), ['user', 'assistant']);
  assert.ok(!('sources' in sent[1].history[1]), 'les sources ne repartent pas au serveur');
  assert.equal(JSON.parse(window.sessionStorage.getItem('ea-chat')).length, 4);

  panel.querySelector('[data-chat="close"]').click();
  assert.equal(panel.hidden, true);
  dom.window.close();
});

test('Assistant : suit la langue choisie sur le site (créole puis espagnol) et n’est pas retraduit automatiquement', async () => {
  const dom = await page('index.html', '/');
  const { window } = dom;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.localStorage.setItem('__GT_TRANSLATE_LANGS', JSON.stringify({ srcLang: 'fr', tgtLang: 'ht' }));
  const sent = [];
  window.fetch = async (url, options = {}) => {
    if (url === '/api/chat') { sent.push(JSON.parse(options.body)); return response(200, { reponse: 'Repons.', sources: [] }); }
    return response(200, {});
  };
  try { window.eval(await read('js/premium.js')); } catch { /* idem */ }
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await settle();
  const doc = window.document;
  const fab = doc.getElementById('chatbotFab');
  assert.equal(fab.getAttribute('aria-label'), 'Louvri asistan En Avant');
  fab.click();
  const panel = doc.getElementById('eaChatPanel');
  assert.ok(panel.classList.contains('notranslate'));
  assert.equal(panel.getAttribute('translate'), 'no');
  assert.equal(panel.querySelector('[data-t="title"]').textContent, 'Asistan En Avant');
  assert.equal(panel.querySelector('textarea').placeholder, 'Poze kesyon ou…');
  assert.match(panel.querySelector('.eac-msg--bot').textContent, /Bonjou/);
  panel.querySelector('.eac-suggest button').click(); await settle(); await settle();
  assert.equal(sent[0].langue, 'ht');
  // Changement de langue sur le site.
  doc.dispatchEvent(new window.CustomEvent('ea:lang', { detail: 'es' }));
  assert.equal(panel.querySelector('[data-t="title"]').textContent, 'Asistente de En Avant');
  assert.equal(panel.querySelector('textarea').placeholder, 'Escriba su pregunta…');
  assert.match(panel.querySelector('.eac-msg--bot').textContent, /Hola/);
  const input = panel.querySelector('textarea');
  input.value = '¿Y la salud?';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle(); await settle();
  assert.equal(sent[1].langue, 'es');
  dom.window.close();
});

test('Accueil : classement du quiz flouté jusqu’à 10 joueurs, puis vrai top 5 (pseudos échappés)', async () => {
  for (const [payload, live] of [
    [{ actif: false, joueurs: 3, seuil: 10, top: [] }, false],
    [{ actif: true, joueurs: 12, seuil: 10, top: [{ rang: 1, pseudo: '<b>Tito</b>', points: 1234 }, { rang: 2, pseudo: 'Marie', points: 900 }] }, true],
  ]) {
    const dom = await page('index.html', '/');
    const { window } = dom;
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.fetch = async (url) => (String(url).includes('/api/trivia/classement') ? response(200, payload) : response(200, {}));
    try { window.eval(await read('js/app.js')); } catch { /* modules décoratifs */ }
    await settle(); await settle();
    const box = window.document.getElementById('home-leaderboard');
    assert.equal(box.classList.contains('is-live'), live);
    if (!live) {
      assert.match(window.document.getElementById('home-lb-status').textContent, /3\/10/);
    } else {
      const rows = [...box.querySelectorAll('.lb-lb-row')];
      assert.equal(rows.length, 2);
      assert.equal(rows[0].querySelector('.lb-lb-name').textContent, '<b>Tito</b>');
      assert.equal(rows[0].querySelector('b'), null, 'pseudo affiché comme texte');
      assert.match(rows[0].querySelector('.lb-lb-score').textContent, /1\s?234 pts/);
      assert.equal(box.getAttribute('aria-hidden'), null);
    }
    dom.window.close();
  }
});

test('Assistant : membre connecté accueilli par son pseudo, jeton de session envoyé au serveur', async () => {
  const dom = await page('index.html', '/');
  const { window } = dom;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.EA_ENV = { SUPABASE_URL: 'https://rgtzwnihabkpudhwiuik.supabase.co' };
  window.localStorage.setItem('sb-rgtzwnihabkpudhwiuik-auth-token', JSON.stringify({
    access_token: 'jeton-membre', expires_at: Date.now() / 1000 + 3600, user: { user_metadata: { pseudo: 'TitoTizzy', nom: 'Myrtho Charles' } },
  }));
  const calls = [];
  window.fetch = async (url, options = {}) => {
    if (url === '/api/chat') { calls.push(options.headers); return response(200, { reponse: 'Hi !', sources: [] }); }
    return response(200, {});
  };
  try { window.eval(await read('js/premium.js')); } catch { /* idem */ }
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await settle();
  window.document.getElementById('chatbotFab').click();
  const panel = window.document.getElementById('eaChatPanel');
  assert.match(panel.querySelector('.eac-msg--bot').textContent, /Bonjour TitoTizzy/);
  const input = panel.querySelector('textarea');
  input.value = 'hey';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle(); await settle();
  assert.equal(calls[0].Authorization, 'Bearer jeton-membre');
  dom.window.close();
});

test('Assistant : absent de l’administration et de la connexion, ajouté sur les pages publiques sans bouton', async () => {
  for (const [file, path, expected] of [['login.html', '/login', false], ['don.html', '/don', true]]) {
    const dom = await page(file, path);
    dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    dom.window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    dom.window.fetch = async () => response(200, {});
    try { dom.window.eval(await read('js/premium.js')); } catch { /* idem */ }
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await settle();
    assert.equal(Boolean(dom.window.document.getElementById('chatbotFab')), expected, file);
    dom.window.close();
  }
});

test('Admin : les onglets du quiz ne sont jamais traités comme des onglets d’adhésions', async () => {
  const html = await read('admin.html');
  const js = await read('js/admin.js');
  const dom = new JSDOM(html);
  for (const tab of dom.window.document.querySelectorAll('.member-tab[data-tab]')) {
    assert.ok(tab.querySelector('.member-tab-count'), `compteur manquant : ${tab.dataset.tab}`);
  }
  assert.ok(dom.window.document.querySelectorAll('.member-tab[data-quiz-tab]').length > 0);
  assert.doesNotMatch(js, /querySelectorAll\("\.member-tab"\)/, 'sélecteur trop large');
  dom.window.close();
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

test('Assistant : réponse en flux affichée progressivement, langue de conversation renvoyée, référence du PDF cliquable', async () => {
  const dom = await page('index.html', '/');
  const { window } = dom;
  window.TextDecoder = TextDecoder;
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  const sent = [];
  const lines = [
    { type: 'meta', langue: 'ht' },
    { type: 'delta', text: 'Dakò, m ap reponn ou an kreyòl.\n\nLiv blan an pale de sekirite ' },
    { type: 'delta', text: '([Livre blanc, p. 40](/docs/livre-blanc.pdf#page=40)).' },
    { type: 'done', reponse: 'Dakò, m ap reponn ou an kreyòl.\n\nLiv blan an pale de sekirite ([Livre blanc, p. 40](/docs/livre-blanc.pdf#page=40)).',
      sources: [{ titre: 'Livre blanc, p. 40', url: '/docs/livre-blanc.pdf#page=40' }] },
  ];
  window.fetch = async (url, options = {}) => {
    if (url !== '/api/chat') return response(200, {});
    sent.push(JSON.parse(options.body));
    const chunks = lines.map((l) => new TextEncoder().encode(`${JSON.stringify(l)}\n`));
    const partial = [];
    return {
      ok: true, status: 200, headers: { get: () => 'application/x-ndjson; charset=utf-8' },
      body: { getReader: () => ({ read: async () => {
        await new Promise((r) => setTimeout(r, 15));
        partial.push(1);
        return chunks.length ? { value: chunks.shift(), done: false } : { value: undefined, done: true };
      } }) },
    };
  };
  try { window.eval(await read('js/premium.js')); } catch { /* modules décoratifs */ }
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await settle();
  const doc = window.document;
  doc.getElementById('chatbotFab').click();
  const panel = doc.getElementById('eaChatPanel');
  const input = panel.querySelector('textarea');
  input.value = 'réponds en créole';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle();
  assert.ok(panel.querySelector('.eac-typing .eac-thinking'), 'indicateur de réflexion');
  assert.equal(sent[0].stream, true);
  let sawPartial = false;
  for (let i = 0; i < 200 && (panel.querySelector('.eac-typing') || panel.querySelector('.eac-streaming')); i += 1) {
    if (panel.querySelector('.eac-streaming .eac-caret')) sawPartial = true;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(sawPartial, 'texte révélé progressivement');
  const bot = [...panel.querySelectorAll('.eac-msg--bot')].at(-1);
  assert.equal(bot.querySelectorAll('p').length >= 2, true, 'paragraphes séparés');
  assert.equal(bot.querySelector('.eac-caret'), null);
  assert.deepEqual([...bot.querySelectorAll('.eac-sources a')].map((a) => a.getAttribute('href')), ['/docs/livre-blanc.pdf#page=40']);
  assert.ok(bot.querySelector('p a[href="/docs/livre-blanc.pdf#page=40"]'));
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem('ea-chat-langue')), { conv: 'ht' });

  input.value = 'Et pour la santé ?';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sent[1].langue_conv, 'ht');
  assert.ok(!('langue_imposee' in sent[1]));
  dom.window.close();
});

test('Bouton « Faire un don » dans l’en-tête et dans le menu de toutes les pages publiques', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(new URL('../', import.meta.url))).filter((f) => f.endsWith('.html'));
  for (const file of files) {
    const html = await read(file);
    if (!html.includes('u-nav-actions')) continue;
    const doc = new JSDOM(html).window.document;
    assert.ok(doc.querySelector('.u-links-cta a.btn-don[href="/don.html"]'), `${file} : menu hamburger`);
    assert.ok(doc.querySelector('.u-nav-actions a.btn-don[href="/don.html"]'), `${file} : en-tête`);
  }
});

test('Cartes d’invitation : alternance s’engager / don, exceptions, membre connecté, langue', async () => {
  const run = async (file, path, { count = null, member = false, lang = null } = {}) => {
    const dom = await page(file, path);
    const { window } = dom;
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.fetch = async () => response(200, {});
    if (count !== null) window.sessionStorage.setItem('ea-nudge-n', String(count));
    if (lang) window.localStorage.setItem('__GT_TRANSLATE_LANGS', JSON.stringify({ tgtLang: lang }));
    if (member) window.localStorage.setItem('sb-rgtzwnihabkpudhwiuik-auth-token', JSON.stringify({ access_token: 't', expires_at: Date.now() / 1000 + 3600, user: { user_metadata: { pseudo: 'Tito' } } }));
    try { window.eval(await read('js/premium.js')); } catch { /* modules décoratifs */ }
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await settle();
    const card = window.document.getElementById('eaNudge');
    const out = { kind: card?.className.match(/ea-nudge--(\w+)/)?.[1] || null, next: window.sessionStorage.getItem('ea-nudge-n'),
      cta: card?.querySelector('.ea-nudge-cta')?.getAttribute('href'), title: card?.querySelector('strong')?.textContent, hidden: card?.hidden };
    dom.window.close();
    return out;
  };
  const first = await run('index.html', '/');
  assert.deepEqual([first.kind, first.cta, first.next, first.hidden], ['engage', '/adherer.html', '1', true], '1re page : s’engager (affichée après un délai)');
  const second = await run('Apropos.html', '/Apropos.html', { count: 1 });
  assert.deepEqual([second.kind, second.cta, second.next], ['don', '/don.html', '2']);
  assert.equal((await run('blog.html', '/blog.html', { count: 2 })).kind, 'engage', 'puis de nouveau s’engager');
  assert.equal((await run('don.html', '/don.html', { count: 1 })).kind, 'engage', 'jamais le don sur la page Don');
  assert.equal((await run('adherer.html', '/adherer.html', { count: 0 })).kind, 'don', 'jamais l’adhésion sur la page Adhérer');
  assert.equal((await run('index.html', '/', { count: 0, member: true })).kind, 'don', 'membre connecté : don seulement');
  assert.equal((await run('login.html', '/login.html')).kind, null, 'aucune carte sur la connexion');
  assert.equal((await run('index.html', '/', { lang: 'ht' })).title, 'Ayiti bezwen w');
});

test('Sous-pages : menu à sous-menus partout, fil d’Ariane, contenu du Livre blanc, liens des rubriques', async () => {
  const { RUBRIQUES, SUBPAGES, CHANTIER_PAGES } = await import('../api/_lib/site-pages.js');
  const { readdir } = await import('node:fs/promises');
  const counts = { apropos: 5, historique: 3, organisation: 3, chantiers: 20 };
  for (const r of RUBRIQUES) assert.equal(r.pages.length, counts[r.key], r.key);
  const roots = (await readdir(new URL('../', import.meta.url))).filter((f) => f.endsWith('.html'));
  for (const file of [...roots, ...SUBPAGES.map((p) => p.file)]) {
    const html = await read(file);
    if (!html.includes('id="main-nav"')) continue;
    const doc = new JSDOM(html).window.document;
    const nav = doc.getElementById('main-nav');
    assert.equal(nav.querySelectorAll('[data-dd]').length, 4, `${file} : 4 rubriques à sous-menu`);
    for (const p of SUBPAGES) assert.ok(nav.querySelector(`.u-dd-menu a[href="${p.href}"]`), `${file} : lien ${p.href}`);
    assert.ok(nav.querySelector('.u-links-cta a.btn-don'), `${file} : bouton don conservé dans le menu`);
  }
  for (const p of SUBPAGES) {
    const html = await read(p.file);
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.querySelector('link[rel="canonical"]').href, `https://enavant.org${p.href}`, p.file);
    assert.match(doc.title, / \| En Avant$/);
    const crumbs = [...doc.querySelectorAll('.sp-crumbs li')].map((li) => li.textContent.trim());
    assert.deepEqual(crumbs, ['Accueil', p.rubrique.label, p.titre], `${p.file} : fil d’Ariane`);
    assert.ok(doc.querySelector(`#main-nav .u-dd.is-current .u-dd-menu a[href="${p.href}"][aria-current="page"]`), `${p.file} : rubrique active`);
    assert.ok(doc.querySelector('.u-footer a[href="/organisation/candidats"]'), `${p.file} : pied de page`);
    assert.ok(!/=== Page|PAGE \||­/.test(doc.querySelector('main').textContent), `${p.file} : texte du Livre blanc nettoyé`);
  }
  for (const c of CHANTIER_PAGES) {
    const doc = new JSDOM(await read(c.file)).window.document;
    const resume = doc.querySelectorAll('.sp-resume p');
    assert.ok(resume.length >= 3 && resume.length <= 4, `${c.file} : résumé en 3 ou 4 paragraphes`);
    assert.ok([...resume].every((p) => p.textContent.length > 120), `${c.file} : paragraphes développés`);
    assert.match(doc.querySelector('.sp-readmore a').getAttribute('href'), /^\/docs\/livre-blanc\.pdf#page=\d+$/, `${c.file} : invitation à lire le Livre blanc`);
    const poster = doc.querySelector('.sp-hero-poster img');
    assert.equal(poster.getAttribute('src'), `/pictures/chantiers/chantier-${String(c.n).padStart(2, '0')}.webp`, `${c.file} : affiche complète`);
    const full = doc.querySelector('details.sp-full');
    assert.ok(full && !full.open, `${c.file} : texte intégral replié`);
    const text = full.querySelector('.sp-article').textContent;
    assert.ok(text.length > 3000, `${c.file} : texte intégral du Livre blanc (${text.length})`);
    assert.equal(doc.querySelectorAll('.sp-pager a').length, c.n === 1 || c.n === 20 ? 2 : 3);
  }
  const candidats = new JSDOM(await read('organisation/candidats.html')).window.document;
  assert.match(candidats.querySelector('main').textContent, /Page en construction/);
  assert.match(candidats.querySelector('main').textContent, /En Avant pour Haïti — n° 85/);
  const diaspora = new JSDOM(await read('organisation/diaspora.html')).window.document;
  assert.deepEqual([...diaspora.querySelectorAll('.orga-section')].map((s) => s.dataset.section), ['branches-exterieures']);
  assert.equal(diaspora.getElementById('structure').dataset.teamOnly, 'branches-exterieures');
  for (const r of RUBRIQUES.filter((x) => x.key !== 'chantiers')) {
    const doc = new JSDOM(await read(r.file)).window.document;
    for (const p of r.pages) assert.ok(doc.querySelector(`main .sp-cards a[href="${p.href}"]`), `${r.file} → ${p.href}`);
  }
  const vc = new JSDOM(await read('vingt-chantiers.html')).window.document;
  assert.deepEqual([...vc.querySelectorAll('.chantier-card .card-link')].map((a) => a.getAttribute('href')), CHANTIER_PAGES.map((c) => c.href));
  const { STATIC_PAGES } = await import('../api/articles.js');
  for (const p of SUBPAGES) assert.ok(STATIC_PAGES.some(([path]) => path === p.href), `sitemap : ${p.href}`);
});

test('Sous-menu : la flèche ouvre et referme, Échap ferme', async () => {
  const dom = await page('historique/origines.html', '/historique/origines');
  const { window } = dom;
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = async () => response(200, {});
  try { window.eval(await read('js/premium.js')); } catch { /* modules décoratifs */ }
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await settle();
  const dd = [...window.document.querySelectorAll('[data-dd]')][2];
  const toggle = dd.querySelector('.u-dd-toggle');
  toggle.click();
  assert.ok(dd.classList.contains('is-open'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  [...window.document.querySelectorAll('[data-dd]')][0].querySelector('.u-dd-toggle').click();
  assert.ok(!dd.classList.contains('is-open'), 'un seul sous-menu ouvert');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(window.document.querySelectorAll('[data-dd].is-open').length, 0);
  dom.window.close();
});

test('Don : PayPal disponible avec le bouton de dons d’En Avant Miami Inc, ouvert dans un nouvel onglet', async () => {
  const doc = new JSDOM(await read('don.html')).window.document;
  const link = doc.querySelector('.don-methods-row--active a.don-paypal-btn');
  assert.equal(link.getAttribute('href'), 'https://www.paypal.com/donate/?hosted_button_id=L7ZGQVJNM5KPU');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.match(link.getAttribute('rel'), /noopener/);
  assert.ok(![...doc.querySelectorAll('.don-methods-row--soon h3')].some((h) => /PayPal/.test(h.textContent)), 'plus dans « Bientôt disponibles »');
});
