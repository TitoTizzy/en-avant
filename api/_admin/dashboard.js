import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';
import { onApproved, sendAccessLink, relanceEmail } from '../_lib/adhesion.js';
import { sendBatchToMembers } from '../_lib/notify.js';

const MEMBER_STATUSES = ['pending', 'approved', 'rejected'];

// Droits fins (profiles.permissions). Le superadmin les a tous.
const can = (identity, perm) => identity.isSuperAdmin || identity.permissions.includes(perm);

function forbidden(res) {
  return json(res, 403, { error: 'Droits insuffisants pour ces données.' });
}

/** NINU masqué sauf pour le superadmin : seuls les 3 derniers caractères restent. */
function maskNinu(value, identity) {
  if (!value || identity.isSuperAdmin) return value || null;
  const s = String(value);
  return s.length <= 3 ? '•••' : `${'•'.repeat(Math.max(s.length - 3, 3))}${s.slice(-3)}`;
}

// user_id n'est jamais renvoyé au navigateur : seulement « a un compte ou non ».
const maskMembers = (rows, identity) => (rows || []).map(({ user_id: userId, ...m }) => ({
  ...m,
  ninu: maskNinu(m.ninu, identity),
  has_account: Boolean(userId),
}));

const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''));
const RELANCE_DELAI_MS = 7 * 24 * 3600 * 1000;

/** Comptes « member » sans fiche d'adhésion, non relancés depuis 7 jours. */
async function relanceTargets(supabase) {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, nom, relance_adhesion_at')
    .eq('role', 'member')
    .limit(1000);
  if (error) throw error;
  const { data: fiches, error: fichesError } = await supabase
    .from('members')
    .select('user_id, email')
    .limit(5000);
  if (fichesError) throw fichesError;
  const linked = new Set(fiches.map((f) => f.user_id).filter(Boolean));
  const emails = new Set(fiches.map((f) => String(f.email || '').toLowerCase()));
  const limit = Date.now() - RELANCE_DELAI_MS;
  return (profiles || []).filter((p) => p.email
    && !linked.has(p.id)
    && !emails.has(String(p.email).toLowerCase())
    && (!p.relance_adhesion_at || new Date(p.relance_adhesion_at).getTime() < limit));
}

