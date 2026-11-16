// POST /api/trivia/generate-session
// Génère 8 questions IA depuis le Livre Blanc pour un membre connecté.
// Chaque question générée est stockée dans trivia_questions → banque pour l'app mobile future.
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, methodGuard, handleError } from '../_lib/http.js';

const SAVE_QUESTIONS_TOOL = {
  name: 'save_quiz_questions',
  description: 'Enregistre les questions de quiz générées.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question:           { type: 'string' },
            options:            { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
            correct_answer:     { type: 'string' },
            explication:        { type: 'string' },
            source_livre_blanc: { type: 'string' },
          },
          required: ['question', 'options', 'correct_answer', 'explication', 'source_livre_blanc'],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  },
};

// Quotas d'appels IA sur 24 h glissantes (surchargeables par variables d'environnement).
const PER_USER = Math.max(parseInt(process.env.TRIVIA_AI_DAILY_PER_USER, 10) || 3, 0);
const GLOBAL = Math.max(parseInt(process.env.TRIVIA_AI_DAILY_GLOBAL, 10) || 200, 0);
const SOURCE_WINDOW = 40000; // caractères envoyés à l'IA par génération

/** 8 questions tirées de la banque existante : aucun coût IA. */
async function questionsFromBank(supabase) {
  const { data, error } = await supabase
    .from('trivia_questions')
    .select('question, options, correct_answer, explication, source_livre_blanc')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  const pool = [...(data || [])];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 8);
}

/** Fenêtre aléatoire du Livre Blanc, alignée sur un début de paragraphe. */
function sampleSource(text) {
  if (text.length <= SOURCE_WINDOW) return text;
  let start = Math.floor(Math.random() * (text.length - SOURCE_WINDOW));
  const para = text.indexOf('\n\n', start);
  if (para !== -1 && para - start < 2000) start = para + 2;
  return text.slice(start, start + SOURCE_WINDOW);
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    // Membre ou superadmin — pas de PIN requis pour le quiz
    const { user } = await requireRole(req, ['member', 'superadmin'], { requirePin: false });
    const supabase = getServiceClient();

    const serveBank = async (reason) => {
      const questions = await questionsFromBank(supabase);
      if (questions.length < 4) {
        return json(res, 429, { error: 'Limite de quiz atteinte pour aujourd\'hui. Réessayez demain.' });
      }
      return json(res, 200, { ok: true, questions, source: 'bank', reason });
    };

    if (!process.env.ANTHROPIC_API_KEY) return serveBank('ia_indisponible');

    // Réservation atomique : si la fonction SQL manque ou que le quota est
    // atteint, on sert la banque de questions (aucun appel payant).
    const { data: allowed, error: quotaError } = await supabase.rpc('ai_usage_reserve', {
      p_user: user.id, p_kind: 'trivia_session', p_user_limit: PER_USER, p_global_limit: GLOBAL,
    });
    if (quotaError) console.error('[generate-session] quota:', quotaError.message);
    if (quotaError || allowed !== true) return serveBank('quota');

    // Charger le Livre Blanc depuis le bucket privé
    const path = process.env.LIVRE_BLANC_TEXT_PATH || 'livre-blanc.txt';
    const { data: file, error: fileError } = await supabase.storage
      .from('documents')
      .download(path);

    if (fileError || !file) {
      return json(res, 503, {
        error: 'Source documentaire indisponible. Contactez l\'administrateur.',
      });
    }

    const source = sampleSource((await file.text()).trim());

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // Haiku : rapide et économique pour la génération de quiz
      max_tokens: 4000,
      tools: [SAVE_QUESTIONS_TOOL],
      tool_choice: { type: 'tool', name: 'save_quiz_questions' },
      system:
        'Tu es un générateur de quiz pédagogiques en français sur le Livre Blanc du parti politique haïtien En Avant. ' +
        'Tu génères des questions STRICTEMENT fondées sur le document fourni. ' +
        'Tu varies les thèmes à chaque génération : sécurité, économie, éducation, diplomatie, ' +
        'diaspora, institutions, valeurs du parti, historique, chiffres clés, personnalités citées. ' +
        'N\'invente aucun fait absent du document. Style clair et accessible.',
      messages: [
        {
          role: 'user',
          content:
            'Génère exactement 8 questions à choix multiples sur ce document. ' +
            'Couvre 8 thèmes DIFFÉRENTS. ' +
            'Chaque question : 4 options, une seule correcte ' +
            '(`correct_answer` = copie exacte d\'une des options), ' +
            'une `explication` courte (1-2 phrases), ' +
            '`source_livre_blanc` = section ou thème du document.\n\n' +
            `<document>\n${source}\n</document>`,
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse?.input?.questions) {
      return json(res, 502, { error: 'Génération échouée. Réessayez.' });
    }

    const rows = toolUse.input.questions
      .filter((q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.includes(q.correct_answer)
      )
      .map((q) => ({
        question:           q.question,
        options:            q.options,
        correct_answer:     q.correct_answer,
        explication:        q.explication,
        source_livre_blanc: q.source_livre_blanc,
      }));

    if (rows.length < 4) {
      return json(res, 502, { error: 'Génération insuffisante. Réessayez.' });
    }

    // Stocker dans la banque de questions (attendu : une fonction serverless
    // peut être figée dès que la réponse est envoyée).
    const { error: insertError } = await supabase.from('trivia_questions').insert(rows);
    if (insertError) console.error('[generate-session] insert:', insertError.message);

    return json(res, 200, { ok: true, questions: rows, source: 'ai' });
  } catch (error) {
    return handleError(res, error, 'Échec de la génération du quiz.');
  }
}
