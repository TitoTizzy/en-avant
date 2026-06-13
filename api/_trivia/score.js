// POST /api/trivia/score — Enregistre un score de quiz (classement & viralité, DAT).
// Table publique en écriture mais validée et bornée côté serveur.
import { getServiceClient } from '../_lib/supabase.js';
import { json, getBody, handleError, clean, enforceRateLimit } from '../_lib/http.js';

export default async function handler(req, res) {
  try {
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('trivia_scores')
        .select('user_session, pseudo, score, total, completed_at')
        .not('pseudo', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(300);
      if (error) throw error;

      const bestBySession = new Map();
      for (const item of data || []) {
        const current = bestBySession.get(item.user_session);
        const ratio = item.score / item.total;
        const currentRatio = current ? current.score / current.total : -1;
        if (!current || ratio > currentRatio || (ratio === currentRatio && item.score > current.score)) {
          bestBySession.set(item.user_session, item);
        }
      }

      const leaderboard = [...bestBySession.values()]
        .sort((a, b) =>
          (b.score / b.total) - (a.score / a.total) ||
          b.score - a.score ||
          new Date(a.completed_at) - new Date(b.completed_at)
        )
        .slice(0, 10)
        .map(({ pseudo, score, total, completed_at }, index) => ({
          rank: index + 1,
          pseudo,
          score,
          total,
          completed_at,
        }));

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return json(res, 200, { leaderboard });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }
    if (!enforceRateLimit(req, res, { key: 'trivia-score', limit: 12 })) return;

    const body = getBody(req);

    const userSession = clean(body.user_session);
    const pseudo = clean(body.pseudo).slice(0, 40);
    const score = Number(body.score);
    const total = Number(body.total);

    const valid =
      userSession.length >= 8 && userSession.length <= 80 &&
      pseudo.length >= 2 && pseudo.length <= 40 &&
      Number.isInteger(score) && Number.isInteger(total) &&
      score >= 0 && total >= 1 && total <= 50 && score <= total;

    if (!valid) {
      return json(res, 422, { error: 'Score invalide.' });
    }

    const { error } = await supabase.from('trivia_scores').insert({
      user_session: userSession,
      pseudo,
      score,
      total,
    });
    if (error) throw error;

    return json(res, 201, { ok: true });
  } catch (error) {
    return handleError(res, error);
  }
}
