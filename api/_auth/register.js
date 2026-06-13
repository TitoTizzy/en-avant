// POST /api/auth/register
// Inscription libre d'un membre (rôle "member").
// Le trigger handle_new_user crée le profil ; on met ensuite le rôle à "member".
import { getServiceClient } from '../_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError, isEmail, isText, clean, enforceRateLimit,
} from '../_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, { key: 'register', limit: 5 })) return;

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

    const supabase = getServiceClient();

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom, pseudo },
    });

    if (error) {
      const msg = error.message || '';
      if (/already registered|already been registered/i.test(msg)) {
        return json(res, 409, { error: 'Cette adresse email est déjà utilisée.' });
      }
      throw error;
    }

    // Mettre à jour le profil créé par le trigger : rôle member + nom
    await supabase
      .from('profiles')
      .update({ role: 'member', nom })
      .eq('id', data.user.id);

    return json(res, 201, { ok: true });
  } catch (error) {
    return handleError(res, error, 'Inscription momentanément indisponible.');
  }
}
