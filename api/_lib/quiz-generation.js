// Génération de la banque du quiz : consignes à l'IA, contrôle des questions
// reçues et détection des doublons. Fonctions pures (testées sans réseau).
import { readFile } from 'node:fs/promises';

export const FORMATS = ['qcm', 'vrai_faux', 'chiffre', 'citation', 'image', 'ordre'];
export const DIFFICULTES = ['facile', 'moyen', 'difficile'];

// 5 appels de 10 questions = 50 questions, tous les formats à chaque fois.
export const QUOTA_PAR_APPEL = { qcm: 3, vrai_faux: 2, chiffre: 2, citation: 1, image: 1, ordre: 1 };
export const APPELS = 5;

let manifestCache = null;
/** Fiches des visuels du quiz (pictures/quiz/manifest.json). */
export async function loadImageManifest() {
  if (!manifestCache) {
    try {
      const raw = await readFile(new URL('../../pictures/quiz/manifest.json', import.meta.url), 'utf8');
      manifestCache = JSON.parse(raw);
    } catch {
      manifestCache = [];
    }
  }
  return manifestCache;
}

/** Les 20 chantiers, d'après les visuels (repli : numéros seuls). */
export function chantierNames(manifest) {
  const names = {};
  for (const item of manifest || []) {
    if (item.categorie === 'chantier' && item.chantier) names[item.chantier] = item.titre;
  }
  for (let n = 1; n <= 20; n += 1) names[n] ||= `Chantier ${n}`;
  return names;
}

const STOP = new Set(['les', 'des', 'une', 'pour', 'par', 'dans', 'est', 'que', 'qui', 'quel', 'quelle',
  'quels', 'quelles', 'sur', 'aux', 'avec', 'son', 'ses', 'leur', 'leurs', 'cette', 'ces', 'parti',
  'avant', 'selon', 'blanc', 'livre', 'programme', 'combien', 'comment']);

/** Texte réduit à ses mots significatifs, sans accents ni ponctuation. */
export function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ').trim();
}
const words = (text) => new Set(normalize(text).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));

/** Empreinte exacte (index unique en base). */
export const fingerprint = (question) => normalize(question).slice(0, 500);

/** Similarité de Jaccard entre deux questions (0 à 1). */
export function similarity(a, b) {
  const x = a instanceof Set ? a : words(a);
  const y = b instanceof Set ? b : words(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter += 1;
  return inter / (x.size + y.size - inter);
}

/** Index des questions existantes pour repérer les doublons. */
export function duplicateIndex(existing) {
  const prints = new Set();
  const sets = [];
  for (const q of existing || []) {
    prints.add(fingerprint(q));
    sets.push(words(q));
  }
  return {
    has(question, threshold = 0.8) {
      if (prints.has(fingerprint(question))) return true;
      const w = words(question);
      return sets.some((s) => similarity(w, s) >= threshold);
    },
    add(question) {
      prints.add(fingerprint(question));
      sets.push(words(question));
    },
  };
}

const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const num = (value) => {
  const n = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
};

const PAS_FINS = [1, 0.5, 0.25, 0.2, 0.1, 0.05, 0.01];
const MAX_CRANS = 2000;

/** Vrai si la valeur est atteignable avec un curseur min..max au pas donné. */
export function reachable(value, min, max, step, tolerance = 0) {
  if (!(step > 0) || value < min || value > max) return false;
  const crans = Math.round((value - min) / step);
  const proche = min + crans * step;
  return proche <= max + 1e-9 && Math.abs(proche - value) <= tolerance + 1e-9;
}

function shuffleDifferent(items) {
  const copy = [...items];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    if (copy.some((v, i) => v !== items[i])) return copy;
  }
  return [...items].reverse();
}

/**
 * Transforme une question proposée par l'IA en ligne `trivia_questions`,
 * ou renvoie null si elle est invalide.
 */
