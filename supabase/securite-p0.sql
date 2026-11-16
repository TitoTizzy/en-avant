-- ============================================================================
-- Sécurité P0 — à exécuter une fois dans Supabase (SQL Editor). Idempotent.
-- ============================================================================

-- 1. Total des dons encaissés, par devise, calculé en base (plus de limite à 5 000 lignes).
create or replace function public.donations_totals()
returns table (devise text, total_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select devise, sum(montant)::bigint
  from public.donations
  where statut = 'completed'
  group by devise
$$;
revoke all on function public.donations_totals() from public, anon, authenticated;
grant execute on function public.donations_totals() to service_role;

-- 2. Quota de génération IA du trivia (voir api/_trivia/generate-session.js).
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_kind_created_idx on public.ai_usage (user_id, kind, created_at);
create index if not exists ai_usage_kind_created_idx on public.ai_usage (kind, created_at);
alter table public.ai_usage enable row level security;
-- Aucune politique : seul le service_role (serveur) lit et écrit.

-- Réservation atomique d'un appel IA : vérifie les quotas (par utilisateur et
-- global, sur 24 h glissantes) et enregistre l'appel dans la même transaction.
-- Retourne true si l'appel est autorisé.
create or replace function public.ai_usage_reserve(
  p_user uuid, p_kind text, p_user_limit int, p_global_limit int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n_user int;
  n_global int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage:' || p_kind));
  select count(*) into n_global from ai_usage
    where kind = p_kind and created_at > now() - interval '24 hours';
  select count(*) into n_user from ai_usage
    where kind = p_kind and user_id = p_user and created_at > now() - interval '24 hours';
  if n_global >= p_global_limit or n_user >= p_user_limit then
    return false;
  end if;
  insert into ai_usage (user_id, kind) values (p_user, p_kind);
  return true;
end;
$$;
revoke all on function public.ai_usage_reserve(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.ai_usage_reserve(uuid, text, int, int) to service_role;
