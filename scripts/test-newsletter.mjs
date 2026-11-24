// Newsletter et géographie : filtres, rendu, envoi par lots sans doublon.
// Lancer : node --test scripts/test-newsletter.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import {
  DEPARTEMENTS, PAYS, REGIONS, canonicalRegion, canonicalPays, canonicalDepartement, inferFromVille, effectiveLocation, matchesGeo, cleanLocation,
} from '../api/_lib/geo.js';
import { applyFiltres, breakdown, cleanFiltres, renderNewsletter, htmlToText, processQueue, emailifyHtml } from '../api/_lib/newsletter.js';
import { imageMatches } from '../api/_admin/newsletter.js';

process.env.SITE_URL = 'https://enavant.org';

test('Géographie : pays et départements canoniques, ville → département (sans deviner)', () => {
  assert.equal(canonicalPays('haiti'), 'Haïti');
  assert.equal(canonicalPays('USA'), 'États-Unis');
  assert.equal(canonicalPays('Sénégal'), 'Sénégal', 'pays hors liste accepté tel quel');
  assert.equal(canonicalDepartement('grand anse'), 'Grand’Anse');
  assert.equal(canonicalDepartement('Mars'), null);
  assert.deepEqual(inferFromVille('Pétion-Ville'), { pays: 'Haïti', departement: 'Ouest', region: 'Ouest', commune: 'Pétion-Ville' });
  assert.deepEqual(inferFromVille('cap haitien'), { pays: 'Haïti', departement: 'Nord', region: 'Nord', commune: 'Cap-Haïtien' });
  assert.deepEqual(inferFromVille('Gonaives'), { pays: 'Haïti', departement: 'Artibonite', region: 'Artibonite', commune: 'Gonaïves' });
  assert.deepEqual(inferFromVille('Miami'), { pays: 'États-Unis', region: 'Floride', commune: 'Miami' });
  assert.deepEqual(inferFromVille('Montréal'), { pays: 'Canada', region: 'Québec', commune: 'Montréal' });
  assert.deepEqual(inferFromVille('Villeinconnue'), {});
  // Villes saisies comme des adresses (exemples inventés, même forme que les vraies saisies).
  const cas = {
    'Delmas 33, Rue Exemple': ['Haïti', 'Ouest', 'Delmas'],
    'Delmas12 impasse Test': ['Haïti', 'Ouest', 'Delmas'],
    'Port au Prince,delmas': ['Haïti', 'Ouest', 'Port-au-Prince'],
    'Petion- ville': ['Haïti', 'Ouest', 'Pétion-Ville'],
    'rue Test, Pèlerin 5': ['Haïti', 'Ouest', 'Pétion-Ville'],
    'Aux cayes': ['Haïti', 'Sud', 'Les Cayes'],
    'LES CAYES': ['Haïti', 'Sud', 'Les Cayes'],
    'Limonade, Nord d’Haïti': ['Haïti', 'Nord', 'Limonade'],
    'Gros morne, Artibonite Haiti': ['Haïti', 'Artibonite', 'Gros-Morne'],
    'Leogane, Ouest, Haiti': ['Haïti', 'Ouest', 'Léogâne'],
    'Naples, Florida, USA': ['États-Unis', undefined, 'Naples'],
    'Trois-Rivières, Québec': ['Canada', undefined, 'Trois-Rivières'],
    'Quelque part, Florida': ['États-Unis', undefined, undefined],
    'Rue 5, Artibonite': ['Haïti', 'Artibonite', undefined],
  };
  for (const [ville, [pays, departement, commune]] of Object.entries(cas)) {
    const r = inferFromVille(ville);
    assert.deepEqual([r.pays, r.departement, r.commune], [pays, departement, commune], ville);
  }
  // Régions de la diaspora : déduites de la ville ou d'un mot de l'adresse ; filtres acceptant les variantes.
  for (const [ville, region] of [['Boston', 'Massachusetts'], ['Naples, Florida, USA', 'Floride'], ['Toronto', 'Ontario'],
    ['Quelque part, Florida', 'Floride'], ['Paris', 'Île-de-France'], ['Delmas 40', 'Ouest']]) {
    assert.equal(effectiveLocation({ ville }).region, region, ville);
  }
  assert.equal(canonicalRegion('florida'), 'Floride');
  assert.equal(canonicalRegion('grand anse'), 'Grand’Anse');
  assert.equal(matchesGeo({ ville: 'Miami' }, { departements: ['Florida'] }), true);
  assert.equal(matchesGeo({ ville: 'Boston' }, { departements: ['Floride'] }), false);
  assert.equal(matchesGeo({ ville: 'Delmas' }, { departements: ['Ouest', 'Floride'] }), true);
  // Pas de faux positif sur une abréviation : on préfère « non renseigné ».
  assert.deepEqual(inferFromVille('Ma rue, RD 12'), {});
  // Déclaré > déduit ; un département n'existe que pour Haïti.
  assert.deepEqual(effectiveLocation({ pays: 'Canada', ville: 'Jacmel' }),
    { pays: 'Canada', departement: null, region: null, ville: 'Jacmel', commune: 'Jacmel', deduit: false });
  assert.equal(effectiveLocation({ ville: 'Jacmel' }).departement, 'Sud-Est');
  assert.equal(effectiveLocation({ ville: 'Jacmel' }).deduit, true);
  assert.equal(cleanLocation({ pays: 'Haïti', ville: 'Hinche' }).error, 'Département requis pour Haïti.');
  assert.deepEqual(cleanLocation({ pays: 'France', departement: 'Nord', ville: 'Paris' }),
    { pays: 'France', departement: null, ville: 'Paris' });
});

