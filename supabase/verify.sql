-- EN AVANT — Contrôle après exécution de schema.sql
-- Ce script ne plante pas si la migration principale est incomplète.

create or replace function pg_temp.ea_superadmin_check()
returns text
language plpgsql
as $$
declare
  required_columns integer;
  configured boolean;
begin
  if to_regclass('public.profiles') is null then
    return 'schema_incomplet';
  end if;

  select count(*)
  into required_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name in ('username', 'email', 'pin_hash');

  if required_columns <> 3 then
    return 'schema_incomplet';
  end if;

  execute $query$
    select exists (
      select 1
      from public.profiles
      where role = 'superadmin'
        and username is not null
        and email is not null
        and pin_hash is not null
    )
  $query$
  into configured;

  return case when configured then 'ok' else 'a_configurer' end;
end;
$$;

with expected_tables(name) as (
  values
    ('profiles'),
    ('articles'),
    ('members'),
    ('donations'),
    ('trivia_questions'),
    ('trivia_scores'),
    ('events'),
    ('media_gallery'),
    ('leads_livreblanc'),
    ('team_members')
),
table_checks as (
  select
    'table:' || expected.name as controle,
    case
      when cls.oid is null then 'manquante'
      when not cls.relrowsecurity then 'rls_desactivee'
      else 'ok'
    end as resultat
  from expected_tables expected
  left join pg_class cls
    on cls.relname = expected.name
   and cls.relnamespace = 'public'::regnamespace
)
select controle, resultat
from table_checks

union all

select
  'bucket:' || expected.name,
  case when bucket.id is null then 'manquant' else 'ok' end
from (
  values
    ('assets'),
    ('documents'),
    ('uploads-admin')
) as expected(name)
left join storage.buckets bucket on bucket.id = expected.name

union all

select
  'members:ninu',
  case
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'members'
        and column_name = 'ninu'
        and is_nullable = 'NO'
    )
    and exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'members'
        and indexname = 'members_ninu_unique'
    )
    then 'ok'
    else 'incomplet'
  end

union all

select 'superadmin:login_pin', pg_temp.ea_superadmin_check()

order by controle;
