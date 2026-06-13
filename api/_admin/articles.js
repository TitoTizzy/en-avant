// /api/admin/articles — CRUD des articles du blog (SuperAdmin + PIN requis).
// GET    : liste complète (publiés + brouillons, contenu inclus)
// POST   : { titre, categorie, contenu, excerpt? }                → crée un brouillon
// PATCH  : { id, titre?, categorie?, contenu?, excerpt?, published?,
//            image_base64?, image_ext? }                         → met à jour
//          · publication → published_at posé automatiquement
//          · contenu modifié → audio_url remis à zéro (le MP3 TTS est obsolète)
// DELETE : { id }
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean, isText } from '../_lib/http.js';

const CATEGORIES = [
  'actualite', 'politique', 'economie', 'societe',
  'diaspora', 'programme', 'communique',
];

const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const isUuid = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ''));

const slugify = (titre) =>
  titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'article';

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await requireRole(req, ['superadmin']);

    const supabase = getServiceClient();
    const body = getBody(req);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('articles')
        .select('id, titre, slug, categorie, excerpt, contenu, image_url, audio_url, published, published_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return json(res, 200, { articles: data || [] });
    }

    if (req.method === 'POST') {
      const titre = clean(body.titre);
      const categorie = clean(body.categorie);
      const contenu = String(body.contenu || '').trim();
      const excerpt = clean(body.excerpt).slice(0, 300) || null;

      if (!isText(titre, 3, 200)) return json(res, 422, { error: 'Titre requis (3 à 200 caractères).' });
      if (!CATEGORIES.includes(categorie)) return json(res, 422, { error: 'Catégorie inconnue.' });
      if (contenu.length < 20) return json(res, 422, { error: 'Contenu trop court.' });

      // Slug unique : base + suffixe numérique en cas de collision.
      const base = slugify(titre);
      let lastError = null;
      for (let i = 0; i < 5; i++) {
        const slug = i === 0 ? base : `${base}-${i + 1}`;
        const { data, error } = await supabase
          .from('articles')
          .insert({ titre, slug, categorie, contenu, excerpt, published: false })
          .select()
          .single();

        if (!error) return json(res, 201, { ok: true, article: data });
        if (error.code !== '23505') throw error;
        lastError = error;
      }
      throw lastError;
    }

    if (req.method === 'PATCH') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });

      const updates = {};

      if ('titre' in body) {
        const titre = clean(body.titre);
        if (!isText(titre, 3, 200)) return json(res, 422, { error: 'Titre invalide.' });
        updates.titre = titre;
      }
      if ('categorie' in body) {
        const categorie = clean(body.categorie);
        if (!CATEGORIES.includes(categorie)) return json(res, 422, { error: 'Catégorie inconnue.' });
        updates.categorie = categorie;
      }
      if ('excerpt' in body) updates.excerpt = clean(body.excerpt).slice(0, 300) || null;
      if ('contenu' in body) {
        const contenu = String(body.contenu || '').trim();
        if (contenu.length < 20) return json(res, 422, { error: 'Contenu trop court.' });
        updates.contenu = contenu;
        updates.audio_url = null; // le MP3 TTS ne correspond plus au texte
      }

      if ('published' in body) {
        updates.published = body.published === true;
        if (updates.published) {
          const { data: current } = await supabase
            .from('articles')
            .select('published_at')
            .eq('id', body.id)
            .single();
          if (!current?.published_at) updates.published_at = new Date().toISOString();
        }
      }

      // Image de couverture (base64 → bucket public assets/articles/)
      if (body.image_base64) {
        const ext = clean(body.image_ext).toLowerCase();
        const contentType = IMAGE_TYPES[ext];
        if (!contentType) return json(res, 422, { error: 'Image : JPG, PNG ou WebP uniquement.' });

        let buffer;
        try {
          buffer = Buffer.from(String(body.image_base64), 'base64');
        } catch {
          return json(res, 422, { error: 'Image illisible.' });
        }
        if (!buffer.length || buffer.length > IMAGE_MAX_BYTES) {
          return json(res, 422, { error: 'Image trop lourde (2 Mo maximum).' });
        }

        const path = `articles/${body.id}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(path, buffer, { contentType, upsert: true });
        if (uploadError) throw uploadError;

        const { data: pub } = supabase.storage.from('assets').getPublicUrl(path);
        updates.image_url = `${pub.publicUrl}?v=${Date.now()}`;
      }

      if (Object.keys(updates).length === 0) {
        return json(res, 422, { error: 'Aucune modification fournie.' });
      }

      const { data, error } = await supabase
        .from('articles')
        .update(updates)
        .eq('id', body.id)
        .select()
        .single();
      if (error) throw error;

      return json(res, 200, { ok: true, article: data });
    }

    if (req.method === 'DELETE') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });
      const { error } = await supabase.from('articles').delete().eq('id', body.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Gestion des articles impossible.');
  }
}
