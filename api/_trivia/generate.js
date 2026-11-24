// POST /api/trivia/generate — Génère 50 nouvelles questions pour la banque du quiz.
// Seul point d'appel à l'IA : lancé depuis l'administration (permission « Gérer le Trivia »).
// Flux : Livre blanc (bucket privé `documents`) + fiches des visuels + liste des questions
// existantes → 5 appels Claude en parallèle (10 questions, tous formats) → contrôle,
// anti-doublon → insertion directe (questions jouables tout de suite).
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { json, methodGuard, handleError } from '../_lib/http.js';
import {
  APPELS, QUOTA_PAR_APPEL, QUESTION_TOOL, SYSTEM_PROMPT, buildUserPrompt, chantierNames,
  auditQuestion, duplicateIndex, loadImageManifest, sourceWindow, toQuestionRow,
} from '../_lib/quiz-generation.js';

const MODEL = process.env.TRIVIA_MODEL || 'claude-haiku-5-5';
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';

async function ask(anthropic, model, prompt) {
  return anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [QUESTION_TOOL],
    tool_choice: { type: 'tool', name: QUESTION_TOOL.name },
    messages: [{ role: 'user', content: prompt }],
  });
}

async function askWithFallback(anthropic, prompt) {
  try {
    return { response: await ask(anthropic, MODEL, prompt), model: MODEL };
  } catch (error) {
    if (error?.status === 404 && MODEL !== FALLBACK_MODEL) {
      return { response: await ask(anthropic, FALLBACK_MODEL, prompt), model: FALLBACK_MODEL };
    }
    throw error;
  }
}

function pickImages(manifest, count) {
  const pool = [...manifest];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!methodGuard(req, res, 'POST')) return;
  let generationId = null;
  let supabase = null;
  try {
    supabase = getServiceClient();
    const { user } = await requirePermission(req, 'gerer_trivia');
    if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: 'ANTHROPIC_API_KEY non configurée.' });

    const path = process.env.LIVRE_BLANC_TEXT_PATH || 'livre-blanc.txt';
    const { data: file, error: fileError } = await supabase.storage.from('documents').download(path);
    const source = !fileError && file ? (await file.text()).trim() : '';
    if (!source) return json(res, 422, { error: 'Livre blanc introuvable dans le bucket « documents ».' });

    const { data: existingRows, error: existingError } = await supabase
      .from('trivia_questions').select('question, created_at')
      .order('created_at', { ascending: false }).limit(5000);
    if (existingError) throw existingError;
    const existing = (existingRows || []).map((r) => r.question);

    const { data: generation, error: genError } = await supabase.from('quiz_generations')
      .insert({ created_by: user.id, demandees: APPELS * Object.values(QUOTA_PAR_APPEL).reduce((a, b) => a + b, 0), modele: MODEL })
      .select('id').single();
    if (genError) throw genError;
    generationId = generation.id;

    const manifest = await loadImageManifest();
    const chantiers = chantierNames(manifest);
    const imageIds = new Set(manifest.map((i) => i.id));
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Les questions existantes les plus récentes sont citées à l'IA ; toutes sont vérifiées ensuite.
    const cited = existing.slice(0, 250);

    const results = await Promise.allSettled(Array.from({ length: APPELS }, (_, i) => askWithFallback(anthropic,
      buildUserPrompt({
        source: sourceWindow(source, i, APPELS),
        chantiers,
        images: pickImages(manifest, 3),
        existing: cited,
        quota: QUOTA_PAR_APPEL,
      }))));

    const dupes = duplicateIndex(existing);
    const rows = [];
    let duplicates = 0;
    let rejected = 0;
    let modelUsed = MODEL;
    const failures = [];
    for (const result of results) {
      if (result.status !== 'fulfilled') { failures.push(result.reason?.message || 'Appel IA échoué'); continue; }
      modelUsed = result.value.model;
      const tool = result.value.response.content.find((b) => b.type === 'tool_use');
      for (const candidate of tool?.input?.questions || []) {
        const row = toQuestionRow(candidate, { imageIds, generationId });
        // Double contrôle : aucune question injouable n'entre dans la banque.
        if (!row || auditQuestion(row, imageIds)) { rejected += 1; continue; }
        if (dupes.has(row.question)) { duplicates += 1; continue; }
        dupes.add(row.question);
        rows.push(row);
      }
    }

    if (rows.length) {
      const { error: insertError } = await supabase.from('trivia_questions').insert(rows);
      if (insertError) throw insertError;
    }

    const failed = !rows.length;
    await supabase.from('quiz_generations').update({
      inserees: rows.length, doublons: duplicates, rejetees: rejected, modele: modelUsed,
      statut: failed ? 'echec' : 'termine', erreur: failures.length ? failures.join(' | ').slice(0, 1000) : null,
    }).eq('id', generationId);

    if (failed) return json(res, 502, { error: 'Aucune question valide générée. Réessayez.', doublons: duplicates, rejetees: rejected });
    const parFormat = rows.reduce((acc, r) => ({ ...acc, [r.format]: (acc[r.format] || 0) + 1 }), {});
    return json(res, 201, {
      ok: true, generation_id: generationId, inserees: rows.length, doublons: duplicates,
      rejetees: rejected, appels_echoues: failures.length, par_format: parFormat,
      questions: rows.map(({ question, format, chantier }) => ({ question, format, chantier })),
    });
  } catch (error) {
    if (generationId && supabase) {
      await supabase.from('quiz_generations')
        .update({ statut: 'echec', erreur: String(error?.message || error).slice(0, 1000) })
        .eq('id', generationId);
    }
    return handleError(res, error, 'Échec de la génération du quiz.');
  }
}
