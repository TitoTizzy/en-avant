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

/* ----- Validation ----- */

export const isEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 160;

export const isText = (value, min, max) =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;

export const isPhone = (value) =>
  typeof value === 'string' && value.replace(/\D/g, '').length >= 8 && value.length <= 25;

export const clean = (value) => String(value ?? '').trim();
