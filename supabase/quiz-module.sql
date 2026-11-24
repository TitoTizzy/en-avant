-- ============================================================================
-- Module Quiz membres — En Avant
-- À exécuter après security-hardening.sql. Réexécutable sans risque.
--
--   · Banque : formats (qcm, vrai_faux, chiffre, citation, image, ordre),
--     chantier (1-20), difficulté, image, activation, empreinte anti-doublon.
--   · Parties membres (libre, défi de la semaine, duel) : chrono et points
--     calculés en base, jamais par le navigateur.
--   · Classements (général, du mois, défi de la semaine), badges, titres.
--   · Toutes les tables sont fermées à anon/authenticated : l'accès passe par
--     les routes /api (service_role) qui appellent les fonctions ci-dessous.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Banque de questions
-- ---------------------------------------------------------------------------
alter table public.trivia_questions
  add column if not exists format text not null default 'qcm',
  add column if not exists chantier smallint,
  add column if not exists difficulte text,
  add column if not exists image_id text,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists active boolean not null default true,
  add column if not exists generation_id uuid,
  add column if not exists empreinte text;

alter table public.trivia_questions drop constraint if exists trivia_questions_format_check;
alter table public.trivia_questions add constraint trivia_questions_format_check
  check (format in ('qcm', 'vrai_faux', 'chiffre', 'citation', 'image', 'ordre'));
alter table public.trivia_questions drop constraint if exists trivia_questions_chantier_check;
alter table public.trivia_questions add constraint trivia_questions_chantier_check
  check (chantier is null or chantier between 1 and 20);
alter table public.trivia_questions drop constraint if exists trivia_questions_difficulte_check;
alter table public.trivia_questions add constraint trivia_questions_difficulte_check
  check (difficulte is null or difficulte in ('facile', 'moyen', 'difficile'));

create index if not exists trivia_questions_actives_idx on public.trivia_questions (active, format);
create unique index if not exists trivia_questions_empreinte_idx
  on public.trivia_questions (empreinte) where empreinte is not null;

create table if not exists public.quiz_generations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid,
  created_at timestamptz not null default now(),
  demandees integer not null default 0,
  inserees integer not null default 0,
  doublons integer not null default 0,
  rejetees integer not null default 0,
  modele text,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'termine', 'echec')),
  erreur text
);

