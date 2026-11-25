// /api/admin/media - Galerie en albums (droit gerer_galerie).
// GET                                   : { albums, media }
// POST   { action: 'album', titre, description?, date_album? }          → crée un album
// PATCH  { action: 'album', id, titre?, description?, date_album?, cover_id? }
// DELETE { action: 'album', id, avec_photos? }                          → supprime l'album
//        (ses photos sont supprimées si avec_photos, sinon l'album doit être vide)
// POST   { album_id, caption?, image_base64, image_ext }                → ajoute une photo
// PATCH  { id, caption?, album_id? }                                    → légende / déplacement
// DELETE { id }                                                         → supprime une photo
import { randomUUID } from 'node:crypto';
import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';
import { logTeamAction } from '../_lib/activity.js';

const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const isUuid = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ''));
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(value));
const STORAGE_MARKER = '/storage/v1/object/public/assets/';

export const slugifyAlbum = (titre) => {
  const s = String(titre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80).replace(/-+$/, '');
  return s.length >= 3 ? s : `album${s ? `-${s}` : ''}`;
};

/** Champs d'album validés (null = absent / vidé). */
export function albumFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.titre !== undefined) {
    const titre = clean(body.titre).slice(0, 120);
    if (titre.length < 2) throw Object.assign(new Error('Donnez un titre à l’album (2 caractères minimum).'), { status: 422 });
    out.titre = titre;
  }
  if (!partial || body.description !== undefined) out.description = clean(body.description).slice(0, 600) || null;
  if (!partial || body.date_album !== undefined) {
    if (body.date_album && !isDate(body.date_album)) throw Object.assign(new Error('Date d’album invalide.'), { status: 422 });
    out.date_album = body.date_album || null;
  }
  return out;
}

