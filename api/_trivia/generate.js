// POST /api/trivia/generate — Génération du quiz via l'API Anthropic (DAT Corr. 3)
// Flux : SuperAdmin (token Supabase vérifié) → texte du Livre Blanc (bucket
// privé `documents`) → Claude génère via tool use (JSON strict garanti)
// → INSERT `trivia_questions`. Le frontend lira ensuite via la clé anon (RLS).
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, methodGuard, getBody, handleError } from '../_lib/http.js';

// Schéma du tool use : garantit un JSON structuré valide (pas de parsing fragile).
const SAVE_QUESTIONS_TOOL = {
  name: 'save_quiz_questions',
  description: 'Enregistre les questions de quiz générées dans la base de données.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question:            { type: 'string' },
            options:             { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
            correct_answer:      { type: 'string' },
            explication:         { type: 'string' },
            source_livre_blanc:  { type: 'string' },
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

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    await requireRole(req, ['superadmin']);

    if (!process.env.ANTHROPIC_API_KEY) {
      return json(res, 503, { error: 'ANTHROPIC_API_KEY non configurée.' });
    }

    const body = getBody(req);
    const count = Math.min(Math.max(parseInt(body.count, 10) || 8, 1), 12);

    // Source : texte fourni dans la requête, sinon le Livre Blanc du Storage.
    let source = typeof body.source_text === 'string' ? body.source_text.trim() : '';
    const supabase = getServiceClient();

    if (!source) {
      const path = process.env.LIVRE_BLANC_TEXT_PATH || 'livre-blanc.txt';
      const { data: file, error } = await supabase.storage.from('documents').download(path);
      if (!error && file) {
        source = (await file.text()).trim();
      }
    }

    if (!source) {
      return json(res, 422, {
        error:
          'Aucune source disponible : uploadez `livre-blanc.txt` dans le bucket ' +
          '`documents` ou passez `source_text` dans le corps de la requête.',
      });
    }

    source = source.slice(0, 60000); // garde-fou contexte/coût

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      tools: [SAVE_QUESTIONS_TOOL],
      tool_choice: { type: 'tool', name: 'save_quiz_questions' },
      system:
        'Tu génères des questions de quiz factuelles, en français, STRICTEMENT ' +
        'fondées sur le document fourni (le Livre Blanc du parti En Avant). ' +
        'N\'invente aucun fait absent du document. Style accessible, ton neutre.',
      messages: [
        {
          role: 'user',
          content:
            `Génère exactement ${count} questions à choix multiples sur ce document. ` +
            'Chaque question doit avoir exactement 4 options, dont une seule correcte ' +
            '(`correct_answer` doit être la copie exacte d\'une des 4 options), ' +
            'une courte `explication`, et `source_livre_blanc` citant la section ' +
            'ou le thème du document d\'où vient la réponse.\n\n' +
            `<document>\n${source}\n</document>`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse?.input?.questions) {
      return json(res, 502, { error: 'Génération invalide, veuillez réessayer.' });
    }

    // Garde-fou : on n'insère que les questions structurellement valides.
    const rows = toolUse.input.questions
      .filter(
        (q) =>
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

    if (rows.length === 0) {
      return json(res, 502, { error: 'Génération invalide, veuillez réessayer.' });
    }

    const { error: insertError } = await supabase.from('trivia_questions').insert(rows);
    if (insertError) throw insertError;

    return json(res, 201, { ok: true, inserees: rows.length, questions: rows });
  } catch (error) {
    return handleError(res, error, 'Échec de la génération du quiz.');
  }
}
