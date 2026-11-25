// GET /api/media              → 5 photos les plus récentes (carrousel de l'accueil)
// GET /api/media?albums=1     → albums contenant au moins une photo (page Galerie)
// GET /api/media?album=<slug> → un album et ses photos
import { getServiceClient } from './_lib/supabase.js';
import { json, methodGuard, handleError, clean } from './_lib/http.js';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Albums publics : ceux qui ont des photos, couverture choisie ou photo la plus récente. */
export function publicAlbums(albums, photos) {
  const byAlbum = new Map();
  for (const p of photos) {
    if (!p.album_id) continue;
    if (!byAlbum.has(p.album_id)) byAlbum.set(p.album_id, []);
    byAlbum.get(p.album_id).push(p);
  }
  return albums
    .filter((a) => byAlbum.has(a.id))
    .map((a) => {
      const list = byAlbum.get(a.id);
      const cover = list.find((p) => p.id === a.cover_id) || list[0];
      return {
        slug: a.slug, titre: a.titre, description: a.description || '', date_album: a.date_album,
        nb_photos: list.length, cover_url: cover.url,
      };
    });
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const supabase = getServiceClient();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    if (req.query?.albums) {
      const [albums, photos] = await Promise.all([
        supabase.from('media_albums').select('id, slug, titre, description, date_album, cover_id, created_at')
          .order('date_album', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
        supabase.from('media_gallery').select('id, url, album_id, created_at').eq('type', 'photo')
          .not('album_id', 'is', null).order('created_at', { ascending: false }).limit(5000),
      ]);
      if (albums.error) throw albums.error;
      if (photos.error) throw photos.error;
      return json(res, 200, { albums: publicAlbums(albums.data || [], photos.data || []) });
    }

    const slug = clean(req.query?.album);
    if (slug) {
      if (!SLUG_RE.test(slug) || slug.length > 90) return json(res, 404, { error: 'Album introuvable.' });
      const { data: album, error } = await supabase.from('media_albums')
        .select('id, slug, titre, description, date_album').eq('slug', slug).maybeSingle();
      if (error) throw error;
      if (!album) return json(res, 404, { error: 'Album introuvable.' });
      const { data: photos, error: pErr } = await supabase.from('media_gallery')
        .select('id, url, caption').eq('album_id', album.id).eq('type', 'photo')
        .order('position', { ascending: true }).order('created_at', { ascending: true });
      if (pErr) throw pErr;
      if (!photos?.length) return json(res, 404, { error: 'Album introuvable.' });
      const { id, ...pub } = album;
      return json(res, 200, { album: { ...pub, nb_photos: photos.length }, photos });
    }

    const { data, error } = await supabase
      .from('media_gallery')
      .select('id, url, caption, type, created_at')
      .eq('type', 'photo')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    return json(res, 200, { media: data || [] });
  } catch (error) {
    return handleError(res, error, 'Chargement de la galerie impossible.');
  }
}