export function toQuestionRow(q, { imageIds = new Set(), generationId = null } = {}) {
  if (!q || !FORMATS.includes(q.format)) return null;
  const question = str(q.question, 500);
  if (question.length < 8) return null;
  const row = {
    question,
    format: q.format,
    explication: str(q.explication, 1000) || null,
    source_livre_blanc: str(q.source_livre_blanc, 300) || null,
    chantier: Number.isInteger(q.chantier) && q.chantier >= 1 && q.chantier <= 20 ? q.chantier : null,
    difficulte: DIFFICULTES.includes(q.difficulte) ? q.difficulte : 'moyen',
    image_id: null,
    meta: {},
    active: true,
    generation_id: generationId,
    empreinte: fingerprint(question),
  };
  const options = Array.isArray(q.options) ? q.options.map((o) => str(o, 200)).filter(Boolean) : [];
  const correct = str(q.correct_answer, 200);

  switch (q.format) {
    case 'qcm':
    case 'citation':
    case 'image': {
      if (options.length !== 4 || new Set(options).size !== 4 || !options.includes(correct)) return null;
      if (q.format === 'image') {
        const id = str(q.image_id, 120);
        if (!imageIds.has(id)) return null;
        row.image_id = id;
      }
      row.options = options;
      row.correct_answer = correct;
      return row;
    }
    case 'vrai_faux': {
      const answer = /^vrai$/i.test(correct) ? 'Vrai' : /^faux$/i.test(correct) ? 'Faux' : null;
      if (!answer) return null;
      row.options = ['Vrai', 'Faux'];
      row.correct_answer = answer;
      return row;
    }
    case 'ordre': {
      // L'IA donne les éléments dans le BON ordre ; on les mélange pour l'affichage.
      if (options.length < 3 || options.length > 6 || new Set(options).size !== options.length) return null;
      row.correct_answer = JSON.stringify(options);
      row.options = shuffleDifferent(options);
      return row;
    }
    case 'chiffre': {
      const value = num(correct);
      const meta = q.meta || {};
      const min = num(meta.min);
      const max = num(meta.max);
      let step = num(meta.step);
      let tolerance = num(meta.tolerance) ?? 0;
      if (value === null || min === null || max === null || !(min < max) || value < min || value > max) return null;
      if (!(step > 0) || step > (max - min)) step = (max - min) <= 20 ? 0.5 : 1;
      if (tolerance < 0 || tolerance > (max - min) / 4) tolerance = 0;
      // La bonne réponse doit pouvoir être choisie avec le curseur (min + k × pas),
      // à la tolérance près. Sinon on essaie un pas plus fin, ou on rejette.
      if (!reachable(value, min, max, step, tolerance)) {
        step = PAS_FINS.find((s) => s < step && (max - min) / s <= MAX_CRANS && reachable(value, min, max, s, tolerance));
        if (!step) return null;
      }
      row.options = [];
      row.correct_answer = String(value);
      row.meta = { min, max, step, unite: str(meta.unite, 20), tolerance };
      return row;
    }
    default:
      return null;
  }
}

/**
 * Contrôle technique d'une question telle qu'elle est (ou sera) en base.
 * Renvoie la raison du problème, ou null si la question est jouable.
 * Mêmes règles que l'audit SQL de la banque : sert au générateur, à l'édition
 * dans le back-office et au bouton « Contrôler la banque ».
 */
