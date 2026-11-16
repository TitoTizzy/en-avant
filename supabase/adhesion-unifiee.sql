-- ============================================================================
-- Adhésion unifiée — à exécuter une fois dans Supabase (SQL Editor). Idempotent.
--
-- Un seul formulaire (/adherer) crée à la fois le compte de connexion et la
-- fiche d'adhésion. L'accès à l'espace membre n'est ouvert qu'après approbation
-- de la fiche dans le tableau de bord.
-- ============================================================================

-- 1. Nouveau rôle « pending » : compte créé, adhésion pas encore approuvée.
--    Aucune route serveur n'accepte ce rôle → pas d'accès à l'espace membre.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('superadmin', 'editor', 'readonly', 'member', 'pending'));

-- Tout compte créé sans rôle explicite démarre en « pending ».
-- (Ferme la porte aux inscriptions faites directement auprès de Supabase avec
-- la clé publique : elles n'ouvrent plus aucun accès.)
alter table public.profiles alter column role set default 'pending';

-- Date de la dernière relance « complétez votre adhésion » (anti-doublon).
alter table public.profiles add column if not exists relance_adhesion_at timestamptz;

-- 2. Lien entre une fiche d'adhésion et le compte de connexion.
alter table public.members
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create unique index if not exists members_user_id_unique
  on public.members (user_id)
  where user_id is not null;

-- 3. Réglages du site (corrige l'erreur « site_settings introuvable » de l'admin).
create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch
  before update on public.site_settings
  for each row execute function public.ea_touch_updated_at();

alter table public.site_settings enable row level security;
revoke all on public.site_settings from public;
grant select on public.site_settings to anon, authenticated;
grant select, insert, update, delete on public.site_settings to service_role;

drop policy if exists "settings: lecture publique" on public.site_settings;
create policy "settings: lecture publique"
  on public.site_settings for select
  to anon, authenticated
  using (true);

insert into public.site_settings (key, value) values
  ('popup_video', jsonb_build_object(
      'enabled', true,
      'url', 'https://www.tiktok.com/@jerrytardieu/video/7650257755273563412',
      'headline', 'En Avant — Pour changer Haïti ensemble',
      'subtext', 'Découvrez notre vision en 15 secondes.'
   )),
  ('popup_football', jsonb_build_object(
      'enabled', true,
      'intervalSec', 60
   ))
on conflict (key) do nothing;

-- Contrôle : doit afficher « pending » puis 1.
select column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'role';
select count(*) as colonne_user_id from information_schema.columns
 where table_schema = 'public' and table_name = 'members' and column_name = 'user_id';
