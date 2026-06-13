-- ============================================================================
-- EN AVANT — Migration : ajout du rôle "member"
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================================

-- 1. Remplacer la contrainte de rôle pour inclure "member"
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('superadmin', 'editor', 'readonly', 'member'));

-- 2. RLS : chaque utilisateur connecté peut lire SON propre profil
DROP POLICY IF EXISTS "profiles: own read" ON public.profiles;
CREATE POLICY "profiles: own read"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Vérification
DO $$
BEGIN
  RAISE NOTICE 'Migration add-member-role : OK';
END $$;
