// /api/admin/trivia — Administration du Quiz (permission « Gérer le Trivia » ; PIN pour le SuperAdmin).
//   GET  ?view=resume                 → chiffres clés, questions les plus ratées, générations
//   GET  ?view=banque&format=&chantier=&difficulte=&statut=&q=&page=
//   GET  ?view=defi                   → défi de la semaine en cours et de la semaine suivante
//   GET  ?view=joueurs&q=             → joueurs membres (score cumulé, parties)
//   GET  ?view=images                 → visuels et nombre de questions qui les utilisent
//   GET  (sans view)                  → scores du quiz visiteur
//   PATCH  { id, ...champs }           → modifier / activer / désactiver une question
//   DELETE { id, kind? }               → supprimer une question ou un score visiteur
//   POST   { action:'reset_joueur', user_id }
//   POST   { action:'remplacer_defi', semaine:'courante'|'suivante', index, question_id? }
//   GET  ?view=controle                → questions techniquement injouables (même règles que le générateur)
//   POST   { action:'desactiver_risques' } → désactive toutes les questions actives injouables
import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { json, getBody, handleError } from '../_lib/http.js';
import { FORMATS, DIFFICULTES, loadImageManifest, chantierNames, fingerprint, auditQuestion } from '../_lib/quiz-generation.js';
import { titreFor } from '../_lib/quiz-rules.js';

const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''));
const PAGE = 50;

async function rpc(supabase, fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}

async function answerStats(supabase, ids) {
  if (!ids.length) return {};
  const { data, error } = await supabase.from('quiz_answers').select('question_id, correct').in('question_id', ids);
  if (error) throw error;
  const stats = {};
  for (const row of data || []) {
    const s = (stats[row.question_id] ||= { vues: 0, reussies: 0 });
    s.vues += 1;
    if (row.correct) s.reussies += 1;
  }
  return stats;
}