test('Géographie : les listes du navigateur (js/geo.js) sont identiques à celles du serveur', async () => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(new URL('../js/geo.js', import.meta.url), 'utf8'), context);
  assert.deepEqual([...context.window.EA_GEO.DEPARTEMENTS], DEPARTEMENTS);
  assert.deepEqual([...context.window.EA_GEO.PAYS], PAYS);
  assert.deepEqual([...context.window.EA_GEO.REGIONS], REGIONS);
  assert.equal(context.window.EA_GEO.isHaiti('haiti'), true);
});

const contact = (email, types, loc) => ({ email, nom: 'X', types: new Set(types), ...effectiveLocation(loc) });
const CONTACTS = [
  contact('a@x.org', ['adherent'], { pays: 'Haïti', departement: 'Nord', ville: 'Cap-Haïtien' }),
  contact('b@x.org', ['adherent', 'abonne'], { pays: 'Haïti', departement: 'Ouest', ville: 'Delmas' }),
  contact('c@x.org', ['abonne'], { pays: 'États-Unis', ville: 'Miami' }),
  contact('d@x.org', ['adherent'], { ville: 'Jacmel' }), // ancienne fiche : ville seulement
  contact('e@x.org', ['abonne'], { pays: 'Canada', ville: 'Montréal' }),
];

test('Filtres : public, pays, département, ville (ET entre critères, OU à l’intérieur)', () => {
  const emails = (filtres) => applyFiltres(CONTACTS, filtres).map((c) => c.email);
  assert.equal(emails({}).length, 5);
  assert.deepEqual(emails({ public: 'adherents' }), ['a@x.org', 'b@x.org', 'd@x.org']);
  assert.deepEqual(emails({ public: 'abonnes' }), ['b@x.org', 'c@x.org', 'e@x.org']);
  assert.deepEqual(emails({ pays: ['Haïti'] }), ['a@x.org', 'b@x.org', 'd@x.org'], 'fiche ancienne déduite de la ville');
  assert.deepEqual(emails({ pays: ['États-Unis', 'Canada'] }), ['c@x.org', 'e@x.org']);
  assert.deepEqual(emails({ departements: ['Nord', 'Sud-Est'] }), ['a@x.org', 'd@x.org']);
  assert.deepEqual(emails({ pays: ['Haïti'], villes: ['delmas'] }), ['b@x.org']);
  // Le filtre « Delmas » trouve aussi une adresse complète à Delmas.
  const adresse = [contact('f@x.org', ['adherent'], { ville: 'Delmas 40, Impasse Test' })];
  assert.equal(applyFiltres(adresse, { villes: ['Delmas'] }).length, 1);
  assert.equal(applyFiltres(adresse, { villes: ['Jacmel'] }).length, 0);
  assert.deepEqual(emails({ public: 'abonnes', pays: ['Haïti'] }), ['b@x.org']);
  assert.deepEqual(cleanFiltres({ public: 'pirate', pays: 'Haïti' }), { public: 'tous', pays: [], departements: [], villes: [] });
  const b = breakdown(CONTACTS);
  assert.equal(b.total, 5);
  assert.equal(b.adherents, 3);
  assert.deepEqual(b.pays[0], { nom: 'Haïti', total: 3 });
});

