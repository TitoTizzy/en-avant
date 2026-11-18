-- ============================================================================
-- Notifications du tableau de bord (cloche 🔔, pastilles, push) — à exécuter
-- une fois dans Supabase (SQL Editor). Idempotent.
-- Accès uniquement par le serveur (service_role) : aucune lecture directe.
-- ============================================================================

create table if not exists public.admin_notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                 -- adhesion, fiche, a_supprimer, don, don_alerte, article
  title       text not null,
  body        text not null default '',
  link        text not null default '',      -- panneau cible, ex. « members:en_attente »
  permission  text,                          -- permission requise ; null = SuperAdmin seulement
  ref_id      text,                          -- évite les doublons (ex. compte à supprimer)
  created_at  timestamptz not null default now()
);

create index if not exists admin_notifications_created_idx
  on public.admin_notifications (created_at desc);

create unique index if not exists admin_notifications_type_ref_unique
  on public.admin_notifications (type, ref_id)
  where ref_id is not null;

create table if not exists public.admin_notification_reads (
  notification_id uuid not null references public.admin_notifications (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.admin_notifications enable row level security;
alter table public.admin_notification_reads enable row level security;
revoke all on public.admin_notifications from public, anon, authenticated;
revoke all on public.admin_notification_reads from public, anon, authenticated;
grant all on public.admin_notifications to service_role;
grant all on public.admin_notification_reads to service_role;

-- Contrôle : doit afficher 2.
select count(*) as tables_notifications
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('admin_notifications', 'admin_notification_reads');
