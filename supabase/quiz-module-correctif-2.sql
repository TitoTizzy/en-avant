-- ============================================================================
-- Module Quiz — correctif n° 2 (novembre 2026)
-- À exécuter UNE FOIS sur une base où quiz-module.sql et le correctif n° 1 ont
-- été appliqués. Réexécutable sans risque. Une nouvelle installation n'a besoin
-- que de quiz-module.sql.
--
--   Une question désactivée APRÈS avoir été placée dans un défi ou un duel
--   n'est plus servie : elle est sautée sans pénalité si elle n'a pas encore
--   été affichée (une question déjà affichée reste figée, cf. correctif n° 1).
-- ============================================================================
begin;

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
  if q.id is null or (g.current_q is null and q.active is false) then
    -- Question supprimée ou désactivée avant d'être affichée (défi ou duel déjà
    -- préparé, par exemple) : on la saute sans pénalité.
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

commit;
