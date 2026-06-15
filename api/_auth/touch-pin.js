import { createPinCookie } from '../_lib/admin-pin.js';
import { requireRole } from '../_lib/supabase.js';
import { json, methodGuard, handleError } from '../_lib/http.js';

// Prolonge la validation PIN uniquement si le cookie actuel est encore valide.
export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const { user } = await requireRole(req, ['superadmin']);
    res.setHeader('Set-Cookie', createPinCookie(req, user.id));
    return json(res, 200, { ok: true });
  } catch (error) {
    return handleError(res, error, 'Renouvellement du PIN impossible.');
  }
}
