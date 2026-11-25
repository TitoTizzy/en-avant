-- Galerie en albums : un album regroupe des photos (titre, date, description, couverture).
-- Les photos déjà en ligne sont rangées dans un premier album « Photos d'En Avant ».
-- Réexécutable sans risque.

create table if not exists public.media_albums (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  titre        text not null check (char_length(titre) between 2 and 120),
  description  text check (char_length(description) <= 600),
  date_album   date,
  cover_id     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.media_gallery add column if not exists album_id uuid references public.media_albums(id) on delete set null;
alter table public.media_gallery add column if not exists position integer not null default 0;
create index if not exists media_gallery_album_idx on public.media_gallery (album_id, position, created_at);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'media_albums_cover_fk') then
    alter table public.media_albums
      add constraint media_albums_cover_fk foreign key (cover_id) references public.media_gallery(id) on delete set null;
  end if;
end $$;

-- Lecture publique (comme media_gallery) ; écritures uniquement via le serveur (service_role).
alter table public.media_albums enable row level security;
drop policy if exists "media_albums: lecture publique" on public.media_albums;
create policy "media_albums: lecture publique" on public.media_albums for select to anon, authenticated using (true);
revoke insert, update, delete on public.media_albums from anon, authenticated;
grant select on public.media_albums to anon, authenticated;
grant all on public.media_albums to service_role;

-- Premier album pour les photos existantes non classées.
do $$
declare v_id uuid;
begin
  if exists (select 1 from public.media_gallery where album_id is null) then
    insert into public.media_albums (slug, titre, description)
    values ('photos-d-en-avant', 'Photos d’En Avant', 'Moments de la vie du parti.')
    on conflict (slug) do nothing;
    select id into v_id from public.media_albums where slug = 'photos-d-en-avant';
    update public.media_gallery set album_id = v_id where album_id is null;
    update public.media_albums a set cover_id = (
      select g.id from public.media_gallery g where g.album_id = a.id order by g.created_at desc limit 1
    ) where a.id = v_id and a.cover_id is null;
  end if;
end $$;

notify pgrst, 'reload schema';
