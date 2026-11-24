// Petits utilitaires HTTP partagés par les fonctions /api/*.
// (Les fichiers préfixés par `_` ne sont pas exposés comme endpoints par Vercel.)

export function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(payload);
}

export function methodGuard(req, res, allowed) {
  if (req.method === allowed) return true;
  res.setHeader('Allow', allowed);
  json(res, 405, { error: `Méthode non autorisée. Utilisez ${allowed}.` });
  return false;
}

/** Corps JSON déjà parsé par Vercel ; on sécurise le type. */
export function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

/** Traduction en clair des causes techniques les plus courantes (journal d'activité). */
export function plainCause(error) {
  const msg = String(error?.message || error || '');
  if (/resend|api key is invalid|domain is not verified/i.test(msg)) return 'le service d’envoi d’emails (Resend) a refusé la demande';
  if (/fetch failed|ECONNRESET|ETIMEDOUT|timeout|network/i.test(msg)) return 'un service externe n’a pas répondu à temps';
  if (/JWT|token|auth/i.test(msg)) return 'un problème d’authentification avec la base de données';
  if (/relation .* does not exist|column .* does not exist|schema cache/i.test(msg)) return 'la base de données n’est pas à jour (migration manquante)';
  if (/rate limit|too many/i.test(msg)) return 'trop de demandes en peu de temps';
  if (/stripe/i.test(msg)) return 'le service de paiement (Stripe) a renvoyé une erreur';
  if (/anthropic|overloaded|529/i.test(msg)) return 'le service d’IA est momentanément surchargé';
  return msg ? `cause technique : ${msg.replace(/\s+/g, ' ').slice(0, 140)}` : 'cause inconnue';
}

export async function handleError(res, error, fallback = 'Erreur interne du serveur.') {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) {
    console.error(error);
    // Journal d'activité (best effort, jamais bloquant).
    try {
      const { logActivity } = await import('./activity.js');
      await logActivity(null, {
        categorie: 'systeme', niveau: 'erreur',
        message: `Incident : « ${fallback.replace(/\.$/, '')} » — ${plainCause(error)}.`,
      });
    } catch { /* journal indisponible */ }
  }
  json(res, status, { error: status >= 500 ? fallback : error.message });
}

/* ----- Anti-abus best effort -----
 * Une instance serverless ne partage pas sa mémoire avec les autres instances :
 * ce garde-fou complète, sans remplacer, le rate limiting Cloudflare/Vercel.
 */
const rateBuckets = new Map();

export function enforceRateLimit(req, res, {
  key = 'default',
  limit = 10,
  windowMs = 10 * 60 * 1000,
} = {}) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const current = rateBuckets.get(bucketKey);

  if (rateBuckets.size > 1000) {
    for (const [storedKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(storedKey);
    }
  }

  if (!current || current.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return true;
  }

  current.count += 1;
  if (current.count <= limit) return true;

  res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
  json(res, 429, { error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  return false;
}

/* ----- Validation ----- */

export const isEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 160;

export const isText = (value, min, max) =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;

export const isPhone = (value) =>
  typeof value === 'string' && value.replace(/\D/g, '').length >= 8 && value.length <= 25;

export const clean = (value) => String(value ?? '').trim();
