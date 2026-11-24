-- Journal d'activité : une ligne par événement, rédigée en français clair.
-- Lisible uniquement par le serveur (service_role) ; affiché aux SuperAdmins.
-- Réexécutable sans risque : la reconstitution de l'historique n'ajoute jamais de doublon (ref unique).

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  categorie text not null check (categorie in ('adhesions', 'dons', 'contenus', 'newsletter', 'quiz', 'equipe', 'securite', 'systeme')),
  niveau text not null default 'info' check (niveau in ('info', 'attention', 'erreur')),
  message text not null check (char_length(message) between 3 and 500),
  acteur text,                -- qui a agi (nom affiché) ; null = visiteur ou système
  acteur_id uuid,
  details jsonb,
  ref text unique             -- évite les doublons (reconstitution, tâches répétées)
);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_categorie_idx on public.activity_logs (categorie, created_at desc);

alter table public.activity_logs enable row level security;
revoke all on public.activity_logs from public, anon, authenticated;
grant all on public.activity_logs to service_role;

-- ---------------------------------------------------------------------------
-- Reconstitution de l'historique à partir des données existantes
-- ---------------------------------------------------------------------------
-- Demandes d'adhésion
insert into public.activity_logs (created_at, categorie, message, ref)
select m.created_at, 'adhesions',
  m.nom || coalesce(' (' || nullif(trim(coalesce(m.ville, '')), '') || coalesce(', ' || m.pays, '') || ')', '')
    || ' a envoyé sa demande d’adhésion' ||
    case m.status when 'approved' then ' — adhésion approuvée.' when 'rejected' then ' — demande refusée.' else ' — en attente d’examen.' end,
  'adhesion:' || m.id
from public.members m
on conflict (ref) do nothing;

-- Dons
insert into public.activity_logs (created_at, categorie, niveau, message, ref)
select d.created_at, 'dons', case when d.statut in ('refunded', 'disputed', 'failed') then 'attention' else 'info' end,
  case d.statut
    when 'completed' then 'Don reçu : ' || to_char(d.montant / 100.0, 'FM999G999D00') || ' ' || upper(coalesce(d.devise, 'usd'))
      || coalesce(' de ' || nullif(trim(coalesce(d.nom, '')), ''), '') || coalesce(' via ' || d.provider, '') || '.'
    when 'refunded' then 'Don remboursé : ' || to_char(d.montant / 100.0, 'FM999G999D00') || ' ' || upper(coalesce(d.devise, 'usd')) || '.'
    when 'disputed' then 'Don contesté par la banque du donateur : ' || to_char(d.montant / 100.0, 'FM999G999D00') || ' ' || upper(coalesce(d.devise, 'usd')) || '.'
    when 'failed' then 'Paiement de don échoué : ' || to_char(d.montant / 100.0, 'FM999G999D00') || ' ' || upper(coalesce(d.devise, 'usd')) || '.'
    else 'Don en attente de confirmation : ' || to_char(d.montant / 100.0, 'FM999G999D00') || ' ' || upper(coalesce(d.devise, 'usd')) || '.'
  end,
  'don_tx:' || coalesce(d.transaction_id, d.id::text)
from public.donations d
on conflict (ref) do nothing;

-- Téléchargements du Livre blanc
insert into public.activity_logs (created_at, categorie, message, ref)
select l.downloaded_at, 'contenus',
  'Le Livre blanc a été téléchargé par ' || coalesce(nullif(trim(coalesce(l.nom, '')), ''), 'un visiteur')
    || coalesce(' (' || nullif(trim(coalesce(l.ville, '')), '') || ')', '') || '.',
  'livre_blanc:' || l.id
from public.leads_livreblanc l
on conflict (ref) do nothing;

-- Inscriptions à la newsletter (formulaire ; les adhérents sont inscrits d'office)
insert into public.activity_logs (created_at, categorie, message, ref)
select s.created_at, 'newsletter',
  'Nouvelle inscription à la newsletter' || coalesce(' : ' || nullif(trim(coalesce(s.nom, '')), ''), '')
    || coalesce(' (' || nullif(trim(coalesce(s.ville, '')), '') || ')', '') || '.',
  'abonnement:' || s.id
from public.newsletter_subscribers s
where coalesce(s.source, '') <> 'adhesion'
on conflict (ref) do nothing;

-- Newsletters et invitations au quiz envoyées
insert into public.activity_logs (created_at, categorie, niveau, message, ref)
select coalesce(n.sent_at, n.started_at), case when n.type = 'quiz' then 'quiz' else 'newsletter' end,
  case when n.echecs > 0 then 'attention' else 'info' end,
  case when n.type = 'quiz'
    then 'Invitation au quiz de la semaine envoyée' || case when n.envoi_auto then ' automatiquement' else '' end
    else 'Newsletter « ' || n.sujet || ' » envoyée' end
    || ' à ' || n.envoyes || ' personne(s)' || case when n.echecs > 0 then ' (' || n.echecs || ' échec(s))' else '' end || '.',
  'envoi:' || n.id
from public.newsletters n
where n.statut <> 'brouillon' and coalesce(n.sent_at, n.started_at) is not null
on conflict (ref) do nothing;

-- Articles publiés et propositions d'articles des membres
insert into public.activity_logs (created_at, categorie, message, ref)
select a.published_at, 'contenus', 'Article publié : « ' || a.titre || ' ».', 'publication:' || a.id
from public.articles a where a.published and a.published_at is not null
on conflict (ref) do nothing;
insert into public.activity_logs (created_at, categorie, message, ref)
select a.created_at, 'contenus',
  coalesce(nullif(trim(coalesce(a.author_name, '')), ''), 'Un membre') || ' a proposé l’article « ' || a.titre || ' »'
    || case a.review_status when 'approved' then ' — accepté.' when 'rejected' then ' — refusé.' else ' — à relire.' end,
  'proposition:' || a.id
from public.articles a where a.review_status is not null
on conflict (ref) do nothing;

-- Défi de la semaine : un résumé par jour
insert into public.activity_logs (created_at, categorie, message, ref)
select max(g.finished_at), 'quiz',
  case when count(*) = 1 then '1 adhérent a terminé le défi de la semaine'
       else count(*) || ' adhérents ont terminé le défi de la semaine' end
    || ' (meilleur score : ' || max(g.points) || ' points).',
  'defi_jour:' || (g.finished_at at time zone 'America/Port-au-Prince')::date
from public.quiz_games g
where g.mode = 'defi' and g.finished_at is not null
group by (g.finished_at at time zone 'America/Port-au-Prince')::date
on conflict (ref) do nothing;

notify pgrst, 'reload schema';
