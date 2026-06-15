// Client Supabase « service_role » — réservé aux fonctions serverless.
// Cette clé bypasse la Row-Level Security : elle ne doit JAMAIS atteindre le client.
import { createClient } from '@supabase/supabase-js';
import { hasValidPinCookie } from './admin-pin.js';

let cached = null;

export function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes dans les variables d\'environnement.');
  }

  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cached;
}

export function getAnonClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY manquantes.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Vérifie le token Supabase Auth et le rôle.
 * Retourne { user, role } ou lève une erreur avec .status.
 */
export async function requireRole(req, allowedRoles, { requirePin = true } = {}) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw httpError(401, 'Authentification requise.');
  }

  const supabase = getServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    throw httpError(401, 'Session invalide ou expirée.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || !allowedRoles.includes(profile.role)) {
    throw httpError(403, 'Droits insuffisants pour cette opération.');
  }

  if (requirePin && profile.role === 'superadmin' && !hasValidPinCookie(req, userData.user.id)) {
    throw httpError(401, 'PIN SuperAdmin requis ou expiré.');
  }

  return { user: userData.user, role: profile.role };
}

/**
 * Vérifie qu'un utilisateur est superadmin OU possède une permission donnée.
 * Pour les superadmins, le PIN reste obligatoire (requirePin = true par défaut).
 * Pour les autres roles, pas de PIN.
 * Retourne { user, role, permissions, isSuperAdmin }.
 */
export async function requirePermission(req, permission, { requirePin = true } = {}) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw httpError(401, 'Authentification requise.');

  const supabase = getServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) throw httpError(401, 'Session invalide ou expirée.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) throw httpError(403, 'Droits insuffisants pour cette opération.');

  const isSuperAdmin = profile.role === 'superadmin';
  const perms = Array.isArray(profile.permissions) ? profile.permissions : [];
  const hasPermission = isSuperAdmin || perms.includes(permission);

  if (!hasPermission) throw httpError(403, 'Droits insuffisants pour cette opération.');

  // PIN requis uniquement pour superadmin
  if (requirePin && isSuperAdmin && !hasValidPinCookie(req, userData.user.id)) {
    throw httpError(401, 'PIN SuperAdmin requis ou expiré.');
  }

  return { user: userData.user, role: profile.role, permissions: perms, isSuperAdmin };
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
