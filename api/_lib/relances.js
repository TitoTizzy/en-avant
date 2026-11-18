// Relances « Complétez votre adhésion » pour les comptes membres sans fiche.
//
// Règles :
// - au plus une relance tous les 7 jours, 5 relances au maximum par compte ;
// - les relances manuelles (bouton de l'admin) comptent dans les 5 ;
// - 7 jours après la 5e relance sans fiche, le compte est signalé « à supprimer »
//   au SuperAdmin (tableau de bord + résumé quotidien). La suppression reste manuelle.
import { relanceEmail } from './adhesion.js';
import { sendBatchToMembers } from './notify.js';

export const RELANCE_MAX = 5;
export const RELANCE_DELAI_MS = 7 * 24 * 3600 * 1000;

/** Comptes « member » / « pending » sans fiche d'adhésion (liaison ou même adresse). */
export async function accountsWithoutFiche(supabase) {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, nom, username, role, created_at, relance_adhesion_at, relance_count')
    .in('role', ['member', 'pending'])
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw error;
  const { data: fiches, error: fichesError } = await supabase
    .from('members')
    .select('user_id, email')
    .limit(5000);
  if (fichesError) throw fichesError;
  const linked = new Set(fiches.map((f) => f.user_id).filter(Boolean));
  const emails = new Set(fiches.map((f) => String(f.email || '').toLowerCase()));
  return (profiles || []).filter((p) => !linked.has(p.id) && !emails.has(String(p.email || '').toLowerCase()));
}

const lastRelance = (p) => (p.relance_adhesion_at ? new Date(p.relance_adhesion_at).getTime() : 0);

/** Compte à relancer maintenant (rôle membre, moins de 5 relances, dernière il y a 7 jours ou plus). */
export function isRelanceDue(profile, now = Date.now()) {
  return profile.role === 'member'
    && Boolean(profile.email)
    && (profile.relance_count || 0) < RELANCE_MAX
    && now - lastRelance(profile) >= RELANCE_DELAI_MS;
}

/** Compte signalé « à supprimer » : 5 relances, la dernière il y a au moins 7 jours. */
export function isToDelete(profile, now = Date.now()) {
  return (profile.relance_count || 0) >= RELANCE_MAX
    && now - lastRelance(profile) >= RELANCE_DELAI_MS;
}

export const displayName = (p) => (p.nom && !String(p.nom).includes('@') ? p.nom : (p.username || p.email || ''));

/**
 * Envoie les relances dues. Utilisé par la tâche quotidienne et par le bouton manuel.
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendDueRelances(supabase, now = Date.now()) {
  const targets = (await accountsWithoutFiche(supabase)).filter((p) => isRelanceDue(p, now));
  if (!targets.length) return { sent: 0, failed: 0 };

  const sentTo = new Set(await sendBatchToMembers(targets.map((p) => relanceEmail({
    ...p,
    relanceNumber: (p.relance_count || 0) + 1,
  }))));
  const stamp = new Date(now).toISOString();
  let sent = 0;
  for (const p of targets.filter((t) => sentTo.has(t.email))) {
    const { error } = await supabase
      .from('profiles')
      .update({ relance_adhesion_at: stamp, relance_count: (p.relance_count || 0) + 1 })
      .eq('id', p.id);
    if (error) throw error;
    sent += 1;
  }
  return { sent, failed: targets.length - sent };
}

/** Comptes signalés « à supprimer ». */
export async function accountsToDelete(supabase, now = Date.now()) {
  return (await accountsWithoutFiche(supabase)).filter((p) => isToDelete(p, now));
}
