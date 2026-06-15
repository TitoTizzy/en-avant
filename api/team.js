// GET /api/team — Organigramme public (page Organisation).
// Lecture seule, cache CDN court. Tant que la table n'existe pas encore
// (supabase/team.sql non exécuté), répond une liste vide : la page garde
// alors sa version statique.
import { getServiceClient } from './_lib/supabase.js';
import { json, methodGuard, handleError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const supabase = getServiceClient();

    const [membersResult, sectionsResult] = await Promise.all([
      supabase
        .from('team_members')
        .select('id, section, nom, poste, photo_url, ordre')
        .order('ordre', { ascending: true }),
      supabase
        .from('team_sections')
        .select('key, label, ordre')
        .order('ordre', { ascending: true }),
    ]);

    if (membersResult.error) {
      // Table pas encore créée : 42P01 = Postgres, PGRST205 = PostgREST
      if (membersResult.error.code === '42P01' || membersResult.error.code === 'PGRST205') {
        return json(res, 200, { members: [], sections: null });
      }
      throw membersResult.error;
    }

    // sections: null si team_sections n'existe pas encore (fallback HTML statique)
    const sections = sectionsResult.error ? null : sectionsResult.data;

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return json(res, 200, { members: membersResult.data || [], sections });
  } catch (error) {
    return handleError(res, error);
  }
}
