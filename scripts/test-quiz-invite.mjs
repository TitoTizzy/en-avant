// Invitation au quiz de la semaine : destinataires, envoi unique par semaine,
// déclenchement automatique le mardi à minuit (heure d'Haïti), tâche planifiée.
// Lancer : node --test scripts/test-quiz-invite.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { autoSendDue, haitiDate, inviteContent, inviteRecipients, startInvite } from '../api/_lib/quiz-invite.js';
import { renderNewsletter } from '../api/_lib/newsletter.js';
import { cronAuthorized } from '../api/_lib/cron.js';

process.env.SITE_URL = 'https://enavant.org';

/** Faux client Supabase en mémoire (requêtes utilisées par l'invitation). */
function fakeSupabase(tables) {
  const db = { newsletters: [], newsletter_deliveries: [], newsletter_optouts: [], newsletter_subscribers: [], ...tables };
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.op = 'select'; }
    select() { return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
    not(c, op, v) { this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v)); return this; }
    order() { return this; }
    rows() { return (db[this.table] || []).filter((r) => this.filters.every((f) => f(r))); }
    range(from, to) { return Promise.resolve({ data: this.rows().slice(from, to + 1), error: null }); }
    maybeSingle() { return Promise.resolve({ data: this.rows()[0] || null, error: null }); }
    insert(row) {
      if (this.table === 'newsletters' && row.type === 'quiz' && db.newsletters.some((n) => n.type === 'quiz' && n.semaine === row.semaine)) {
        this.result = { data: null, error: { code: '23505', message: 'duplicate key' } };
      } else {
        const created = { id: `nl-${db.newsletters.length + 1}`, ...row };
        db[this.table].push(created);
        this.result = { data: created, error: null };
      }
      return this;
    }
    single() { return Promise.resolve(this.result || { data: this.rows()[0], error: null }); }
    upsert(rows) { db[this.table].push(...rows.map((r) => ({ statut: 'en_attente', ...r }))); return Promise.resolve({ error: null }); }
  }
  return { db, from: (t) => new Query(t) };
}

const WEEK = '2026-11-23'; // lundi
const members = [
  { user_id: 'u1', email: 'alice@example.org', nom: 'Alice Test', status: 'approved', created_at: '1' },
  { user_id: 'u2', email: 'bruno@example.org', nom: 'Bruno Test', status: 'approved', created_at: '2' },
  { user_id: 'u3', email: 'carla@example.org', nom: 'Carla Test', status: 'approved', created_at: '3' },
  { user_id: 'u4', email: 'dany@example.org', nom: 'Dany Test', status: 'pending', created_at: '4' },
];

test('Destinataires : adhérents approuvés, sans désinscrits ni ceux qui ont déjà joué le défi ; abonnés non adhérents exclus', async () => {
  const supabase = fakeSupabase({
    members,
    quiz_games: [
      { user_id: 'u2', mode: 'defi', week_start: WEEK, finished_at: '2026-11-23T15:00:00Z' }, // a joué
      { user_id: 'u1', mode: 'defi', week_start: WEEK, finished_at: null }, // a commencé seulement
      { user_id: 'u3', mode: 'defi', week_start: '2026-11-16', finished_at: '2026-11-17T10:00:00Z' }, // semaine passée
    ],
    newsletter_subscribers: [{ email: 'eve@example.org', nom: 'Eve', source: 'formulaire', unsubscribed_at: null, created_at: '5' }],
    newsletter_optouts: [{ email: 'carla@example.org' }],
  });
  const { recipients, dejaJoue } = await inviteRecipients(supabase, WEEK);
  assert.deepEqual(recipients.map((r) => r.email), ['alice@example.org']);
  assert.equal(dejaJoue, 1);
});

