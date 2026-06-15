// /api/admin/trivia — Banque de questions du quiz (SuperAdmin + PIN).
// GET    : liste des questions (récentes en premier)
// DELETE : { id, kind? } → retire une question ou un score
import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { json, getBody, handleError } from '../_lib/http.js';

const isUuid = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ''));

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await requirePermission(req, 'gerer_trivia');

    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const [questionsResult, scoresResult] = await Promise.all([
        supabase
          .from('trivia_questions')
          .select('id, question, correct_answer, source_livre_blanc, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('trivia_scores')
          .select('id, pseudo, score, total, completed_at')
          .order('completed_at', { ascending: false })
          .limit(100),
      ]);
      if (questionsResult.error) throw questionsResult.error;
      if (scoresResult.error) throw scoresResult.error;
      return json(res, 200, {
        questions: questionsResult.data || [],
        scores: scoresResult.data || [],
      });
    }

    if (req.method === 'DELETE') {
      const { id, kind } = getBody(req);
      if (!isUuid(id)) return json(res, 422, { error: 'Identifiant invalide.' });

      const table = kind === 'score' ? 'trivia_scores' : 'trivia_questions';
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, DELETE');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Gestion du quiz impossible.');
  }
}
