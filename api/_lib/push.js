// Notifications push (Web Push / VAPID).
// Les clés VAPID sont créées par le serveur au premier usage et gardées dans
// Supabase (table push_config, service_role uniquement) : aucune clé à saisir.
import webpush from 'web-push';
import { siteUrl } from './notify.js';

let cachedKeys = null;

/** Clés VAPID (création au premier appel). */
export async function vapidKeys(supabase) {
  if (cachedKeys) return cachedKeys;
  const { data, error } = await supabase.from('push_config').select('public_key, private_key').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (data) {
    cachedKeys = { publicKey: data.public_key, privateKey: data.private_key };
    return cachedKeys;
  }
  const keys = webpush.generateVAPIDKeys();
  const { error: insertError } = await supabase
    .from('push_config')
    .insert({ id: 1, public_key: keys.publicKey, private_key: keys.privateKey });
  if (insertError && insertError.code !== '23505') throw insertError;
  cachedKeys = null; // relire : une autre instance a pu créer les clés en même temps
  return vapidKeys(supabase);
}

/** Comptes autorisés à voir une notification (SuperAdmin ou permission requise). */
async function recipients(supabase, notif) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, permissions')
    .in('role', ['superadmin', 'editor', 'readonly']);
  if (error) throw error;
  return (data || [])
    .filter((p) => p.role === 'superadmin'
      || (notif.permission && Array.isArray(p.permissions) && p.permissions.includes(notif.permission)))
    .map((p) => p.id);
}

/** Contenu affiché par le service worker (aucune donnée sensible). */
export const pushPayload = (notif) => JSON.stringify({
  title: notif.title,
  body: notif.body || '',
  url: `${siteUrl()}/admin.html${notif.link ? `?n=${encodeURIComponent(notif.link)}` : ''}`,
  tag: notif.type,
});

/**
 * Envoie une notification à tous les appareils abonnés autorisés.
 * Supprime les abonnements expirés. Ne lève jamais d'exception.
 * @returns {Promise<number>} nombre d'appareils atteints
 */
export async function sendPush(supabase, notif, { userIds } = {}) {
  try {
    const ids = userIds || (await recipients(supabase, notif));
    if (!ids.length) return 0;
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', ids);
    if (error) throw error;
    if (!subs?.length) return 0;

    const keys = await vapidKeys(supabase);
    const options = {
      vapidDetails: { subject: 'mailto:contact@enavant.org', publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 24 * 3600,
      timeout: 5000,
    };
    const payload = pushPayload(notif);
    let delivered = 0;
    const expired = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options);
        delivered += 1;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) expired.push(s.id);
        else console.error('[push] envoi échoué :', e?.statusCode || e?.message);
      }
    }));
    if (expired.length) await supabase.from('push_subscriptions').delete().in('id', expired);
    return delivered;
  } catch (error) {
    console.error('[push] échec :', error?.message || error);
    return 0;
  }
}
