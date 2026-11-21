import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { JSDOM } from 'jsdom';
import { sanitizeArticle, escapeText } from '../api/_lib/content.js';
import { datasetConfig, createDashboardHandler } from '../api/_admin/dashboard.js';
import { can, assertPermission, effectivePermissions } from '../api/_lib/permissions.js';
import { createTriviaSession } from '../api/_lib/trivia-session.js';
import { processStripeEvent, stripeRecord } from '../api/webhooks/stripe.js';

test('HTML membre : les charges actives sont supprimées, le format éditorial reste lisible', async () => {
  assert.equal(await readFile(new URL('../js/vendor/purify.min.js', import.meta.url), 'utf8'),
    await readFile(new URL('../node_modules/dompurify/dist/purify.min.js', import.meta.url), 'utf8'));
  const payload = '<h2>Bonjour</h2><p onclick="alert(1)">Texte <strong>utile</strong></p>'
    + '<img src=x onerror=alert(1)><svg onload=alert(1)></svg><script>alert(1)</script>'
    + '<a href="javascript:alert(1)">danger</a><a href="https://example.com">lien</a>';
  const clean = sanitizeArticle(payload);
  assert.match(clean, /<strong>utile<\/strong>/);
  assert.doesNotMatch(clean, /onclick|onerror|onload|javascript:|<script|<svg|<img/);
  assert.equal(escapeText('<img "x">&'), '&lt;img &quot;x&quot;&gt;&amp;');
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  dom.window.eval(await readFile(new URL('../js/vendor/purify.min.js', import.meta.url), 'utf8'));
  dom.window.eval(await readFile(new URL('../js/content-security.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(dom.window.EASecurity.article(payload), /onclick|onerror|onload|javascript:|<script|<svg|<img/);
  delete dom.window.DOMPurify;
  assert.equal(dom.window.EASecurity.article(payload), '');
  dom.window.close();
});

test('Droits : accès dashboard seul sans accès privé, NINU séparé et permissions explicites', () => {
  const identity = { isSuperAdmin: false, permissions: ['acces_dashboard'] };
  for (const name of ['members', 'donations', 'leads']) {
    const config = datasetConfig(identity, name);
    assert.throws(() => assertPermission(identity, config.permission), { status: 403 });
  }
  assert.throws(() => assertPermission(identity, 'traiter_membres'), { status: 403 });
  identity.permissions.push('voir_membres');
  assert.equal(can(identity, 'voir_membres'), true);
  assert.doesNotMatch(datasetConfig(identity, 'members').fields, /ninu/);
  assert.ok(!datasetConfig(identity, 'members').filters.includes('ninu'));
  identity.permissions.push('voir_ninu');
  assert.match(datasetConfig(identity, 'members').fields, /ninu/);
  assert.ok(effectivePermissions({ role: 'member', permissions: null }).includes('jouer_trivia'));
  assert.deepEqual(effectivePermissions({ role: 'member', permissions: [] }), []);
});

test('Une partie ne révèle pas sa clé de réponses', async () => {
  const result = await createTriviaSession({ from: () => ({ insert: async () => ({ error: null }) }) }, [
    { question: 'Q', options: ['A', 'B'], correct_answer: 'B', explication: 'secret' },
  ]);
  assert.deepEqual(Object.keys(result.questions[0]), ['question', 'options']);
  assert.match(result.session_id, /^[a-f0-9-]{36}$/);
});

test('Dashboard : les réponses et chaque branche serveur respectent les droits', async () => {
  const identity = { isSuperAdmin: false, permissions: ['acces_dashboard'], user: { email: 'test@example.com' }, role: 'member' };
  const handler = createDashboardHandler({ authenticate: async () => identity,
    serviceClient: () => ({ from() { throw new Error('Lecture privée non autorisée'); }, rpc() { throw new Error('Total privé non autorisé'); } }),
  });
  const call = async (method, query = {}) => {
    let status, body;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(b) { body = b; } };
    await handler({ method, query, body: {} }, res);
    return { status, body };
  };
  const summary = await call('GET');
  assert.equal(summary.status, 200);
  assert.deepEqual(summary.body.members, []);
  assert.deepEqual(summary.body.donations, []);
  assert.equal(summary.body.stats.donation_totals, null);
  for (const dataset of ['members', 'donations', 'leads']) assert.equal((await call('GET', { dataset })).status, 403);
  assert.equal((await call('PATCH')).status, 403);
  identity.permissions.push('voir_membres');
  assert.equal((await call('GET', { dataset: 'members', export: '1' })).status, 403);
});

const payment = { id: 'evt_payment', created: 10, type: 'checkout.session.completed', data: { object: {
  metadata: { source: 'enavant.org' }, mode: 'payment', payment_status: 'paid', amount_total: 1000,
  currency: 'usd', payment_intent: 'pi_test', customer_details: { email: 'test@example.com' },
} } };

test('Stripe : filtrage source, paiements différés, écriture atomique et échec réessayable', async () => {
  const record = await stripeRecord(payment, {});
  assert.equal(record.p_transaction, 'pi_test');
  assert.equal(record.p_row.montant, 1000);
  assert.equal(await stripeRecord({ ...payment, data: { object: { ...payment.data.object, metadata: {} } } }, {}), null);
  assert.equal(await stripeRecord({ ...payment, data: { object: { ...payment.data.object, payment_status: 'unpaid' } } }, {}), null);
  let called = false;
  await processStripeEvent(payment, {}, { rpc: async (name, args) => {
    called = true; assert.equal(name, 'ea_record_stripe_event'); assert.equal(args.p_id, payment.id); return {};
  } });
  assert.ok(called);
  await assert.rejects(processStripeEvent(payment, {}, { rpc: async () => ({ error: new Error('DB down') }) }), /DB down/);
  const refund = { id: 'evt_refund', created: 11, type: 'charge.refunded', data: { object: { payment_intent: 'pi_test', amount_refunded: 200 } } };
  await assert.rejects(stripeRecord(refund, { invoicePayments: { list: async () => { throw new Error('Stripe down'); } } }), /Stripe down/);
  const partial = await stripeRecord(refund, {
    invoicePayments: { list: async () => ({ data: [] }) },
    paymentIntents: { retrieve: async () => ({ metadata: { source: 'enavant.org' } }) },
  });
  assert.equal(partial.p_refunded, 200);
  assert.equal(partial.p_transaction, 'pi_test');
});

test('Migration PostgreSQL : quotas, scores et rapprochement Stripe résistent aux replays et au désordre', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create table profiles(id uuid primary key, role text, nom text, username text, email text,
      permissions text[], pin_hash text);
    create table articles(id uuid, titre text, slug text, categorie text, contenu text, excerpt text,
      image_url text, published boolean, published_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create table trivia_questions(id uuid);
    create table trivia_scores(id uuid default gen_random_uuid(), user_session text, pseudo text,
      score integer, total integer, completed_at timestamptz default now());
    create table donations(id uuid default gen_random_uuid(), montant integer not null,
      devise text, provider text, transaction_id text unique, frequence text, email text, nom text,
      pays text, statut text, created_at timestamptz default now());
    grant select on trivia_questions, trivia_scores, articles to anon, authenticated;
    grant select (id, role, nom, username, email) on profiles to authenticated;
  `);
  const migration = await readFile(new URL('../supabase/security-hardening.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Safe to reapply.
  await db.exec(`create trigger test_profile after insert on auth.users
    for each row execute function public.handle_new_user();`);
  await db.query('insert into auth.users values ($1,$2,$3)', [
    '22222222-2222-4222-8222-222222222222', 'member@example.com', JSON.stringify({ role: 'superadmin', nom: 'Membre' }),
  ]);
  assert.equal((await db.query('select role from profiles')).rows[0].role, 'member');
  const first = await db.query("select ea_take_rate_limit('key', 2, 60) as allowed");
  const second = await db.query("select ea_take_rate_limit('key', 2, 60) as allowed");
  const third = await db.query("select ea_take_rate_limit('key', 2, 60) as allowed");
  assert.deepEqual([first, second, third].map(r => r.rows[0].allowed), [true, true, false]);
  await db.exec("update api_rate_limits set reset_at = now() - interval '1 second'");
  assert.equal((await db.query("select ea_take_rate_limit('key', 2, 60) as allowed")).rows[0].allowed, true);
  const session = '11111111-1111-4111-8111-111111111111';
  const questions = [{ question: 'Q1', options: ['A','B'], correct_answer: 'B' }, { question: 'Q2', options: ['C','D'], correct_answer: 'C' }];
  await db.query('insert into trivia_sessions(id,questions) values ($1,$2)', [session, JSON.stringify(questions)]);
  const answer = async (index, option) => (await db.query('select ea_answer_trivia($1,$2,$3) as result', [session,index,option])).rows[0].result;
  assert.ok((await answer(1,'C')).error);
  assert.equal((await answer(0,'A')).score, 0);
  assert.ok((await answer(0,'B')).error);
  assert.equal((await answer(0,'A')).score, 0); // Same-answer retry is safe.
  assert.equal((await answer(1,'C')).score, 1);
  for (let i = 0; i < 2; i++) {
    const result = await db.query('select ea_submit_trivia($1,$2) as result', [session,'Test']);
    assert.equal(result.rows[0].result.score, 1);
  }
  assert.equal((await db.query('select count(*)::int as n from trivia_scores')).rows[0].n, 1);
  const record = async (id, kind, row = null, refunded = null, dispute = null, created = 10) => db.query(
    'select ea_record_stripe_event($1,$2,$3,$4,$5,$6,$7)', [id,'pi_test',kind,created,row && JSON.stringify(row),refunded,dispute]);
  await record('evt_r1','refund',null,200);
  await record('evt_p','payment',{ montant: 1000, devise: 'usd', frequence: 'unique' });
  assert.equal((await db.query('select statut from donations')).rows[0].statut, 'partially_refunded');
  await record('evt_p','payment',{ montant: 1000, devise: 'usd', frequence: 'unique' });
  assert.equal((await db.query('select count(*)::int as n from donations')).rows[0].n, 1);
  assert.equal((await db.query('select net_cents from ea_donation_totals()')).rows[0].net_cents, 800);
  await record('evt_dclosed','dispute',null,null,'won',20);
  await record('evt_dopen','dispute',null,null,'needs_response',15);
  assert.equal((await db.query('select statut from donations')).rows[0].statut, 'partially_refunded');
  await record('evt_r2','refund',null,1000);
  assert.equal((await db.query('select net_cents from ea_donation_totals()')).rows[0].net_cents, 0);
  await db.exec("set role anon");
  await assert.rejects(db.query('select * from trivia_sessions'), /permission denied/);
  await assert.rejects(db.query("select ea_take_rate_limit('x',1,60)"), /permission denied/);
  await assert.rejects(db.query('select * from trivia_questions'), /permission denied/);
  await db.exec('reset role; set role authenticated');
  await db.query('select permissions from profiles');
  await assert.rejects(db.query('select pin_hash from profiles'), /permission denied/);
});