-- ---------------------------------------------------------------------------
-- 2. Défi de la semaine, duels, parties, réponses
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_challenges (
  week_start date primary key,              -- lundi (heure d'Haïti)
  question_ids uuid[] not null,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_duels (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  question_ids uuid[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists quiz_duels_creator_idx on public.quiz_duels (creator_id);

create table if not exists public.quiz_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  mode text not null check (mode in ('libre', 'defi', 'duel')),
  duel_id uuid references public.quiz_duels(id) on delete set null,
  week_start date,
  question_ids uuid[] not null,
  current_index integer not null default 0,
  shown_at timestamptz,                      -- affichage de la question en cours (chrono)
  streak integer not null default 0,
  best_streak integer not null default 0,
  correct integer not null default 0,
  fast integer not null default 0,
  points integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists quiz_games_user_idx on public.quiz_games (user_id, finished_at);
create index if not exists quiz_games_finished_idx on public.quiz_games (finished_at) where finished_at is not null;
create unique index if not exists quiz_games_defi_unique on public.quiz_games (user_id, week_start) where mode = 'defi';
create unique index if not exists quiz_games_duel_unique on public.quiz_games (user_id, duel_id) where mode = 'duel';

create table if not exists public.quiz_answers (
  game_id uuid not null references public.quiz_games(id) on delete cascade,
  idx integer not null,
  user_id uuid not null,
  question_id uuid,
  chantier smallint,
  correct boolean not null,
  fast boolean not null default false,
  timed_out boolean not null default false,
  ms integer,
  points integer not null default 0,
  answered_at timestamptz not null default now(),
  primary key (game_id, idx)
);
create index if not exists quiz_answers_user_idx on public.quiz_answers (user_id, chantier) where correct;
create index if not exists quiz_answers_question_idx on public.quiz_answers (question_id);

alter table public.quiz_generations enable row level security;
alter table public.quiz_challenges enable row level security;
alter table public.quiz_duels enable row level security;
alter table public.quiz_games enable row level security;
alter table public.quiz_answers enable row level security;
revoke all on public.quiz_generations, public.quiz_challenges, public.quiz_duels,
  public.quiz_games, public.quiz_answers from public, anon, authenticated;
grant all on public.quiz_generations, public.quiz_challenges, public.quiz_duels,
  public.quiz_games, public.quiz_answers to service_role;

-- ---------------------------------------------------------------------------
-- 3. Outils
-- ---------------------------------------------------------------------------
-- Lundi de la semaine en cours, heure d'Haïti.
create or replace function public.quiz_week_start(p_at timestamptz default now())
returns date language sql stable set search_path = public as $$
  select (date_trunc('week', p_at at time zone 'America/Port-au-Prince'))::date;
$$;

-- Tirage aléatoire de questions actives (formats membres : tous).
create or replace function public.quiz_pick(p_count integer)
returns uuid[] language sql volatile set search_path = public as $$
  select coalesce(array_agg(id), '{}') from (
    select id from public.trivia_questions where active order by random() limit p_count
  ) t;
$$;

-- Vérifie une réponse selon le format. Ne lève jamais d'exception.
create or replace function public.quiz_is_correct(p_format text, p_correct text, p_meta jsonb, p_answer text)
returns boolean language plpgsql immutable set search_path = public as $$
declare v numeric; c numeric; tol numeric;
begin
  if p_answer is null then return false; end if;
  if p_format = 'chiffre' then
    if trim(replace(p_answer, ',', '.')) !~ '^-?[0-9]+(\.[0-9]+)?$' then return false; end if;
    v := trim(replace(p_answer, ',', '.'))::numeric;
    c := replace(p_correct, ',', '.')::numeric;
    tol := coalesce(nullif(p_meta ->> 'tolerance', '')::numeric, 0);
    return abs(v - c) <= tol;
  elsif p_format = 'ordre' then
    begin
      return p_answer::jsonb = p_correct::jsonb;
    exception when others then
      return false;
    end;
  else
    return p_answer = p_correct;
  end if;
exception when others then
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Parties
-- ---------------------------------------------------------------------------
-- Démarre (ou reprend) une partie. p_mode : libre | defi | duel.
-- p_duel : null pour lancer un nouveau duel, sinon l'identifiant du duel rejoint.
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
    insert into public.quiz_challenges (week_start, question_ids)
      select ws, public.quiz_pick(n)
      on conflict (week_start) do nothing;
    select question_ids into ids from public.quiz_challenges where week_start = ws;
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

-- Question en cours (sans la réponse). Démarre son chrono au premier affichage ;
-- un rechargement ne remet pas le chrono à zéro.
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
  select * into q from public.trivia_questions where id = g.question_ids[g.current_index + 1];
  if not found then
    -- Question supprimée entre-temps : on la saute sans pénalité.
    insert into public.quiz_answers (game_id, idx, user_id, question_id, correct, timed_out, points)
      values (g.id, g.current_index, p_user, g.question_ids[g.current_index + 1], false, false, 0)
      on conflict do nothing;
    update public.quiz_games set current_index = current_index + 1, shown_at = null,
      finished_at = case when current_index + 1 >= total then now() end
      where id = g.id;
    return public.quiz_next(p_game, p_user);
  end if;
  if g.shown_at is null then
    update public.quiz_games set shown_at = now() where id = g.id returning * into g;
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

-- Enregistre la réponse à la question en cours et calcule les points.
--   bonne réponse : 10 ; rapidité (≤ 5 s) : +5 ; série dès la 3e : +2, +4, +6…
--   mauvaise réponse ou temps écoulé (15 s) : 0, sans pénalité.
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
  select * into q from public.trivia_questions where id = g.question_ids[g.current_index + 1];

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
    current_index = current_index + 1, shown_at = null, streak = s,
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

-- ---------------------------------------------------------------------------
-- 5. Classements : general | mois | semaine (défi de la semaine)
-- ---------------------------------------------------------------------------
create or replace function public.quiz_leaderboard(p_kind text, p_user uuid default null, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz; ws date; rows jsonb; me jsonb;
begin
  if p_kind = 'mois' then
    since := (date_trunc('month', now() at time zone 'America/Port-au-Prince')) at time zone 'America/Port-au-Prince';
  elsif p_kind = 'semaine' then
    ws := public.quiz_week_start();
  elsif p_kind is distinct from 'general' then
    return jsonb_build_object('error', 'Classement inconnu.');
  end if;

  with scores as (
    select user_id, sum(points)::integer as pts, max(finished_at) as dernier
    from public.quiz_games
    where finished_at is not null
      and (since is null or finished_at >= since)
      and (ws is null or (mode = 'defi' and week_start = ws))
    group by user_id
  ), cumul as (
    select user_id, sum(points)::integer as total from public.quiz_games
    where finished_at is not null group by user_id
  ), ranked as (
    select s.user_id, s.pts, c.total,
      coalesce(nullif(trim(p.username), ''), 'Membre') as pseudo,
      rank() over (order by s.pts desc) as rang,
      row_number() over (order by s.pts desc, s.dernier asc) as ordre
    from scores s join cumul c using (user_id) left join public.profiles p on p.id = s.user_id
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object('rang', rang, 'pseudo', pseudo, 'points', pts,
      'cumul', total, 'moi', user_id = p_user) order by ordre)
      from ranked where ordre <= least(greatest(p_limit, 1), 100)), '[]'::jsonb),
    (select jsonb_build_object('rang', rang, 'points', pts, 'cumul', total) from ranked where user_id = p_user)
  into rows, me;

  return jsonb_build_object('type', p_kind, 'top', rows, 'moi', me);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Profil joueur : score cumulé, statistiques, badges
-- ---------------------------------------------------------------------------
create or replace function public.quiz_profile(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  cumul integer; parties integer; meilleure integer; eclair boolean; parfaite boolean; jours integer;
  experts jsonb; progression jsonb; victoires integer; ambassade integer; champion integer;
  ws date := public.quiz_week_start(); defi jsonb; badges jsonb := '[]'::jsonb;
begin
  select coalesce(sum(points), 0)::integer, count(*)::integer, coalesce(max(best_streak), 0),
         coalesce(bool_or(fast >= 10), false), coalesce(bool_or(best_streak >= 15), false),
         count(distinct (finished_at at time zone 'America/Port-au-Prince')::date)::integer
    into cumul, parties, meilleure, eclair, parfaite, jours
    from public.quiz_games where user_id = p_user and finished_at is not null;

  select coalesce(jsonb_object_agg(chantier, n), '{}'::jsonb) into progression
    from (select chantier, count(*)::integer as n from public.quiz_answers
          where user_id = p_user and correct and chantier is not null group by chantier) t;
  select coalesce(jsonb_agg(chantier order by chantier), '[]'::jsonb) into experts
    from (select chantier from public.quiz_answers
          where user_id = p_user and correct and chantier is not null
          group by chantier having count(*) >= 20) t;

  -- Duels gagnés : meilleur score strict face à au moins un autre joueur du même duel.
  select count(*)::integer into victoires from (
    select g.duel_id from public.quiz_games g
    where g.user_id = p_user and g.mode = 'duel' and g.finished_at is not null
      and exists (select 1 from public.quiz_games o where o.duel_id = g.duel_id and o.user_id <> p_user
                  and o.finished_at is not null)
      and not exists (select 1 from public.quiz_games o where o.duel_id = g.duel_id and o.user_id <> p_user
                      and o.finished_at is not null and o.points >= g.points)
  ) t;

  select count(distinct o.user_id)::integer into ambassade
    from public.quiz_duels d join public.quiz_games o on o.duel_id = d.id
    where d.creator_id = p_user and o.user_id <> p_user and o.finished_at is not null;

  -- Semaines passées remportées au défi.
  select count(*)::integer into champion from (
    select week_start, (array_agg(user_id order by points desc, finished_at asc))[1] as vainqueur
    from public.quiz_games where mode = 'defi' and finished_at is not null and week_start < ws
    group by week_start
  ) t where vainqueur = p_user;

  select jsonb_build_object('joue', true, 'points', points, 'termine', finished_at is not null) into defi
    from public.quiz_games where user_id = p_user and mode = 'defi' and week_start = ws;

  if parties >= 1 then badges := badges || '["premier_pas"]'; end if;
  if meilleure >= 5 then badges := badges || '["serie_de_feu"]'; end if;
  if parfaite then badges := badges || '["inarretable"]'; end if;
  if eclair then badges := badges || '["eclair"]'; end if;
  if jours >= 7 then badges := badges || '["assidu"]'; end if;
  if champion >= 1 then badges := badges || '["champion_semaine"]'; end if;
  if victoires >= 5 then badges := badges || '["duelliste"]'; end if;
  if ambassade >= 3 then badges := badges || '["ambassadeur"]'; end if;
  if jsonb_array_length(experts) > 0 then
    badges := badges || (select jsonb_agg('expert_chantier_' || value) from jsonb_array_elements_text(experts));
  end if;

  return jsonb_build_object(
    'cumul', cumul, 'parties', parties, 'meilleure_serie', meilleure, 'jours', jours,
    'duels_gagnes', victoires, 'invites', ambassade, 'semaines_gagnees', champion,
    'chantiers', progression, 'badges', badges,
    'defi', coalesce(defi, jsonb_build_object('joue', false)),
    'semaine', ws
  );
end;
$$;

-- Résultats d'un duel (pseudos et scores des participants ayant terminé).
create or replace function public.quiz_duel_result(p_duel uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'duel_id', d.id, 'expires_at', d.expires_at, 'expire', d.expires_at <= now(),
    'createur', coalesce((select nullif(trim(username), '') from public.profiles where id = d.creator_id), 'Membre'),
    'joueurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pseudo', coalesce(nullif(trim(p.username), ''), 'Membre'), 'points', g.points,
        'bonnes', g.correct, 'termine', g.finished_at is not null, 'createur', g.user_id = d.creator_id,
        'user_id', g.user_id) order by g.points desc, g.finished_at asc)
      from public.quiz_games g left join public.profiles p on p.id = g.user_id
      where g.duel_id = d.id), '[]'::jsonb))
  from public.quiz_duels d where d.id = p_duel;