async function loadMember(supabase, memberId) {
  const { data, error } = await supabase
    .from('members')
    .select('id, nom, email, status, user_id')
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Totaux des dons encaissés, par devise, calculés en base (fonction SQL donations_totals). */
async function donationTotals(supabase) {
  const { data, error } = await supabase.rpc('donations_totals');
  if (error) return null; // migration non exécutée : le total n'est pas affiché plutôt que faux
  return Object.fromEntries((data || []).map((r) => [r.devise, Number(r.total_cents) || 0]));
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const identity = await requirePermission(req, 'acces_dashboard');
    const supabase = getServiceClient();

    if (req.method === 'PATCH') {
      if (!can(identity, 'voir_membres')) return forbidden(res);
      const body = getBody(req);
      const memberId = clean(body.member_id);
      const status = clean(body.status);

      if (!isUuid(memberId) || !MEMBER_STATUSES.includes(status)) {
        return json(res, 422, { error: 'Mise à jour invalide.' });
      }

      const member = await loadMember(supabase, memberId);
      if (!member) return json(res, 404, { error: 'Adhésion introuvable.' });

      const { error } = await supabase
        .from('members')
        .update({ status })
        .eq('id', memberId);
      if (error) throw error;

      // Ouverture de l'accès + email, uniquement au passage à « approved ».
      if (status === 'approved' && member.status !== 'approved') {
        try {
          const result = await onApproved(supabase, member);
          return json(res, 200, { ok: true, email_sent: result.emailSent, mode: result.mode });
        } catch (approveError) {
          console.error('Approbation : ouverture du compte impossible', approveError?.message || approveError);
          return json(res, 200, {
            ok: true,
            email_sent: false,
            warning: 'Adhésion approuvée, mais l’accès n’a pas pu être ouvert. Utilisez « Lien d’accès » pour réessayer.',
          });
        }
      }
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST') {
      if (!can(identity, 'voir_membres')) return forbidden(res);
      const body = getBody(req);
      const action = clean(body.action);

      if (action === 'access_link') {
        const memberId = clean(body.member_id);
        if (!isUuid(memberId)) return json(res, 422, { error: 'Adhésion invalide.' });
        const member = await loadMember(supabase, memberId);
        if (!member) return json(res, 404, { error: 'Adhésion introuvable.' });
        if (member.status !== 'approved') {
          return json(res, 409, { error: 'Approuvez d’abord cette adhésion.' });
        }
        const sent = await sendAccessLink(supabase, member);
        return json(res, sent ? 200 : 502, sent
          ? { ok: true }
          : { error: 'Le lien a été créé mais l’email n’est pas parti. Réessayez dans un instant.' });
      }

      if (action === 'relance') {
        const targets = await relanceTargets(supabase);
        if (body.preview === true) return json(res, 200, { ok: true, count: targets.length });
        const sentTo = new Set(await sendBatchToMembers(targets.map(relanceEmail)));
        const ids = targets.filter((t) => sentTo.has(t.email)).map((t) => t.id);
        if (ids.length) {
          const { error } = await supabase
            .from('profiles')
            .update({ relance_adhesion_at: new Date().toISOString() })
            .in('id', ids);
          if (error) throw error;
        }
        return json(res, 200, { ok: true, sent: ids.length, failed: targets.length - ids.length });
      }

      return json(res, 422, { error: 'Action inconnue.' });
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, PATCH, POST');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }

    const dataset = clean(req.query?.dataset);
    if (['members', 'donations', 'leads'].includes(dataset)) {
      const needed = dataset === 'members' ? 'voir_membres' : 'voir_dons';
      if (!can(identity, needed)) return forbidden(res);
      // Les exports massifs de données personnelles sont réservés au superadmin.
      if (req.query?.export === '1' && !identity.isSuperAdmin) return forbidden(res);
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
          fields: 'id, nom, ninu, email, ville, status, created_at, user_id',
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
        records: dataset === 'members' ? maskMembers(data, identity) : (data || []),
        total: count || 0,
        page: exporting ? 1 : page,
        page_size: pageSize,
        truncated: exporting && (count || 0) > pageSize,
      });
    }

    const seeMembers = can(identity, 'voir_membres');
    const seeDonations = can(identity, 'voir_dons');
    const empty = Promise.resolve({ data: [], count: 0, error: null });

    const [
      membersResult,
      donationsResult,
      leadsResult,
      triviaCountResult,
      articlesCountResult,
      eventsCountResult,
      mediaCountResult,
    ] = await Promise.all([
      seeMembers
        ? supabase
          .from('members')
          .select('id, nom, ninu, email, ville, status, created_at, user_id', { count: 'exact' })
          .order('created_at', { ascending: false })
          .limit(25)
        : empty,
      seeDonations
        ? supabase
          .from('donations')
          .select('montant, devise, provider, email, transaction_id, statut, created_at')
          .order('created_at', { ascending: false })
          .limit(25)
        : empty,
      seeDonations
        ? supabase
          .from('leads_livreblanc')
          .select('nom, email, ville, downloaded_at', { count: 'exact' })
          .order('downloaded_at', { ascending: false })
          .limit(25)
        : empty,
      supabase.from('trivia_questions').select('id', { count: 'exact', head: true }),
      supabase.from('articles').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }),
      supabase.from('media_gallery').select('id', { count: 'exact', head: true }),
    ]);

    const failure = [
      membersResult.error,
      donationsResult.error,
      leadsResult.error,
      triviaCountResult.error,
      articlesCountResult.error,
      eventsCountResult.error,
      mediaCountResult.error,
    ].find(Boolean);
    if (failure) throw failure;

    const totals = seeDonations ? await donationTotals(supabase) : null;

    return json(res, 200, {
      profile: { email: identity.user.email, role: identity.role },
      access: { members: seeMembers, donations: seeDonations, export: identity.isSuperAdmin },
      stats: {
        members: seeMembers ? (membersResult.count || 0) : null,
        // Compatibilité : total en centimes USD ; détail par devise dans donations_totals.
        donations_cents: totals ? (totals.usd || 0) : null,
        donations_totals: totals,
        leads: seeDonations ? (leadsResult.count || 0) : null,
        trivia: triviaCountResult.count || 0,
        articles: articlesCountResult.count || 0,
        events: eventsCountResult.count || 0,
        media: mediaCountResult.count || 0,
      },
      members: maskMembers(membersResult.data, identity),
      donations: donationsResult.data || [],
      leads: leadsResult.data || [],
    });
  } catch (error) {
    return handleError(res, error, 'Chargement du dashboard impossible.');
  }
}
