-- EN AVANT — Ajout de la modification sécurisée du PIN SuperAdmin
-- À exécuter une seule fois dans Supabase SQL Editor.

create or replace function public.ea_change_pin(
  target_user_id uuid,
  current_pin text,
  new_pin text
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if new_pin !~ '^[0-9]{4,8}$' then
    return false;
  end if;

  update public.profiles
  set pin_hash = extensions.crypt(
    new_pin,
    extensions.gen_salt('bf', 12)
  )
  where id = target_user_id
    and role = 'superadmin'
    and pin_hash is not null
    and pin_hash = extensions.crypt(current_pin, pin_hash);

  return found;
end;
$$;

revoke all on function public.ea_change_pin(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.ea_change_pin(uuid, text, text)
  to service_role;

select
  case
    when has_function_privilege(
      'service_role',
      'public.ea_change_pin(uuid,text,text)',
      'EXECUTE'
    )
    then 'ok'
    else 'erreur'
  end as modification_pin;
