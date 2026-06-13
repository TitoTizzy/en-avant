-- EN AVANT — Organigramme éditable depuis le Dashboard SuperAdmin
-- À exécuter une seule fois dans Supabase SQL Editor.
-- Crée la table `team_members` + RLS + insère les 30 cartes actuelles
-- (seed exécuté uniquement si la table est vide : ré-exécution sans risque).

create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  section     text not null check (section in (
                'coordination-nationale',
                'conseil-strategique',
                'coordonnateurs-adjoints',
                'coordonnateurs-departementaux',
                'branches-exterieures'
              )),
  nom         text,            -- null = poste vacant (la carte affiche le poste seul)
  poste       text,            -- ex. « Sud », « Questions Féminines »
  photo_url   text,            -- URL publique (bucket assets/equipe/…)
  ordre       integer not null default 0,
  updated_at  timestamptz not null default now()
);

create index if not exists team_members_section_idx
  on public.team_members (section, ordre);

drop trigger if exists team_members_touch on public.team_members;
create trigger team_members_touch
  before update on public.team_members
  for each row execute function public.ea_touch_updated_at();

alter table public.team_members enable row level security;

revoke all on public.team_members from public;
grant select on public.team_members to anon, authenticated;
grant select, insert, update, delete on public.team_members to service_role;

-- L'organigramme est public en lecture ; l'écriture passe par /api/admin/team
-- (service_role + session SuperAdmin + PIN). Le superadmin authentifié peut
-- aussi gérer depuis le Dashboard Supabase.
drop policy if exists "team: lecture publique" on public.team_members;
create policy "team: lecture publique"
  on public.team_members for select
  to anon, authenticated
  using (true);

drop policy if exists "team: gestion superadmin" on public.team_members;

-- ----------------------------------------------------------------------------
-- SEED : reflète l'organigramme statique actuel (30 cartes).
-- Ne s'exécute que si la table est vide.
-- ----------------------------------------------------------------------------
insert into public.team_members (section, nom, poste, ordre)
select * from (values
  ('coordination-nationale', 'Saint-Jean JOSEPH', null, 1),
  ('coordination-nationale', 'Frantz AZEMAR',     null, 2),
  ('coordination-nationale', 'Nancy VILCE',       null, 3),

  ('conseil-strategique', 'Jerry TARDIEU', 'Président du Conseil Stratégique', 1),

  ('coordonnateurs-adjoints', null, 'Branches Extérieures',     1),
  ('coordonnateurs-adjoints', null, 'Questions Féminines',      2),
  ('coordonnateurs-adjoints', null, 'Questions Politiques',     3),
  ('coordonnateurs-adjoints', null, 'Questions Jeunesse',       4),
  ('coordonnateurs-adjoints', null, 'Questions Financières',    5),
  ('coordonnateurs-adjoints', null, 'Branches Départementales', 6),

  ('coordonnateurs-departementaux', null, 'Sud',         1),
  ('coordonnateurs-departementaux', null, 'Nord',        2),
  ('coordonnateurs-departementaux', null, 'Ouest',       3),
  ('coordonnateurs-departementaux', null, 'Nippes',      4),
  ('coordonnateurs-departementaux', null, 'Grande-Anse', 5),
  ('coordonnateurs-departementaux', null, 'Nord-Est',    6),
  ('coordonnateurs-departementaux', null, 'Nord-Ouest',  7),
  ('coordonnateurs-departementaux', null, 'Sud-Est',     8),
  ('coordonnateurs-departementaux', null, 'Centre',      9),
  ('coordonnateurs-departementaux', null, 'Artibonite',  10),

  ('branches-exterieures', null, 'Massachusetts',          1),
  ('branches-exterieures', null, 'Europe',                 2),
  ('branches-exterieures', null, 'République Dominicaine', 3),
  ('branches-exterieures', null, 'Floride',                4),
  ('branches-exterieures', null, 'Connecticut',            5),
  ('branches-exterieures', null, 'Georgia',                6),
  ('branches-exterieures', null, 'New-York 1',             7),
  ('branches-exterieures', null, 'New-York 2',             8),
  ('branches-exterieures', null, 'Canada',                 9),
  ('branches-exterieures', null, 'Amérique du Sud',        10)
) as seed(section, nom, poste, ordre)
where not exists (select 1 from public.team_members);

-- Contrôle : doit retourner 5 sections / 30 lignes au premier passage.
select section, count(*) as cartes
from public.team_members
group by section
order by section;
