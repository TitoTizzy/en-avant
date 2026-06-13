// /api/admin/team — Gestion de l'organigramme (SuperAdmin + PIN requis).
// GET    : liste fraîche (sans cache)
// POST   : { section, nom?, poste?, ordre? }            → crée une carte
// PATCH  : { id, nom?, poste?, ordre?, photo_base64?, photo_ext? } → met à jour
//          (la photo part dans le bucket public `assets`, dossier equipe/)
// DELETE : { id }                                       → supprime la carte
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';

const SECTIONS = [
  'coordination-nationale',
  'conseil-strategique',
  'coordonnateurs-adjoints',
  'coordonnateurs-departementaux',
  'branches-exterieures',
];

const PHOTO_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const PHOTO_MAX_BYTES = 2 * 1024 * 1024; // 2 Mo

const isUuid = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ''));

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await requireRole(req, ['superadmin']);

    const supabase = getServiceClient();
    const body = getBody(req);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, section, nom, poste, photo_url, ordre')
        .order('section', { ascending: true })
        .order('ordre', { ascending: true });

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          return json(res, 503, { error: 'Table absente : exécutez supabase/team.sql dans Supabase.' });
        }
        throw error;
      }
      return json(res, 200, { members: data || [] });
    }

    if (req.method === 'POST') {
      const section = clean(body.section);
      if (!SECTIONS.includes(section)) {
        return json(res, 422, { error: 'Section inconnue.' });
      }

      const { data, error } = await supabase
        .from('team_members')
        .insert({
          section,
          nom: clean(body.nom).slice(0, 120) || null,
          poste: clean(body.poste).slice(0, 120) || null,
          ordre: Number.isInteger(Number(body.ordre)) ? Number(body.ordre) : 99,
        })
        .select()
        .single();

      if (error) throw error;
      return json(res, 201, { ok: true, member: data });
    }

    if (req.method === 'PATCH') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });

      const updates = {};
      if ('nom' in body) updates.nom = clean(body.nom).slice(0, 120) || null;
      if ('poste' in body) updates.poste = clean(body.poste).slice(0, 120) || null;
      if ('ordre' in body && Number.isInteger(Number(body.ordre))) updates.ordre = Number(body.ordre);

      // Photo : envoyée en base64 par le Dashboard → bucket public `assets`.
      if (body.photo_base64) {
        const ext = clean(body.photo_ext).toLowerCase();
        const contentType = PHOTO_TYPES[ext];
        if (!contentType) {
          return json(res, 422, { error: 'Format photo accepté : JPG, PNG ou WebP.' });
        }

        let buffer;
        try {
          buffer = Buffer.from(String(body.photo_base64), 'base64');
        } catch {
          return json(res, 422, { error: 'Photo illisible.' });
        }
        if (!buffer.length || buffer.length > PHOTO_MAX_BYTES) {
          return json(res, 422, { error: 'Photo trop lourde (2 Mo maximum).' });
        }

        const path = `equipe/${body.id}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(path, buffer, { contentType, upsert: true });
        if (uploadError) throw uploadError;

        const { data: pub } = supabase.storage.from('assets').getPublicUrl(path);
        updates.photo_url = `${pub.publicUrl}?v=${Date.now()}`; // anti-cache navigateur
      }

      if (Object.keys(updates).length === 0) {
        return json(res, 422, { error: 'Aucune modification fournie.' });
      }

      const { data, error } = await supabase
        .from('team_members')
        .update(updates)
        .eq('id', body.id)
        .select()
        .single();

      if (error) throw error;
      return json(res, 200, { ok: true, member: data });
    }

    if (req.method === 'DELETE') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });

      const { error } = await supabase.from('team_members').delete().eq('id', body.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Gestion de l\'équipe impossible.');
  }
}
