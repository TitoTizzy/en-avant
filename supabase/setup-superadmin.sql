-- EN AVANT — Configuration initiale du SuperAdmin
-- 1) Créez d'abord l'utilisateur dans Supabase Authentication > Users.
-- 2) Remplacez l'email, l'identifiant et le PIN dans le bloc `configuration`.
--    Le PIN doit contenir entre 4 et 8 chiffres.
-- 3) NE COMMITEZ JAMAIS ce fichier avec vos vraies valeurs : remettez les
--    placeholders après exécution (le hash, lui, reste en base — c'est normal).

do $$
declare
  admin_email constant text := 'REMPLACER_PAR_EMAIL_AUTH';
  admin_username constant text := 'REMPLACER_PAR_IDENTIFIANT';
  admin_pin constant text := 'REMPLACER_PAR_VOTRE_PIN';
  admin_user_id uuid;
  normalized_email text;
begin
  if admin_email = 'REMPLACER_PAR_EMAIL_AUTH'
     or admin_username = 'REMPLACER_PAR_IDENTIFIANT'
     or admin_pin = 'REMPLACER_PAR_VOTRE_PIN' then
    raise exception
      'Remplacez l''email, l''identifiant et le PIN avant exécution.';
  end if;

  if admin_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Le PIN doit contenir entre 4 et 8 chiffres.';
  end if;

  select id, email
  into admin_user_id, normalized_email
  from auth.users
  where lower(email) = lower(admin_email);

  if admin_user_id is null then
    raise exception
      'Aucun utilisateur Auth trouvé pour l''email %. Créez-le d''abord dans Authentication > Users.',
      admin_email;
  end if;

  insert into public.profiles (
    id,
    role,
    nom,
    username,
    email,
    pin_hash
  )
  values (
    admin_user_id,
    'superadmin',
    normalized_email,
    admin_username,
    normalized_email,
    extensions.crypt(
      admin_pin,
      extensions.gen_salt('bf', 12)
    )
  )
  on conflict (id) do update
  set
    role = excluded.role,
    username = excluded.username,
    email = excluded.email,
    pin_hash = excluded.pin_hash;
end;
$$;

-- La requête doit retourner exactement une ligne correctement configurée.
select id, role, username, email, pin_hash is not null as pin_configure
from public.profiles
where role = 'superadmin';