export function auditQuestion(q, imageIds = null) {
  if (!q || !FORMATS.includes(q.format)) return 'format inconnu';
  if (typeof q.question !== 'string' || q.question.trim().length < 8) return 'énoncé vide ou trop court';
  const options = Array.isArray(q.options) ? q.options : null;
  const correct = typeof q.correct_answer === 'string' ? q.correct_answer : null;
  if (!options || correct === null) return 'options ou réponse manquantes';
  switch (q.format) {
    case 'qcm':
    case 'citation':
    case 'image': {
      if (options.length !== 4) return 'il faut exactement 4 options';
      if (options.some((o) => typeof o !== 'string' || !o.trim())) return 'option vide';
      if (new Set(options.map((o) => o.trim())).size !== 4) return 'options en double';
      if (!options.includes(correct)) return 'bonne réponse absente des options';
      if (q.format === 'image' && (!q.image_id || (imageIds && !imageIds.has(q.image_id)))) return 'image introuvable';
      return null;
    }
    case 'vrai_faux':
      if (JSON.stringify(options) !== '["Vrai","Faux"]' || !['Vrai', 'Faux'].includes(correct)) return 'vrai/faux mal formé';
      return null;
    case 'ordre': {
      let answer;
      try { answer = JSON.parse(correct); } catch { return 'ordre : réponse illisible'; }
      if (!Array.isArray(answer) || answer.some((x) => typeof x !== 'string')) return 'ordre : réponse illisible';
      if (answer.length < 3 || answer.length > 6) return 'ordre : 3 à 6 éléments';
      if (new Set(answer).size !== answer.length) return 'ordre : éléments en double';
      if (JSON.stringify([...options].sort()) !== JSON.stringify([...answer].sort())) return 'ordre : options différentes de la réponse';
      return null;
    }
    case 'chiffre': {
      const meta = q.meta || {};
      const value = num(correct);
      const min = num(meta.min);
      const max = num(meta.max);
      const step = num(meta.step);
      const tolerance = num(meta.tolerance) ?? 0;
      if ([value, min, max, step].includes(null)) return 'chiffre : données manquantes';
      if (!(min < max) || !(step > 0)) return 'chiffre : curseur invalide';
      if (value < min || value > max) return 'chiffre : réponse hors du curseur';
      if ((max - min) / step > MAX_CRANS) return 'chiffre : curseur trop fin';
      if (!reachable(value, min, max, step, tolerance)) return 'chiffre : réponse impossible à sélectionner';
      if (options.length) return 'chiffre : ne doit pas avoir d’options';
      return null;
    }
    default:
      return 'format inconnu';
  }
}

/** Extrait du Livre blanc : une fenêtre différente pour chaque appel. */
export function sourceWindow(text, index, total, size = 30000) {
  if (text.length <= size) return text;
  const span = text.length - size;
  const base = Math.floor((span * index) / Math.max(total, 1));
  const jitter = Math.floor(Math.random() * Math.min(4000, span / Math.max(total, 1)));
  let start = Math.min(span, base + jitter);
  const paragraph = text.indexOf('\n\n', start);
  if (paragraph > -1 && paragraph < start + 2000) start = paragraph + 2;
  return text.slice(start, start + size);
}

export const QUESTION_TOOL = {
  name: 'enregistrer_questions',
  description: 'Enregistre les nouvelles questions du quiz.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: FORMATS },
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            correct_answer: { type: 'string' },
            meta: {
              type: 'object',
              properties: {
                min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
                unite: { type: 'string' }, tolerance: { type: 'number' },
              },
            },
            chantier: { type: 'integer', minimum: 0, maximum: 20 },
            difficulte: { type: 'string', enum: DIFFICULTES },
            image_id: { type: 'string' },
            explication: { type: 'string' },
            source_livre_blanc: { type: 'string' },
          },
          required: ['format', 'question', 'options', 'correct_answer', 'chantier', 'difficulte',
            'explication', 'source_livre_blanc'],
        },
      },
    },
    required: ['questions'],
  },
};

