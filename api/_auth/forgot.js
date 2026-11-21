import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
// POST /api/auth/forgot — « Mot de passe oublié ».
// Envoie, si l'adresse correspond à un compte, un email en français avec un
// lien sécurisé vers /mot-de-passe. Réponse toujours identique : on ne révèle
// jamais si une adresse est inscrite ou non.
import { getServiceClient } from '../_lib/supabase.js';
import { json, methodGuard, getBody, handleError, isEmail, clean } from '../_lib/http.js';
import { sendToMember, siteUrl } from '../_lib/notify.js';
import { passwordLinkFrom } from '../_lib/adhesion.js';

const NEUTRAL = {
  ok: true,
  message: 'Si cette adresse correspond à un compte, vous allez recevoir un email avec un lien pour choisir un nouveau mot de passe. Pensez à vérifier vos indésirables.',
};

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = getBody(req);
    if (clean(body.website)) return json(res, 200, NEUTRAL); // honeypot
    const email = clean(body.email).toLowerCase();
    if (!isEmail(email)) {
      return json(res, 422, { error: 'Adresse email invalide.', fields: { email: 'Adresse email invalide.' } });
    }

  if (!await enforceDurableRateLimit(req, res, { key: 'forgot', limit: 5 })) return;

    const supabase = getServiceClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nom')
      .eq('email', email)
      .maybeSingle();

    if (profile) {
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${siteUrl()}/mot-de-passe` },
      });
      if (error) {
        console.error('[forgot] lien impossible :', error.message);
      } else {
        const nom = profile.nom && !String(profile.nom).includes('@') ? profile.nom : '';
        await sendToMember({
          to: email,
          subject: 'Réinitialisation de votre mot de passe En Avant',
          title: 'Choisissez un nouveau mot de passe',
          paragraphs: [
            `Bonjour ${nom},`.replace(' ,', ','),
            'Vous avez demandé à réinitialiser votre mot de passe sur enavant.org. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.',
            'Ce lien est personnel et expire rapidement. Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet email : votre mot de passe actuel reste valable.',
          ],
          cta: { label: 'Choisir un nouveau mot de passe', url: passwordLinkFrom(data.properties, 'recovery') },
        });
      }
    }

    return json(res, 200, NEUTRAL);
  } catch (error) {
    return handleError(res, error, 'Service momentanément indisponible.');
  }
}
