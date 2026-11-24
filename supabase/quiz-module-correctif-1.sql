-- ============================================================================
-- Module Quiz — correctif n° 1 (retour de revue Codex, novembre 2026)
-- À exécuter UNE FOIS sur une base où quiz-module.sql a déjà été appliqué.
-- Réexécutable sans risque. (Une nouvelle installation n'a besoin que de
-- quiz-module.sql, qui contient déjà ces corrections.)
--
--   1. Défi de la semaine : tirage vérifié avant l'enregistrement ; un défi
--      vide ou trop court déjà enregistré est remplacé.
--   2. Partie en cours : la question est figée à son affichage (current_q) ;
--      une modification administrative ne change plus la correction.
-- ============================================================================
begin;

alter table public.quiz_games add column if not exists current_q jsonb;

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
      ids := public.quiz_pick(n);
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

create or replace function public.quiz_next(p_game uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.quiz_games; q public.trivia_questions; total integer; opts jsonb;
begin
  select * into g from public.quiz_games where id = p_game and user_id = p_user for update;
  if not found then return jsonb_build_object('error', 'Partie introuvable.'); end if;
  total := cardinality(g.question_ids);
  if g.finished_at is not null or g.current_index >= total then
    return jsonb_build_object('finished', true, 'points', g.points);
  end if;
  if g.shown_at is not null and g.current_q is not null then
    -- Question déjà affichée : on réaffiche la version figée.
    q := jsonb_populate_record(null::public.trivia_questions, g.current_q);
  else
    select * into q from public.trivia_questions where id = g.question_ids[g.current_index + 1];
  end if;
  if q.id is null then
    -- Question supprimée entre-temps : on la saute sans pénalité.
    insert into public.quiz_answers (game_id, idx, user_id, question_id, correct, timed_out, points)
      values (g.id, g.current_index, p_user, g.question_ids[g.current_index + 1], false, false, 0)
      on conflict do nothing;
    update public.quiz_games set current_index = current_index + 1, shown_at = null, current_q = null,
      finished_at = case when current_index + 1 >= total then now() end
      where id = g.id;
    return public.quiz_next(p_game, p_user);
  end if;
  if g.shown_at is null or g.current_q is null then
    update public.quiz_games set shown_at = coalesce(shown_at, now()), current_q = to_jsonb(q)
      where id = g.id returning * into g;
  end if;
  opts := case when q.format = 'chiffre' then '[]'::jsonb else q.options end;
  return jsonb_build_object(
    'index', g.current_index, 'total', total, 'points', g.points, 'streak', g.streak,
    'question', q.question, 'format', q.format, 'options', opts, 'chantier', q.chantier,
    'image_id', q.image_id, 'difficulte', q.difficulte,
    'meta', q.meta - 'tolerance',
    'elapsed_ms', greatest(0, floor(extract(epoch from (now() - g.shown_at)) * 1000))::integer
  );
end;
$$;

create or replace function public.quiz_answer(p_game uuid, p_user uuid, p_index integer, p_answer text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.quiz_games; q public.trivia_questions; total integer;
  elapsed numeric; timed_out boolean; ok boolean; is_fast boolean; pts integer := 0; s integer;
  done boolean;
begin
  select * into g from public.quiz_games where id = p_game and user_id = p_user for update;
  if not found then return jsonb_build_object('error', 'Partie introuvable.'); end if;
  total := cardinality(g.question_ids);
  if g.finished_at is not null then return jsonb_build_object('error', 'Partie terminée.'); end if;
  if p_index is distinct from g.current_index or g.shown_at is null then
    return jsonb_build_object('error', 'Question non affichée ou déjà répondue.');
  end if;
  -- Correction selon la version affichée au joueur, pas la version actuelle de la banque.
  if g.current_q is not null then
    q := jsonb_populate_record(null::public.trivia_questions, g.current_q);
  else
    select * into q from public.trivia_questions where id = g.question_ids[g.current_index + 1];
  end if;

  elapsed := extract(epoch from (now() - g.shown_at));
  -- 15 s de chrono + 2 s de tolérance réseau.
  timed_out := p_answer is null or elapsed > 17;
  ok := not timed_out and coalesce(public.quiz_is_correct(q.format, q.correct_answer, q.meta, p_answer), false);
  is_fast := ok and elapsed <= 5.5;
  s := case when ok then g.streak + 1 else 0 end;
  if ok then
    pts := 10 + case when is_fast then 5 else 0 end + case when s >= 3 then 2 * (s - 2) else 0 end;
  end if;
  done := g.current_index + 1 >= total;

  insert into public.quiz_answers (game_id, idx, user_id, question_id, chantier, correct, fast, timed_out, ms, points)
  values (g.id, g.current_index, p_user, q.id, q.chantier, ok, is_fast, timed_out,
          least(floor(elapsed * 1000), 2147483647)::integer, pts);

  update public.quiz_games set
    current_index = current_index + 1, shown_at = null, current_q = null, streak = s,
    best_streak = greatest(best_streak, s), correct = correct + (case when ok then 1 else 0 end),
    fast = fast + (case when is_fast then 1 else 0 end), points = points + pts,
    finished_at = case when done then now() else null end
  where id = g.id returning * into g;

  return jsonb_build_object(
    'correct', ok, 'timed_out', timed_out, 'fast', is_fast, 'points_gagnes', pts,
    'streak', g.streak, 'points', g.points, 'correct_answer', q.correct_answer,
    'explication', q.explication, 'source', q.source_livre_blanc,
    'finished', done, 'bonnes', g.correct, 'total', total, 'meilleure_serie', g.best_streak
  );
end;
$$;

-- Défis déjà enregistrés vides ou trop courts : supprimés (aucune partie ne peut
-- y être rattachée, quiz_start refusait de les lancer).
delete from public.quiz_challenges where cardinality(question_ids) < 5;

commit;