async function uniqueSlug(supabase, titre) {
  const base = slugifyAlbum(titre);
  const { data } = await supabase.from('media_albums').select('slug').like('slug', `${base}%`);
  const taken = new Set((data || []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i += 1) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

const storagePath = (url) => (url?.includes(STORAGE_MARKER)
  ? decodeURIComponent(url.split(STORAGE_MARKER)[1].split('?')[0]) : '');

async function removeFiles(supabase, urls) {
  const paths = urls.map(storagePath).filter((p) => p.startsWith('galerie/'));
  if (paths.length) await supabase.storage.from('assets').remove(paths);
}

/** Si l'album n'a plus de couverture valide, prend sa photo la plus récente. */
async function ensureCover(supabase, albumId) {
  if (!albumId) return;
  const { data: album } = await supabase.from('media_albums').select('cover_id').eq('id', albumId).maybeSingle();
  if (!album) return;
  if (album.cover_id) {
    const { data: still } = await supabase.from('media_gallery').select('id').eq('id', album.cover_id).eq('album_id', albumId).maybeSingle();
    if (still) return;
  }
  const { data: first } = await supabase.from('media_gallery').select('id').eq('album_id', albumId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  await supabase.from('media_albums').update({ cover_id: first?.id || null, updated_at: new Date().toISOString() }).eq('id', albumId);
}

async function albumTitle(supabase, id) {
  const { data } = await supabase.from('media_albums').select('titre').eq('id', id).maybeSingle();
  return data?.titre || '';
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const { user } = await requirePermission(req, 'gerer_galerie');
    const supabase = getServiceClient();
    const body = getBody(req);
    const isAlbum = body.action === 'album';

    if (req.method === 'GET') {
      const [albums, media] = await Promise.all([
        supabase.from('media_albums').select('id, slug, titre, description, date_album, cover_id, created_at')
          .order('date_album', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
        supabase.from('media_gallery').select('id, url, caption, type, album_id, position, created_at')
          .order('position', { ascending: true }).order('created_at', { ascending: false }).limit(2000),
      ]);
      if (albums.error) throw albums.error;
      if (media.error) throw media.error;
      return json(res, 200, { albums: albums.data || [], media: media.data || [] });
    }

    /* ----------------------------- Albums ----------------------------- */
    if (isAlbum && req.method === 'POST') {
      const fields = albumFields(body);
      const { data, error } = await supabase.from('media_albums')
        .insert({ ...fields, slug: await uniqueSlug(supabase, fields.titre) }).select().single();
      if (error) throw error;
      await logTeamAction(supabase, user, { categorie: 'contenus', message: `a créé l’album photo « ${data.titre} ».` });
      return json(res, 201, { ok: true, album: data });
    }

    if (isAlbum && req.method === 'PATCH') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant d’album invalide.' });
      const fields = albumFields(body, { partial: true });
      if (body.cover_id !== undefined) {
        if (body.cover_id && !isUuid(body.cover_id)) return json(res, 422, { error: 'Photo de couverture invalide.' });
        if (body.cover_id) {
          const { data: photo } = await supabase.from('media_gallery').select('id').eq('id', body.cover_id).eq('album_id', body.id).maybeSingle();
          if (!photo) return json(res, 422, { error: 'La couverture doit être une photo de cet album.' });
        }
        fields.cover_id = body.cover_id || null;
      }
      const { data, error } = await supabase.from('media_albums')
        .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', body.id).select().single();
      if (error) throw error;
      return json(res, 200, { ok: true, album: data });
    }

    if (isAlbum && req.method === 'DELETE') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant d’album invalide.' });
      const titre = await albumTitle(supabase, body.id);
      const { data: photos, error: readError } = await supabase.from('media_gallery').select('id, url').eq('album_id', body.id);
      if (readError) throw readError;
      if (photos?.length && !body.avec_photos) {
        return json(res, 409, { error: `Cet album contient encore ${photos.length} photo(s). Déplacez-les ou confirmez leur suppression.`, photos: photos.length });
      }
      if (photos?.length) {
        const { error } = await supabase.from('media_gallery').delete().eq('album_id', body.id);
        if (error) throw error;
        await removeFiles(supabase, photos.map((p) => p.url));
      }
      const { error } = await supabase.from('media_albums').delete().eq('id', body.id);
      if (error) throw error;
      await logTeamAction(supabase, user, {
        categorie: 'contenus', niveau: photos?.length ? 'attention' : 'info',
        message: `a supprimé l’album photo « ${titre} »${photos?.length ? ` et ses ${photos.length} photo(s)` : ''}.`,
      });
      return json(res, 200, { ok: true, supprimees: photos?.length || 0 });
    }

    /* ----------------------------- Photos ----------------------------- */
    if (req.method === 'POST') {
      if (!isUuid(body.album_id)) return json(res, 422, { error: 'Choisissez l’album de la photo.' });
      const { data: album } = await supabase.from('media_albums').select('id, titre, cover_id').eq('id', body.album_id).maybeSingle();
      if (!album) return json(res, 404, { error: 'Album introuvable.' });

      const ext = clean(body.image_ext).toLowerCase();
      const contentType = IMAGE_TYPES[ext];
      if (!contentType || !body.image_base64) return json(res, 422, { error: 'Image JPG, PNG ou WebP requise.' });
      let buffer;
      try { buffer = Buffer.from(String(body.image_base64), 'base64'); } catch { return json(res, 422, { error: 'Image illisible.' }); }
      if (!buffer.length || buffer.length > IMAGE_MAX_BYTES) return json(res, 422, { error: 'Image trop lourde (3 Mo maximum).' });

      const id = randomUUID();
      const path = `galerie/${id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('assets').upload(path, buffer, { contentType, upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from('assets').getPublicUrl(path);
      const { data, error } = await supabase.from('media_gallery').insert({
        id, url: publicUrl.publicUrl, caption: clean(body.caption).slice(0, 180) || null, type: 'photo', album_id: album.id,
      }).select().single();
      if (error) {
        await supabase.storage.from('assets').remove([path]);
        throw error;
      }
      if (!album.cover_id) await supabase.from('media_albums').update({ cover_id: id }).eq('id', album.id);
      return json(res, 201, { ok: true, media: data });
    }

    if (req.method === 'PATCH') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });
      const update = {};
      if (body.caption !== undefined) update.caption = clean(body.caption).slice(0, 180) || null;
      let before = null;
      if (body.album_id !== undefined) {
        if (!isUuid(body.album_id)) return json(res, 422, { error: 'Album de destination invalide.' });
        const { data: album } = await supabase.from('media_albums').select('id').eq('id', body.album_id).maybeSingle();
        if (!album) return json(res, 404, { error: 'Album de destination introuvable.' });
        const { data: cur } = await supabase.from('media_gallery').select('album_id').eq('id', body.id).maybeSingle();
        before = cur?.album_id || null;
        update.album_id = body.album_id;
      }
      if (!Object.keys(update).length) return json(res, 422, { error: 'Rien à modifier.' });
      const { data, error } = await supabase.from('media_gallery').update(update).eq('id', body.id).select().single();
      if (error) throw error;
      if (update.album_id && before !== update.album_id) {
        await ensureCover(supabase, before);
        await ensureCover(supabase, update.album_id);
      }
      return json(res, 200, { ok: true, media: data });
    }

    if (req.method === 'DELETE') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });
      const { data: current, error: readError } = await supabase.from('media_gallery').select('url, album_id').eq('id', body.id).single();
      if (readError) throw readError;
      const { error } = await supabase.from('media_gallery').delete().eq('id', body.id);
      if (error) throw error;
      await removeFiles(supabase, [current?.url]);
      await ensureCover(supabase, current?.album_id);
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Gestion de la galerie impossible.');
  }
}
