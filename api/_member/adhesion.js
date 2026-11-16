// /api/member/adhesion — Fiche d'adhésion du membre connecté.
// GET  : { status: 'none' | 'pending' | 'approved' | 'rejected' }
// POST : { sexe, ninu, telephone, ville, consent } → crée la fiche (comptes
//        existants créés avant le formulaire unique). Statut « pending ».
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';
import { notifyTeam } from '../_lib/notify.js';
import { validateFiche, duplicateFicheMessage } from '../_lib/adhesion.js';

// « pending » est volontairement absent : pas d'accès avant approbation.
const ACCOUNT_ROLES = ['member', 'editor', 'readonly', 'superadmin'];

/** Fiche du compte ; relie automatiquement une ancienne fiche faite avec la même adresse. */
async function findFiche(supabase, user) {
  const { data: linked, error } = await supabase
    .from('members')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (linked) return linked;

  const email = String(user.email || '').toLowerCase();
  if (!email || !user.email_confirmed_at) return null;
  const { data: orphan, error: orphanError } = await supabase
    .from('members')
    .select('id, status')
    .eq('email', email)
    .is('user_id', null)
    .maybeSingle();
  if (orphanError) throw orphanError;
  if (!orphan) return null;

  const { error: linkError } = await supabase.from('members').update({ user_id: user.id }).eq('id', orphan.id);
  if (linkError) throw linkError;
  return orphan;
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const { user } = await requireRole(req, ACCOUNT_ROLES, { requirePin: false });
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const fiche = await findFiche(supabase, user);
      return json(res, 200, { status: fiche?.status || 'none' });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }

    if (await findFiche(supabase, user)) {
      return json(res, 409, { error: 'Votre fiche d’adhésion est déjà enregistrée.' });
    }

    const { values: fiche, errors } = validateFiche(getBody(req));
    if (Object.keys(errors).length > 0) {
      return json(res, 422, { error: 'Formulaire invalide.', fields: errors });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('nom, username')
      .eq('id', user.id)
      .maybeSingle();
    const meta = user.user_metadata || {};
    const nom = clean(profile?.nom || meta.nom || '').slice(0, 120);
    const finalNom = nom.length >= 2 && !nom.includes('@') ? nom : (profile?.username || user.email.split('@')[0]);

    const { error } = await supabase.from('members').insert({
      nom: String(finalNom).padEnd(2, '.'),
      email: String(user.email).toLowerCase(),
      ...fiche,
      consent: true,
      status: 'pending',
      user_id: user.id,
    });
    if (error) {
      if (error.code === '23505') {
        const dup = duplicateFicheMessage(error);
        return json(res, 409, { error: dup.error, fields: { [dup.field]: dup.error } });
      }
      throw error;
    }

    await notifyTeam({
      subject: `Fiche d'adhésion complétée — ${finalNom}`,
      title: 'Un membre a complété sa fiche d’adhésion',
      rows: [['Nom', finalNom], ['Ville', fiche.ville]],
      note: 'Compte existant : son accès reste ouvert. La fiche est à examiner dans l’onglet Membres.',
    });

    return json(res, 201, { ok: true, status: 'pending' });
  } catch (error) {
    return handleError(res, error);
  }
}
