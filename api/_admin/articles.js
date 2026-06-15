// /api/admin/articles — CRUD des articles du blog (SuperAdmin + PIN requis).
// GET    : ?review=pending → soumissions membres en attente ; sinon liste admin
// POST   : { titre, categorie, contenu, excerpt?, is_featured? }  → crée un brouillon
// PATCH  : { id, titre?, categorie?, contenu?, excerpt?, published?,
//            is_featured?, image_base64?, image_ext?, remove_image?,
//            review_status?, review_note? }                      → met à jour
//          · publication → published_at posé automatiquement
//          · is_featured:true → retire is_featured des autres articles
//          · review_status:"approved" → publie automatiquement
//          · remove_image:true → efface image_url
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
      const reviewFilter = req.query?.review;
      // Sélection étendue (colonnes ajoutées par supabase/articles-review.sql)
      // Si les colonnes n'existent pas encore, on retombe sur la sélection de base
      const SELECT_EXTENDED = 'id, titre, slug, categorie, excerpt, contenu, image_url, published, published_at, updated_at, is_featured, submitted_by, author_name, review_status, review_note';
      const SELECT_BASE     = 'id, titre, slug, categorie, excerpt, contenu, image_url, published, published_at, updated_at, is_featured';

      if (reviewFilter === 'pending') {
        // Soumissions membres en attente — silencieux si colonnes absentes
        const { data, error } = await supabase
          .from('articles')
          .select(SELECT_EXTENDED)
          .eq('review_status', 'pending')
          .order('updated_at', { ascending: false })
          .limit(50);
        if (error) return json(res, 200, { articles: [] }); // colonnes absentes → liste vide
        return json(res, 200, { articles: data || [] });
      }

      // Liste principale : essayer avec les colonnes étendues, repli sinon
      let { data, error } = await supabase
        .from('articles')
        .select(SELECT_EXTENDED)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error) {
        // Colonnes review absentes (migration non exécutée) → sélection de base
        ({ data, error } = await supabase
          .from('articles')
          .select(SELECT_BASE)
          .order('updated_at', { ascending: false })
          .limit(100));
      }
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

      const isFeatured = body.is_featured === true;

      // Si cet article sera à la une, retirer le flag des autres
      if (isFeatured) {
        await supabase.from('articles').update({ is_featured: false }).eq('is_featured', true);
      }

      // Slug unique : base + suffixe numérique en cas de collision.
      const base = slugify(titre);
      let lastError = null;
      for (let i = 0; i < 5; i++) {
        const slug = i === 0 ? base : `${base}-${i + 1}`;
        const { data, error } = await supabase
          .from('articles')
          .insert({ titre, slug, categorie, contenu, excerpt, published: false, is_featured: isFeatured })
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

      if ('is_featured' in body) {
        updates.is_featured = body.is_featured === true;
        if (updates.is_featured) {
          // Retirer le flag à la une des autres articles
          await supabase.from('articles').update({ is_featured: false }).neq('id', body.id).eq('is_featured', true);
        }
      }

      // Suppression de l'image de couverture
      if (body.remove_image === true) {
        updates.image_url = null;
      }

      // Workflow de révision (soumissions membres)
      if ('review_status' in body) {
        const validStatuses = ['pending', 'approved', 'rejected'];
        if (!validStatuses.includes(body.review_status)) {
          return json(res, 422, { error: 'review_status invalide.' });
        }
        updates.review_status = body.review_status;
        if (body.review_status === 'approved') {
          updates.published = true;
          const { data: current } = await supabase
            .from('articles')
            .select('published_at')
            .eq('id', body.id)
            .single();
          if (!current?.published_at) updates.published_at = new Date().toISOString();
        }
      }
      if ('review_note' in body) {
        updates.review_note = body.review_note ? String(body.review_note).slice(0, 500) : null;
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
