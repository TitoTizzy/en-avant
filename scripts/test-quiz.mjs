// Module Quiz membres : migration SQL testée sur un vrai PostgreSQL (PGlite).
// Lancer : node --test scripts/test-quiz.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { toQuestionRow, reachable } from '../api/_lib/quiz-generation.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, role text, username text);
    create table trivia_questions(id uuid primary key default gen_random_uuid(), question text not null,
      options jsonb not null, correct_answer text not null, explication text, source_livre_blanc text,
      created_at timestamptz not null default now());
    create table trivia_scores(id uuid default gen_random_uuid(), user_session text, pseudo text,
      score integer, total integer, completed_at timestamptz default now(), verified boolean default false);
    insert into profiles values ('${A}','member','Alpha'), ('${B}','member','Bravo'), ('${C}','member','Charlie');
  `);
  const sql = await readFile(new URL('../supabase/quiz-module.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // Réexécutable.
  // 20 QCM (réponse « B »), plus un exemplaire de chaque format spécial.
  for (let i = 0; i < 20; i += 1) {
    await db.query(`insert into trivia_questions(question, options, correct_answer, chantier, format)
      values ($1, '["A","B","C","D"]', 'B', $2, 'qcm')`, [`Question ${i}`, (i % 3) + 1]);
  }
  return db;
}

const one = async (db, text, params) => (await db.query(text, params)).rows[0];
const call = async (db, fn, ...params) => {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
  return (await one(db, `select public.${fn}(${placeholders}) as r`, params)).r;
};
// Recule le chrono de la question en cours (simule le temps écoulé).
const wait = (db, game, seconds) => db.query(
  `update quiz_games set shown_at = now() - make_interval(secs => $2) where id = $1`, [game, seconds]);

async function play(db, user, mode, { duel = null, answers = () => 'B', delay = 1 } = {}) {
  const start = await call(db, 'quiz_start', user, mode, duel, 15);
  assert.ok(start.game_id, JSON.stringify(start));
  let last;
  for (let i = 0; i < start.total; i += 1) {
    const q = await call(db, 'quiz_next', start.game_id, user);
    assert.equal(q.index, i);
    assert.equal(q.correct_answer, undefined, 'la réponse ne doit jamais être envoyée avant');
    await wait(db, start.game_id, delay);
    last = await call(db, 'quiz_answer', start.game_id, user, i, answers(i));
  }
  return { start, last };
}

test('Points : 10 + rapidité (≤ 5 s) + série croissante dès la 3e ; 407 pour un sans-faute rapide', async (t) => {
  const db = await setup(); t.after(() => db.close());
  const { last } = await play(db, A, 'libre');
  assert.equal(last.finished, true);
  assert.equal(last.bonnes, 15);
  assert.equal(last.points, 150 + 75 + 2 * (13 * 14) / 2); // 407
  assert.equal(last.meilleure_serie, 15);
});

test('Chrono : temps écoulé = 0 point sans pénalité ; réponse lente = pas de bonus ; série remise à zéro', async (t) => {
  const db = await setup(); t.after(() => db.close());
  const s = await call(db, 'quiz_start', A, 'libre', null, 15);
  const g = s.game_id;
  const step = async (i, ans, delay) => {
    await call(db, 'quiz_next', g, A); await wait(db, g, delay);
    return call(db, 'quiz_answer', g, A, i, ans);
  };
  assert.equal((await step(0, 'B', 1)).points_gagnes, 15);   // rapide
  assert.equal((await step(1, 'B', 8)).points_gagnes, 10);   // lent : pas de bonus
  assert.equal((await step(2, 'B', 2)).points_gagnes, 17);   // 3e d'affilée : +2
  const timeout = await step(3, 'B', 20);                     // temps écoulé
  assert.equal(timeout.timed_out, true);
  assert.equal(timeout.points_gagnes, 0);
  assert.equal(timeout.streak, 0);
  assert.equal(timeout.correct_answer, 'B');                  // on montre la réponse
  assert.equal((await step(4, 'A', 1)).points_gagnes, 0);     // faux : 0, rien retiré
  assert.equal((await one(db, 'select points from quiz_games where id=$1', [g])).points, 42);
});

test('Anti-triche : ordre imposé, pas de double réponse, partie d’un autre joueur refusée, rechargement sans remise à zéro du chrono', async (t) => {
  const db = await setup(); t.after(() => db.close());
  const { game_id: g } = await call(db, 'quiz_start', A, 'libre', null, 15);
  assert.ok((await call(db, 'quiz_answer', g, A, 0, 'B')).error);          // pas encore affichée
  await call(db, 'quiz_next', g, A);
  assert.ok((await call(db, 'quiz_answer', g, A, 1, 'B')).error);          // mauvais index
  assert.ok((await call(db, 'quiz_answer', g, B, 0, 'B')).error);          // autre joueur
  await wait(db, g, 9);
  const again = await call(db, 'quiz_next', g, A);                          // rechargement
  assert.ok(again.elapsed_ms >= 9000);
  await call(db, 'quiz_answer', g, A, 0, 'B');
  assert.ok((await call(db, 'quiz_answer', g, A, 0, 'B')).error);          // déjà répondue
});

test('Formats : chiffre avec tolérance, ordre, vrai/faux ; la tolérance n’est pas révélée', async (t) => {
  const db = await setup(); t.after(() => db.close());
  const ok = (f, c, m, a) => call(db, 'quiz_is_correct', f, c, JSON.stringify(m), a);
  assert.equal(await ok('chiffre', '20', { tolerance: 1 }, '21'), true);
  assert.equal(await ok('chiffre', '20', { tolerance: 1 }, '22'), false);
  assert.equal(await ok('chiffre', '1.5', {}, '1,5'), true);
  assert.equal(await ok('chiffre', '20', {}, 'vingt'), false);
  assert.equal(await ok('ordre', '["a","b","c"]', {}, '["a","b","c"]'), true);
  assert.equal(await ok('ordre', '["a","b","c"]', {}, '["b","a","c"]'), false);
  assert.equal(await ok('ordre', '["a","b","c"]', {}, 'pas du json'), false);
  assert.equal(await ok('vrai_faux', 'Vrai', {}, 'Vrai'), true);
  await db.exec(`update trivia_questions set format='chiffre', options='[]', correct_answer='20',
    meta='{"min":0,"max":100,"step":1,"unite":"%","tolerance":2}'`);
  const { game_id: g } = await call(db, 'quiz_start', A, 'libre', null, 15);
  const q = await call(db, 'quiz_next', g, A);
  assert.equal(q.meta.tolerance, undefined);
  assert.equal(q.meta.unite, '%');
});

test('Défi de la semaine : mêmes questions pour tous, une seule tentative, classement de la semaine', async (t) => {
  const db = await setup(); t.after(() => db.close());
  const a = await play(db, A, 'defi');
  const b = await play(db, B, 'defi', { answers: (i) => (i < 5 ? 'B' : 'A') });
  const qa = await one(db, 'select question_ids from quiz_games where id=$1', [a.start.game_id]);
  const qb = await one(db, 'select question_ids from quiz_games where id=$1', [b.start.game_id]);
  assert.deepEqual(qa.question_ids, qb.question_ids);
  const again = await call(db, 'quiz_start', A, 'defi', null, 15);
  assert.equal(again.code, 'defi_joue');
  const board = await call(db, 'quiz_leaderboard', 'semaine', B, 20);
  assert.deepEqual(board.top.map(r => r.pseudo), ['Alpha', 'Bravo']);
  assert.equal(board.moi.rang, 2);
});

test('Défi (retour Codex) : banque insuffisante → rien n’est enregistré, et un défi vide existant est remplacé', async (t) => {
  const db = await setup(); t.after(() => db.close());
  await db.exec(`update trivia_questions set active = false
    where id not in (select id from trivia_questions order by question limit 3)`);
  const refus = await call(db, 'quiz_start', A, 'defi', null, 15);
  assert.match(refus.error, /insuffisante/);
  assert.equal((await one(db, 'select count(*)::int as n from quiz_challenges')).n, 0, 'aucun défi vide enregistré');

  await db.exec('update trivia_questions set active = true');
  const ok = await call(db, 'quiz_start', A, 'defi', null, 15);
  assert.ok(ok.game_id, JSON.stringify(ok));
  assert.equal(ok.total, 15);

  // Défi vide déjà en base (ancienne version) : il est remplacé au lancement suivant.
  const db2 = await setup(); t.after(() => db2.close());
  await db2.exec(`insert into quiz_challenges (week_start, question_ids) values (quiz_week_start(), '{}')`);
  const repare = await call(db2, 'quiz_start', B, 'defi', null, 15);
  assert.equal(repare.total, 15, JSON.stringify(repare));
  assert.equal((await one(db2, 'select cardinality(question_ids) as n from quiz_challenges')).n, 15);
});

test('Partie en cours (retour Codex) : une modification admin ne change ni l’énoncé affiché ni la correction', async (t) => {
  const db = await setup(); t.after(() => db.close());
  const { game_id: g } = await call(db, 'quiz_start', A, 'libre', null, 15);
  const q0 = await call(db, 'quiz_next', g, A);
  // L'admin modifie toute la banque pendant que la question 1 est affichée.
  await db.exec(`update trivia_questions set question = question || ' (modifiée)', correct_answer = 'C'`);
  const recharge = await call(db, 'quiz_next', g, A);
  assert.equal(recharge.question, q0.question, 'énoncé figé au rechargement');
  await wait(db, g, 1);
  const r0 = await call(db, 'quiz_answer', g, A, 0, 'B');
  assert.equal(r0.correct, true, 'corrigée selon la version affichée');
  assert.equal(r0.correct_answer, 'B');
  // La question suivante, pas encore affichée, utilise la nouvelle version.
  const q1 = await call(db, 'quiz_next', g, A);
  assert.match(q1.question, /\(modifiée\)$/);
  await wait(db, g, 1);
  assert.equal((await call(db, 'quiz_answer', g, A, 1, 'C')).correct, true);
  // Question supprimée après affichage : la réponse reste corrigée normalement.
  await call(db, 'quiz_next', g, A);
  await db.exec(`delete from trivia_questions where id = (select question_ids[3] from quiz_games where id = '${g}')`);
  await wait(db, g, 1);
  assert.equal((await call(db, 'quiz_answer', g, A, 2, 'C')).correct, true);
});

test('Générateur (retour Codex) : une réponse « chiffre » est toujours atteignable avec le curseur', () => {
  const chiffre = (correct, meta) => toQuestionRow({
    format: 'chiffre', question: 'Quel pourcentage du budget ?', correct_answer: correct, meta,
  });
  // 1,5 avec un pas de 1 et sans tolérance : pas affiné à 0,5.
  const fine = chiffre('1,5', { min: 0, max: 10, step: 1, tolerance: 0 });
  assert.equal(fine.meta.step, 0.5);
  assert.ok(reachable(1.5, 0, 10, fine.meta.step));
  // Déjà atteignable : pas conservé.
  assert.equal(chiffre('30', { min: 0, max: 100, step: 10 }).meta.step, 10);
  // Atteignable grâce à la tolérance : pas conservé.
  assert.equal(chiffre('33', { min: 0, max: 100, step: 5, tolerance: 2 }).meta.step, 5);
  // Min décalé : 7 n'est pas sur la grille 2, 4, 6… → pas affiné à 1.
  assert.equal(chiffre('7', { min: 2, max: 20, step: 2 }).meta.step, 1);
  // Impossible sans curseur démesuré : question rejetée.
  assert.equal(chiffre('1.37', { min: 0, max: 1000000, step: 1000 }), null);
  // Chaque question acceptée est atteignable.
  for (const [v, m] of [['2.5', { min: 0, max: 5, step: 2 }], ['0.3', { min: 0, max: 1, step: 0.25 }], ['48', { min: 0, max: 100, step: 7 }]]) {
    const row = chiffre(v, m);
    if (row) assert.ok(reachable(Number(row.correct_answer), row.meta.min, row.meta.max, row.meta.step, row.meta.tolerance), `${v} ${JSON.stringify(row.meta)}`);
  }
});

test('Duel : même jeu pour l’invité, une partie chacun, résultat côte à côte, expiration à 7 jours', async (t) => {
  const db = await setup(); t.after(() => db.close());
  const creator = await play(db, A, 'duel', { answers: () => 'A' });
  const duel = creator.start.duel_id;
  assert.ok(duel);
  await play(db, B, 'duel', { duel });
  assert.equal((await call(db, 'quiz_start', B, 'duel', duel, 15)).code, 'duel_joue');
  const result = await call(db, 'quiz_duel_result', duel);
  assert.deepEqual(result.joueurs.map(j => j.pseudo), ['Bravo', 'Alpha']);
  await db.query(`update quiz_duels set expires_at = now() - interval '1 minute' where id = $1`, [duel]);
  assert.equal((await call(db, 'quiz_start', C, 'duel', duel, 15)).code, 'duel_expire');
});

test('Classements général et du mois, profil et badges', async (t) => {
  const db = await setup(); t.after(() => db.close());
  await play(db, A, 'libre');                                       // 407, série 15, éclair
  await play(db, B, 'libre', { answers: (i) => (i % 2 ? 'A' : 'B') });
  const general = await call(db, 'quiz_leaderboard', 'general', B, 20);
  assert.equal(general.top[0].pseudo, 'Alpha');
  assert.equal(general.top[0].cumul, 407);
  assert.equal(general.moi.rang, 2);
  assert.equal((await call(db, 'quiz_leaderboard', 'mois', A, 20)).top.length, 2);
  const profil = await call(db, 'quiz_profile', A);
  assert.equal(profil.cumul, 407);
  for (const badge of ['premier_pas', 'serie_de_feu', 'inarretable', 'eclair']) assert.ok(profil.badges.includes(badge), badge);
  assert.ok(!profil.badges.includes('assidu'));
  assert.equal(profil.chantiers['1'] + profil.chantiers['2'] + profil.chantiers['3'], 15);
  // 7 jours différents → Assidu ; 20 bonnes réponses sur un chantier → Expert.
  for (let d = 1; d <= 6; d += 1) {
    await db.query(`insert into quiz_games(user_id, mode, question_ids, points, finished_at)
      values ($1, 'libre', '{}', 0, now() - make_interval(days => $2))`, [A, d]);
  }
  for (let i = 0; i < 20; i += 1) {
    const g = (await one(db, `insert into quiz_games(user_id, mode, question_ids) values ($1,'libre','{}') returning id`, [A])).id;
    await db.query(`insert into quiz_answers(game_id, idx, user_id, chantier, correct) values ($1, 0, $2, 7, true)`, [g, A]);
  }
  const after = await call(db, 'quiz_profile', A);
  assert.ok(after.badges.includes('assidu'));
  assert.ok(after.badges.includes('expert_chantier_7'));
});

test('Sécurité : tables et fonctions du quiz inaccessibles aux rôles publics', async (t) => {
  const db = await setup(); t.after(() => db.close());
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from quiz_games'), /permission denied/);
  await assert.rejects(db.query(`select quiz_profile('${A}')`), /permission denied/);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(db.query(`select quiz_start('${A}', 'libre', null, 15)`), /permission denied/);
});
