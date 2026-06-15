-- Ordre des sections de l'organigramme.
-- À exécuter dans l'éditeur SQL Supabase (Settings → SQL Editor).
CREATE TABLE IF NOT EXISTS team_sections (
  key    TEXT PRIMARY KEY,
  label  TEXT NOT NULL,
  ordre  INTEGER NOT NULL DEFAULT 0
);

-- Sections par défaut (ignorées si elles existent déjà)
INSERT INTO team_sections (key, label, ordre) VALUES
  ('coordination-nationale',         'Coordination Nationale',                         0),
  ('conseil-strategique',            'Conseil Stratégique',                            1),
  ('coordonnateurs-adjoints',        'Les Coordonnateurs Nationaux Adjoints',           2),
  ('coordonnateurs-departementaux',  'Les Coordonnateurs Départementaux',               3),
  ('branches-exterieures',           'Les Coordonnateurs des Branches Extérieures',     4)
ON CONFLICT (key) DO NOTHING;
