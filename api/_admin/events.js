// /api/admin/events — Gestion des événements / compte à rebours (SuperAdmin + PIN).
// GET    : tous les événements (passés inclus)
// POST   : { titre, date_cible, lieu?, description? }
// PATCH  : { id, titre?, date_cible?, lieu?, description? }
// DELETE : { id }
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean, isText } from '../_lib/http.js';

const isUuid = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ''));

const parseDate = (value) => {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await requireRole(req, ['superadmin']);

    const supabase = getServiceClient();
    const body = getBody(req);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('events')
        .select('id, titre, date_cible, lieu, description, created_at')
        .order('date_cible', { ascending: true })
        .limit(100);
      if (error) throw error;
      return json(res, 200, { events: data || [] });
    }

    if (req.method === 'POST') {
      const titre = clean(body.titre);
      const dateCible = parseDate(body.date_cible);

      if (!isText(titre, 3, 160)) return json(res, 422, { error: 'Titre requis (3 à 160 caractères).' });
      if (!dateCible) return json(res, 422, { error: 'Date cible invalide.' });

      const { data, error } = await supabase
        .from('events')
        .insert({
          titre,
          date_cible: dateCible,
          lieu: clean(body.lieu).slice(0, 160) || null,
          description: clean(body.description).slice(0, 500) || null,
        })
        .select()
        .single();
      if (error) throw error;

      return json(res, 201, { ok: true, event: data });
    }

    if (req.method === 'PATCH') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });

      const updates = {};
      if ('titre' in body) {
        const titre = clean(body.titre);
        if (!isText(titre, 3, 160)) return json(res, 422, { error: 'Titre invalide.' });
        updates.titre = titre;
      }
      if ('date_cible' in body) {
        const dateCible = parseDate(body.date_cible);
        if (!dateCible) return json(res, 422, { error: 'Date cible invalide.' });
        updates.date_cible = dateCible;
      }
      if ('lieu' in body) updates.lieu = clean(body.lieu).slice(0, 160) || null;
      if ('description' in body) updates.description = clean(body.description).slice(0, 500) || null;

      if (Object.keys(updates).length === 0) {
        return json(res, 422, { error: 'Aucune modification fournie.' });
      }

      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', body.id)
        .select()
        .single();
      if (error) throw error;

      return json(res, 200, { ok: true, event: data });
    }

    if (req.method === 'DELETE') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });
      const { error } = await supabase.from('events').delete().eq('id', body.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Gestion des événements impossible.');
  }
}
