-- ============================================================================
-- Relances automatiques « Complétez votre adhésion » — à exécuter une fois
-- dans Supabase (SQL Editor). Idempotent.
--
-- 5 relances maximum par compte sans fiche, une par semaine. Après la 5e,
-- le compte est signalé « à supprimer » au SuperAdmin.
-- ============================================================================

alter table public.profiles
  add column if not exists relance_count integer not null default 0;

-- Une relance manuelle déjà envoyée compte comme la 1re.
update public.profiles
   set relance_count = 1
 where relance_adhesion_at is not null
   and relance_count = 0;

-- Contrôle : doit afficher 1.
select count(*) as colonne_relance_count
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'relance_count';