test('Email : objet échappé, prénom, événement, bouton, lien de désinscription, version texte', () => {
  const { html, text } = renderNewsletter({
    newsletter: { sujet: 'Rassemblement <script>', apercu: 'Samedi', contenu: '<p>Venez <strong>nombreux</strong>.</p>',
      cta_label: 'Je viens', cta_url: 'https://enavant.org/rsvp' },
    event: { titre: 'Meeting au Cap', date_cible: '2026-12-05T15:00:00Z', lieu: 'Place d’Armes', description: 'Ouvert à tous' },
    nom: 'Marie Joseph', unsubscribeUrl: 'https://enavant.org/newsletter?desinscription=abc',
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Rassemblement &lt;script&gt;/);
  assert.match(html, /Bonjour Marie,/);
  assert.match(html, /Meeting au Cap/);
  assert.match(html, /Place d&#39;Armes|Place d’Armes/);
  assert.match(html, /href="https:\/\/enavant\.org\/rsvp"/);
  assert.match(html, /desinscription=abc/);
  assert.match(text, /Venez nombreux\./);
  assert.match(text, /Se désinscrire : https:\/\/enavant\.org\/newsletter\?desinscription=abc/);
  assert.equal(htmlToText('<ul><li>Un</li><li>Deux</li></ul><p><a href="https://x.org">lien</a></p>'), '• Un\n• Deux\nlien (https://x.org)');
});

async function db() {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create table members(id uuid primary key default gen_random_uuid(), nom text, email text, ville text, status text, created_at timestamptz default now());
    create table events(id uuid primary key default gen_random_uuid(), titre text, date_cible timestamptz, lieu text, description text);
  `);
  for (const file of ['newsletter.sql', 'newsletter-adherents.sql']) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8');
    await pg.exec(sql);
    await pg.exec(sql); // réexécutable
  }
  return pg;
}

test('SQL : deux envois simultanés ne réservent jamais les mêmes destinataires ; progression exacte', async (t) => {
  const pg = await db(); t.after(() => pg.close());
  const { rows: [{ id }] } = await pg.query(`insert into newsletters (sujet, contenu) values ('Test', '<p>x</p>') returning id`);
  await pg.query(`insert into newsletter_deliveries (newsletter_id, email) select $1, 'p' || g || '@x.org' from generate_series(1, 250) g`, [id]);
  const a = (await pg.query('select * from newsletter_claim($1, 100)', [id])).rows.map((r) => r.email);
  const b = (await pg.query('select * from newsletter_claim($1, 100)', [id])).rows.map((r) => r.email);
  assert.equal(a.length, 100);
  assert.equal(b.length, 100);
  assert.equal(new Set([...a, ...b]).size, 200, 'aucun doublon');
  await pg.query(`update newsletter_deliveries set statut = 'envoye' where email = any($1)`, [a]);
  await pg.query(`update newsletter_deliveries set statut = 'echec' where email = any($1)`, [b.slice(0, 3)]);
  const { rows: [{ p }] } = await pg.query('select newsletter_progress($1) as p', [id]);
  assert.deepEqual(p, { destinataires: 250, envoyes: 100, echecs: 3, restants: 147 });
  // Un lot bloqué depuis plus de 5 minutes est repris.
  await pg.query(`update newsletter_deliveries set claimed_at = now() - interval '6 minutes' where statut = 'envoi'`);
  const repris = (await pg.query('select * from newsletter_claim($1, 100)', [id])).rows.length;
  assert.equal(repris, 100);
  // Fermé aux rôles publics.
  const { rows: [g] } = await pg.query(`select has_table_privilege('anon', 'newsletter_subscribers', 'select') as s,
    has_function_privilege('anon', 'newsletter_claim(uuid, integer)', 'execute') as f`);
  assert.deepEqual(g, { s: false, f: false });
});

/** Faux client Supabase branché sur PGlite pour les seules requêtes de processQueue. */
function pgClient(pg) {
  return {
    rpc: async (fn, args) => {
      if (fn === 'newsletter_claim') return { data: (await pg.query('select * from newsletter_claim($1, $2)', [args.p_newsletter, args.p_count])).rows, error: null };
      return { data: (await pg.query('select newsletter_progress($1) as p', [args.p_newsletter])).rows[0].p, error: null };
    },
    from: (table) => {
      const q = { table, filters: [], patch: null, rows: null };
      const run = async () => {
        const where = q.filters.map(([c, op], i) => (op === 'in' ? `${c} = any($${i + 1})` : `${c} = $${i + 1}`)).join(' and ');
        const params = q.filters.map(([, , v]) => v);
        if (q.patch) {
          const keys = Object.keys(q.patch);
          const sets = keys.map((k, i) => `${k} = $${params.length + i + 1}`).join(', ');
          await pg.query(`update ${table} set ${sets}${where ? ` where ${where}` : ''}`, [...params, ...keys.map((k) => q.patch[k])]);
          return { data: null, error: null };
        }
        if (q.rows) {
          for (const row of q.rows) {
            const keys = Object.keys(row);
            await pg.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) on conflict do nothing`, keys.map((k) => row[k]));
          }
          return { data: null, error: null };
        }
        const { rows } = await pg.query(`select * from ${table}${where ? ` where ${where}` : ''}`, params);
        return { data: q.single ? rows[0] : rows, error: null };
      };
      const chain = {
        select: () => chain, eq: (c, v) => { q.filters.push([c, 'eq', v]); return chain; },
        in: (c, v) => { q.filters.push([c, 'in', v]); return chain; },
        update: (patch) => { q.patch = patch; return chain; },
        upsert: (rows) => { q.rows = rows; return chain; },
        single: () => { q.single = true; return run(); }, maybeSingle: () => { q.single = true; return run(); },
        then: (resolve, reject) => run().then(resolve, reject),
      };
      return chain;
    },
  };
}

