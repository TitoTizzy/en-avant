// GET /api/admin/audience — fréquentation du site (Google Analytics 4, lecture seule).
//   ?periode=1|7|30|90|365            → vue d'ensemble (chiffres comparés à la période précédente)
//   ?periode=30&page=/chemin          → détail d'une page
//   ?temps_reel=1                     → visiteurs en ce moment (30 dernières minutes)
// Droit requis : voir_statistiques (le SuperAdmin l'a toujours).
import { requirePermission } from '../_lib/supabase.js';
import { json, handleError, clean } from '../_lib/http.js';
import { gaConfig, audience, realtime, GaError, PERIODES_GA } from '../_lib/ga.js';

const NON_BRANCHE = {
  branche: false,
  error: 'Google Analytics n’est pas encore relié : il manque GA_PROPERTY_ID ou GA_CREDENTIALS dans Vercel.',
};

export function validPath(raw) {
  const p = String(raw || '').trim();
  if (!p) return null;
  if (!p.startsWith('/') || p.length > 300 || /[\u0000-\u001f\u007f]/.test(p)) {
    throw Object.assign(new Error('Adresse de page invalide.'), { status: 400 });
  }
  return p;
}

export default async function handler(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }
    await requirePermission(req, 'voir_statistiques');
    const cfg = gaConfig(env);
    if (!cfg) return json(res, 200, NON_BRANCHE);
    if (clean(req.query?.temps_reel)) {
      return json(res, 200, { branche: true, ...(await realtime(cfg, { fetchImpl })), maj: new Date().toISOString() });
    }
    const days = Object.hasOwn(PERIODES_GA, clean(req.query?.periode)) ? Number(req.query.periode) : 30;
    const path = validPath(req.query?.page);
    const data = await audience(cfg, { days, path }, { fetchImpl });
    return json(res, 200, { branche: true, ...data, maj: new Date().toISOString() });
  } catch (error) {
    if (error instanceof GaError) {
      console.warn('[audience]', error.code, error.message);
      return json(res, error.status, { branche: true, error: error.message, code: error.code });
    }
    return handleError(res, error, 'Statistiques de fréquentation indisponibles.');
  }
}
