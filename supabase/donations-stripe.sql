-- ============================================================================
-- Dons Stripe : dons uniques + mensuels, remboursements et litiges.
-- À exécuter une fois dans Supabase (SQL Editor), APRÈS schema.sql.
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================================

alter table public.donations add column if not exists frequence text;
alter table public.donations add column if not exists nom  text;
alter table public.donations add column if not exists pays text;  -- code ISO à 2 lettres

alter table public.donations drop constraint if exists donations_frequence_check;
alter table public.donations add constraint donations_frequence_check
  check (frequence is null or frequence in ('unique', 'mensuel'));

alter table public.donations drop constraint if exists donations_statut_check;
alter table public.donations add constraint donations_statut_check
  check (statut in ('completed', 'pending', 'refunded', 'failed', 'disputed'));

-- Suivi du plafond annuel par donateur (loi haïtienne de 2014 sur les partis).
create index if not exists donations_email_created_idx
  on public.donations (lower(email), created_at);

-- Rappel : aucune politique RLS de lecture. Seul le service_role (serveur) lit
-- et écrit cette table. Ne jamais l'exposer via la clé anon.
