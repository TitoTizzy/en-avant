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
    const { data, error } = await supabase
      .from('team_members')
      .select('id, section, nom, poste, photo_url, ordre')
      .order('section', { ascending: true })
      .order('ordre', { ascending: true });

    if (error) {
      // Table pas encore créée (team.sql non exécuté) : 42P01 = Postgres,
      // PGRST205 = PostgREST « not in schema cache ».
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return json(res, 200, { members: [] });
      }
      throw error;
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return json(res, 200, { members: data || [] });
  } catch (error) {
    return handleError(res, error);
  }
}
