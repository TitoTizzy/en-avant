// GET /api/events — Événements à venir pour le compte à rebours (DAT)
import { getServiceClient } from './_lib/supabase.js';
import { json, methodGuard, handleError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const supabase = getServiceClient();
    const now = new Date().toISOString();

    const [{ data, error }, { data: lastData }] = await Promise.all([
      supabase
        .from('events')
        .select('id, titre, date_cible, lieu, description')
        .gte('date_cible', now)
        .order('date_cible', { ascending: true })
        .limit(10),
      supabase
        .from('events')
        .select('id, titre, date_cible, lieu, description')
        .lt('date_cible', now)
        .order('date_cible', { ascending: false })
        .limit(1),
    ]);

    if (error) throw error;

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return json(res, 200, { events: data, last: lastData?.[0] || null });
  } catch (error) {
    return handleError(res, error);
  }
}
