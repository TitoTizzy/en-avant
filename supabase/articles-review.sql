-- Migration : colonnes de soumission et de révision des articles membres.
-- À exécuter UNE FOIS dans Supabase → SQL Editor.
-- Idempotente : ADD COLUMN IF NOT EXISTS.

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS submitted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS author_name   TEXT,
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT NULL
    CHECK (review_status IS NULL OR review_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS review_note   TEXT;

-- Index pour accélérer la requête des soumissions en attente
CREATE INDEX IF NOT EXISTS idx_articles_review_status
  ON articles (review_status)
  WHERE review_status IS NOT NULL;

-- Politique RLS : les membres peuvent lire leurs propres soumissions
-- (à activer si RLS est activé sur la table articles)
-- CREATE POLICY "Membres voient leurs articles" ON articles
--   FOR SELECT TO authenticated
--   USING (submitted_by = auth.uid());
