// GET /api/articles?categorie=X&limit=12&offset=0 — Filtrage AJAX du blog (DAT)
// Lecture seule des articles publiés, avec cache CDN court.
import { getServiceClient } from './_lib/supabase.js';
import { json, methodGuard, handleError, clean } from './_lib/http.js';
import { SUBPAGES } from './_lib/site-pages.js';

// Pages publiques du site, avec priorité et fréquence indicatives pour Google.
const STATIC_PAGES = [
  ['/', '1.0', 'weekly'],
  ['/vingt-chantiers', '0.9', 'monthly'],
  ['/livre-blanc', '0.9', 'monthly'],
  ['/adherer', '0.9', 'monthly'],
  ['/blog', '0.8', 'daily'],
  ['/Apropos', '0.7', 'monthly'],
  ['/historique', '0.6', 'yearly'],
  ['/organisation', '0.6', 'monthly'],
  ['/don', '0.6', 'monthly'],
  ['/trivia', '0.5', 'monthly'],
  ['/newsletter', '0.5', 'yearly'],
  ['/mentions-legales', '0.2', 'yearly'],
  // Sous-pages des rubriques (À propos, Historique, Organisation, 20 chantiers).
  ...SUBPAGES.map((p) => [p.href, p.rubrique.key === 'chantiers' ? '0.8' : '0.6', 'monthly']),
];
export { STATIC_PAGES };

const xmlEscape = (v) => String(v).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

/** /sitemap.xml : pages publiques + articles publiés. */
async function sitemap(res) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('articles')
    .select('slug, published_at, updated_at')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  const base = 'https://enavant.org';
  const urls = [
    ...STATIC_PAGES.map(([path, priority, freq]) => `  <url><loc>${base}${path}</loc><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`),
    ...(data || []).filter((a) => a.slug).map((a) => {
      const lastmod = (a.updated_at || a.published_at || '').slice(0, 10);
      return `  <url><loc>${base}/article-details?slug=${xmlEscape(encodeURIComponent(a.slug))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>monthly</changefreq><priority>0.7</priority></url>`;
    }),
  ];
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  try {
    if (req.query?.format === 'sitemap') return await sitemap(res);

    const categorie = clean(req.query.categorie);
    const slug = clean(req.query.slug);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const supabase = getServiceClient();

    // Mode article unique (page article-details) : contenu complet inclus.
    if (slug) {
      const { data: article, error } = await supabase
        .from('articles')
        .select('id, titre, slug, categorie, contenu, excerpt, image_url, published_at')
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
      .select('id, titre, slug, categorie, excerpt, image_url, published_at, is_featured', { count: 'exact' })
      .eq('published', true)
      .order('is_featured', { ascending: false })
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
