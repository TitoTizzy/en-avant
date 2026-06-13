// GET /api/articles?categorie=X&limit=12&offset=0 — Filtrage AJAX du blog (DAT)
// Lecture seule des articles publiés, avec cache CDN court.
import { getServiceClient } from './_lib/supabase.js';
import { json, methodGuard, handleError, clean } from './_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const categorie = clean(req.query.categorie);
    const slug = clean(req.query.slug);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const supabase = getServiceClient();

    // Mode article unique (page article-details) : contenu complet inclus.
    if (slug) {
      const { data: article, error } = await supabase
        .from('articles')
        .select('id, titre, slug, categorie, contenu, excerpt, image_url, audio_url, published_at')
        .eq('published', true)
        .eq('slug', slug)
        .single();

      if (error || !article) {
        return json(res, 404, { error: 'Article introuvable.' });
      }

      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return json(res, 200, { article });
    }
    let query = supabase
      .from('articles')
      .select('id, titre, slug, categorie, excerpt, image_url, audio_url, published_at', { count: 'exact' })
      .eq('published', true)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (categorie && categorie !== 'tous') {
      query = query.eq('categorie', categorie);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return json(res, 200, { articles: data, total: count });
  } catch (error) {
    return handleError(res, error);
  }
}
