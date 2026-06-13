import { createPinCookie } from '../_lib/admin-pin.js';
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError, clean, enforceRateLimit,
} from '../_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, { key: 'admin-pin', limit: 6 })) return;

  try {
    const { user } = await requireRole(req, ['superadmin'], { requirePin: false });
    const pin = clean(getBody(req).pin);

    if (!/^\d{4,8}$/.test(pin)) {
      return json(res, 422, { error: 'Le PIN doit contenir entre 4 et 8 chiffres.' });
    }

    const supabase = getServiceClient();
    const { data: valid, error } = await supabase.rpc('ea_verify_pin', {
      target_user_id: user.id,
      candidate_pin: pin,
    });

    if (error) throw error;
    if (!valid) return json(res, 401, { error: 'PIN incorrect.' });

    res.setHeader('Set-Cookie', createPinCookie(req, user.id));
    return json(res, 200, { ok: true });
  } catch (error) {
    return handleError(res, error, 'Vérification du PIN impossible.');
  }
}
