// POST /api/chat — Assistant En Avant (public).
//   { question, langue?: 'fr'|'en'|'ht'|'es', history?: [{ role:'user'|'assistant', content }] }
//   → { reponse, sources: [{ titre, url }] }
// Garde-fous : 10 messages / 5 min par visiteur, 40 / 24 h (100 pour un membre connecté), plafond global par jour
// (CHAT_DAILY_LIMIT, 1500 par défaut) ; question ≤ 800 caractères ; réponse ≤ 2 000 tokens.
// L'adresse IP n'est jamais stockée : seule une empreinte SHA-256 sert au quota.
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../_lib/supabase.js';
import { json, methodGuard, getBody, handleError } from '../_lib/http.js';
import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
import { SYSTEM, buildPrompt, cleanHistory, loadIndex, search, sourcesOf, langueOf, message, displayNameOf } from '../_lib/chat.js';

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

/**
 * Le Livre blanc est en français : une question posée dans une autre langue est
 * d'abord traduite en français pour la recherche des passages.
 */
async function frenchQuery(anthropic, model, question) {
  const r = await anthropic.messages.create({
    model,
    max_tokens: 200,
    system: 'Traduis la question suivante en français. Réponds uniquement par la traduction, sans guillemets ni commentaire. Si elle est déjà en français, recopie-la.',
    messages: [{ role: 'user', content: question.slice(0, 800) }],
  });
  return (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim().slice(0, 800);
}

/**
 * Membre connecté : identité vérifiée par Supabase à partir du jeton de session
 * (jamais un nom envoyé par le navigateur). Sans jeton ou jeton invalide : anonyme.
 */
async function connectedMember(req, supabase) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  try {
    const { data, error } = await supabase.auth.getUser(header.slice(7));
    if (error || !data?.user) return null;
    const { data: profile } = await supabase.from('profiles').select('username').eq('id', data.user.id).maybeSingle();
    return { id: data.user.id, nom: displayNameOf({ username: profile?.username, metadata: data.user.user_metadata || {} }) };
  } catch {
    return null;
  }
}

async function ask(anthropic, model, messages) {
  return anthropic.messages.create({
    model,
    max_tokens: 2000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!methodGuard(req, res, 'POST')) return;
  try {
    const body = getBody(req);
    const langue = langueOf(body.langue);
    const question = String(body.question ?? '').replace(/\s+/g, ' ').trim();
    if (question.length < 2) return json(res, 422, { error: message('vide', langue) });
    if (question.length > 800) return json(res, 422, { error: message('long', langue) });
    if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: message('indispo', langue) });
    if (!await enforceDurableRateLimit(req, res, { key: 'chat', limit: 10, windowMs: 300000 })) return;

    const supabase = getServiceClient();
    const membre = await connectedMember(req, supabase);
    const limit = Number.parseInt(process.env.CHAT_DAILY_LIMIT, 10) || 1500;
    const { data: allowed, error: quotaError } = await supabase.rpc('ai_usage_reserve', {
      p_user: membre?.id || visitorId(req), p_kind: 'chat', p_user_limit: membre ? 100 : 40, p_global_limit: limit,
    });
    if (quotaError) throw quotaError;
    if (!allowed) {
      return json(res, 429, { error: message('quota', langue) });
    }

    const history = cleanHistory(body.history);
    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25000, maxRetries: 1 });
    // Recherche en français pour une question dans une autre langue (échec : question telle quelle).
    const searchText = langue === 'fr' ? question
      : await frenchQuery(anthropic, MODEL, `${question}${question.length < 60 && lastUser ? `\n(contexte : ${lastUser})` : ''}`)
        .catch(() => question);
    const [index, eventsResult] = await Promise.all([
      loadIndex(supabase),
      supabase.from('events').select('titre, date_cible, lieu')
        .gte('date_cible', new Date().toISOString()).order('date_cible').limit(5),
    ]);
    // La question précédente aide pour les relances courtes (« et pour la santé ? »).
    const passages = search(index, langue === 'fr' ? `${question} ${question.length < 60 ? lastUser : ''}` : `${searchText} ${question}`, 6);
    const events = (eventsResult.data || []).map((e) => ({ titre: e.titre, date: formatDate(e.date_cible), lieu: e.lieu }));
    const messages = [...history, { role: 'user', content: buildPrompt({ question, passages, events, langue, visiteur: membre }) }];

    let response;
    try {
      try {
        response = await ask(anthropic, MODEL, messages);
      } catch (error) {
        if (error?.status !== 404 || MODEL === FALLBACK_MODEL) throw error;
        response = await ask(anthropic, FALLBACK_MODEL, messages);
      }
    } catch (error) {
      // Le détail technique reste dans les journaux, jamais affiché au visiteur.
      console.error('[chat] appel IA échoué :', error?.status, error?.message);
      const busy = error?.status === 429 || error?.status === 529;
      return json(res, 503, {
        error: message(busy ? 'occupe' : 'indispo', langue),
      });
    }
    let reponse = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!reponse) return json(res, 502, { error: message('vide_reponse', langue) });
    if (response.stop_reason === 'max_tokens') {
      console.warn('[chat] réponse tronquée (max_tokens)');
      reponse = `${reponse.replace(/\s+\S*$/, '')}…`;
    }
    return json(res, 200, { reponse: reponse.slice(0, 4000), sources: sourcesOf(passages, reponse) });
  } catch (error) {
    console.error('[chat] erreur :', error?.message || error);
    return handleError(res, Number.isInteger(error?.status) && error.status < 500 ? error : new Error('chat'),
      'L’assistant est momentanément indisponible.');
  }
}
