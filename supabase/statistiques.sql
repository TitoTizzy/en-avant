-- Statistiques de l'assistant du site : nombre de questions par jour et par langue
-- (aucun contenu de question, aucune donnée personnelle). Réexécutable sans risque.
create table if not exists public.chat_stats (
  day date not null,
  langue text not null check (langue in ('fr', 'en', 'ht', 'es')),
  questions integer not null default 0,
  primary key (day, langue)
);
alter table public.chat_stats enable row level security;
revoke all on public.chat_stats from public, anon, authenticated;
grant all on public.chat_stats to service_role;

create or replace function public.chat_stats_add(p_langue text)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.chat_stats (day, langue, questions)
  values ((now() at time zone 'America/Port-au-Prince')::date, p_langue, 1)
  on conflict (day, langue) do update set questions = public.chat_stats.questions + 1;
$$;
revoke all on function public.chat_stats_add(text) from public, anon, authenticated;
grant execute on function public.chat_stats_add(text) to service_role;

notify pgrst, 'reload schema';