$$;

revoke all on function public.quiz_week_start(timestamptz), public.quiz_pick(integer),
  public.quiz_is_correct(text, text, jsonb, text), public.quiz_start(uuid, text, uuid, integer),
  public.quiz_next(uuid, uuid), public.quiz_answer(uuid, uuid, integer, text),
  public.quiz_leaderboard(text, uuid, integer), public.quiz_profile(uuid), public.quiz_duel_result(uuid)
  from public, anon, authenticated;
grant execute on function public.quiz_week_start(timestamptz), public.quiz_pick(integer),
  public.quiz_is_correct(text, text, jsonb, text), public.quiz_start(uuid, text, uuid, integer),
  public.quiz_next(uuid, uuid), public.quiz_answer(uuid, uuid, integer, text),
  public.quiz_leaderboard(text, uuid, integer), public.quiz_profile(uuid), public.quiz_duel_result(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. Classement public (visiteurs) : l'ancien score réaffiché (choix de Myrtho)
-- ---------------------------------------------------------------------------
create or replace function public.ea_trivia_leaderboard()
returns table(pseudo text, score integer, total integer, completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.pseudo, s.score, s.total, s.completed_at from public.trivia_scores s
  where s.pseudo is not null and trim(s.pseudo) <> ''
  order by s.score::numeric / s.total desc, s.score desc, s.completed_at asc
  limit 10;
$$;

commit;
