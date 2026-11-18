// /api/admin/push — Abonnement aux notifications push de l'appareil courant.
// GET    : { publicKey }                      clé publique VAPID (créée au besoin)
// POST   : { subscription }                   enregistre l'appareil
// POST   : { action: 'test' }                 envoie une notification de test à mes appareils
// DELETE : { endpoint }                       désabonne l'appareil
import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';
import { vapidKeys, sendPush } from '../_lib/push.js';

const isHttps = (v) => /^https:\/\/[^\s]{10,2000}$/.test(String(v || ''));
const isKey = (v) => /^[A-Za-z0-9_-]{16,200}$/.test(String(v || ''));

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const identity = await requirePermission(req, 'acces_dashboard', { requirePin: false });
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const { publicKey } = await vapidKeys(supabase);
      return json(res, 200, { publicKey });
    }

    const body = getBody(req);

    if (req.method === 'POST' && clean(body.action) === 'test') {
      const delivered = await sendPush(supabase, {
        type: 'test',
        title: 'Notifications activées',
        body: 'Vous recevrez ici les alertes du tableau de bord En Avant.',
        link: 'home',
      }, { userIds: [identity.user.id] });
      return json(res, delivered ? 200 : 404, delivered
        ? { ok: true, delivered }
        : { error: 'Aucun appareil abonné : activez d’abord les notifications sur cet appareil.' });
    }

    if (req.method === 'POST') {
      const sub = body.subscription || {};
      if (!isHttps(sub.endpoint) || !isKey(sub.keys?.p256dh) || !isKey(sub.keys?.auth)) {
        return json(res, 422, { error: 'Abonnement invalide.' });
      }
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: identity.user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: clean(req.headers['user-agent']).slice(0, 200),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      return json(res, 201, { ok: true });
    }

    if (req.method === 'DELETE') {
      const endpoint = String(body.endpoint || '');
      if (!isHttps(endpoint)) return json(res, 422, { error: 'Abonnement invalide.' });
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
        .eq('user_id', identity.user.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error);
  }
}
