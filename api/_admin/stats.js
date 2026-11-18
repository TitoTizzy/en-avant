// GET /api/admin/stats?kind=members|donations|leads|trivia|articles|events|media
// Détail d'une carte du tableau de bord : total, évolution sur 30 jours,
// répartitions, et lien vers la liste. Aucune donnée nominative renvoyée.
import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { json, handleError, clean } from '../_lib/http.js';

const DAY = 86400000;
const can = (identity, perm) => identity.isSuperAdmin || identity.permissions.includes(perm);

/** Nombre d'éléments par jour sur les 30 derniers jours (fuseau Haïti). */
export function dailySeries(rows, dateKey, now = Date.now(), valueOf = () => 1) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Port-au-Prince' });
  const days = [];
  for (let i = 29; i >= 0; i -= 1) days.push(fmt.format(new Date(now - i * DAY)));
  const index = new Map(days.map((d, i) => [d, i]));
  const values = new Array(30).fill(0);
  for (const r of rows) {
    if (!r[dateKey]) continue;
    const i = index.get(fmt.format(new Date(r[dateKey])));
    if (i !== undefined) values[i] += valueOf(r);
  }
  return { days, values, total: values.reduce((a, b) => a + b, 0) };
}

/** Répartition par valeur, triée, limitée (le reste regroupé dans « Autres »). */
export function breakdown(rows, keyOf, { limit = 8, labels = {} } = {}) {
  const counts = new Map();
  for (const r of rows) {
    const raw = keyOf(r);
    const key = raw === null || raw === undefined || raw === '' ? '—' : String(raw).trim();
    const norm = key.toLowerCase();
    const prev = counts.get(norm) || { label: labels[key] || labels[norm] || key, value: 0 };
    prev.value += 1;
    counts.set(norm, prev);
  }
  const sorted = [...counts.values()].sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit - 1).reduce((a, b) => a + b.value, 0);
  return [...sorted.slice(0, limit - 1), { label: 'Autres', value: rest }];
}

async function rowsOf(supabase, table, columns) {
  const { data, error } = await supabase.from(table).select(columns).limit(5000);
  if (error) throw error;
  return data || [];
}

const money = (cents, cur) => `${((cents || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${String(cur || 'usd').toUpperCase()}`;

