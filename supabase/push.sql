-- ============================================================================
-- Notifications push (navigateur / téléphone) — à exécuter une fois dans
-- Supabase (SQL Editor). Idempotent. Accès serveur uniquement (service_role).
-- ============================================================================

-- Clés VAPID générées automatiquement par le serveur au premier usage.
create table if not exists public.push_config (
  id          smallint primary key default 1 check (id = 1),
  public_key  text not null,
  private_key text not null,
  created_at  timestamptz not null default now()
);

-- Un abonnement par appareil / navigateur.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_config enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_config from public, anon, authenticated;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant all on public.push_config to service_role;
grant all on public.push_subscriptions to service_role;

-- Contrôle : doit afficher 2.
select count(*) as tables_push
  from information_schema.tables
 where table_schema = 'public' and table_name in ('push_config', 'push_subscriptions');
