// /api/admin/media - Gestion de la galerie (SuperAdmin + PIN requis).
// GET    : liste des medias
// POST   : { caption?, image_base64, image_ext }
// PATCH  : { id, caption }
// DELETE : { id }
import { randomUUID } from 'node:crypto';
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';

const IMAGE_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const isUuid = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ''));

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await requireRole(req, ['superadmin']);

    const supabase = getServiceClient();
    const body = getBody(req);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('media_gallery')
        .select('id, url, caption, type, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return json(res, 200, { media: data || [] });
    }

    if (req.method === 'POST') {
      const ext = clean(body.image_ext).toLowerCase();
      const contentType = IMAGE_TYPES[ext];
      if (!contentType || !body.image_base64) {
        return json(res, 422, { error: 'Image JPG, PNG ou WebP requise.' });
      }

      let buffer;
      try {
        buffer = Buffer.from(String(body.image_base64), 'base64');
      } catch {
        return json(res, 422, { error: 'Image illisible.' });
      }
      if (!buffer.length || buffer.length > IMAGE_MAX_BYTES) {
        return json(res, 422, { error: 'Image trop lourde (3 Mo maximum).' });
      }

      const id = randomUUID();
      const path = `galerie/${id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(path, buffer, { contentType, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from('assets').getPublicUrl(path);
      const { data, error } = await supabase
        .from('media_gallery')
        .insert({
          id,
          url: publicUrl.publicUrl,
          caption: clean(body.caption).slice(0, 180) || null,
          type: 'photo',
        })
        .select()
        .single();

      if (error) {
        await supabase.storage.from('assets').remove([path]);
        throw error;
      }
      return json(res, 201, { ok: true, media: data });
    }

    if (req.method === 'PATCH') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });
      const { data, error } = await supabase
        .from('media_gallery')
        .update({ caption: clean(body.caption).slice(0, 180) || null })
        .eq('id', body.id)
        .select()
        .single();
      if (error) throw error;
      return json(res, 200, { ok: true, media: data });
    }

    if (req.method === 'DELETE') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });

      const { data: current, error: readError } = await supabase
        .from('media_gallery')
        .select('url')
        .eq('id', body.id)
        .single();
      if (readError) throw readError;

      const { error } = await supabase.from('media_gallery').delete().eq('id', body.id);
      if (error) throw error;

      const marker = '/storage/v1/object/public/assets/';
      const path = current?.url?.includes(marker)
        ? decodeURIComponent(current.url.split(marker)[1].split('?')[0])
        : '';
      if (path.startsWith('galerie/')) {
        await supabase.storage.from('assets').remove([path]);
      }
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Gestion de la médiathèque impossible.');
  }
}
