import { getServiceClient } from '../_lib/supabase.js';
import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
import { json, methodGuard, getBody, handleError } from '../_lib/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!methodGuard(req, res, 'POST')) return;
  const body = getBody(req);
  if (!/^[0-9a-f-]{36}$/i.test(body.session_id || '') || !Number.isInteger(body.index)
      || typeof body.option !== 'string' || body.option.length > 1000) {
    return json(res, 422, { error: 'Réponse invalide.' });
  }
  if (!await enforceDurableRateLimit(req, res, { key: 'trivia-answer', limit: 120 })) return;
  try {
    const { data, error } = await getServiceClient().rpc('ea_answer_trivia', {
      p_session: body.session_id, p_index: body.index, p_option: body.option,
    });
    if (error) throw error;
    return json(res, data?.error ? 409 : 200, data);
  } catch (error) { return handleError(res, error); }
}
