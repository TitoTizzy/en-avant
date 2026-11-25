-- Date de décision d'une adhésion (approuvée ou refusée), enregistrée automatiquement.
-- Sert au « Délai moyen d'approbation » du tableau de bord. Réexécutable sans risque.
-- Les adhésions décidées avant cette migration n'ont pas de date (non comptées).
alter table public.members add column if not exists decided_at timestamptz;

create or replace function public.members_set_decided_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('approved', 'rejected') then
      new.decided_at := now();
    elsif new.status = 'pending' then
      new.decided_at := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists members_decided_at on public.members;
create trigger members_decided_at before update of status on public.members
  for each row execute function public.members_set_decided_at();

create index if not exists members_decided_at_idx on public.members (decided_at) where decided_at is not null;
