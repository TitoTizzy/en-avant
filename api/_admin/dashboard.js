import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';

const MEMBER_STATUSES = ['pending', 'approved', 'rejected'];

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const identity = await requireRole(req, ['superadmin']);
    const supabase = getServiceClient();

    if (req.method === 'PATCH') {
      const body = getBody(req);
      const memberId = clean(body.member_id);
      const status = clean(body.status);

      if (!/^[0-9a-f-]{36}$/i.test(memberId) || !MEMBER_STATUSES.includes(status)) {
        return json(res, 422, { error: 'Mise à jour invalide.' });
      }

      const { error } = await supabase
        .from('members')
        .update({ status })
        .eq('id', memberId);
      if (error) throw error;

      return json(res, 200, { ok: true });
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, PATCH');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }

    const dataset = clean(req.query?.dataset);
    if (['members', 'donations', 'leads'].includes(dataset)) {
      const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
      const exporting = req.query?.export === '1';
      const pageSize = exporting
        ? 1000
        : Math.min(Math.max(parseInt(req.query?.page_size, 10) || 25, 10), 100);
      const from = exporting ? 0 : (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const search = clean(req.query?.search)
        .replace(/[%(),]/g, '')
        .slice(0, 80);

      const configs = {
        members: {
          table: 'members',
          fields: 'id, nom, ninu, email, ville, status, created_at',
          order: 'created_at',
          filters: ['nom', 'ninu', 'email', 'ville'],
        },
        donations: {
          table: 'donations',
          fields: 'montant, devise, provider, email, transaction_id, statut, created_at',
          order: 'created_at',
          filters: ['provider', 'email', 'transaction_id', 'statut'],
        },
        leads: {
          table: 'leads_livreblanc',
          fields: 'nom, email, ville, downloaded_at',
          order: 'downloaded_at',
          filters: ['nom', 'email', 'ville'],
        },
      };

      const config = configs[dataset];
      let query = supabase
        .from(config.table)
        .select(config.fields, { count: 'exact' })
        .order(config.order, { ascending: false })
        .range(from, to);

      if (search) {
        query = query.or(config.filters.map((field) => `${field}.ilike.%${search}%`).join(','));
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return json(res, 200, {
        records: data || [],
        total: count || 0,
        page: exporting ? 1 : page,
        page_size: pageSize,
        truncated: exporting && (count || 0) > pageSize,
      });
    }

    const [
      membersResult,
      donationsResult,
      donationsSumResult,
      leadsResult,
      triviaCountResult,
      articlesCountResult,
      eventsCountResult,
      mediaCountResult,
    ] = await Promise.all([
      supabase
        .from('members')
        .select('id, nom, ninu, email, ville, status, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('donations')
        .select('montant, devise, provider, email, transaction_id, statut, created_at')
        .order('created_at', { ascending: false })
        .limit(25),
      // Total réel : la liste ci-dessus est tronquée à 25 lignes.
      supabase
        .from('donations')
        .select('montant')
        .eq('statut', 'completed')
        .limit(5000),
      supabase
        .from('leads_livreblanc')
        .select('nom, email, ville, downloaded_at', { count: 'exact' })
        .order('downloaded_at', { ascending: false })
        .limit(25),
      supabase
        .from('trivia_questions')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('articles')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('media_gallery')
        .select('id', { count: 'exact', head: true }),
    ]);

    const failure = [
      membersResult.error,
      donationsResult.error,
      donationsSumResult.error,
      leadsResult.error,
      triviaCountResult.error,
      articlesCountResult.error,
      eventsCountResult.error,
      mediaCountResult.error,
    ].find(Boolean);
    if (failure) throw failure;

    const donations = donationsResult.data || [];
    return json(res, 200, {
      profile: { email: identity.user.email, role: identity.role },
      stats: {
        members: membersResult.count || 0,
        donations_cents: (donationsSumResult.data || [])
          .reduce((sum, item) => sum + (item.montant || 0), 0),
        leads: leadsResult.count || 0,
        trivia: triviaCountResult.count || 0,
        articles: articlesCountResult.count || 0,
        events: eventsCountResult.count || 0,
        media: mediaCountResult.count || 0,
      },
      members: membersResult.data || [],
      donations,
      leads: leadsResult.data || [],
    });
  } catch (error) {
    return handleError(res, error, 'Chargement du dashboard impossible.');
  }
}
