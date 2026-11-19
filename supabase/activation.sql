-- ============================================================================
-- Compte « réellement activé » (mot de passe choisi / connexion par mot de passe).
-- Idempotent. Un simple clic sur un lien d'invitation ne rend plus un compte « Actif ».
-- ============================================================================
alter table public.profiles add column if not exists activated_at timestamptz;

-- Reprise : comptes créés par le formulaire (sans invitation) déjà connectés.
update public.profiles p
   set activated_at = u.last_sign_in_at
  from auth.users u
 where u.id = p.id
   and p.activated_at is null
   and u.invited_at is null
   and u.last_sign_in_at is not null;

-- Contrôle : comptes invités jamais activés (à qui renvoyer un lien).
select count(*) as invites_a_relancer
  from auth.users u join public.profiles p on p.id = u.id
 where u.invited_at is not null and p.activated_at is null;
