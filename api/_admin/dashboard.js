import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { can, assertPermission } from '../_lib/permissions.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';

export function datasetConfig(identity, dataset) {
  return {
    members: { permission: 'voir_membres', table: 'members',
      fields: ['id', 'nom', ...(can(identity, 'voir_ninu') ? ['ninu'] : []), 'email', 'ville', 'status', 'created_at'].join(', '),
      order: 'created_at', filters: ['nom', 'email', 'ville', ...(can(identity, 'voir_ninu') ? ['ninu'] : [])] },
    donations: { permission: 'voir_dons', table: 'donations',
      fields: 'montant, refunded_cents, devise, provider, email, transaction_id, statut, created_at',
      order: 'created_at', filters: ['provider', 'email', 'transaction_id', 'statut'] },
    leads: { permission: 'voir_leads', table: 'leads_livreblanc', fields: 'nom, email, ville, downloaded_at',
      order: 'downloaded_at', filters: ['nom', 'email', 'ville'] },
  }[dataset];
}

export function createDashboardHandler({ authenticate = requirePermission, serviceClient = getServiceClient } = {}) {
return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const identity = await authenticate(req, 'acces_dashboard');
    const supabase = serviceClient();
    if (req.method === 'PATCH') {
      assertPermission(identity, 'traiter_membres');
      const body = getBody(req);
      if (!/^[0-9a-f-]{36}$/i.test(clean(body.member_id)) || !['pending', 'approved', 'rejected'].includes(body.status)) {
        return json(res, 422, { error: 'Mise à jour invalide.' });
      }
      const { data, error } = await supabase.from('members').update({ status: body.status })
        .eq('id', body.member_id).select('id').maybeSingle();
      if (error) throw error;
      return json(res, data ? 200 : 404, data ? { ok: true } : { error: 'Adhésion introuvable.' });
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, PATCH');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }
    const dataset = clean(req.query?.dataset);
    if (dataset) {
      const config = datasetConfig(identity, dataset);
      if (!config) return json(res, 400, { error: 'Jeu de données inconnu.' });
      assertPermission(identity, config.permission);
      const exporting = req.query?.export === '1';
      if (exporting) assertPermission(identity, 'exporter_donnees');
      const page = exporting ? 1 : Math.min(Math.max(parseInt(req.query?.page, 10) || 1, 1), 100000);
      const pageSize = exporting ? 1000 : Math.min(Math.max(parseInt(req.query?.page_size, 10) || 25, 10), 100);
      let query = supabase.from(config.table).select(config.fields, { count: 'exact' })
        .order(config.order, { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
      const search = clean(req.query?.search).replace(/[^\p{L}\p{N}@ .+_-]/gu, '').slice(0, 80);
      if (search) query = query.or(config.filters.map(field => `${field}.ilike.%${search}%`).join(','));
      const { data, error, count } = await query;
      if (error) throw error;
      return json(res, 200, { records: data || [], total: count || 0, page, page_size: pageSize,
        truncated: exporting && (count || 0) > pageSize });
    }
    const stats = {};
    const lists = { members: [], donations: [], leads: [] };
    for (const name of Object.keys(lists)) {
      const config = datasetConfig(identity, name);
      if (!can(identity, config.permission)) { stats[name] = null; continue; }
      const { data, error, count } = await supabase.from(config.table)
        .select(config.fields, { count: 'exact' }).order(config.order, { ascending: false }).limit(25);
      if (error) throw error;
      lists[name] = data || [];
      stats[name] = count || 0;
    }
    stats.donation_totals = null;
    if (can(identity, 'voir_dons')) {
      const { data, error } = await supabase.rpc('ea_donation_totals');
      if (error) throw error;
      stats.donation_totals = data || [];
    }
    for (const [name, table, permission] of [
      ['trivia', 'trivia_questions', 'gerer_trivia'], ['articles', 'articles', 'gerer_articles'],
      ['events', 'events', 'gerer_evenements'], ['media', 'media_gallery', 'gerer_galerie'],
    ]) {
      if (!can(identity, permission)) { stats[name] = null; continue; }
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
      if (error) throw error;
      stats[name] = count || 0;
    }
    return json(res, 200, { profile: { email: identity.user.email, role: identity.role }, stats, ...lists });
  } catch (error) { return handleError(res, error, 'Chargement du dashboard impossible.'); }
}
}
export default createDashboardHandler();
