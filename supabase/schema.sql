-- ============================================================================
-- EN AVANT — SCHÉMA SUPABASE (PostgreSQL)
-- À exécuter dans : Supabase Dashboard > SQL Editor (une seule fois).
--
-- Conforme au DAT (Branche 4) :
--   · 8 tables : articles, members, donations, trivia_questions, trivia_scores,
--     events, media_gallery, leads_livreblanc (+ profiles pour les rôles).
--   · RLS stricte : les tables sensibles (members, donations, leads) n'ont
--     AUCUN accès anon direct — toutes les écritures passent par les routes
--     /api/* (service_role). Le DAT mentionnait "INSERT public" pour members :
--     arbitrage sécurité → l'INSERT public se fait via /api/members (validation
--     serveur), jamais via la clé anon, ce qui satisfait aussi la règle
--     "zéro accès anon direct" du même document.
--   · 3 buckets Storage : assets (public), documents (privé),
--     uploads-admin (privé).
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Sécurité par défaut : aucune nouvelle table/fonction du schéma public ne
-- devient accessible à l'API automatiquement. Les droits utiles sont accordés
-- explicitement à la fin de cette migration.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- ============================================================================
-- 0. PROFILS & RÔLES (Supabase Auth → Dashboard Admin)
--    Rôles DAT : superadmin (tout), editor (articles), readonly (analytics).
--    Le SuperAdmin utilise email/identifiant + mot de passe + PIN serveur.
-- ============================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'readonly'
              check (role in ('superadmin', 'editor', 'readonly')),
  nom         text,
  username    extensions.citext,
  email       extensions.citext,
  pin_hash    text,
  created_at  timestamptz not null default now()
);

alter table public.profiles add column if not exists username extensions.citext;
alter table public.profiles add column if not exists email extensions.citext;
alter table public.profiles add column if not exists pin_hash text;

create unique index if not exists profiles_username_unique
  on public.profiles (username)
  where username is not null;

alter table public.profiles enable row level security;

-- Création automatique d'un profil (readonly) à chaque inscription Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nom, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', new.email),
    nullif(new.raw_user_meta_data ->> 'username', ''),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers de rôle (SECURITY DEFINER pour être utilisables dans les policies).
create or replace function public.ea_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.ea_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  -- Les opérations SuperAdmin passent par /api avec service_role après PIN.
  -- Un JWT frontend normal ne reçoit jamais ce claim.
  select coalesce(
    public.ea_role() = 'superadmin'
    and (auth.jwt() -> 'app_metadata' ->> 'pin_verified') = 'true',
    false
  );
$$;

create or replace function public.ea_is_editor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.ea_role() = 'editor' or public.ea_is_admin(), false);
$$;

create or replace function public.ea_verify_pin(target_user_id uuid, candidate_pin text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = target_user_id
        and role = 'superadmin'
        and pin_hash is not null
        and pin_hash = extensions.crypt(candidate_pin, pin_hash)
    ),
    false
  );
$$;

create or replace function public.ea_change_pin(
  target_user_id uuid,
  current_pin text,
  new_pin text
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if new_pin !~ '^[0-9]{4,8}$' then
    return false;
  end if;

  update public.profiles
  set pin_hash = extensions.crypt(
    new_pin,
    extensions.gen_salt('bf', 12)
  )
  where id = target_user_id
    and role = 'superadmin'
    and pin_hash is not null
    and pin_hash = extensions.crypt(current_pin, pin_hash);

  return found;
end;
$$;

drop policy if exists "profiles: lire son propre profil" on public.profiles;
create policy "profiles: lire son propre profil"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles: superadmin gère les rôles" on public.profiles;

-- ============================================================================
-- 1. ARTICLES (Blog / Actualités — filtrage AJAX par catégorie)
-- ============================================================================

create table if not exists public.articles (
  id            uuid primary key default gen_random_uuid(),
  titre         text not null check (char_length(titre) between 3 and 200),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{3,120}$'),
  contenu       text not null,
  excerpt       text,
  categorie     text not null default 'actualite',
  image_url     text,
  published     boolean not null default false,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists articles_categorie_idx
  on public.articles (categorie, published_at desc);
create index if not exists articles_published_idx
  on public.articles (published, published_at desc);

create or replace function public.ea_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists articles_touch on public.articles;
create trigger articles_touch
  before update on public.articles
  for each row execute function public.ea_touch_updated_at();

alter table public.articles enable row level security;

-- SELECT public uniquement sur le contenu publié (DAT).
drop policy if exists "articles: lecture publique si publié" on public.articles;
create policy "articles: lecture publique si publié"
  on public.articles for select
  to anon, authenticated
  using (published = true);

-- INSERT/UPDATE/DELETE réservés aux rôles admin/editor (DAT).
drop policy if exists "articles: écriture editor/admin" on public.articles;

-- ============================================================================
-- 2. MEMBERS (Adhérents — formulaire /api/members)
--    RLS activée, AUCUNE policy anon : seules les routes Node.js (service_role)
--    écrivent ; seuls les admins authentifiés lisent.
-- ============================================================================

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null check (char_length(nom) between 2 and 120),
  sexe        text not null check (sexe in ('femme', 'homme', 'autre')),
  -- NINU : Numéro d'Identification Nationale Unique (carte ONI, 10 chiffres).
  -- Indispensable à la vérification des candidatures par le comité d'éthique.
  ninu        text not null check (ninu ~ '^[0-9]{10}$'),
  email       text not null check (char_length(email) <= 160),
  telephone   text not null check (char_length(telephone) <= 25),
  ville       text not null check (char_length(ville) between 2 and 80),
  consent     boolean not null default false,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now()
);

-- Migration sûre si `members` existait avant l'ajout du NINU.
-- La colonne reste nullable pour les anciennes lignes ; toutes les nouvelles
-- candidatures sont contrôlées par /api/members et fournissent 10 chiffres.
alter table public.members
  add column if not exists ninu text check (ninu ~ '^[0-9]{10}$');

-- Sur une ancienne table, `NOT VALID` n'inspecte pas les lignes historiques,
-- mais impose immédiatement le NINU à toute nouvelle insertion/mise à jour.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.members'::regclass
      and conname = 'members_ninu_required'
  ) then
    alter table public.members
      add constraint members_ninu_required check (ninu is not null) not valid;
  end if;
end;
$$;

create unique index if not exists members_email_unique
  on public.members (lower(email));

-- Un NINU = une seule candidature.
create unique index if not exists members_ninu_unique
  on public.members (ninu);

alter table public.members enable row level security;

drop policy if exists "members: lecture superadmin" on public.members;
drop policy if exists "members: gestion superadmin" on public.members;

-- ============================================================================
-- 3. DONATIONS (Log des paiements — alimentée par le webhook Stripe)
--    INSERT via service_role uniquement (webhook). SELECT restreint admin.
-- ============================================================================

create table if not exists public.donations (
  id              uuid primary key default gen_random_uuid(),
  montant         integer not null check (montant > 0),  -- en centimes
  devise          text not null default 'usd',
  provider        text not null default 'stripe'
                  check (provider in ('stripe', 'moncash', 'paypal')),
  transaction_id  text not null unique,
  email           text,
  statut          text not null default 'completed'
                  check (statut in ('completed', 'pending', 'refunded', 'failed')),
  created_at      timestamptz not null default now()
);

alter table public.donations enable row level security;

drop policy if exists "donations: lecture superadmin" on public.donations;

-- ============================================================================
-- 4. TRIVIA_QUESTIONS (Quiz viral — générées par /api/trivia/generate)
--    SELECT public (le frontend lit via la clé anon). INSERT service_role only.
-- ============================================================================

create table if not exists public.trivia_questions (
  id                  uuid primary key default gen_random_uuid(),
  question            text not null,
  options             jsonb not null,        -- ["A", "B", "C", "D"]
  correct_answer      text not null,
  explication         text,
  source_livre_blanc  text,                  -- extrait/section du Livre Blanc
  created_at          timestamptz not null default now(),
  constraint options_est_un_tableau check (jsonb_typeof(options) = 'array')
);

alter table public.trivia_questions enable row level security;

drop policy if exists "trivia_questions: lecture publique" on public.trivia_questions;
create policy "trivia_questions: lecture publique"
  on public.trivia_questions for select
  to anon, authenticated
  using (true);

drop policy if exists "trivia_questions: gestion superadmin" on public.trivia_questions;

-- ============================================================================
-- 5. TRIVIA_SCORES (Classement & viralité — jeu public, joueurs anonymes)
-- ============================================================================

create table if not exists public.trivia_scores (
  id            uuid primary key default gen_random_uuid(),
  user_session  text not null check (char_length(user_session) between 8 and 80),
  pseudo        text check (char_length(pseudo) <= 40),
  score         integer not null check (score >= 0),
  total         integer not null check (total between 1 and 50),
  completed_at  timestamptz not null default now(),
  constraint score_coherent check (score <= total)
);

create index if not exists trivia_scores_top_idx
  on public.trivia_scores (score desc, completed_at desc);

alter table public.trivia_scores enable row level security;

-- Jeu public : enregistrement du score et lecture du classement via la clé anon.
drop policy if exists "trivia_scores: insertion publique" on public.trivia_scores;

drop policy if exists "trivia_scores: lecture publique" on public.trivia_scores;
create policy "trivia_scores: lecture publique"
  on public.trivia_scores for select
  to anon, authenticated
  using (true);

-- ============================================================================
-- 6. EVENTS (Compte à rebours & agenda politique)
-- ============================================================================

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  titre       text not null check (char_length(titre) between 3 and 160),
  date_cible  timestamptz not null,
  lieu        text,
  description text,
  created_at  timestamptz not null default now()
);

create index if not exists events_date_idx on public.events (date_cible);

alter table public.events enable row level security;

drop policy if exists "events: lecture publique" on public.events;
create policy "events: lecture publique"
  on public.events for select
  to anon, authenticated
  using (true);

drop policy if exists "events: écriture editor/admin" on public.events;

-- ============================================================================
-- 7. MEDIA_GALLERY (Galerie photos/vidéos)
-- ============================================================================

create table if not exists public.media_gallery (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  caption     text,
  type        text not null default 'photo' check (type in ('photo', 'video')),
  created_at  timestamptz not null default now()
);

alter table public.media_gallery enable row level security;

drop policy if exists "media_gallery: lecture publique" on public.media_gallery;
create policy "media_gallery: lecture publique"
  on public.media_gallery for select
  to anon, authenticated
  using (true);

drop policy if exists "media_gallery: écriture editor/admin" on public.media_gallery;

-- ============================================================================
-- 8. LEADS_LIVREBLANC (Lead Magnet — formulaire /api/leads-livreblanc)
--    RLS activée, zéro accès anon : écritures via service_role, lecture admin.
-- ============================================================================

create table if not exists public.leads_livreblanc (
  id             uuid primary key default gen_random_uuid(),
  nom            text not null check (char_length(nom) between 2 and 120),
  sexe           text check (sexe in ('femme', 'homme', 'autre')),
  email          text not null check (char_length(email) <= 160),
  telephone      text check (char_length(telephone) <= 25),
  ville          text check (char_length(ville) <= 80),
  downloaded_at  timestamptz not null default now()
);

create index if not exists leads_livreblanc_email_idx
  on public.leads_livreblanc (lower(email));

alter table public.leads_livreblanc enable row level security;

drop policy if exists "leads: lecture superadmin" on public.leads_livreblanc;

-- ============================================================================
-- 9. STORAGE — BUCKETS
--    · assets        (public)  : images articles, photos galerie
--    · documents     (privé)   : Livre Blanc source (PDF + TXT pour le Trivia)
--    · uploads-admin (privé)   : médias uploadés par les éditeurs
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('assets', 'assets', true),
  ('documents', 'documents', false),
  ('uploads-admin', 'uploads-admin', false)
on conflict (id) do nothing;

-- Lecture publique du bucket d'assets (URLs servies par le CDN Supabase).
drop policy if exists "storage: lecture publique assets+tts" on storage.objects;
drop policy if exists "storage: lecture publique assets" on storage.objects;
create policy "storage: lecture publique assets"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'assets');

-- Les éditeurs/admins peuvent gérer les médias depuis le Dashboard Admin.
drop policy if exists "storage: upload editor/admin" on storage.objects;
drop policy if exists "storage: maj editor/admin" on storage.objects;
drop policy if exists "storage: suppression editor/admin" on storage.objects;

-- Le bucket `documents` (Livre Blanc) : lecture superadmin côté Dashboard.
-- (Les routes /api y accèdent via service_role, qui bypasse la RLS.
drop policy if exists "storage: documents superadmin" on storage.objects;

-- ============================================================================
-- 10. PRIVILÈGES DATA API EXPLICITES
--     Les GRANT ouvrent l'objet ; les policies RLS limitent ensuite les lignes.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Visiteurs : uniquement les données publiques prévues par le DAT.
grant select on table
  public.articles,
  public.trivia_questions,
  public.events,
  public.media_gallery
to anon;

grant select on table public.trivia_scores to anon;

-- Utilisateurs connectés : les policies décident selon le rôle.
-- Le hash PIN n'est jamais lisible depuis le frontend.
grant select (id, role, nom, username, email, created_at)
  on table public.profiles to authenticated;
grant select on table public.articles to authenticated;
grant select on table public.trivia_questions to authenticated;
grant select on table public.trivia_scores to authenticated;
grant select on table public.events to authenticated;
grant select on table public.media_gallery to authenticated;

-- Les fonctions Vercel utilisent exclusivement la clé service_role.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Fonctions internes utilisées par les policies. Les fonctions de trigger ne
-- sont pas exposées comme RPC publiques.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.ea_touch_updated_at() from public, anon, authenticated;
revoke all on function public.ea_role() from public, anon;
revoke all on function public.ea_is_admin() from public, anon;
revoke all on function public.ea_is_editor() from public, anon;
revoke all on function public.ea_verify_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.ea_change_pin(uuid, text, text) from public, anon, authenticated;

grant execute on function public.ea_role() to service_role;
grant execute on function public.ea_is_admin() to service_role;
grant execute on function public.ea_is_editor() to service_role;
grant execute on function public.ea_verify_pin(uuid, text) to service_role;
grant execute on function public.ea_change_pin(uuid, text, text) to service_role;

-- ============================================================================
-- 11. APRÈS EXÉCUTION — étapes manuelles
--   1) Créer le compte SuperAdmin : Authentication > Users > Add user.
--   2) Définir son identifiant et son PIN (remplacer les valeurs) :
--      update public.profiles
--      set role = 'superadmin',
--          username = 'TitoTizzy',
--          pin_hash = extensions.crypt(
--            'VOTRE_PIN',
--            extensions.gen_salt('bf', 12)
--          )
--      where id = '<uuid-auth>';
--   3) Uploader dans `documents` : livre-blanc.pdf + livre-blanc.txt
--      (texte brut utilisé par /api/trivia/generate).
-- ============================================================================