test('Envoi : une seule invitation par semaine, nombre confirmé exigé, rien si tout le monde a joué', async () => {
  const resendCalls = [];
  const supabase = fakeSupabase({ members, quiz_games: [] });
  // processQueue est remplacé : on vérifie seulement la préparation de l'envoi.
  const sendOnce = async (opts) => startInvite({ ...supabase, rpc: async () => ({ data: [], error: null }) }, opts).catch((e) => e);
  supabase.rpc = async (fn) => {
    resendCalls.push(fn);
    if (fn === 'newsletter_claim') return { data: [], error: null };
    if (fn === 'newsletter_progress') return { data: { destinataires: 3, envoyes: 0, echecs: 0, restants: 3 }, error: null };
    return { data: null, error: null };
  };
  const { from } = supabase;
  supabase.from = (t) => {
    const q = from(t);
    if (t === 'newsletters') q.update = () => ({ eq: async () => ({ error: null }) });
    return q;
  };
  process.env.RESEND_API_KEY = 're_test_fictive';

  const mismatch = await sendOnce({ week: WEEK, expected: 99 });
  assert.equal(mismatch.code, 'audience_changee');
  assert.equal(supabase.db.newsletters.length, 0, 'rien n’est créé si le nombre ne correspond pas');

  const ok = await startInvite(supabase, { week: WEEK, expected: 3, userId: 'admin' });
  assert.ok(ok.id);
  const row = supabase.db.newsletters[0];
  assert.equal(row.type, 'quiz');
  assert.equal(row.semaine, WEEK);
  assert.equal(row.statut, 'en_cours');
  assert.equal(row.cta_url, 'https://enavant.org/quiz');
  assert.deepEqual(supabase.db.newsletter_deliveries.map((d) => d.email).sort(), ['alice@example.org', 'bruno@example.org', 'carla@example.org']);

  const again = await startInvite(supabase, { week: WEEK, auto: true }).catch((e) => e);
  assert.equal(again.code, 'deja_envoyee', 'la tâche du mardi ne renvoie pas une invitation déjà partie');

  const nobody = fakeSupabase({ members: members.slice(0, 1), quiz_games: [{ user_id: 'u1', mode: 'defi', week_start: WEEK, finished_at: 'x' }] });
  const empty = await startInvite(nobody, { week: WEEK, auto: true }).catch((e) => e);
  assert.equal(empty.code, 'personne');
  delete process.env.RESEND_API_KEY;
});

test('Automatique : seulement à partir du mardi 00:00 à Port-au-Prince (heure d’hiver et d’été)', () => {
  // Hiver (UTC-5) : lundi 23:30 à Haïti = mardi 04:30 UTC → pas encore ; mardi 00:10 = 05:10 UTC → oui.
  assert.equal(haitiDate(new Date('2026-11-24T04:30:00Z')), '2026-11-23');
  assert.equal(autoSendDue(WEEK, new Date('2026-11-24T04:30:00Z')), false);
  assert.equal(autoSendDue(WEEK, new Date('2026-11-24T05:10:00Z')), true);
  // Été (UTC-4) : mardi 00:10 à Haïti = 04:10 UTC → oui.
  assert.equal(autoSendDue('2026-06-15', new Date('2026-06-16T04:10:00Z')), true);
  assert.equal(autoSendDue('2026-06-15', new Date('2026-06-16T03:50:00Z')), false);
  assert.equal(autoSendDue(WEEK, new Date('2026-11-23T12:00:00Z')), false, 'lundi : on attend l’envoi manuel');
});

test('Tâche planifiée : deux passages le mardi (04:00 et 05:00 UTC), route protégée par CRON_SECRET', async () => {
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const quiz = vercel.crons.filter((c) => c.path === '/api/cron/quiz').map((c) => c.schedule).sort();
  assert.deepEqual(quiz, ['0 4 * * 2', '0 5 * * 2']);
  assert.ok(vercel.rewrites.some((r) => r.source === '/api/cron/quiz' && r.destination === '/api/admin?action=quiz-cron'));
  process.env.CRON_SECRET = 'secret-de-test-assez-long';
  assert.equal(cronAuthorized({ headers: { authorization: 'Bearer secret-de-test-assez-long' } }), true);
  assert.equal(cronAuthorized({ headers: { authorization: 'Bearer autre' } }), false);
  assert.equal(cronAuthorized({ headers: {} }), false);
  delete process.env.CRON_SECRET;
  assert.equal(cronAuthorized({ headers: { authorization: 'Bearer ' } }), false);
});

test('Email d’invitation : objet, bouton « Jouer maintenant », boutons fixes, désinscription', () => {
  const { html, text } = renderNewsletter({ newsletter: inviteContent(), nom: 'Alice Test', unsubscribeUrl: 'https://enavant.org/newsletter?desinscription=t' });
  assert.match(html, /Le quiz de la semaine est ouvert/);
  assert.match(html, /href="https:\/\/enavant\.org\/quiz"[^>]*>Jouer maintenant/);
  assert.match(html, /Bonjour Alice,/);
  assert.match(html, /Adhérer à En Avant/);
  assert.match(html, /Se désinscrire/);
  assert.match(text, /Jouer maintenant : https:\/\/enavant\.org\/quiz/);
});
