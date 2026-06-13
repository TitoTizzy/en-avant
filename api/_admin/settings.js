// /api/admin/settings — Réglages globaux du site (SuperAdmin + PIN requis).
// GET  : { settings: { popup_video, popup_football, ... } }
// PUT  : { key, value }  → upsert d'un réglage (validé selon la clé)
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';

// Clés autorisées + normalisation de chaque valeur (anti-injection).
const NORMALIZERS = {
  popup_video(v = {}) {
    const url = clean(v.url);
    const safeUrl = /^https:\/\/[\w.-]+\/storage\/v1\/object\/public\//.test(url) || url === '' ? url : '';
    return {
      enabled: v.enabled === true,
      url: safeUrl.slice(0, 500),
      headline: clean(v.headline).slice(0, 120),
      subtext: clean(v.subtext).slice(0, 200),
    };
  },
  popup_football(v = {}) {
    const interval = parseInt(v.intervalSec, 10);
    return {
      enabled: v.enabled === true,
      intervalSec: Number.isFinite(interval) ? Math.min(Math.max(interval, 20), 3600) : 60,
    };
  },
  contact(v = {}) {
    return {
      address: clean(v.address).slice(0, 200),
      phone: clean(v.phone).slice(0, 30),
      email: clean(v.email).slice(0, 120),
    };
  },
};

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await requireRole(req, ['superadmin']);
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('site_settings').select('key, value');
      if (error) throw error;
      const settings = {};
      for (const row of data || []) settings[row.key] = row.value;
      return json(res, 200, { settings });
    }

    if (req.method === 'PUT' || req.method === 'POST' || req.method === 'PATCH') {
      const body = getBody(req);
      const key = clean(body.key);
      const normalize = NORMALIZERS[key];
      if (!normalize) return json(res, 422, { error: 'Clé de réglage inconnue.' });

      const value = normalize(body.value || {});
      const { data, error } = await supabase
        .from('site_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .select()
        .single();
      if (error) throw error;

      return json(res, 200, { ok: true, key, value: data.value });
    }

    res.setHeader('Allow', 'GET, PUT');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Gestion des réglages impossible.');
  }
}
