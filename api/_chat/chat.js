// POST /api/chat — Assistant En Avant (public).
//   { question, history?: [{ role:'user'|'assistant', content }] }
//   → { reponse, sources: [{ titre, url }] }
// Garde-fous : 10 messages / 5 min par visiteur, 40 / 24 h, plafond global par jour
// (CHAT_DAILY_LIMIT, 1500 par défaut) ; question ≤ 800 caractères ; réponse ≤ 700 tokens.
// L'adresse IP n'est jamais stockée : seule une empreinte SHA-256 sert au quota.
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../_lib/supabase.js';
import { json, methodGuard, getBody, handleError } from '../_lib/http.js';
import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
import { SYSTEM, buildPrompt, cleanHistory, loadIndex, search, sourcesOf } from '../_lib/chat.js';

const MODEL = process.env.CHAT_MODEL || 'claude-haiku-5-5';
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';

/** Identifiant de quota anonyme (UUID dérivé de l'IP, non réversible). */
function visitorId(req) {
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for']
    || req.socket?.remoteAddress || 'inconnu').split(',')[0].trim();
  const h = createHash('sha256').update(`chat:${ip}:${process.env.SUPABASE_URL || ''}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Port-au-Prince',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

async function ask(anthropic, model, messages) {
  return anthropic.messages.create({
    model,
    max_tokens: 700,
    temperature: 0.2,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!methodGuard(req, res, 'POST')) return;
  try {
    const body = getBody(req);
    const question = String(body.question ?? '').replace(/\s+/g, ' ').trim();
    if (question.length < 2) return json(res, 422, { error: 'Posez votre question.' });
    if (question.length > 800) return json(res, 422, { error: 'Question trop longue (800 caractères au maximum).' });
    if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: 'L’assistant est momentanément indisponible.' });
    if (!await enforceDurableRateLimit(req, res, { key: 'chat', limit: 10, windowMs: 300000 })) return;

    const supabase = getServiceClient();
    const limit = Number.parseInt(process.env.CHAT_DAILY_LIMIT, 10) || 1500;
    const { data: allowed, error: quotaError } = await supabase.rpc('ai_usage_reserve', {
      p_user: visitorId(req), p_kind: 'chat', p_user_limit: 40, p_global_limit: limit,
    });
    if (quotaError) throw quotaError;
    if (!allowed) {
      return json(res, 429, { error: 'Vous avez atteint la limite de questions pour aujourd’hui. Écrivez-nous à contact@enavant.org, nous vous répondrons.' });
    }

    const history = cleanHistory(body.history);
    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
    const [index, eventsResult] = await Promise.all([
      loadIndex(supabase),
      supabase.from('events').select('titre, date_cible, lieu')
        .gte('date_cible', new Date().toISOString()).order('date_cible').limit(5),
    ]);
    // La question précédente aide pour les relances courtes (« et pour la santé ? »).
    const passages = search(index, `${question} ${question.length < 60 ? lastUser : ''}`, 6);
    const events = (eventsResult.data || []).map((e) => ({ titre: e.titre, date: formatDate(e.date_cible), lieu: e.lieu }));
    const messages = [...history, { role: 'user', content: buildPrompt({ question, passages, events }) }];

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25000, maxRetries: 1 });
    let response;
    try {
      response = await ask(anthropic, MODEL, messages);
    } catch (error) {
      if (error?.status !== 404 || MODEL === FALLBACK_MODEL) throw error;
      response = await ask(anthropic, FALLBACK_MODEL, messages);
    }
    const reponse = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!reponse) return json(res, 502, { error: 'Pas de réponse pour le moment. Réessayez.' });
    return json(res, 200, { reponse: reponse.slice(0, 4000), sources: sourcesOf(passages) });
  } catch (error) {
    if (error?.status === 429 || error?.status === 529) {
      return json(res, 503, { error: 'L’assistant est très sollicité. Réessayez dans un instant.' });
    }
    return handleError(res, error, 'L’assistant est momentanément indisponible.');
  }
}
