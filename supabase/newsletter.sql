-- ============================================================================
-- Newsletter hebdomadaire + géographie des adhérents — En Avant
-- Réexécutable sans risque.
--
--   · members : pays et département (Haïti) en plus de la ville.
--   · newsletter_subscribers : inscriptions publiques (formulaire /newsletter).
--   · newsletter_optouts : toute adresse désinscrite (adhérent ou abonné).
--   · newsletter_tokens : jeton de désinscription par adresse (aucun secret).
--   · newsletters + newsletter_deliveries : envois suivis destinataire par
--     destinataire, reprenables, jamais envoyés deux fois.
--   · Tout est fermé à anon/authenticated : accès par les routes /api.
-- ============================================================================
begin;

-- 1. Géographie des fiches d'adhésion ----------------------------------------
alter table public.members
  add column if not exists pays text,
  add column if not exists departement text;
alter table public.members drop constraint if exists members_pays_check;
alter table public.members add constraint members_pays_check
  check (pays is null or char_length(pays) between 2 and 60);
alter table public.members drop constraint if exists members_departement_check;
alter table public.members add constraint members_departement_check
  check (departement is null or departement in ('Artibonite', 'Centre', 'Grand’Anse', 'Nippes', 'Nord',
    'Nord-Est', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Est'));
create index if not exists members_geo_idx on public.members (pays, departement);

-- 2. Abonnés, désinscriptions, jetons ----------------------------------------
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 5 and 160),
  nom text check (nom is null or char_length(nom) <= 120),
  pays text check (pays is null or char_length(pays) between 2 and 60),
  departement text check (departement is null or departement in ('Artibonite', 'Centre', 'Grand’Anse',
    'Nippes', 'Nord', 'Nord-Est', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Est')),
  ville text check (ville is null or char_length(ville) <= 80),
  source text not null default 'formulaire',
  consent_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists newsletter_subscribers_email_idx on public.newsletter_subscribers (lower(email));

create table if not exists public.newsletter_optouts (
  email text primary key check (email = lower(email)),
  source text not null default 'lien',
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_tokens (
  email text primary key check (email = lower(email)),
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- 3. Newsletters et envois ---------------------------------------------------
create table if not exists public.newsletters (
  id uuid primary key default gen_random_uuid(),
  sujet text not null check (char_length(sujet) between 3 and 150),
  apercu text check (apercu is null or char_length(apercu) <= 200),
  contenu text not null default '',
  evenement_id uuid references public.events(id) on delete set null,
  cta_label text check (cta_label is null or char_length(cta_label) <= 60),
  cta_url text check (cta_url is null or cta_url ~ '^https://'),
  filtres jsonb not null default '{}'::jsonb,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'en_cours', 'envoyee')),
  semaine date,
  destinataires integer not null default 0,
  envoyes integer not null default 0,
  echecs integer not null default 0,
  forcee boolean not null default false,
  created_by uuid,
  envoyee_par uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  sent_at timestamptz
);
create index if not exists newsletters_semaine_idx on public.newsletters (semaine) where statut <> 'brouillon';

create table if not exists public.newsletter_deliveries (
  newsletter_id uuid not null references public.newsletters(id) on delete cascade,
  email text not null check (email = lower(email)),
  nom text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'envoi', 'envoye', 'echec')),
  tentatives integer not null default 0,
  erreur text,
  claimed_at timestamptz,
  sent_at timestamptz,
  primary key (newsletter_id, email)
);
create index if not exists newsletter_deliveries_todo_idx
  on public.newsletter_deliveries (newsletter_id, statut);

-- Réserve un lot de destinataires à envoyer (deux appels simultanés ne
-- reçoivent jamais les mêmes adresses ; un lot bloqué plus de 5 min est repris).
create or replace function public.newsletter_claim(p_newsletter uuid, p_count integer)
returns table (email text, nom text)
language sql volatile security definer set search_path = public as $$
  update public.newsletter_deliveries d
     set statut = 'envoi', claimed_at = now(), tentatives = d.tentatives + 1
   where (d.newsletter_id, d.email) in (
     select x.newsletter_id, x.email from public.newsletter_deliveries x
      where x.newsletter_id = p_newsletter
        and (x.statut = 'en_attente' or (x.statut = 'envoi' and x.claimed_at < now() - interval '5 minutes'))
      order by x.email
      limit greatest(1, least(p_count, 100))
      for update skip locked)
  returning d.email, d.nom;
$$;

-- Compteurs d'un envoi (recalculés, jamais incrémentés à la main).
create or replace function public.newsletter_progress(p_newsletter uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'destinataires', count(*),
    'envoyes', count(*) filter (where statut = 'envoye'),
    'echecs', count(*) filter (where statut = 'echec'),
    'restants', count(*) filter (where statut in ('en_attente', 'envoi')))
  from public.newsletter_deliveries where newsletter_id = p_newsletter;
$$;

-- 4. Sécurité -----------------------------------------------------------------
alter table public.newsletter_subscribers enable row level security;
alter table public.newsletter_optouts enable row level security;
alter table public.newsletter_tokens enable row level security;
alter table public.newsletters enable row level security;
alter table public.newsletter_deliveries enable row level security;
revoke all on public.newsletter_subscribers, public.newsletter_optouts, public.newsletter_tokens,
  public.newsletters, public.newsletter_deliveries from public, anon, authenticated;
grant all on public.newsletter_subscribers, public.newsletter_optouts, public.newsletter_tokens,
  public.newsletters, public.newsletter_deliveries to service_role;
revoke all on function public.newsletter_claim(uuid, integer), public.newsletter_progress(uuid)
  from public, anon, authenticated;
grant execute on function public.newsletter_claim(uuid, integer), public.newsletter_progress(uuid) to service_role;

commit;
