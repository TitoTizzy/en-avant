-- Ajoute la colonne permissions à la table profiles.
-- NULL = utiliser les permissions par défaut du rôle (comportement actuel).
-- TEXT[] = liste explicite de clés de permission accordées à cet utilisateur.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT NULL;
