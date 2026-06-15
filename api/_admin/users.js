// /api/admin/users — Gestion des comptes d'accès (SuperAdmin + PIN requis).
// GET    : liste des profils (comptes)
// POST   : { email, password, nom, username, role } → crée un compte Auth + rôle
// PATCH  : { id, role }                              → change le rôle
// DELETE : { id }                                    → supprime le compte
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean, isEmail, isText } from '../_lib/http.js';

const ROLES = ['superadmin', 'editor', 'readonly', 'member'];
const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''));

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const identity = await requireRole(req, ['superadmin']);
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, username, nom, role, created_at')
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return json(res, 200, { users: data || [], me: identity.user.id });
    }

    const body = getBody(req);

    if (req.method === 'POST') {
      const email = clean(body.email).toLowerCase();
      const nom = clean(body.nom);
      const username = clean(body.username).slice(0, 30);
      const password = String(body.password || '');
      const role = clean(body.role);

      if (!isEmail(email)) return json(res, 422, { error: 'Adresse email invalide.' });
      if (!ROLES.includes(role)) return json(res, 422, { error: 'Rôle inconnu.' });
      if (password.length < 8) return json(res, 422, { error: 'Mot de passe trop court (8 caractères minimum).' });
      if (password.length > 200) return json(res, 422, { error: 'Mot de passe trop long.' });
      if (username && !isText(username, 2, 30)) return json(res, 422, { error: 'Pseudo invalide (2 à 30 caractères).' });

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nom: nom || email, username: username || null },
      });
      if (error) {
        if (/already registered|already been registered/i.test(error.message || '')) {
          return json(res, 409, { error: 'Cette adresse email est déjà utilisée.' });
        }
        throw error;
      }

      // Le trigger handle_new_user crée le profil (readonly) ; on pose le rôle + champs.
      const updates = { role };
      if (nom) updates.nom = nom;
      if (username) updates.username = username;
      const { error: pErr } = await supabase.from('profiles').update(updates).eq('id', data.user.id);
      if (pErr) throw pErr;

      return json(res, 201, { ok: true, id: data.user.id });
    }

    if (req.method === 'PATCH') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });
      const role = clean(body.role);
      if (!ROLES.includes(role)) return json(res, 422, { error: 'Rôle inconnu.' });

      // Garde-fou : ne pas se retirer le rôle SuperAdmin si on est le dernier.
      if (body.id === identity.user.id && role !== 'superadmin') {
        const { count } = await supabase
          .from('profiles').select('id', { count: 'exact', head: true })
          .eq('role', 'superadmin');
        if ((count || 0) <= 1) return json(res, 409, { error: 'Impossible : vous êtes le dernier SuperAdmin.' });
      }

      const { error } = await supabase.from('profiles').update({ role }).eq('id', body.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      if (!isUuid(body.id)) return json(res, 422, { error: 'Identifiant invalide.' });
      if (body.id === identity.user.id) return json(res, 409, { error: 'Vous ne pouvez pas supprimer votre propre compte.' });
      const { error } = await supabase.auth.admin.deleteUser(body.id); // cascade → profiles
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error, 'Gestion des utilisateurs impossible.');
  }
}
