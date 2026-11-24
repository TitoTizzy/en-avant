-- ============================================================================
-- Newsletter : tout adhérent est abonné automatiquement — En Avant
-- À exécuter après newsletter.sql. Réexécutable sans risque.
--
--   · Dès qu'une fiche est approuvée (insertion ou changement de statut),
--     l'adresse rejoint newsletter_subscribers (source « adhesion ») avec le
--     pays, le département et la ville de la fiche.
--   · Une adresse désinscrite (newsletter_optouts) n'est jamais réabonnée.
--   · Un changement de lieu sur la fiche met à jour l'abonnement issu de l'adhésion.
--   · Rattrapage : toutes les fiches approuvées existantes sont abonnées.
-- ============================================================================
begin;

create or replace function public.newsletter_from_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(new.email, '')));
begin
  if new.status is distinct from 'approved' or position('@' in v_email) = 0 then
    return new;
  end if;
  if exists (select 1 from public.newsletter_optouts o where o.email = v_email) then
    return new;
  end if;
  insert into public.newsletter_subscribers (email, nom, pays, departement, ville, source, consent_at)
  values (v_email, left(new.nom, 120), new.pays, new.departement, left(new.ville, 80), 'adhesion', now())
  on conflict ((lower(email))) do update set
    nom = coalesce(public.newsletter_subscribers.nom, excluded.nom),
    pays = case when public.newsletter_subscribers.source = 'adhesion' then excluded.pays else public.newsletter_subscribers.pays end,
    departement = case when public.newsletter_subscribers.source = 'adhesion' then excluded.departement else public.newsletter_subscribers.departement end,
    ville = case when public.newsletter_subscribers.source = 'adhesion' then excluded.ville else public.newsletter_subscribers.ville end;
  return new;
end;
$$;

drop trigger if exists members_newsletter on public.members;
create trigger members_newsletter
  after insert or update of status, email, pays, departement, ville on public.members
  for each row execute function public.newsletter_from_member();

revoke all on function public.newsletter_from_member() from public, anon, authenticated;

-- Rattrapage des adhérents déjà approuvés.
insert into public.newsletter_subscribers (email, nom, pays, departement, ville, source, consent_at)
select distinct on (lower(trim(m.email)))
       lower(trim(m.email)), left(m.nom, 120), m.pays, m.departement, left(m.ville, 80), 'adhesion', now()
  from public.members m
 where m.status = 'approved'
   and position('@' in coalesce(m.email, '')) > 0
   and not exists (select 1 from public.newsletter_optouts o where o.email = lower(trim(m.email)))
 order by lower(trim(m.email)), m.created_at desc
on conflict ((lower(email))) do nothing;

commit;
