// /api/trivia/membre — Module Quiz réservé aux membres connectés (permission « Participer au Trivia »).
//   GET  ?op=profil                         → pseudo, titre, score cumulé, badges, défi de la semaine
//   GET  ?op=classement&type=general|mois|semaine
//   GET  ?op=duel&id=<uuid>                 → résultats d'un duel
//   POST { op:'start', mode:'libre'|'defi'|'duel', duel? }
//   POST { op:'next', game }                → question en cours (démarre son chrono)
//   POST { op:'answer', game, index, answer } → correction + points (calculés en base)
// Aucun appel à l'IA ici : les parties puisent dans la banque générée par l'administration.
import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
import { json, getBody, handleError } from '../_lib/http.js';
import { loadImageManifest, chantierNames } from '../_lib/quiz-generation.js';
import { QUESTIONS_PAR_PARTIE, titreFor, prochainTitre, badgeInfo } from '../_lib/quiz-rules.js';
import { logQuizDay } from '../_lib/activity.js';

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

async function rpc(supabase, fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}

async function pseudoOf(supabase, userId) {
  const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
  return data?.username?.trim() || 'Membre';
}

async function imageFor(id) {
  if (!id) return null;
  const item = (await loadImageManifest()).find((i) => i.id === id);
  return item ? { src: `/${item.fichier}`, src_mobile: `/${item.fichier_mobile}`, alt: item.texte_alternatif } : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { user } = await requirePermission(req, 'jouer_trivia', { requirePin: false });
    if (!await enforceDurableRateLimit(req, res, { key: 'quiz-membre', limit: 600, subject: user.id })) return;
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const op = String(req.query?.op || '');
      if (op === 'profil') {
        const [profil, pseudo] = await Promise.all([rpc(supabase, 'quiz_profile', { p_user: user.id }), pseudoOf(supabase, user.id)]);
        const chantiers = chantierNames(await loadImageManifest());
        return json(res, 200, {
          pseudo, titre: titreFor(profil.cumul), prochain_titre: prochainTitre(profil.cumul),
          ...profil, badges: (profil.badges || []).map((code) => badgeInfo(code, chantiers)).filter(Boolean),
          noms_chantiers: chantiers, questions_par_partie: QUESTIONS_PAR_PARTIE,
        });
      }
      if (op === 'classement') {
        const type = ['general', 'mois', 'semaine'].includes(req.query?.type) ? req.query.type : 'general';
        const board = await rpc(supabase, 'quiz_leaderboard', { p_kind: type, p_user: user.id, p_limit: 20 });
        const withTitle = (row) => (row ? { ...row, titre: titreFor(row.cumul) } : null);
        return json(res, 200, { type, top: (board.top || []).map(withTitle), moi: withTitle(board.moi) });
      }
      if (op === 'duel') {
        if (!isUuid(req.query?.id)) return json(res, 422, { error: 'Duel invalide.' });
        const result = await rpc(supabase, 'quiz_duel_result', { p_duel: req.query.id });
        if (!result) return json(res, 404, { error: 'Duel introuvable.' });
        const joueurs = (result.joueurs || []).map(({ user_id: id, ...rest }) => ({ ...rest, moi: id === user.id }));
        return json(res, 200, { ...result, joueurs });
      }
      return json(res, 400, { error: 'Opération inconnue.' });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }

    const body = getBody(req);
    switch (body.op) {
      case 'start': {
        const mode = ['libre', 'defi', 'duel'].includes(body.mode) ? body.mode : null;
        if (!mode) return json(res, 422, { error: 'Mode de jeu invalide.' });
        if (body.duel && !isUuid(body.duel)) return json(res, 422, { error: 'Duel invalide.' });
        const data = await rpc(supabase, 'quiz_start', {
          p_user: user.id, p_mode: mode, p_duel: mode === 'duel' ? (body.duel || null) : null, p_count: QUESTIONS_PAR_PARTIE,
        });
        return json(res, data?.error ? 409 : 201, data);
      }
      case 'next': {
        if (!isUuid(body.game)) return json(res, 422, { error: 'Partie invalide.' });
        const data = await rpc(supabase, 'quiz_next', { p_game: body.game, p_user: user.id });
        if (data?.error) return json(res, 409, data);
        if (data?.image_id) data.image = await imageFor(data.image_id);
        return json(res, 200, data);
      }
      case 'answer': {
        if (!isUuid(body.game) || !Number.isInteger(body.index)) return json(res, 422, { error: 'Réponse invalide.' });
        const answer = body.answer === null || body.answer === undefined ? null : String(body.answer).slice(0, 2000);
        const data = await rpc(supabase, 'quiz_answer', {
          p_game: body.game, p_user: user.id, p_index: body.index, p_answer: answer,
        });
        if (data?.finished) await logQuizDay(supabase, body.game);
        return json(res, data?.error ? 409 : 200, data);
      }
      default:
        return json(res, 400, { error: 'Opération inconnue.' });
    }
  } catch (error) {
    return handleError(res, error, 'Quiz indisponible.');
  }
}