async function weekStarts(supabase) {
  const courante = await rpc(supabase, 'quiz_week_start', {});
  const next = new Date(`${courante}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  return { courante, suivante: next.toISOString().slice(0, 10) };
}

async function challengeFor(supabase, weekStart, create) {
  const { data, error } = await supabase.from('quiz_challenges').select('*').eq('week_start', weekStart).maybeSingle();
  if (error) throw error;
  if ((data && data.question_ids?.length >= 5) || !create) return data;
  // Tirage vérifié avant l'enregistrement : jamais de défi vide ou trop court.
  const ids = await rpc(supabase, 'quiz_pick', { p_count: 15 });
  if (!ids || ids.length < 5) return data || null;
  const { data: created, error: insertError } = data
    ? await supabase.from('quiz_challenges').update({ question_ids: ids }).eq('week_start', weekStart).select('*').maybeSingle()
    : await supabase.from('quiz_challenges')
      .upsert({ week_start: weekStart, question_ids: ids }, { onConflict: 'week_start', ignoreDuplicates: true })
      .select('*').maybeSingle();
  if (insertError) throw insertError;
  return created || (await supabase.from('quiz_challenges').select('*').eq('week_start', weekStart).single()).data;
}

/** Questions de la banque qui ne passent pas le contrôle technique. */
async function risques(supabase) {
  const imageIds = new Set((await loadImageManifest()).map((i) => i.id));
  const { data, error } = await supabase.from('trivia_questions')
    .select('id, question, format, options, correct_answer, meta, image_id, active').limit(20000);
  if (error) throw error;
  return (data || []).flatMap((q) => {
    const raison = auditQuestion(q, imageIds);
    return raison ? [{ id: q.id, question: q.question, format: q.format, active: q.active, raison }] : [];
  });
}

async function describeChallenge(supabase, challenge) {
  if (!challenge) return null;
  const { data, error } = await supabase.from('trivia_questions')
    .select('id, question, format, chantier, active').in('id', challenge.question_ids);
  if (error) throw error;
  const byId = Object.fromEntries((data || []).map((q) => [q.id, q]));
  const { count } = await supabase.from('quiz_games').select('id', { count: 'exact', head: true })
    .eq('mode', 'defi').eq('week_start', challenge.week_start);
  return {
    week_start: challenge.week_start,
    joueurs: count || 0,
    questions: challenge.question_ids.map((id, index) => ({ index, id, ...(byId[id] || { question: '(question supprimée)' }) })),
  };
}

function cleanEdit(body, format) {
  const patch = {};
  if (typeof body.active === 'boolean') patch.active = body.active;
  if (typeof body.question === 'string' && body.question.trim().length >= 8) {
    patch.question = body.question.trim().slice(0, 500);
    patch.empreinte = fingerprint(patch.question);
  }
  if (typeof body.explication === 'string') patch.explication = body.explication.trim().slice(0, 1000) || null;
  if (typeof body.source_livre_blanc === 'string') patch.source_livre_blanc = body.source_livre_blanc.trim().slice(0, 300) || null;
  if (body.chantier === null || (Number.isInteger(body.chantier) && body.chantier >= 1 && body.chantier <= 20)) patch.chantier = body.chantier;
  if (DIFFICULTES.includes(body.difficulte)) patch.difficulte = body.difficulte;
  if ((Array.isArray(body.options) || typeof body.correct_answer === 'string') && ['chiffre', 'ordre'].includes(format)) {
    return { error: 'Pour ce format, la réponse ne se modifie pas ici : désactivez la question et générez-en une nouvelle.' };
  }
  if (Array.isArray(body.options) && typeof body.correct_answer === 'string') {
    const options = body.options.map((o) => String(o).trim().slice(0, 200)).filter(Boolean);
    if (options.length >= 2 && new Set(options).size === options.length && options.includes(body.correct_answer.trim())) {
      patch.options = options;
      patch.correct_answer = body.correct_answer.trim();
    } else {
      return { error: 'La bonne réponse doit faire partie des options, toutes différentes.' };
    }
  }
  return patch;
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await requirePermission(req, 'gerer_trivia');
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const view = String(req.query?.view || '');

      if (view === 'controle') {
        return json(res, 200, { risques: await risques(supabase) });
      }

      if (view === 'resume') {
        const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
        const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
        const [questions, games7, gamesAll, players7, players30, answered, generations] = await Promise.all([
          supabase.from('trivia_questions').select('format, chantier, active').limit(20000),
          supabase.from('quiz_games').select('id', { count: 'exact', head: true }).not('finished_at', 'is', null).gte('finished_at', since7),
          supabase.from('quiz_games').select('id', { count: 'exact', head: true }).not('finished_at', 'is', null),
          supabase.from('quiz_games').select('user_id').gte('started_at', since7).limit(20000),
          supabase.from('quiz_games').select('user_id').gte('started_at', since30).limit(20000),
          supabase.from('quiz_answers').select('question_id, correct').limit(50000),
          supabase.from('quiz_generations').select('*').order('created_at', { ascending: false }).limit(10),
        ]);
        for (const r of [questions, games7, gamesAll, players7, players30, answered, generations]) if (r.error) throw r.error;
        const parFormat = {};
        let actives = 0;
        for (const q of questions.data || []) {
          parFormat[q.format] = (parFormat[q.format] || 0) + 1;
          if (q.active) actives += 1;
        }
        const perQuestion = {};
        for (const a of answered.data || []) {
          const s = (perQuestion[a.question_id] ||= { vues: 0, reussies: 0 });
          s.vues += 1; if (a.correct) s.reussies += 1;
        }
        const hardestIds = Object.entries(perQuestion).filter(([, s]) => s.vues >= 5)
          .sort((a, b) => a[1].reussies / a[1].vues - b[1].reussies / b[1].vues).slice(0, 10);
        let plusRatees = [];
        if (hardestIds.length) {
          const { data, error } = await supabase.from('trivia_questions').select('id, question, format, active').in('id', hardestIds.map(([id]) => id));
          if (error) throw error;
          const byId = Object.fromEntries((data || []).map((q) => [q.id, q]));
          plusRatees = hardestIds.filter(([id]) => byId[id]).map(([id, s]) => ({
            ...byId[id], vues: s.vues, taux_reussite: Math.round((s.reussies / s.vues) * 100),
          }));
        }
        const total = (questions.data || []).length;
        return json(res, 200, {
          questions: { total, actives, par_format: parFormat, jamais_jouees: Math.max(0, total - Object.keys(perQuestion).length) },
          parties: { total: gamesAll.count || 0, sept_jours: games7.count || 0 },
          joueurs: {
            sept_jours: new Set((players7.data || []).map((r) => r.user_id)).size,
            trente_jours: new Set((players30.data || []).map((r) => r.user_id)).size,
          },
          plus_ratees: plusRatees,
          generations: generations.data || [],
        });
      }

      if (view === 'banque') {
        const page = Math.max(parseInt(req.query.page, 10) || 0, 0);
        let query = supabase.from('trivia_questions')
          .select('id, question, format, options, correct_answer, explication, source_livre_blanc, chantier, difficulte, image_id, meta, active, created_at', { count: 'exact' })
          .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
        if (FORMATS.includes(req.query.format)) query = query.eq('format', req.query.format);
        if (/^\d{1,2}$/.test(String(req.query.chantier || ''))) query = query.eq('chantier', Number(req.query.chantier));
        if (DIFFICULTES.includes(req.query.difficulte)) query = query.eq('difficulte', req.query.difficulte);
        if (req.query.statut === 'active') query = query.eq('active', true);
        if (req.query.statut === 'inactive') query = query.eq('active', false);
        const q = String(req.query.q || '').trim().slice(0, 80).replace(/[%_,()]/g, ' ');
        if (q) query = query.ilike('question', `%${q}%`);
        const { data, error, count } = await query;
        if (error) throw error;
        const stats = await answerStats(supabase, (data || []).map((r) => r.id));
        return json(res, 200, {
          total: count || 0, page, par_page: PAGE,
          questions: (data || []).map((r) => {
            const s = stats[r.id];
            return { ...r, vues: s?.vues || 0, taux_reussite: s ? Math.round((s.reussies / s.vues) * 100) : null };
          }),
        });
      }

      if (view === 'defi') {
        const weeks = await weekStarts(supabase);
        const [courante, suivante, classement] = await Promise.all([
          challengeFor(supabase, weeks.courante, false),
          challengeFor(supabase, weeks.suivante, false),
          rpc(supabase, 'quiz_leaderboard', { p_kind: 'semaine', p_user: null, p_limit: 10 }),
        ]);
        return json(res, 200, {
          semaines: weeks,
          courante: await describeChallenge(supabase, courante),
          suivante: await describeChallenge(supabase, suivante),
          classement: classement.top || [],
        });
      }

      if (view === 'joueurs') {
        const { data: games, error } = await supabase.from('quiz_games')
          .select('user_id, points, finished_at').not('finished_at', 'is', null).limit(50000);
        if (error) throw error;
        const players = {};
        for (const g of games || []) {
          const p = (players[g.user_id] ||= { user_id: g.user_id, cumul: 0, parties: 0, dernier: null });
          p.cumul += g.points; p.parties += 1;
          if (!p.dernier || g.finished_at > p.dernier) p.dernier = g.finished_at;
        }
        const ids = Object.keys(players);
        const pseudos = {};
        for (let i = 0; i < ids.length; i += 200) {
          const { data, error: profileError } = await supabase.from('profiles').select('id, username').in('id', ids.slice(i, i + 200));
          if (profileError) throw profileError;
          for (const p of data || []) pseudos[p.id] = p.username;
        }
        const q = String(req.query.q || '').trim().toLowerCase();
        const list = Object.values(players)
          .map((p) => ({ ...p, pseudo: pseudos[p.user_id] || 'Membre', titre: titreFor(p.cumul) }))
          .filter((p) => !q || p.pseudo.toLowerCase().includes(q))
          .sort((a, b) => b.cumul - a.cumul).slice(0, 200);
        return json(res, 200, { joueurs: list, total: Object.keys(players).length });
      }

      if (view === 'images') {
        const manifest = await loadImageManifest();
        const { data, error } = await supabase.from('trivia_questions').select('image_id').not('image_id', 'is', null).limit(20000);
        if (error) throw error;
        const usage = {};
        for (const r of data || []) usage[r.image_id] = (usage[r.image_id] || 0) + 1;
        return json(res, 200, {
          chantiers: chantierNames(manifest),
          images: manifest.map((i) => ({
            id: i.id, titre: i.titre, categorie: i.categorie, chantier: i.chantier,
            src: `/${i.fichier_mobile || i.fichier}`, legende: i.legende, questions: usage[i.id] || 0,
          })),
        });
      }

      // Par défaut : scores du quiz visiteur (modération).
      const { data, error } = await supabase.from('trivia_scores')
        .select('id, pseudo, score, total, completed_at').order('completed_at', { ascending: false }).limit(100);
      if (error) throw error;
      return json(res, 200, { scores: data || [] });
    }

    if (req.method === 'PATCH') {
      const body = getBody(req);
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });
      const { data: current, error: currentError } = await supabase.from('trivia_questions')
        .select('question, format, options, correct_answer, meta, image_id').eq('id', body.id).maybeSingle();
      if (currentError) throw currentError;
      if (!current) return json(res, 404, { error: 'Question introuvable.' });
      const patch = cleanEdit(body, current.format);
      if (patch.error) return json(res, 422, { error: patch.error });
      if (!Object.keys(patch).length) return json(res, 422, { error: 'Aucune modification valide.' });
      // Une modification ne doit jamais rendre la question injouable.
      const imageIds = new Set((await loadImageManifest()).map((i) => i.id));
      const probleme = auditQuestion({ ...current, ...patch }, imageIds);
      if (probleme && patch.active !== false) return json(res, 422, { error: `Modification refusée : ${probleme}.` });
      const { data, error } = await supabase.from('trivia_questions').update(patch).eq('id', body.id).select('id, active').maybeSingle();
      if (error) {
        if (error.code === '23505') return json(res, 409, { error: 'Une question identique existe déjà.' });
        throw error;
      }
      if (!data) return json(res, 404, { error: 'Question introuvable.' });
      return json(res, 200, { ok: true, question: data });
    }

    if (req.method === 'DELETE') {
      const { id, kind } = getBody(req);
      if (!isUuid(id)) return json(res, 422, { error: 'Identifiant invalide.' });
      const table = kind === 'score' ? 'trivia_scores' : 'trivia_questions';
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST') {
      const body = getBody(req);
      if (body.action === 'desactiver_risques') {
        const ids = (await risques(supabase)).filter((q) => q.active).map((q) => q.id);
        if (ids.length) {
          const { error } = await supabase.from('trivia_questions').update({ active: false }).in('id', ids);
          if (error) throw error;
        }
        return json(res, 200, { ok: true, desactivees: ids.length });
      }
      if (body.action === 'reset_joueur') {
        if (!isUuid(body.user_id)) return json(res, 422, { error: 'Joueur invalide.' });
        const { error, count } = await supabase.from('quiz_games').delete({ count: 'exact' }).eq('user_id', body.user_id);
        if (error) throw error;
        return json(res, 200, { ok: true, parties_supprimees: count || 0 });
      }
      if (body.action === 'remplacer_defi') {
        const weeks = await weekStarts(supabase);
        const week = body.semaine === 'suivante' ? weeks.suivante : weeks.courante;
        const index = Number(body.index);
        const challenge = await challengeFor(supabase, week, true);
        if (!challenge || !Number.isInteger(index) || index < 0 || index >= challenge.question_ids.length) {
          return json(res, 422, { error: 'Question du défi invalide.' });
        }
        if (body.semaine !== 'suivante') {
          const { count } = await supabase.from('quiz_games').select('id', { count: 'exact', head: true })
            .eq('mode', 'defi').eq('week_start', week);
          if (count) return json(res, 409, { error: 'Des membres ont déjà joué le défi de cette semaine : préparez plutôt celui de la semaine suivante.' });
        }
        let replacement = body.question_id;
        if (replacement) {
          if (!isUuid(replacement) || challenge.question_ids.includes(replacement)) return json(res, 422, { error: 'Question de remplacement invalide.' });
          const { data } = await supabase.from('trivia_questions').select('id').eq('id', replacement).eq('active', true).maybeSingle();
          if (!data) return json(res, 422, { error: 'Question de remplacement introuvable ou désactivée.' });
        } else {
          const picks = await rpc(supabase, 'quiz_pick', { p_count: 40 });
          replacement = (picks || []).find((id) => !challenge.question_ids.includes(id));
          if (!replacement) return json(res, 409, { error: 'Aucune autre question disponible.' });
        }
        const ids = [...challenge.question_ids];
        ids[index] = replacement;
        const { error } = await supabase.from('quiz_challenges').update({ question_ids: ids }).eq('week_start', week);
        if (error) throw error;
        return json(res, 200, { ok: true, defi: await describeChallenge(supabase, { ...challenge, question_ids: ids }) });
      }
      return json(res, 400, { error: 'Action inconnue.' });
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE, POST');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Gestion du quiz impossible.');
  }
}
