// Galerie en albums : migration (PGlite), règles d'albums, albums publics.
// Lancer : node --test scripts/test-galerie.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { slugifyAlbum, albumFields } from '../api/_admin/media.js';
import { publicAlbums } from '../api/media.js';

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table media_gallery (id uuid primary key default gen_random_uuid(), url text not null, caption text,
      type text not null default 'photo', created_at timestamptz not null default now());
    insert into media_gallery (url, created_at) values ('https://x.test/a.jpg', now() - interval '3 days'),
      ('https://x.test/b.jpg', now() - interval '1 day'), ('https://x.test/c.jpg', now() - interval '2 days');
  `);
  return db;
}
const migration = async () => (await readFile(new URL('../supabase/galerie-albums.sql', import.meta.url), 'utf8')).replace(/notify pgrst[^;]*;/, '');

test('Migration : photos existantes rangées dans « Photos d’En Avant », couverture = la plus récente, réexécutable', async (t) => {
  const db = await setup(); t.after(() => db.close());
  const sql = await migration();
  await db.exec(sql);
  await db.exec(sql);
  const { rows: albums } = await db.query('select id, slug, titre, cover_id from media_albums');
  assert.equal(albums.length, 1);
  assert.equal(albums[0].slug, 'photos-d-en-avant');
  const { rows: libres } = await db.query('select count(*)::int n from media_gallery where album_id is null');
  assert.equal(libres[0].n, 0);
  const { rows: cover } = await db.query('select url from media_gallery where id = $1', [albums[0].cover_id]);
  assert.equal(cover[0].url, 'https://x.test/b.jpg');
  // Supprimer la photo de couverture ne casse pas l'album.
  await db.query('delete from media_gallery where id = $1', [albums[0].cover_id]);
  const { rows: after } = await db.query('select cover_id from media_albums');
  assert.equal(after[0].cover_id, null);
  // Supprimer l'album libère ses photos (aucune perte silencieuse côté base).
  await db.exec('delete from media_albums');
  const { rows: rest } = await db.query('select count(*)::int n from media_gallery where album_id is null');
  assert.equal(rest[0].n, 2);
  await assert.rejects(db.query("insert into media_albums (slug, titre) values ('Mauvais Slug', 'Test')"));
});

test('Migration : base sans photo → aucun album créé', async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table media_gallery (id uuid primary key default gen_random_uuid(), url text not null, caption text, type text not null default 'photo', created_at timestamptz not null default now());`);
  await db.exec(await migration());
  const { rows } = await db.query('select count(*)::int n from media_albums');
  assert.equal(rows[0].n, 0);
});

test('Albums : adresse lisible, titre obligatoire, date valide', () => {
  assert.equal(slugifyAlbum('Rassemblement au Cap-Haïtien !'), 'rassemblement-au-cap-haitien');
  assert.equal(slugifyAlbum('Ô'), 'album-o');
  assert.throws(() => albumFields({ titre: ' ' }), /titre/);
  assert.throws(() => albumFields({ titre: 'Tournée', date_album: '2026-13-45' }), /Date/);
  assert.deepEqual(albumFields({ titre: '  Tournée diaspora ', date_album: '2026-11-20', description: '' }),
    { titre: 'Tournée diaspora', description: null, date_album: '2026-11-20' });
  assert.deepEqual(albumFields({ description: 'x' }, { partial: true }), { description: 'x' });
});

test('Albums publics : albums vides masqués, couverture choisie sinon photo la plus récente', () => {
  const albums = [
    { id: 'a1', slug: 'cap', titre: 'Cap', description: null, date_album: '2026-11-20', cover_id: 'p2' },
    { id: 'a2', slug: 'vide', titre: 'Vide', cover_id: null },
    { id: 'a3', slug: 'miami', titre: 'Miami', cover_id: 'introuvable' },
  ];
  const photos = [
    { id: 'p1', url: 'u1', album_id: 'a1' }, { id: 'p2', url: 'u2', album_id: 'a1' },
    { id: 'p3', url: 'u3', album_id: 'a3' }, { id: 'p4', url: 'u4', album_id: null },
  ];
  const out = publicAlbums(albums, photos);
  assert.deepEqual(out.map((a) => a.slug), ['cap', 'miami']);
  assert.equal(out[0].cover_url, 'u2');
  assert.equal(out[0].nb_photos, 2);
  assert.equal(out[1].cover_url, 'u3');
  assert.equal(out[0].description, '');
  assert.equal('id' in out[0], false, 'aucun identifiant interne exposé');
});

test('Photos de départ : 20 photos dans « Photos d’En Avant », 5 légendes, couverture, sans doublon', async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table media_gallery (id uuid primary key default gen_random_uuid(), url text not null, caption text, type text not null default 'photo', created_at timestamptz not null default now());`);
  await db.exec(await migration());
  const seed = await readFile(new URL('../supabase/galerie-photos-depart.sql', import.meta.url), 'utf8');
  await db.exec(seed);
  await db.exec(seed);
  const { rows } = await db.query(`select g.url, g.caption from media_gallery g join media_albums a on a.id = g.album_id
    where a.slug = 'photos-d-en-avant' order by g.created_at desc`);
  assert.equal(rows.length, 20);
  assert.match(rows[0].url, /galerie-1\.webp$/, 'la photo 1 reste la plus récente (carrousel)');
  assert.equal(rows.filter((r) => r.caption).length, 5);
  const { rows: album } = await db.query(`select url from media_gallery order by position, created_at`);
  assert.match(album[0].url, /galerie-1\.webp$/, 'l’album commence par la photo 1');
  assert.match(album[19].url, /galerie-20\.webp$/);
  const { rows: cover } = await db.query(`select g.url from media_albums a join media_gallery g on g.id = a.cover_id`);
  assert.match(cover[0].url, /galerie-1\.webp$/);
});
