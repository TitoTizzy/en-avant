-- Photos de départ de la Galerie : les 20 photos du site (pictures/home-galerie), rangées dans
-- l'album « Photos d'En Avant ». Les 5 premières gardent les légendes de l'accueil et restent
-- les plus récentes (donc celles du carrousel). Dans l'album, elles s'affichent de 1 à 20
-- (position négative : les photos ajoutées ensuite, position 0, viennent après). Réexécutable sans doublon.
-- Supprimer une de ces photos depuis le back-office la retire de la galerie sans toucher au fichier du site.
do $$
declare v_album uuid;
begin
  insert into public.media_albums (slug, titre, description)
  values ('photos-d-en-avant', 'Photos d’En Avant', 'Moments de la vie du parti.')
  on conflict (slug) do nothing;
  select id into v_album from public.media_albums where slug = 'photos-d-en-avant';

  insert into public.media_gallery (url, caption, type, album_id, created_at, position)
  select v.url, v.caption, 'photo', v_album, v.created_at, (substring(v.url from 'galerie-([0-9]+)\.webp$'))::int - 21
  from (values
    ('https://enavant.org/pictures/home-galerie/galerie-1.webp', 'Présence, proximité, mobilisation', now() - interval '1 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-2.webp', 'Dialoguer avec les forces vives du pays', now() - interval '2 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-3.webp', 'Structurer une action politique durable', now() - interval '3 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-4.webp', 'Porter une vision moderne et ambitieuse', now() - interval '4 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-5.webp', 'Créer un parti capable de rassembler', now() - interval '5 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-6.webp', null, now() - interval '6 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-7.webp', null, now() - interval '7 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-8.webp', null, now() - interval '8 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-9.webp', null, now() - interval '9 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-10.webp', null, now() - interval '10 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-11.webp', null, now() - interval '11 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-12.webp', null, now() - interval '12 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-13.webp', null, now() - interval '13 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-14.webp', null, now() - interval '14 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-15.webp', null, now() - interval '15 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-16.webp', null, now() - interval '16 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-17.webp', null, now() - interval '17 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-18.webp', null, now() - interval '18 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-19.webp', null, now() - interval '19 minutes'),
    ('https://enavant.org/pictures/home-galerie/galerie-20.webp', null, now() - interval '20 minutes')
  ) as v(url, caption, created_at)
  where not exists (select 1 from public.media_gallery g where g.url = v.url);

  update public.media_albums set cover_id = (
    select id from public.media_gallery where url = 'https://enavant.org/pictures/home-galerie/galerie-1.webp' limit 1
  ) where id = v_album and cover_id is null;
end $$;
