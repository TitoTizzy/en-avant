// GET /api/media - Medias publics de la galerie d'accueil.
import { getServiceClient } from './_lib/supabase.js';
import { json, methodGuard, handleError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('media_gallery')
      .select('id, url, caption, type, created_at')
      .eq('type', 'photo')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return json(res, 200, { media: data || [] });
  } catch (error) {
    return handleError(res, error, 'Chargement de la galerie impossible.');
  }
}