const KINDS = {
  members: {
    perm: 'voir_membres',
    title: 'Adhésions',
    link: 'members:en_attente',
    async build(supabase, now) {
      const rows = await rowsOf(supabase, 'members', 'status, ville, sexe, user_id, created_at');
      return {
        total: rows.length,
        series: { label: 'Nouvelles demandes par jour', ...dailySeries(rows, 'created_at', now) },
        groups: [
          { title: 'Par statut', items: breakdown(rows, (r) => r.status, { labels: { pending: 'En attente', approved: 'Approuvées', rejected: 'Rejetées' } }) },
          { title: 'Compte de connexion', items: breakdown(rows, (r) => (r.user_id ? 'Créé' : 'Pas encore')) },
          { title: 'Par ville', items: breakdown(rows, (r) => r.ville) },
          { title: 'Par sexe', items: breakdown(rows, (r) => r.sexe, { labels: { femme: 'Femme', homme: 'Homme', autre: 'Autre' } }) },
        ],
      };
    },
  },
  donations: {
    perm: 'voir_dons',
    title: 'Dons',
    link: 'donations',
    async build(supabase, now) {
      const rows = await rowsOf(supabase, 'donations', 'montant, devise, provider, statut, frequence, created_at');
      const ok = rows.filter((r) => !['refunded', 'disputed', 'failed'].includes(r.statut));
      const byCurrency = new Map();
      ok.forEach((r) => byCurrency.set(r.devise || 'usd', (byCurrency.get(r.devise || 'usd') || 0) + (r.montant || 0)));
      return {
        total: rows.length,
        highlight: [...byCurrency.entries()].map(([cur, cents]) => money(cents, cur)).join(' · ') || money(0, 'usd'),
        series: {
          label: 'Montant reçu par jour (USD)',
          ...dailySeries(ok.filter((r) => (r.devise || 'usd') === 'usd'), 'created_at', now, (r) => Math.round((r.montant || 0) / 100)),
        },
        groups: [
          { title: 'Par moyen de paiement', items: breakdown(rows, (r) => r.provider) },
          { title: 'Type de don', items: breakdown(rows, (r) => r.frequence, { labels: { unique: 'Unique', mensuel: 'Mensuel' } }) },
          { title: 'Par statut', items: breakdown(rows, (r) => r.statut) },
        ],
      };
    },
  },
  leads: {
    perm: 'voir_dons',
    title: 'Téléchargements du Livre blanc',
    link: 'leads',
    async build(supabase, now) {
      const rows = await rowsOf(supabase, 'leads_livreblanc', 'ville, sexe, downloaded_at');
      return {
        total: rows.length,
        series: { label: 'Téléchargements par jour', ...dailySeries(rows, 'downloaded_at', now) },
        groups: [
          { title: 'Par ville', items: breakdown(rows, (r) => r.ville) },
          { title: 'Par sexe', items: breakdown(rows, (r) => r.sexe, { labels: { femme: 'Femme', homme: 'Homme', autre: 'Autre' } }) },
        ],
      };
    },
  },
  trivia: {
    perm: 'acces_dashboard',
    title: 'Trivia',
    link: 'trivia',
    async build(supabase, now) {
      const [questions, scores] = await Promise.all([
        supabase.from('trivia_questions').select('id', { count: 'exact', head: true }),
        rowsOf(supabase, 'trivia_scores', 'score, total, completed_at'),
      ]);
      if (questions.error) throw questions.error;
      const pct = (r) => Math.round((100 * r.score) / r.total);
      const avg = scores.length ? Math.round(scores.reduce((a, r) => a + pct(r), 0) / scores.length) : 0;
      return {
        total: questions.count || 0,
        highlight: `${scores.length} partie(s) jouée(s) · score moyen ${avg} %`,
        series: { label: 'Parties jouées par jour', ...dailySeries(scores, 'completed_at', now) },
        groups: [
          {
            title: 'Répartition des scores',
            items: breakdown(scores, (r) => {
              const p = pct(r);
              return p >= 80 ? '80 – 100 %' : p >= 50 ? '50 – 79 %' : 'Moins de 50 %';
            }),
          },
        ],
      };
    },
  },
  articles: {
    perm: 'acces_dashboard',
    title: 'Articles',
    link: 'articles',
    async build(supabase, now) {
      const rows = await rowsOf(supabase, 'articles', 'categorie, published, review_status, created_at');
      return {
        total: rows.length,
        series: { label: 'Articles créés par jour', ...dailySeries(rows, 'created_at', now) },
        groups: [
          {
            title: 'État',
            items: breakdown(rows, (r) => (r.review_status === 'pending' ? 'En attente de relecture' : r.published ? 'Publié' : 'Brouillon')),
          },
          { title: 'Par catégorie', items: breakdown(rows, (r) => r.categorie) },
        ],
      };
    },
  },
  events: {
    perm: 'acces_dashboard',
    title: 'Événements',
    link: 'events',
    async build(supabase, now) {
      const rows = await rowsOf(supabase, 'events', 'lieu, date_cible, created_at');
      return {
        total: rows.length,
        series: { label: 'Événements ajoutés par jour', ...dailySeries(rows, 'created_at', now) },
        groups: [
          { title: 'Calendrier', items: breakdown(rows, (r) => (new Date(r.date_cible).getTime() >= now ? 'À venir' : 'Passés')) },
          { title: 'Par lieu', items: breakdown(rows, (r) => r.lieu) },
        ],
      };
    },
  },
  media: {
    perm: 'acces_dashboard',
    title: 'Médias',
    link: 'gallery',
    async build(supabase, now) {
      const rows = await rowsOf(supabase, 'media_gallery', 'type, created_at');
      return {
        total: rows.length,
        series: { label: 'Médias ajoutés par jour', ...dailySeries(rows, 'created_at', now) },
        groups: [{ title: 'Par type', items: breakdown(rows, (r) => r.type, { labels: { image: 'Images', video: 'Vidéos' } }) }],
      };
    },
  },
};

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }
    const identity = await requirePermission(req, 'acces_dashboard');
    const kind = clean(req.query?.kind);
    const def = KINDS[kind];
    if (!def) return json(res, 404, { error: 'Statistique inconnue.' });
    if (!can(identity, def.perm)) return json(res, 403, { error: 'Droits insuffisants pour cette statistique.' });

    const detail = await def.build(getServiceClient(), Date.now());
    return json(res, 200, { kind, title: def.title, link: def.link, ...detail });
  } catch (error) {
    return handleError(res, error, 'Statistiques indisponibles.');
  }
}
