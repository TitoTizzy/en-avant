// /api/admin/notifications — Cloche du tableau de bord.
// GET  : { items: [...50 dernières], unread, badges: { members, donations, articles } }
// POST : { action: 'read', id } | { action: 'read_all' }
// Chacun ne voit que les notifications liées à ses permissions (SuperAdmin : toutes).
import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';
import { BADGE_GROUPS, visibleTo } from '../_lib/notifications.js';

const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''));

async function visibleNotifications(supabase, identity) {
  let query = supabase
    .from('admin_notifications')
    .select('id, type, title, body, link, permission, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (!identity.isSuperAdmin) {
    if (!identity.permissions.length) return [];
    query = query.in('permission', identity.permissions);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter((n) => visibleTo(identity, n));
}

async function readIds(supabase, userId, ids) {
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from('admin_notification_reads')
    .select('notification_id')
    .eq('user_id', userId)
    .in('notification_id', ids);
  if (error) throw error;
  return new Set((data || []).map((r) => r.notification_id));
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    // Pas de PIN : la cloche doit pouvoir se mettre à jour en arrière-plan.
    const identity = await requirePermission(req, 'acces_dashboard', { requirePin: false });
    const supabase = getServiceClient();
    const userId = identity.user.id;

    const all = await visibleNotifications(supabase, identity);
    const read = await readIds(supabase, userId, all.map((n) => n.id));

    if (req.method === 'GET') {
      const unreadItems = all.filter((n) => !read.has(n.id));
      const badges = Object.fromEntries(Object.entries(BADGE_GROUPS)
        .map(([group, types]) => [group, unreadItems.filter((n) => types.includes(n.type)).length]));
      return json(res, 200, {
        items: all.slice(0, 50).map(({ permission, ...n }) => ({ ...n, read: read.has(n.id) })),
        unread: unreadItems.length,
        badges,
      });
    }

    if (req.method === 'POST') {
      const body = getBody(req);
      const action = clean(body.action);
      let ids = [];
      if (action === 'read') {
        const id = clean(body.id);
        if (!isUuid(id) || !all.some((n) => n.id === id)) return json(res, 404, { error: 'Notification introuvable.' });
        ids = [id];
      } else if (action === 'read_all') {
        const group = clean(body.group);
        const types = BADGE_GROUPS[group];
        ids = all.filter((n) => !read.has(n.id) && (!types || types.includes(n.type))).map((n) => n.id);
      } else {
        return json(res, 422, { error: 'Action inconnue.' });
      }
      if (ids.length) {
        const { error } = await supabase
          .from('admin_notification_reads')
          .upsert(ids.map((id) => ({ notification_id: id, user_id: userId })), { onConflict: 'notification_id,user_id' });
        if (error) throw error;
      }
      return json(res, 200, { ok: true, marked: ids.length });
    }

    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) {
    return handleError(res, error);
  }
}
