// GET /api/events — Événements à venir pour le compte à rebours (DAT)
import { getServiceClient } from './_lib/supabase.js';
import { json, methodGuard, handleError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('events')
      .select('id, titre, date_cible, lieu, description')
      .gte('date_cible', new Date().toISOString())
      .order('date_cible', { ascending: true })
      .limit(10);

    if (error) throw error;

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return json(res, 200, { events: data });
  } catch (error) {
    return handleError(res, error);
  }
}
