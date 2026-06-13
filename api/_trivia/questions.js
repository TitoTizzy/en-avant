// GET /api/trivia/questions?count=8 — Questions mélangées pour le quiz public.
// Lecture seule ; les questions sont générées au préalable par /api/trivia/generate.
import { getServiceClient } from '../_lib/supabase.js';
import { json, methodGuard, handleError } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const count = Math.min(Math.max(parseInt(req.query.count, 10) || 10, 1), 12);

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('trivia_questions')
      .select('id, question, options, correct_answer, explication, source_livre_blanc')
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) throw error;

    // Mélange Fisher-Yates côté serveur pour varier chaque partie.
    const pool = [...(data || [])];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    res.setHeader('Cache-Control', 'no-store');
    return json(res, 200, { questions: pool.slice(0, count) });
  } catch (error) {
    return handleError(res, error);
  }
}