export const SYSTEM_PROMPT = [
  'Tu crées des questions pour le quiz officiel du parti politique haïtien En Avant.',
  'Le but : faire apprendre le programme du parti (son Livre blanc) en jouant.',
  'Règles absolues :',
  '- Chaque question repose UNIQUEMENT sur le document fourni (ou sur la fiche d’image fournie). N’invente aucun fait, chiffre, nom ni date.',
  '- Français clair et correct, ton neutre et pédagogique, questions courtes (une phrase).',
  '- Une seule bonne réponse, sans ambiguïté ; les mauvaises réponses sont plausibles mais clairement fausses au regard du document.',
  '- `explication` : 1 à 2 phrases qui apprennent quelque chose au joueur. `source_livre_blanc` : le chantier ou la section du document.',
  '- `chantier` : le numéro (1 à 20) du chantier concerné, 0 si la question est générale.',
  '- Varie les difficultés (facile, moyen, difficile) et les chantiers.',
  '- Ne reprends jamais une question de la liste des questions existantes, même reformulée.',
].join('\n');

export const FORMAT_RULES = [
  'Formats :',
  '- qcm : 4 options distinctes ; `correct_answer` = copie exacte de l’une d’elles.',
  '- vrai_faux : une affirmation à juger ; options ["Vrai","Faux"] ; `correct_answer` = "Vrai" ou "Faux". Alterne les deux.',
  '- chiffre : un nombre du document à deviner avec un curseur. `options` = [] ; `correct_answer` = le nombre (ex. "15") ;',
  '  `meta` = { min, max, step, unite, tolerance } avec min < réponse < max, la réponse pas au centre.',
  '  IMPÉRATIF : la réponse doit tomber EXACTEMENT sur un cran du curseur, c.-à-d. réponse = min + k × step (k entier),',
  '  et le curseur doit avoir au plus 200 crans ((max − min) / step ≤ 200). Exemples valides : réponse 35, min 0, max 100, step 5 ;',
  '  réponse 2.5, min 0, max 10, step 0.5. INTERDIT : réponse 4545 avec step 10, réponse 148355 avec step 1000.',
  '  Ne choisis donc QUE des nombres « ronds » à cette échelle (pourcentages, années, petits effectifs, montants ronds).',
  '  Un grand nombre précis (ex. 148 355 touristes) ne doit PAS devenir une question chiffre : fais-en un qcm.',
  '- citation : une phrase recopiée MOT POUR MOT du document, entre guillemets dans `question` ; on demande qui l’a dite si le document',
  '  l’attribue explicitement, sinon de quel chantier elle provient. 4 options.',
  '- image : une question sur l’UNE des images fournies, à partir de ses faits uniquement ; `image_id` = son identifiant exact. 4 options.',
  '- ordre : 3 à 5 éléments (étapes, dates, objectifs) à remettre dans l’ordre ; `options` = les éléments DANS LE BON ORDRE',
  '  (le serveur les mélangera) ; `correct_answer` = "ordre".',
].join('\n');

/** Message utilisateur d'un appel de génération. */
export function buildUserPrompt({ source, chantiers, images, existing, quota }) {
  const quotaText = Object.entries(quota).map(([f, n]) => `${n} × ${f}`).join(', ');
  const chantierText = Object.entries(chantiers).map(([n, t]) => `${n}. ${t}`).join('\n');
  const imageText = images.length
    ? images.map((i) => `- image_id "${i.id}" — ${i.titre} (chantier ${i.chantier ?? 'général'}) : ${i.legende} Faits : ${(i.faits || []).join(' | ')}`).join('\n')
    : '(aucune image : remplace la question image par un qcm)';
  const existingText = existing.length ? existing.map((q) => `- ${q}`).join('\n') : '(aucune)';
  return [
    `Crée exactement ${Object.values(quota).reduce((a, b) => a + b, 0)} NOUVELLES questions : ${quotaText}.`,
    FORMAT_RULES,
    `\nLes 20 chantiers :\n${chantierText}`,
    `\nImages disponibles :\n${imageText}`,
    `\nQuestions déjà en base (à ne pas reproduire) :\n${existingText}`,
    `\n<document>\n${source}\n</document>`,
  ].join('\n');
}
