-- Apply after schema.sql, add-member-role.sql, add-user-permissions.sql,
-- articles-review.sql and donations-stripe.sql, before deploying the new API.
begin;

alter table public.articles add column if not exists is_featured boolean not null default false;
grant select (permissions) on public.profiles to authenticated;
-- Review notes and account UUIDs are internal, even after publication.
revoke select on public.articles from anon, authenticated;
grant select (id, titre, slug, categorie, contenu, excerpt, image_url, published,
  published_at, created_at, updated_at, is_featured) on public.articles to anon, authenticated;

create table if not exists public.api_rate_limits (
  key text primary key, hits integer not null, reset_at timestamptz not null
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
grant all on public.api_rate_limits to service_role;

create or replace function public.ea_take_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid quota';
  end if;
  -- Bounded retention; the primary key serializes concurrent requests.
  delete from public.api_rate_limits where reset_at < now() - interval '1 day';
  insert into public.api_rate_limits as r (key, hits, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    hits = case when r.reset_at <= now() then 1 else least(r.hits + 1, p_limit + 1) end,
    reset_at = case when r.reset_at <= now() then excluded.reset_at else r.reset_at end
  returning hits into n;
  return n <= p_limit;
end;
$$;

-- Preserve the pending-by-default adhesion approval workflow from adhesion-unifiee.sql.

create table if not exists public.trivia_sessions (
  id uuid primary key default gen_random_uuid(),
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  answers jsonb not null default '[]'::jsonb,
  submitted boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour'
);
alter table public.trivia_sessions enable row level security;
revoke all on public.trivia_sessions from public, anon, authenticated;
grant all on public.trivia_sessions to service_role;
alter table public.trivia_scores add column if not exists verified boolean not null default false;
-- Answer keys and session identifiers must not be available via PostgREST.
revoke select on public.trivia_questions, public.trivia_scores from anon, authenticated;

create or replace function public.ea_answer_trivia(p_session uuid, p_index integer, p_option text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.trivia_sessions; q jsonb; a jsonb; n integer; points integer;
begin
  select * into s from public.trivia_sessions where id = p_session for update;
  if not found or s.expires_at <= now() or s.submitted then
    return jsonb_build_object('error', 'Partie expirée ou terminée.');
  end if;
  n := jsonb_array_length(s.answers);
  if p_index is null or p_index < 0 or p_index > n or p_index >= jsonb_array_length(s.questions) then
    return jsonb_build_object('error', 'Ordre des réponses invalide.');
  end if;
  q := s.questions -> p_index;
  if not (q -> 'options' @> jsonb_build_array(p_option)) then
    return jsonb_build_object('error', 'Option invalide.');
  end if;
  if p_index < n then
    if s.answers -> p_index ->> 'option' is distinct from p_option then
      return jsonb_build_object('error', 'Réponse déjà enregistrée.');
    end if;
  else
    a := jsonb_build_object('option', p_option, 'correct', p_option = (q ->> 'correct_answer'));
    s.answers := s.answers || jsonb_build_array(a);
    update public.trivia_sessions set answers = s.answers where id = p_session;
  end if;
  select count(*) into points from jsonb_array_elements(s.answers) x where (x ->> 'correct')::boolean;
  return jsonb_build_object('correct_answer', q ->> 'correct_answer', 'explication', q ->> 'explication',
    'source_livre_blanc', q ->> 'source_livre_blanc', 'score', points);
end;
$$;

create or replace function public.ea_submit_trivia(p_session uuid, p_pseudo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.trivia_sessions; points integer; total integer;
begin
  select * into s from public.trivia_sessions where id = p_session for update;
  if not found or s.expires_at <= now() then return jsonb_build_object('error', 'Partie expirée.'); end if;
  total := jsonb_array_length(s.questions);
  if total < 1 or jsonb_array_length(s.answers) <> total or char_length(trim(p_pseudo)) not between 2 and 40 then
    return jsonb_build_object('error', 'Partie incomplète ou pseudonyme invalide.');
  end if;
  select count(*) into points from jsonb_array_elements(s.answers) x where (x ->> 'correct')::boolean;
  if not s.submitted then
    insert into public.trivia_scores (user_session, pseudo, score, total, verified)
    values (p_session::text, trim(p_pseudo), points, total, true);
    update public.trivia_sessions set submitted = true where id = p_session;
  end if;
  return jsonb_build_object('ok', true, 'score', points, 'total', total);
end;
$$;

create or replace function public.ea_trivia_leaderboard()
returns table(pseudo text, score integer, total integer, completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.pseudo, s.score, s.total, s.completed_at from public.trivia_scores s
  where s.verified = true
  order by s.score::numeric / s.total desc, s.score desc, s.completed_at asc
  limit 10;
$$;

alter table public.donations add column if not exists refunded_cents integer not null default 0
  check (refunded_cents >= 0 and refunded_cents <= montant);
alter table public.donations drop constraint if exists donations_statut_check;
alter table public.donations add constraint donations_statut_check
  check (statut in ('completed', 'pending', 'partially_refunded', 'refunded', 'failed', 'disputed'));
-- Preserve existing fully refunded rows when switching to net totals.
update public.donations set refunded_cents = montant where statut = 'refunded';

-- Minimal event ledger, no raw Stripe payload or payment details.
create table if not exists public.stripe_events (
  id text primary key, transaction_id text not null,
  kind text not null check (kind in ('payment', 'refund', 'dispute')),
  event_created bigint not null, refunded_cents integer, dispute_status text,
  received_at timestamptz not null default now()
);
create index if not exists stripe_events_transaction_idx on public.stripe_events(transaction_id);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;
grant all on public.stripe_events to service_role;

create or replace function public.ea_record_stripe_event(
  p_id text, p_transaction text, p_kind text, p_created bigint,
  p_row jsonb default null, p_refunded integer default null, p_dispute text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare refunds integer; dispute text; payment_inserted boolean := false;
begin
  -- Also serializes an adjustment arriving concurrently with the initial payment.
  perform pg_advisory_xact_lock(hashtextextended(p_transaction, 0));
  insert into public.stripe_events(id, transaction_id, kind, event_created, refunded_cents, dispute_status)
  values (p_id, p_transaction, p_kind, p_created, p_refunded, p_dispute)
  on conflict (id) do nothing;
  if not found then return false; end if;
  if p_kind = 'payment' then
    if (p_row ->> 'montant')::integer <= 0 then raise exception 'Invalid amount'; end if;
    insert into public.donations(montant, devise, provider, transaction_id, frequence, email, nom, pays, statut)
    values ((p_row ->> 'montant')::integer, p_row ->> 'devise', 'stripe', p_transaction,
      p_row ->> 'frequence', p_row ->> 'email', p_row ->> 'nom', p_row ->> 'pays', 'completed')
    on conflict (transaction_id) do nothing;
    payment_inserted := found;
  end if;
  select max(refunded_cents) into refunds from public.stripe_events where transaction_id = p_transaction;
  select dispute_status into dispute from public.stripe_events
    where transaction_id = p_transaction and kind = 'dispute'
    order by event_created desc,
      case when dispute_status in ('won', 'lost', 'warning_closed') then 1 else 0 end desc, id desc limit 1;
  update public.donations set
    refunded_cents = greatest(refunded_cents, least(coalesce(refunds, 0), montant)),
    statut = case
      when greatest(refunded_cents, coalesce(refunds, 0)) >= montant then 'refunded'
      when (dispute is not null and dispute not in ('won', 'warning_closed'))
        or (dispute is null and statut = 'disputed') then 'disputed'
      when greatest(refunded_cents, coalesce(refunds, 0)) > 0 then 'partially_refunded'
      else 'completed' end
  where transaction_id = p_transaction;
  return case when p_kind = 'payment' then payment_inserted else true end;
end;
$$;

create or replace function public.ea_donation_totals()
returns table(devise text, gross_cents bigint, refunded_cents bigint, net_cents bigint)
language sql stable security definer set search_path = public as $$
  select d.devise, sum(d.montant)::bigint, sum(d.refunded_cents)::bigint,
    sum(d.montant - d.refunded_cents)::bigint
  from public.donations d where d.statut in ('completed', 'partially_refunded', 'refunded')
  group by d.devise order by d.devise;
$$;

revoke all on function public.ea_take_rate_limit(text, integer, integer),
  public.ea_answer_trivia(uuid, integer, text), public.ea_submit_trivia(uuid, text),
  public.ea_record_stripe_event(text, text, text, bigint, jsonb, integer, text),
  public.ea_donation_totals(), public.ea_trivia_leaderboard() from public, anon, authenticated;
grant execute on function public.ea_take_rate_limit(text, integer, integer),
  public.ea_answer_trivia(uuid, integer, text), public.ea_submit_trivia(uuid, text),
  public.ea_record_stripe_event(text, text, text, bigint, jsonb, integer, text),
  public.ea_donation_totals(), public.ea_trivia_leaderboard() to service_role;

commit;
