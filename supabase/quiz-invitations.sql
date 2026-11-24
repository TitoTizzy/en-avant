-- Invitations au quiz de la semaine et défis sans question répétée d'une semaine à l'autre.
-- À exécuter une fois dans l'éditeur SQL de Supabase (réexécutable sans risque).

-- 1. Les invitations au quiz passent par le système d'envoi de la newsletter.
alter table public.newsletters add column if not exists type text not null default 'newsletter';
alter table public.newsletters drop constraint if exists newsletters_type_check;
alter table public.newsletters add constraint newsletters_type_check check (type in ('newsletter', 'quiz'));
alter table public.newsletters add column if not exists envoi_auto boolean not null default false;
-- Une seule invitation par semaine de quiz (manuelle ou automatique).
create unique index if not exists newsletters_quiz_semaine_uniq on public.newsletters (semaine) where type = 'quiz';

-- 2. Défi de la semaine : aucune question du défi de la semaine voisine.
-- Tirage du défi d'une semaine : jamais une question du défi de la semaine
-- précédente ni de la suivante (déjà préparée). Si la banque ne suffit pas,
-- on complète avec les autres questions actives plutôt que de bloquer le défi.
create or replace function public.quiz_pick_defi(p_count integer, p_week date)
returns uuid[] language sql volatile set search_path = public as $$
  with voisines as (
    select unnest(question_ids) as id from public.quiz_challenges
     where week_start in (p_week - 7, p_week + 7)
  ), libres as (
    select q.id from public.trivia_questions q
     where q.active and not exists (select 1 from voisines v where v.id = q.id)
     order by random() limit p_count
  ), complement as (
    select q.id from public.trivia_questions q
     where q.active and not exists (select 1 from libres l where l.id = q.id)
     order by random() limit greatest(0, p_count - (select count(*) from libres))
  )
  select coalesce(array_agg(id), '{}') from (select id from libres union all select id from complement) t;
$$;

create or replace function public.quiz_start(p_user uuid, p_mode text, p_duel uuid default null, p_count integer default 15)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ids uuid[]; g public.quiz_games; d public.quiz_duels; ws date; n integer; v_duel uuid;
begin
  if p_user is null or p_mode not in ('libre', 'defi', 'duel') then
    return jsonb_build_object('error', 'Partie invalide.');
  end if;
  n := least(greatest(coalesce(p_count, 15), 5), 30);

  if p_mode = 'defi' then
    ws := public.quiz_week_start();
    select * into g from public.quiz_games where user_id = p_user and mode = 'defi' and week_start = ws;
    if found then
      if g.finished_at is not null then
        return jsonb_build_object('error', 'Défi déjà joué cette semaine.', 'code', 'defi_joue', 'points', g.points);
      end if;
      return jsonb_build_object('game_id', g.id, 'mode', g.mode, 'total', cardinality(g.question_ids),
        'index', g.current_index, 'points', g.points, 'repris', true);
    end if;
    select question_ids into ids from public.quiz_challenges where week_start = ws;
    -- Tirage vérifié AVANT l'enregistrement : un défi vide ou trop court
    -- (banque insuffisante au premier lancement) est retiré dès que possible.
    if ids is null or cardinality(ids) < 5 then
      ids := public.quiz_pick_defi(n, ws);
      if cardinality(ids) < 5 then
        return jsonb_build_object('error', 'Banque de questions insuffisante.');
      end if;
      insert into public.quiz_challenges (week_start, question_ids) values (ws, ids)
        on conflict (week_start) do update set question_ids = excluded.question_ids
        where cardinality(public.quiz_challenges.question_ids) < 5;
      select question_ids into ids from public.quiz_challenges where week_start = ws;
    end if;
  elsif p_mode = 'duel' then
    if p_duel is null then
      ids := public.quiz_pick(n);
      if cardinality(ids) < 5 then return jsonb_build_object('error', 'Banque de questions insuffisante.'); end if;
      insert into public.quiz_duels (creator_id, question_ids) values (p_user, ids) returning * into d;
    else
      select * into d from public.quiz_duels where id = p_duel;
      if not found then return jsonb_build_object('error', 'Duel introuvable.', 'code', 'duel_inconnu'); end if;
      select * into g from public.quiz_games where user_id = p_user and mode = 'duel' and duel_id = d.id;
      if found then
        if g.finished_at is not null then
          return jsonb_build_object('error', 'Vous avez déjà joué ce duel.', 'code', 'duel_joue', 'duel_id', d.id);
        end if;
        return jsonb_build_object('game_id', g.id, 'mode', g.mode, 'duel_id', d.id,
          'total', cardinality(g.question_ids), 'index', g.current_index, 'points', g.points, 'repris', true);
      end if;
      if d.expires_at <= now() then
        return jsonb_build_object('error', 'Ce duel a expiré.', 'code', 'duel_expire');
      end if;
    end if;
    ids := d.question_ids;
    v_duel := d.id;
  else
    ids := public.quiz_pick(n);
  end if;

  if ids is null or cardinality(ids) < 5 then
    return jsonb_build_object('error', 'Banque de questions insuffisante.');
  end if;

  insert into public.quiz_games (user_id, mode, duel_id, week_start, question_ids)
  values (p_user, p_mode, v_duel, ws, ids) returning * into g;
  return jsonb_build_object('game_id', g.id, 'mode', g.mode, 'duel_id', g.duel_id,
    'total', cardinality(ids), 'index', 0, 'points', 0, 'repris', false);
end;
$$;

revoke all on function public.quiz_pick_defi(integer, date) from public, anon, authenticated;
grant execute on function public.quiz_pick_defi(integer, date) to service_role;
revoke all on function public.quiz_start(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.quiz_start(uuid, text, uuid, integer) to service_role;

notify pgrst, 'reload schema';
