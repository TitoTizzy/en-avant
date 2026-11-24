// POST /api/chat — Assistant En Avant (public).
//   { question, langue?: langue du site, langue_conv?: langue de la conversation (message sans langue identifiable),
//     history?: [{ role:'user'|'assistant', content }], stream?: true }
//   → { reponse, sources: [{ titre, url }], langue }
//   stream: true → flux NDJSON : {type:'meta', langue} puis {type:'delta', text}… puis
//   {type:'done', reponse, sources} (ou {type:'error', error}). Les erreurs avant le début de la réponse restent en JSON.
// Langue de réponse : demandée dans le message > majoritaire dans le message > conversation > site.
// Garde-fous : 10 messages / 5 min par visiteur, 40 / 24 h (100 pour un membre connecté), plafond global par jour
// (CHAT_DAILY_LIMIT, 1500 par défaut) ; question ≤ 800 caractères ; réponse ≤ 2 000 tokens.
// L'adresse IP n'est jamais stockée : seule une empreinte SHA-256 sert au quota.
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../_lib/supabase.js';
import { json, methodGuard, getBody, handleError } from '../_lib/http.js';
import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
import {
  SYSTEM, ANALYSE, buildPrompt, cleanHistory, loadIndex, search, sourcesOf, langueOf, message, displayNameOf,
  detectLangue, langueDemandee, choisirLangue, parseAnalyse, withChantier,
} from '../_lib/chat.js';

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
 * Analyse rapide du message : langue majoritaire, langue demandée, ton, requête de
 * recherche en français (le Livre blanc est en français). Repli local si l'appel échoue.
 */
async function analyse(anthropic, model, question, history) {
  const context = history.slice(-2).map((m) => `${m.role === 'user' ? 'Visiteur' : 'Assistant'} : ${m.content.slice(0, 300)}`).join('\n');
  try {
    const r = await anthropic.messages.create({
      model,
      max_tokens: 250,
      system: ANALYSE,
      messages: [{ role: 'user', content: `${context ? `<contexte>\n${context}\n</contexte>\n` : ''}<message>${question}</message>` }],
    }, { timeout: 8000 });
    const out = parseAnalyse((r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
    return { ...out, ok: true };
  } catch (error) {
    console.warn('[chat] analyse indisponible :', error?.status, error?.message);
    return { langue: detectLangue(question), langueDemandee: langueDemandee(question), requeteFr: '', ton: '', ok: false };
  }
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

async function ask(anthropic, model, messages, stream = false) {
  return anthropic.messages.create({
    model,
    max_tokens: 2000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
    ...(stream ? { stream: true } : {}),
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!methodGuard(req, res, 'POST')) return;
  try {
    const body = getBody(req);
    const site = langueOf(body.langue);
    const question = String(body.question ?? '').replace(/\s+/g, ' ').trim();
    // Messages d'erreur : langue probable du visiteur.
    let langue = choisirLangue({ demandee: langueDemandee(question), dominante: detectLangue(question), conversation: body.langue_conv, site });
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
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25000, maxRetries: 1 });
    const [info, index, eventsResult] = await Promise.all([
      analyse(anthropic, MODEL, question, history),
      loadIndex(supabase),
      supabase.from('events').select('titre, date_cible, lieu')
        .gte('date_cible', new Date().toISOString()).order('date_cible').limit(5),
    ]);
    const demandee = langueDemandee(question) || info.langueDemandee;
    langue = choisirLangue({ demandee, dominante: info.langue || detectLangue(question), conversation: body.langue_conv, site });

    // Recherche : requête reformulée en français + question ; relance courte → question précédente en appui.
    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
    const query = `${info.requeteFr} ${question} ${!info.requeteFr && question.length < 60 ? lastUser : ''}`;
    const passages = withChantier(index, `${info.requeteFr} ${question}`, search(index, query, 6));
    const events = (eventsResult.data || []).map((e) => ({ titre: e.titre, date: formatDate(e.date_cible), lieu: e.lieu }));
    const messages = [...history, { role: 'user', content: buildPrompt({ question, passages, events, langue, visiteur: membre, ton: info.ton }) }];
    const stream = body.stream === true;

    let response;
    try {
      try {
        response = await ask(anthropic, MODEL, messages, stream);
      } catch (error) {
        if (error?.status !== 404 || MODEL === FALLBACK_MODEL) throw error;
        response = await ask(anthropic, FALLBACK_MODEL, messages, stream);
      }
    } catch (error) {
      // Le détail technique reste dans les journaux, jamais affiché au visiteur.
      console.error('[chat] appel IA échoué :', error?.status, error?.message);
      const busy = error?.status === 429 || error?.status === 529;
      return json(res, 503, {
        error: message(busy ? 'occupe' : 'indispo', langue),
      });
    }
    const finish = (text, stop) => {
      let reponse = String(text || '').trim();
      if (reponse && stop === 'max_tokens') {
        console.warn('[chat] réponse tronquée (max_tokens)');
        reponse = `${reponse.replace(/\s+\S*$/, '')}…`;
      }
      return reponse.slice(0, 4000);
    };

    if (stream) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no');
      const line = (payload) => res.write(`${JSON.stringify(payload)}\n`);
      line({ type: 'meta', langue });
      let text = '';
      let stop = null;
      try {
        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            text += event.delta.text;
            line({ type: 'delta', text: event.delta.text });
          } else if (event.type === 'message_delta') {
            stop = event.delta?.stop_reason || stop;
          }
        }
      } catch (error) {
        console.error('[chat] flux interrompu :', error?.status, error?.message);
        if (!text) {
          line({ type: 'error', error: message('indispo', langue) });
          return res.end();
        }
        stop = 'max_tokens';
      }
      const reponse = finish(text, stop);
      if (!reponse) line({ type: 'error', error: message('vide_reponse', langue) });
      else line({ type: 'done', reponse, sources: sourcesOf(passages, reponse), langue });
      return res.end();
    }

    const reponse = finish((response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'), response.stop_reason);
    if (!reponse) return json(res, 502, { error: message('vide_reponse', langue) });
    return json(res, 200, { reponse, sources: sourcesOf(passages, reponse), langue });
  } catch (error) {
    console.error('[chat] erreur :', error?.message || error);
    return handleError(res, Number.isInteger(error?.status) && error.status < 500 ? error : new Error('chat'),
      'L’assistant est momentanément indisponible.');
  }
}
