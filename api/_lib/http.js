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

export function handleError(res, error, fallback = 'Erreur interne du serveur.') {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error(error);
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
