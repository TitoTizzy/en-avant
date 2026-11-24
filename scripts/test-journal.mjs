// Journal d'activité : table, reconstitution de l'historique en phrases claires,
// écriture jamais bloquante, causes d'incident traduites en clair.
// Lancer : node --test scripts/test-journal.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { logActivity, logTeamAction, CATEGORIES, money, lieu } from '../api/_lib/activity.js';
import { plainCause } from '../api/_lib/http.js';

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table members (id uuid primary key default gen_random_uuid(), nom text, ville text, pays text, status text, created_at timestamptz default now());
    create table donations (id uuid primary key default gen_random_uuid(), montant integer, devise text, provider text, transaction_id text, nom text, statut text, created_at timestamptz default now());
    create table leads_livreblanc (id uuid primary key default gen_random_uuid(), nom text, ville text, downloaded_at timestamptz default now());
    create table newsletter_subscribers (id uuid primary key default gen_random_uuid(), nom text, ville text, source text, created_at timestamptz default now());
    create table newsletters (id uuid primary key default gen_random_uuid(), sujet text, type text default 'newsletter', statut text, envoyes int default 0, echecs int default 0, envoi_auto boolean default false, started_at timestamptz, sent_at timestamptz);
    create table articles (id uuid primary key default gen_random_uuid(), titre text, published boolean default false, published_at timestamptz, author_name text, review_status text, created_at timestamptz default now());
    create table quiz_games (id uuid primary key default gen_random_uuid(), mode text, points int, finished_at timestamptz);
    -- Exemples inventés.
    insert into members (nom, ville, pays, status) values ('Jean Exemple', 'Delmas', 'Haïti', 'approved'), ('Ana Test', null, null, 'pending');
    insert into donations (montant, devise, provider, transaction_id, nom, statut) values (5000, 'usd', 'stripe', 'pi_1', 'Paul Test', 'completed'), (2000, 'usd', 'stripe', 'pi_2', null, 'refunded');
    insert into leads_livreblanc (nom, ville) values ('Marie Exemple', 'Miami');
    insert into newsletter_subscribers (nom, ville, source) values ('Lu Test', 'Paris', 'formulaire'), ('Membre Test', null, 'adhesion');
    insert into newsletters (sujet, type, statut, envoyes, echecs, sent_at) values ('Lettre 1', 'newsletter', 'envoyee', 51, 2, now()),
      ('Quiz', 'quiz', 'envoyee', 40, 0, now()), ('Brouillon', 'newsletter', 'brouillon', 0, 0, null);
    insert into articles (titre, published, published_at, author_name, review_status) values ('Publié', true, now(), null, null), ('Proposé', false, null, 'Rose Test', 'pending');
    insert into quiz_games (mode, points, finished_at) values ('defi', 300, now()), ('defi', 410, now()), ('libre', 100, now());
  `);
  return db;
}

test('Historique reconstitué en phrases claires, sans doublon à la réexécution', async (t) => {
  const db = await setup(); t.after(() => db.close());
  const sql = (await readFile(new URL('../supabase/journal-activite.sql', import.meta.url), 'utf8')).replace(/notify pgrst[^;]*;/, '');
  await db.exec(sql);
  await db.exec(sql);
  const { rows } = await db.query('select categorie, niveau, message from activity_logs order by message');
  const messages = rows.map((r) => r.message);
  const has = (re) => assert.ok(messages.some((m) => re.test(m)), `${re} dans :\n${messages.join('\n')}`);
  has(/^Jean Exemple \(Delmas, Haïti\) a envoyé sa demande d’adhésion — adhésion approuvée\.$/);
  has(/^Ana Test a envoyé sa demande d’adhésion — en attente d’examen\.$/);
  has(/^Don reçu : 50[.,]00 USD de Paul Test via stripe\.$/);
  has(/^Don remboursé : 20[.,]00 USD\.$/);
  has(/^Le Livre blanc a été téléchargé par Marie Exemple \(Miami\)\.$/);
  has(/^Nouvelle inscription à la newsletter : Lu Test \(Paris\)\.$/);
  has(/^Newsletter « Lettre 1 » envoyée à 51 personne\(s\) \(2 échec\(s\)\)\.$/);
  has(/^Invitation au quiz de la semaine envoyée à 40 personne\(s\)\.$/);
  has(/^Article publié : « Publié »\.$/);
  has(/^Rose Test a proposé l’article « Proposé » — à relire\.$/);
  has(/^2 adhérents ont terminé le défi de la semaine \(meilleur score : 410 points\)\.$/);
  assert.equal(rows.length, 11, 'une ligne par événement, brouillons et adhérents abonnés d’office exclus');
  assert.equal(rows.find((r) => /remboursé/.test(r.message)).niveau, 'attention');
  assert.equal(rows.find((r) => /Lettre 1/.test(r.message)).niveau, 'attention');
  assert.ok(!messages.some((m) => /Membre Test|Brouillon/.test(m)));
  await assert.rejects(db.query(`insert into activity_logs (categorie, message) values ('autre', 'Test')`), /check/i);
});

test('Écriture : catégorie inconnue → Système, message vide ignoré, erreur jamais propagée', async () => {
  const rows = [];
  const fake = { from: () => ({ insert: async (row) => { rows.push(row); return { error: null }; } }) };
  await logActivity(fake, { categorie: 'inconnue', message: 'Quelque chose est arrivé.' });
  await logActivity(fake, { categorie: 'dons', message: '  ' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].categorie, 'systeme');
  assert.equal(rows[0].niveau, 'info');
  const broken = { from: () => ({ insert: async () => { throw new Error('base indisponible'); } }) };
  await logActivity(broken, { categorie: 'dons', message: 'Don reçu.' }); // ne lève pas
  // Action d'équipe : le nom vient du profil.
  const team = [];
  const withProfile = {
    from: (table) => (table === 'profiles'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nom: 'Sébastien Test' } }) }) }) }
      : { insert: async (row) => { team.push(row); return { error: null }; } }),
  };
  await logTeamAction(withProfile, { id: 'u1', email: 'x@example.org' }, { categorie: 'adhesions', message: 'a approuvé l’adhésion de Jean Exemple.' });
  assert.equal(team[0].acteur, 'Sébastien Test');
  assert.equal(team[0].acteur_id, 'u1');
  assert.deepEqual(Object.keys(CATEGORIES), ['adhesions', 'dons', 'contenus', 'newsletter', 'quiz', 'equipe', 'securite', 'systeme']);
  assert.equal(lieu('Delmas', '', 'Haïti'), ' (Delmas, Haïti)');
  assert.equal(lieu(null), '');
  assert.match(money(5000, 'usd'), /50,00\s?\$US|50,00\s?US\$|50,00 \$/);
});

test('Incidents : cause expliquée en clair dans le journal', () => {
  assert.match(plainCause(new Error('API key is invalid')), /Resend/);
  assert.match(plainCause(new Error('fetch failed')), /n’a pas répondu à temps/);
  assert.match(plainCause(new Error('relation "public.x" does not exist')), /migration manquante/);
  assert.match(plainCause(new Error('Overloaded')), /surchargé/);
  assert.match(plainCause(new Error('Autre chose')), /^cause technique : Autre chose$/);
});