test('Envoi : lots de 100 au plus, désinscrits ignorés, lien personnel, échec d’un lot sans blocage', async (t) => {
  const pg = await db(); t.after(() => pg.close());
  const { rows: [{ id }] } = await pg.query(`insert into newsletters (sujet, contenu, statut) values ('Hebdo', '<p>Bonjour</p>', 'en_cours') returning id`);
  await pg.query(`insert into newsletter_deliveries (newsletter_id, email, nom) select $1, 'p' || lpad(g::text, 3, '0') || '@x.org', 'Personne ' || g from generate_series(1, 230) g`, [id]);
  await pg.query(`insert into newsletter_optouts (email) values ('p005@x.org')`);

  const batches = [];
  let fail = true;
  const resend = { batch: { send: async (messages, options) => {
    batches.push({ messages, options });
    if (fail) { fail = false; return { error: { message: 'Limite dépassée' } }; } // 1er lot en échec
    return { data: {}, error: null };
  } } };
  const progress = await processQueue(pgClient(pg), id, { resend, deadlineMs: 60000 });

  assert.equal(batches.length, 3);
  assert.ok(batches.every((b) => b.messages.length <= 100));
  const all = batches.flatMap((b) => b.messages.map((m) => m.to[0]));
  assert.equal(new Set(all).size, all.length, 'aucune adresse en double');
  assert.ok(!all.includes('p005@x.org'), 'désinscrit ignoré');
  const msg = batches[1].messages[0];
  assert.match(msg.html, /newsletter\?desinscription=[0-9a-f-]{36}/);
  assert.match(msg.headers['List-Unsubscribe'], /api\/newsletter\?op=desinscription&t=/);
  assert.equal(msg.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(batches[0].options.idempotencyKey, /^nl-/);
  assert.equal(progress.envoyes, 229 - batches[0].messages.length);
  assert.equal(progress.echecs, batches[0].messages.length + 1);
  assert.equal(progress.termine, true);
  const { rows: [n] } = await pg.query('select statut from newsletters where id = $1', [id]);
  assert.equal(n.statut, 'envoyee');
});

test('Adhérents abonnés d’office : rattrapage, approbation, lieu mis à jour, désinscrits jamais réabonnés', async (t) => {
  const pg = await db(); t.after(() => pg.close());
  const subs = async () => (await pg.query(`select email, ville, departement, source from newsletter_subscribers order by email`)).rows;
  // Fiches existantes avant la migration : seules les approuvées sont rattrapées, sauf désinscrites.
  await pg.exec(`
    drop trigger members_newsletter on members;
    insert into members (nom, email, ville, status) values
      ('Ana', 'Ana@X.org', 'Delmas', 'approved'), ('Ben', 'ben@x.org', 'Jacmel', 'pending'),
      ('Cléo', 'cleo@x.org', 'Miami', 'approved'), ('Dan', 'dan@x.org', 'Boston', 'rejected');
    insert into newsletter_optouts (email) values ('cleo@x.org');
  `);
  await pg.exec(await readFile(new URL('../supabase/newsletter-adherents.sql', import.meta.url), 'utf8'));
  assert.deepEqual((await subs()).map((r) => r.email), ['ana@x.org']);
  // Approbation d'une fiche en attente → abonnée.
  await pg.exec(`update members set status = 'approved' where email = 'ben@x.org'`);
  assert.deepEqual((await subs()).map((r) => r.email), ['ana@x.org', 'ben@x.org']);
  // Nouvelle adhésion approuvée directement.
  await pg.exec(`insert into members (nom, email, ville, pays, departement, status) values ('Eva', 'eva@x.org', 'Hinche', 'Haïti', 'Centre', 'approved')`);
  assert.deepEqual((await subs()).find((r) => r.email === 'eva@x.org'), { email: 'eva@x.org', ville: 'Hinche', departement: 'Centre', source: 'adhesion' });
  // Changement de lieu sur la fiche → abonnement mis à jour.
  await pg.exec(`update members set ville = 'Cap-Haïtien', pays = 'Haïti', departement = 'Nord' where lower(email) = 'ana@x.org'`);
  assert.equal((await subs()).find((r) => r.email === 'ana@x.org').departement, 'Nord');
  // Désinscrite : rien ne la réabonne, même une modification de sa fiche.
  await pg.exec(`update members set ville = 'Orlando' where email = 'cleo@x.org'`);
  assert.ok(!(await subs()).some((r) => r.email === 'cleo@x.org'));
  // Fiche rejetée : jamais abonnée.
  assert.ok(!(await subs()).some((r) => r.email === 'dan@x.org'));
  // Un abonné du formulaire garde son lieu déclaré si son adhésion est approuvée ensuite.
  await pg.exec(`insert into newsletter_subscribers (email, ville, source) values ('fay@x.org', 'Paris', 'formulaire');
    insert into members (nom, email, ville, status) values ('Fay', 'fay@x.org', 'Lyon', 'approved')`);
  assert.equal((await subs()).find((r) => r.email === 'fay@x.org').ville, 'Paris');
});

test('Email : boutons Adhérer et Faire un don toujours présents ; photos et mise en forme de l’éditeur lisibles dans les messageries', () => {
  const { html, text } = renderNewsletter({
    newsletter: { sujet: 'Hebdo', contenu: '<p class="ql-align-center">Titre centré</p><p><img src="https://x.supabase.co/storage/v1/object/public/assets/newsletter/a.jpg" width="900"></p><p><span class="ql-size-large">Grand</span></p>' },
    unsubscribeUrl: 'https://enavant.org/newsletter?desinscription=t',
  });
  assert.match(html, /href="https:\/\/enavant\.org\/adherer"[^>]*>Adhérer à En Avant</);
  assert.match(html, /href="https:\/\/enavant\.org\/don"[^>]*>Faire un don</);
  assert.match(text, /Adhérer à En Avant : https:\/\/enavant\.org\/adherer/);
  assert.match(text, /Faire un don : https:\/\/enavant\.org\/don/);
  assert.match(html, /<p style="text-align:center">Titre centré/);
  assert.match(html, /<img src="https:\/\/x\.supabase\.co[^"]+" style="display:block;max-width:100%/);
  assert.doesNotMatch(html, /width="900"/);
  assert.match(html, /<span style="font-size:20px">Grand/);
  assert.equal(emailifyHtml('<p class="ql-inconnue">x</p>'), '<p style="margin:0 0 16px">x</p>', 'classe inconnue retirée');
});

test('Photos de la newsletter : seul un vrai fichier image est accepté', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary');
  assert.equal(imageMatches(png, 'png'), true);
  assert.equal(imageMatches(jpg, 'jpg'), true);
  assert.equal(imageMatches(webp, 'webp'), true);
  assert.equal(imageMatches(png, 'jpg'), false, 'extension mensongère');
  assert.equal(imageMatches(Buffer.from('<script>alert(1)</script>'), 'png'), false);
});
