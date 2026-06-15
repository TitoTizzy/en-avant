// /api/member/articles — Articles soumis par les membres.
// GET   : liste les articles de l'utilisateur connecté
// POST  : { titre, categorie, contenu, excerpt? } → soumet un article (pending)
// PATCH : { id, titre?, categorie?, contenu?, excerpt? } → modifie un brouillon personnel
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean, isText } from '../_lib/http.js';

const CATEGORIES = [
  'actualite', 'politique', 'economie', 'societe',
  'diaspora', 'programme', 'communique',
];

const ALL_MEMBER_ROLES = ['member', 'editor', 'readonly', 'admin', 'superadmin'];

const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''));

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

    // Tous les membres authentifiés (pas de PIN requis)
    const { user } = await requireRole(req, ALL_MEMBER_ROLES, { requirePin: false });
    const supabase = getServiceClient();
    const body = getBody(req);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('articles')
        .select('id, titre, categorie, excerpt, published, published_at, updated_at, review_status, review_note, image_url')
        .eq('submitted_by', user.id)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return json(res, 200, { articles: data || [] });
    }

    if (req.method === 'POST') {
      const titre   = clean(body.titre);
      const categorie = clean(body.categorie);
      const contenu = String(body.contenu || '').trim();
      const excerpt = clean(body.excerpt).slice(0, 300) || null;

      if (!isText(titre, 3, 200))         return json(res, 422, { error: 'Titre requis (3 à 200 caractères).' });
      if (!CATEGORIES.includes(categorie)) return json(res, 422, { error: 'Catégorie inconnue.' });
      if (contenu.length < 20)             return json(res, 422, { error: 'Contenu trop court (20 caractères minimum).' });

      const meta   = user.user_metadata || {};
      const authorName = clean(meta.nom || meta.pseudo || user.email?.split('@')[0] || '').slice(0, 120) || null;

      const base = slugify(titre);
      let lastError = null;
      for (let i = 0; i < 5; i++) {
        const slug = i === 0 ? base : `${base}-${i + 1}`;
        const { data, error } = await supabase
          .from('articles')
          .insert({
            titre,
            slug,
            categorie,
            contenu,
            excerpt,
            published: false,
            submitted_by: user.id,
            author_name: authorName,
            review_status: 'pending',
          })
          .select('id, titre, review_status')
          .single();

        if (!error) return json(res, 201, { ok: true, article: data });
        if (error.code !== '23505') throw error;
        lastError = error;
      }
      throw lastError;
    }

    if (req.method === 'PATCH') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });

      // Vérifier que l'article appartient bien à ce membre et est encore modifiable
      const { data: existing, error: fetchErr } = await supabase
        .from('articles')
        .select('submitted_by, review_status')
        .eq('id', body.id)
        .single();

      if (fetchErr || !existing) return json(res, 404, { error: 'Article introuvable.' });
      if (existing.submitted_by !== user.id) return json(res, 403, { error: 'Cet article ne vous appartient pas.' });
      if (existing.review_status === 'approved') return json(res, 403, { error: 'Impossible de modifier un article déjà approuvé.' });

      const updates = { review_status: 'pending' }; // re-soumettre après modification
      if ('titre' in body) {
        const titre = clean(body.titre);
        if (!isText(titre, 3, 200)) return json(res, 422, { error: 'Titre invalide.' });
        updates.titre = titre;
      }
      if ('categorie' in body) {
        if (!CATEGORIES.includes(body.categorie)) return json(res, 422, { error: 'Catégorie inconnue.' });
        updates.categorie = body.categorie;
      }
      if ('excerpt' in body) updates.excerpt = clean(body.excerpt).slice(0, 300) || null;
      if ('contenu' in body) {
        const contenu = String(body.contenu || '').trim();
        if (contenu.length < 20) return json(res, 422, { error: 'Contenu trop court.' });
        updates.contenu = contenu;
      }

      const { data, error } = await supabase
        .from('articles')
        .update(updates)
        .eq('id', body.id)
        .select('id, titre, review_status')
        .single();
      if (error) throw error;
      return json(res, 200, { ok: true, article: data });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Opération impossible.');
  }
}
