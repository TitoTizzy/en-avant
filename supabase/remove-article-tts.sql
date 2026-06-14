-- EN AVANT - Suppression définitive de l'ancienne option audio des articles.
-- À exécuter une fois dans Supabase SQL Editor.

alter table public.articles
  drop column if exists audio_url;

drop policy if exists "storage: lecture publique assets+tts" on storage.objects;
drop policy if exists "storage: lecture publique assets" on storage.objects;
create policy "storage: lecture publique assets"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'assets');

delete from storage.objects
where bucket_id = 'tts-articles';

delete from storage.buckets
where id = 'tts-articles';

select 'article_tts_removed' as controle, 'ok' as resultat;
