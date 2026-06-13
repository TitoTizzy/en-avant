import { createPinCookie } from '../_lib/admin-pin.js';
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError, clean, enforceRateLimit,
} from '../_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, { key: 'change-admin-pin', limit: 5 })) return;

  try {
    const { user } = await requireRole(req, ['superadmin']);
    const body = getBody(req);
    const currentPin = clean(body.current_pin);
    const newPin = clean(body.new_pin);

    if (!/^\d{4,8}$/.test(currentPin) || !/^\d{4,8}$/.test(newPin)) {
      return json(res, 422, { error: 'Les PIN doivent contenir entre 4 et 8 chiffres.' });
    }
    if (currentPin === newPin) {
      return json(res, 422, { error: 'Le nouveau PIN doit être différent de l’ancien.' });
    }

    const supabase = getServiceClient();
    const { data: changed, error } = await supabase.rpc('ea_change_pin', {
      target_user_id: user.id,
      current_pin: currentPin,
      new_pin: newPin,
    });

    if (error) throw error;
    if (!changed) return json(res, 401, { error: 'PIN actuel incorrect.' });

    res.setHeader('Set-Cookie', createPinCookie(req, user.id));
    return json(res, 200, { ok: true, message: 'PIN modifié avec succès.' });
  } catch (error) {
    return handleError(res, error, 'Modification du PIN impossible.');
  }
}
