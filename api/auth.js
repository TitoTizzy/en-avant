// Dispatcher /api/auth/* → /api/_auth/:action
// vercel.json redirige /api/auth/:path → /api/auth?action=:path
import loginHandler from './_auth/login.js';
import logoutHandler from './_auth/logout.js';
import registerHandler from './_auth/register.js';
import verifyPinHandler from './_auth/verify-pin.js';
import touchPinHandler from './_auth/touch-pin.js';
import changePinHandler from './_auth/change-pin.js';
import { json } from './_lib/http.js';

export default async function handler(req, res) {
  const action = req.query?.action;
  switch (action) {
    case 'login':       return loginHandler(req, res);
    case 'logout':      return logoutHandler(req, res);
    case 'register':    return registerHandler(req, res);
    case 'verify-pin':  return verifyPinHandler(req, res);
    case 'touch-pin':   return touchPinHandler(req, res);
    case 'change-pin':  return changePinHandler(req, res);
    default:            return json(res, 404, { error: 'Route inconnue.' });
  }
}
