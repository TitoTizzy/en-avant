import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
// POST /api/trivia/score — Enregistre un score de quiz (classement & viralité, DAT).
// Les scores sont calculés en base depuis une partie verrouillée côté serveur.
import { getServiceClient } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';

export default async function handler(req, res) {
  try {
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const { data, error } = await supabase.rpc('ea_trivia_leaderboard');
      if (error) throw error;
      const leaderboard = (data || []).map((item, index) => ({ ...item, rank: index + 1 }));
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return json(res, 200, { leaderboard });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }
    if (!await enforceDurableRateLimit(req, res, { key: 'trivia-score', limit: 12 })) return;

    const body = getBody(req);

    const sessionId = clean(body.session_id);
    const pseudo = clean(body.pseudo);
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || pseudo.length < 2 || pseudo.length > 40) {
      return json(res, 422, { error: 'Partie ou pseudonyme invalide.' });
    }
    // The database locks the session and derives score/total from its answers.
    const { data, error } = await supabase.rpc('ea_submit_trivia', { p_session: sessionId, p_pseudo: pseudo });
    if (error) throw error;
    return json(res, data?.error ? 409 : 201, data);
  } catch (error) {
    return handleError(res, error);
  }
}
