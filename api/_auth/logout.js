import { clearPinCookie } from '../_lib/admin-pin.js';
import { json, methodGuard } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  res.setHeader('Set-Cookie', clearPinCookie(req));
  return json(res, 200, { ok: true });
}
