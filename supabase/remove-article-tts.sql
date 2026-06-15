-- EN AVANT - Suppression définitive de l'ancienne option audio des articles.
-- À exécuter une fois dans Supabase SQL Editor.

-- 1) Retire la colonne de cache audio (TTS) des articles.
alter table public.articles
  drop column if exists audio_url;

-- 2) Nettoie la policy de lecture publique du stockage : retire la couverture du
--    bucket TTS, conserve le bucket 'assets' public (images d'articles, photos équipe…).
drop policy if exists "storage: lecture publique assets+tts" on storage.objects;
drop policy if exists "storage: lecture publique assets" on storage.objects;
create policy "storage: lecture publique assets"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'assets');

-- 3) Le bucket 'tts-articles' ne peut PAS être supprimé en SQL : Supabase bloque
--    le DELETE direct sur storage.* (trigger storage.protect_delete()).
--    => Supprime-le à la main si besoin : Dashboard > Storage > bucket
--       "tts-articles" > … > Delete bucket. (S'il n'existe pas : rien à faire ;
--       un bucket vide inutilisé est sans conséquence.)

select 'article_tts_removed' as controle, 'ok' as resultat;
