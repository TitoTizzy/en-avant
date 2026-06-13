-- EN AVANT - Verrouillage des operations administratives
-- A executer une fois apres schema.sql et team.sql.
--
-- Objectif : un JWT Supabase vole ou une session ouverte avant verification
-- du PIN ne doit pas pouvoir administrer directement les tables via PostgREST.
-- Les mutations et lectures privees passent uniquement par /api/admin/*
-- avec la cle service_role, apres validation de la session et du cookie PIN.

-- Profils : un utilisateur connecte ne lit que son profil public.
drop policy if exists "profiles: lire son propre profil" on public.profiles;
create policy "profiles: lire son propre profil"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());
drop policy if exists "profiles: superadmin gère les rôles" on public.profiles;

-- Donnees privees et mutations de contenu : service_role uniquement.
drop policy if exists "articles: écriture editor/admin" on public.articles;
drop policy if exists "members: lecture superadmin" on public.members;
drop policy if exists "members: gestion superadmin" on public.members;
drop policy if exists "donations: lecture superadmin" on public.donations;
drop policy if exists "trivia_questions: gestion superadmin" on public.trivia_questions;
drop policy if exists "events: écriture editor/admin" on public.events;
drop policy if exists "media_gallery: écriture editor/admin" on public.media_gallery;
drop policy if exists "leads: lecture superadmin" on public.leads_livreblanc;
drop policy if exists "team: gestion superadmin" on public.team_members;

-- Storage : lecture publique des assets seulement. Les uploads admin passent
-- par les fonctions Vercel qui utilisent service_role.
drop policy if exists "storage: upload editor/admin" on storage.objects;
drop policy if exists "storage: maj editor/admin" on storage.objects;
drop policy if exists "storage: suppression editor/admin" on storage.objects;
drop policy if exists "storage: documents superadmin" on storage.objects;

-- Retirer les droits directs sensibles accordes au role authenticated.
revoke insert, update, delete on public.articles from authenticated;
revoke select, update on public.members from authenticated;
revoke select on public.donations from authenticated;
revoke insert, update, delete on public.trivia_questions from authenticated;
revoke insert, update, delete on public.trivia_scores from anon, authenticated;
revoke insert, update, delete on public.events from authenticated;
revoke insert, update, delete on public.media_gallery from authenticated;
revoke select on public.leads_livreblanc from authenticated;
revoke insert, update, delete on public.team_members from authenticated;

-- Conserver seulement les lectures publiques et le score public du quiz.
grant select on public.articles, public.trivia_questions, public.events,
  public.media_gallery, public.team_members to authenticated;
grant select on public.trivia_scores to anon, authenticated;

drop policy if exists "trivia_scores: insertion publique" on public.trivia_scores;

-- Les fonctions de role sont internes au backend.
revoke execute on function public.ea_role() from authenticated;
revoke execute on function public.ea_is_admin() from authenticated;
revoke execute on function public.ea_is_editor() from authenticated;

select 'admin_api_lock' as controle, 'ok' as resultat;
