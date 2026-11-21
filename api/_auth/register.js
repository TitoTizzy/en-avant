import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
// POST /api/auth/register
// Inscription libre d'un membre (rôle "member").
// Le trigger handle_new_user crée le profil member dans la transaction Auth.
import { getServiceClient, getAnonClient } from '../_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError, isEmail, isText, clean,
} from '../_lib/http.js';

export function createRegisterHandler({ rateLimit = enforceDurableRateLimit,
  anonClient = getAnonClient, serviceClient = getServiceClient,
} = {}) { return async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!await rateLimit(req, res, { key: 'register', limit: 5 })) return;

  try {
    const body     = getBody(req);
    const email    = clean(body.email).toLowerCase();
    const nom      = clean(body.nom);
    const pseudo   = clean(body.pseudo).slice(0, 30);
    const password = String(body.password || '');

    const errors = {};
    if (!isEmail(email))             errors.email    = 'Adresse email invalide.';
    if (!isText(nom, 2, 120))        errors.nom      = 'Nom invalide (2 à 120 caractères).';
    if (!isText(pseudo, 2, 30))      errors.pseudo   = 'Pseudo invalide (2 à 30 caractères).';
    if (password.length < 8)         errors.password = 'Mot de passe trop court (8 caractères minimum).';
    if (password.length > 200)       errors.password = 'Mot de passe trop long.';

    if (Object.keys(errors).length > 0) {
      return json(res, 422, { error: 'Formulaire invalide.', fields: errors });
    }

    // Supabase sends the confirmation email; never auto-confirm public signups.
    const siteUrl = new URL(process.env.SITE_URL);
    const { data, error } = await anonClient().auth.signUp({
      email, password,
      options: { data: { nom, pseudo }, emailRedirectTo: new URL('/login', siteUrl).href },
    });
    if (error) throw error;
    if (data.session) {
      // Fail closed when the project has accidentally disabled email confirmation.
      const { error: cleanupError } = await serviceClient().auth.admin.deleteUser(data.user.id);
      if (cleanupError) throw cleanupError;
      return json(res, 503, { error: 'La vérification des adresses email doit être activée.' });
    }
    // The SQL trigger creates the member profile atomically with Auth.
    return json(res, 201, { ok: true, confirmation_required: true });
  } catch (error) {
    return handleError(res, error, 'Inscription momentanément indisponible.');
  }
}

}
export default createRegisterHandler();
