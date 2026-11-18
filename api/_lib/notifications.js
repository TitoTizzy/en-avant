import { sendPush } from './push.js';
// Notifications du tableau de bord (cloche, pastilles, push).
// createNotification ne lève jamais d'exception : une notification ratée ne
// doit jamais faire échouer l'action (inscription, don, etc.).

/** Groupes affichés en pastilles dans le menu. */
export const BADGE_GROUPS = {
  members: ['adhesion', 'fiche', 'a_supprimer'],
  donations: ['don', 'don_alerte'],
  articles: ['article'],
};


/**
 * @param {object} supabase  client service_role
 * @param {{ type: string, title: string, body?: string, link?: string, permission?: string|null, refId?: string }} n
 * @returns {Promise<object|null>}
 */
export async function createNotification(supabase, n) {
  try {
    const row = {
      type: n.type,
      title: String(n.title || '').slice(0, 200),
      body: String(n.body || '').slice(0, 500),
      link: n.link || '',
      permission: n.permission ?? null,
      ref_id: n.refId || null,
    };
    const { data, error } = await supabase.from('admin_notifications').insert(row).select('*').maybeSingle();
    if (error) {
      if (error.code === '23505') return null; // déjà notifié (même type + référence)
      throw error;
    }
    if (data) await sendPush(supabase, data); // ne lève jamais d'exception
    return data;
  } catch (error) {
    console.error('[notifications] échec :', n?.type, error?.message || error);
    return null;
  }
}

/** Une notification est-elle visible pour ce compte ? */
export const visibleTo = (identity, notif) => identity.isSuperAdmin
  || Boolean(notif.permission && identity.permissions.includes(notif.permission));
