-- EN AVANT — Réglages globaux du site (key/value JSONB)
-- À exécuter une seule fois dans Supabase SQL Editor.
-- Sert pour : popups (vidéo + soutien Grenadiers), infos de contact, etc.
-- Lecture publique (anon) ; écriture réservée au service_role via /api/admin/settings.

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

-- Les réglages sont publics en lecture (le frontend les lit via l'anon key) ;
-- l'écriture passe par /api/admin/settings (service_role + SuperAdmin + PIN).
drop policy if exists "settings: lecture publique" on public.site_settings;
create policy "settings: lecture publique"
  on public.site_settings for select
  to anon, authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- SEED : valeurs par défaut des deux popups (ne s'exécute que si absent).
-- ----------------------------------------------------------------------------
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

-- Contrôle
select key, value from public.site_settings order by key;
