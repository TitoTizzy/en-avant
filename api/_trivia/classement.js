// GET /api/trivia/classement — Classement public du quiz (page d'accueil).
// Il ne s'affiche qu'à partir de SEUIL adhérents différents ayant terminé au moins
// une partie (phase de test) ; avant, seule la progression est renvoyée.
//   → { actif, joueurs, seuil, top: [{ rang, pseudo, points }] }  (top vide si inactif)
import { getServiceClient } from '../_lib/supabase.js';
import { json, methodGuard, handleError } from '../_lib/http.js';
import { fetchAll } from '../_lib/newsletter.js';

export const SEUIL = Number.parseInt(process.env.QUIZ_CLASSEMENT_SEUIL, 10) || 10;

/** Nombre d'adhérents différents ayant terminé au moins une partie. */
export function countPlayers(rows) {
  return new Set((rows || []).map((r) => r.user_id).filter(Boolean)).size;
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;
  try {
    const supabase = getServiceClient();
    const games = await fetchAll(() => supabase.from('quiz_games').select('user_id')
      .not('finished_at', 'is', null).order('user_id'));
    const joueurs = countPlayers(games);
    const actif = joueurs >= SEUIL;
    let top = [];
    if (actif) {
      const { data, error } = await supabase.rpc('quiz_leaderboard', { p_kind: 'general', p_user: null, p_limit: 5 });
      if (error) throw error;
      top = (data?.top || []).map(({ rang, pseudo, points }) => ({ rang, pseudo, points }));
    }
    // Mis en cache 5 minutes par le CDN : la page d'accueil ne sollicite pas la base à chaque visite.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return json(res, 200, { actif, joueurs, seuil: SEUIL, top });
  } catch (error) {
    return handleError(res, error, 'Classement indisponible.');
  }
}
