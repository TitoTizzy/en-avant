import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
import { getAnonClient, getServiceClient } from '../_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError, clean,
} from '../_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!await enforceDurableRateLimit(req, res, { key: 'admin-login', limit: 8 })) return;

  try {
    const body = getBody(req);
    const identifier = clean(body.identifier).toLowerCase();
    const password = String(body.password || '');

    if (!identifier || !password || identifier.length > 160 || password.length > 200) {
      return json(res, 422, { error: 'Identifiant et mot de passe requis.' });
    }

    let email = identifier;
    if (!identifier.includes('@')) {
      const service = getServiceClient();
      // ilike sans joker = égalité insensible à la casse (TitoTizzy ≡ titotizzy)
      const { data: profile } = await service
        .from('profiles')
        .select('email')
        .ilike('username', identifier.replace(/[%_]/g, '\\$&'))
        .limit(1)
        .maybeSingle();
      email = profile?.email || 'compte-introuvable@invalid.local';
    }

    const supabase = getAnonClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error && /not confirmed/i.test(error.message || '')) {
      return json(res, 403, { error: 'Adresse email non confirmée : ouvrez le lien reçu par email.' });
    }
    if (error || !data.session) {
      return json(res, 401, { error: 'Identifiants incorrects.' });
    }

    // Récupérer le rôle pour que le frontend sache s'il faut demander le PIN
    const service = getServiceClient();
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    // Adhésion pas encore approuvée : la session n'est pas remise au navigateur.
    if (!profile || profile.role === 'pending') {
      await service.auth.admin.signOut(data.session.access_token).catch(() => {});
      const { data: fiche } = await service
        .from('members')
        .select('status')
        .eq('user_id', data.user.id)
        .maybeSingle();
      return json(res, 403, {
        pending: true,
        error: fiche?.status === 'rejected'
          ? 'Votre demande d’adhésion n’a pas été retenue. Pour toute question : contact@enavant.org.'
          : 'Votre adhésion est en cours d’examen. Vous recevrez un email dès qu’elle sera approuvée.',
      });
    }

    // Connexion par mot de passe réussie : le compte est réellement activé.
    await service.from('profiles').update({ activated_at: new Date().toISOString() })
      .eq('id', data.user.id).is('activated_at', null);

    return json(res, 200, {
      ok: true,
      role: profile?.role || 'readonly',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    return handleError(res, error, 'Connexion momentanément indisponible.');
  }
}
