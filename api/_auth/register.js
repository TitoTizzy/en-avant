// POST /api/auth/register
// Inscription libre d'un membre (rôle "member").
//
// Le compte est créé via signUp() : Supabase envoie un email de confirmation
// et la connexion reste impossible tant que l'adresse n'est pas confirmée.
// (Ne jamais utiliser auth.admin.createUser({ email_confirm: true }) ici :
// cela permettrait de créer un compte au nom d'une adresse qu'on ne possède pas.)
//
// Réponse identique que l'adresse soit nouvelle ou déjà utilisée, pour ne pas
// révéler quels emails possèdent un compte.
import { getAnonClient, getServiceClient } from '../_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError, isEmail, isText, clean, enforceRateLimit,
} from '../_lib/http.js';
import { notifyTeam } from '../_lib/notify.js';

const GENERIC_OK = {
  ok: true,
  message: 'Si cette adresse est valide, un email de confirmation vient de vous être envoyé.',
};

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, { key: 'register', limit: 5 })) return;

  try {
    const body     = getBody(req);
    if (clean(body.website)) return json(res, 201, GENERIC_OK); // honeypot

    const email    = clean(body.email).toLowerCase();
    const nom      = clean(body.nom);
    const pseudo   = clean(body.pseudo).slice(0, 30);
    const password = String(body.password || '');

    const errors = {};
    if (!isEmail(email))             errors.email    = 'Adresse email invalide.';
    if (!isText(nom, 2, 120))        errors.nom      = 'Nom invalide (2 à 120 caractères).';
    if (!isText(pseudo, 2, 30))      errors.pseudo   = 'Pseudo invalide (2 à 30 caractères).';
    if (password.length < 10)        errors.password = 'Mot de passe trop court (10 caractères minimum).';
    if (password.length > 200)       errors.password = 'Mot de passe trop long.';

    if (Object.keys(errors).length > 0) {
      return json(res, 422, { error: 'Formulaire invalide.', fields: errors });
    }

    const siteUrl = clean(process.env.SITE_URL).replace(/\/+$/, '');
    const { data, error } = await getAnonClient().auth.signUp({
      email,
      password,
      options: {
        data: { nom, pseudo },
        emailRedirectTo: siteUrl ? `${siteUrl}/login?confirme=1` : undefined,
      },
    });

    if (error) {
      // Mot de passe refusé par la politique Supabase (trop faible, fuité…).
      if (/password/i.test(error.message || '')) {
        return json(res, 422, { error: 'Mot de passe refusé : choisissez-en un plus robuste.', fields: { password: error.message } });
      }
      if (/already registered|already been registered/i.test(error.message || '')) {
        return json(res, 201, GENERIC_OK);
      }
      throw error;
    }

    // Adresse déjà inscrite : Supabase renvoie un utilisateur sans identité. Rien à faire.
    const user = data?.user;
    if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) {
      return json(res, 201, GENERIC_OK);
    }

    // Le trigger handle_new_user a créé le profil (rôle par défaut « readonly ») :
    // on le passe en « member ». Une erreur ici est remontée, pas ignorée.
    const { data: updated, error: profileError } = await getServiceClient()
      .from('profiles')
      .update({ role: 'member', nom })
      .eq('id', user.id)
      .select('id');
    if (profileError) throw profileError;
    if (!updated?.length) {
      console.error('Inscription : profil introuvable pour', user.id);
      throw new Error('Profil non initialisé.');
    }

    await notifyTeam({
      subject: `Nouveau compte membre — ${pseudo}`,
      title: 'Nouveau compte membre créé',
      rows: [['Nom', nom], ['Pseudo', pseudo]],
      note: 'Le compte devient actif après confirmation de l’adresse email.',
      adminPath: '/admin',
    });

    return json(res, 201, GENERIC_OK);
  } catch (error) {
    return handleError(res, error, 'Inscription momentanément indisponible.');
  }
}
