import { getAnonClient, getServiceClient } from '../_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError, clean, enforceRateLimit,
} from '../_lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, { key: 'admin-login', limit: 8 })) return;

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
