// Indicateurs du tableau de bord : chiffres de la période choisie comparés à la période
// précédente, courbes, répartitions. Calculs purs (testables) à partir des lignes lues en base.
// Aucune donnée nominative : seulement des nombres, des lieux et des titres.

const DAY = 864e5;
const TZ = 'America/Port-au-Prince';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
export const PERIODES = { 7: '7 derniers jours', 30: '30 derniers jours', 90: '3 derniers mois', 365: '12 derniers mois' };

const ts = (v) => (v ? Date.parse(v) : NaN);
const inRange = (v, from, to) => { const t = ts(v); return t >= from && t < to; };

/** Tranches (jours, ou mois sur 12 mois) et valeur cumulée par tranche. */
export function buckets(rows, dateKey, { now, days, weight = () => 1 }) {
  const monthly = days > 120;
  const keyOf = (t) => (monthly ? dayFmt.format(new Date(t)).slice(0, 7) : dayFmt.format(new Date(t)));
  const keys = [];
  if (monthly) {
    const seen = new Set();
    for (let i = days; i >= 0; i -= 1) { const k = keyOf(now - i * DAY); if (!seen.has(k)) { seen.add(k); keys.push(k); } }
  } else {
    for (let i = days - 1; i >= 0; i -= 1) keys.push(keyOf(now - i * DAY));
  }
  const index = new Map(keys.map((k, i) => [k, i]));
  const values = new Array(keys.length).fill(0);
  for (const r of rows) {
    const t = ts(r[dateKey]);
    if (Number.isNaN(t) || t < now - days * DAY || t > now) continue;
    const i = index.get(keyOf(t));
    if (i !== undefined) values[i] += weight(r);
  }
  return { keys, values, monthly };
}

/** Répartition triée (le reste dans « Autres »). */
export function top(rows, keyOf, limit = 6) {
  const m = new Map();
  for (const r of rows) {
    const raw = keyOf(r);
    const label = raw === null || raw === undefined || String(raw).trim() === '' ? 'Non renseigné' : String(raw).trim();
    m.set(label, (m.get(label) || 0) + 1);
  }
  const sorted = [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return sorted;
  return [...sorted.slice(0, limit - 1), { label: 'Autres', value: sorted.slice(limit - 1).reduce((a, b) => a + b.value, 0) }];
}

const kpi = (label, value, previous, format = 'int', hint = '') => ({ label, value, previous, format, hint });

/** Délai moyen (en heures) entre la demande et l'approbation, pour les approbations de la période. */
export function delaiMoyen(rows, start, end) {
  const d = rows
    .filter((r) => r.status === 'approved' && r.decided_at && inRange(r.decided_at, start, end))
    .map((r) => (ts(r.decided_at) - ts(r.created_at)) / 3600000)
    .filter((h) => h >= 0);
  return { n: d.length, heures: d.length ? Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10 : null };
}
const delaiKpi = (rows, from, now, prevFrom) => {
  const cur = delaiMoyen(rows, from, now + 1);
  const prev = delaiMoyen(rows, prevFrom, from);
  return {
    ...kpi('Délai moyen d’approbation', cur.heures, prev.heures, 'delai',
      cur.n ? `${cur.n} approbation${cur.n > 1 ? 's' : ''} mesurée${cur.n > 1 ? 's' : ''}` : 'mesuré à partir des prochaines approbations'),
    inverse: true,
  };
};

/**
 * @param data lignes lues en base (voir api/_admin/stats.js)
 * @param opts { now, days, sections: noms autorisés pour la personne connectée }
 */
export function buildOverview(data, { now = Date.now(), days = 30, sections = null } = {}) {
  const from = now - days * DAY;
  const prevFrom = now - 2 * days * DAY;
  const cur = (rows, key) => rows.filter((r) => inRange(r[key], from, now + 1));
  const prev = (rows, key) => rows.filter((r) => inRange(r[key], prevFrom, from));
  const allowed = (k) => !sections || sections.includes(k);
  const out = [];

  if (allowed('adhesions') && data.members) {
    const m = data.members;
    const c = cur(m, 'created_at');
    const p = prev(m, 'created_at');
    const approved = m.filter((r) => r.status === 'approved');
    const decided = c.filter((r) => r.status !== 'pending');
    out.push({
      key: 'adhesions', titre: 'Adhésions', icon: 'fa-user-plus', link: 'members:en_attente',
      kpis: [
        kpi('Demandes reçues', c.length, p.length),
        kpi('Approuvées (sur ces demandes)', c.filter((r) => r.status === 'approved').length, p.filter((r) => r.status === 'approved').length),
        kpi('En attente d’examen', m.filter((r) => r.status === 'pending').length, null, 'int', 'toutes périodes'),
        kpi('Taux d’approbation', decided.length ? Math.round((100 * c.filter((r) => r.status === 'approved').length) / decided.length) : null, null, 'pct', 'demandes déjà examinées'),
        delaiKpi(m, from, now, prevFrom),
        kpi('Adhérents au total', approved.length, null, 'int', 'adhésions approuvées'),
      ],
      series: { label: 'Demandes d’adhésion', ...buckets(m, 'created_at', { now, days }) },
      lists: [
        { title: 'Adhérents par pays', items: top(approved, (r) => r.pays) },
        { title: 'Adhérents en Haïti, par département', items: top(approved.filter((r) => r.pays === 'Haïti'), (r) => r.departement) },
      ],
    });
  }

  if (allowed('dons') && data.donations) {
    const ok = data.donations.filter((r) => ['completed', 'partially_refunded'].includes(r.statut) && (r.devise || 'usd') === 'usd');
    const net = (r) => ((r.montant || 0) - (r.refunded_cents || 0)) / 100;
    const sum = (rows) => Math.round(rows.reduce((a, r) => a + net(r), 0) * 100) / 100;
    const c = cur(ok, 'created_at');
    const p = prev(ok, 'created_at');
    const mensuels = new Set(ok.filter((r) => r.frequence === 'mensuel' && ts(r.created_at) >= now - 35 * DAY).map((r) => r.email || r.transaction_id));
    const alertes = cur(data.donations, 'created_at').filter((r) => ['refunded', 'disputed'].includes(r.statut));
    out.push({
      key: 'dons', titre: 'Dons (en dollars US)', icon: 'fa-hand-holding-heart', link: 'donations',
      kpis: [
        kpi('Montant reçu', sum(c), sum(p), 'money'),
        kpi('Nombre de dons', c.length, p.length),
        kpi('Don moyen', c.length ? Math.round((sum(c) / c.length) * 100) / 100 : null, p.length ? Math.round((sum(p) / p.length) * 100) / 100 : null, 'money'),
        kpi('Donateurs mensuels actifs', mensuels.size, null, 'int', 'au moins une échéance sur 35 jours'),
        kpi('Remboursements et contestations', alertes.length, null, 'int', alertes.length ? 'à vérifier dans Stripe' : ''),
      ],
      series: { label: 'Montant reçu (USD)', ...buckets(ok, 'created_at', { now, days, weight: net }) },
      lists: [{ title: 'Pays des donateurs (période)', items: top(c, (r) => r.pays) }],
    });
  }

  if (allowed('livre_blanc') && data.leads) {
    const c = cur(data.leads, 'downloaded_at');
    out.push({
      key: 'livre_blanc', titre: 'Livre blanc', icon: 'fa-book-open', link: 'leads',
      kpis: [
        kpi('Téléchargements', c.length, prev(data.leads, 'downloaded_at').length),
        kpi('Téléchargements au total', data.leads.length, null, 'int', 'depuis le lancement'),
      ],
      series: { label: 'Téléchargements', ...buckets(data.leads, 'downloaded_at', { now, days }) },
      lists: [{ title: 'Villes des lecteurs (période)', items: top(c, (r) => r.ville) }],
    });
  }

  if (allowed('newsletter') && data.subscribers) {
    const subs = data.subscribers;
    const active = subs.filter((s) => !s.unsubscribed_at);
    const sent = (data.deliveries || []).filter((d) => d.statut === 'envoye');
    const failed = (data.deliveries || []).filter((d) => d.statut === 'echec');
    out.push({
      key: 'newsletter', titre: 'Newsletter', icon: 'fa-envelope-open-text', link: 'newsletter',
      kpis: [
        kpi('Abonnés', active.length, null, 'int', 'adhérents compris'),
        kpi('Nouveaux abonnés', cur(subs, 'created_at').length, prev(subs, 'created_at').length),
        kpi('Désinscriptions', cur(data.optouts || [], 'created_at').length, prev(data.optouts || [], 'created_at').length),
        kpi('Emails envoyés', cur(sent, 'sent_at').length, prev(sent, 'sent_at').length),
        kpi('Emails en échec', cur(failed, 'claimed_at').length, prev(failed, 'claimed_at').length),
      ],
      series: { label: 'Emails envoyés', ...buckets(sent, 'sent_at', { now, days }) },
    });
  }

  if (allowed('quiz') && data.games) {
    const finished = data.games.filter((g) => g.finished_at);
    const c = cur(finished, 'finished_at');
    const p = prev(finished, 'finished_at');
    const weekDefi = finished.filter((g) => g.mode === 'defi' && g.week_start === data.week);
    const adherents = data.adherents || 0;
    const qById = new Map((data.questions || []).map((q) => [q.id, q.question]));
    const stats = new Map();
    for (const a of cur(data.answers || [], 'answered_at')) {
      if (!a.question_id) continue;
      const s = stats.get(a.question_id) || { n: 0, ok: 0 };
      s.n += 1; if (a.correct) s.ok += 1;
      stats.set(a.question_id, s);
    }
    const ratees = [...stats.entries()].filter(([, s]) => s.n >= 3)
      .map(([id, s]) => ({ label: qById.get(id) || 'Question supprimée', value: Math.round((100 * (s.n - s.ok)) / s.n), unit: '% d’erreurs' }))
      .sort((a, b) => b.value - a.value).slice(0, 5);
    out.push({
      key: 'quiz', titre: 'Quiz des adhérents', icon: 'fa-trophy', link: 'trivia',
      kpis: [
        kpi('Joueurs actifs', new Set(c.map((g) => g.user_id)).size, new Set(p.map((g) => g.user_id)).size),
        kpi('Parties terminées', c.length, p.length),
        kpi('Défi de la semaine', weekDefi.length, null, 'int', adherents ? `${Math.round((100 * weekDefi.length) / adherents)} % des adhérents cette semaine` : 'cette semaine'),
      ],
      series: { label: 'Parties terminées', ...buckets(finished, 'finished_at', { now, days }) },
      lists: [{ title: 'Questions les plus ratées (période)', items: ratees, empty: 'Pas encore assez de réponses.' }],
    });
  }

  if (allowed('assistant') && data.chat) {
    const c = data.chat.filter((r) => inRange(`${r.day}T12:00:00Z`, from, now + DAY));
    const p = data.chat.filter((r) => inRange(`${r.day}T12:00:00Z`, prevFrom, from));
    const total = (rows) => rows.reduce((a, r) => a + (r.questions || 0), 0);
    const LANG = { fr: 'Français', en: 'Anglais', ht: 'Créole', es: 'Espagnol' };
    const byLang = new Map();
    for (const r of c) byLang.set(LANG[r.langue] || r.langue, (byLang.get(LANG[r.langue] || r.langue) || 0) + (r.questions || 0));
    out.push({
      key: 'assistant', titre: 'Assistant du site', icon: 'fa-comments', link: null,
      kpis: [kpi('Questions posées', total(c), total(p))],
      series: { label: 'Questions posées', ...buckets(data.chat.map((r) => ({ ...r, at: `${r.day}T12:00:00Z` })), 'at', { now, days, weight: (r) => r.questions || 0 }) },
      lists: [{ title: 'Langues utilisées', items: [...byLang.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value), empty: 'Mesure démarrée récemment.' }],
    });
  }

  if (allowed('contenus') && data.articles) {
    const a = data.articles;
    out.push({
      key: 'contenus', titre: 'Contenus', icon: 'fa-newspaper', link: 'articles',
      kpis: [
        kpi('Articles publiés', cur(a.filter((r) => r.published), 'published_at').length, prev(a.filter((r) => r.published), 'published_at').length),
        kpi('Articles proposés par des membres', cur(a.filter((r) => r.review_status), 'created_at').length, prev(a.filter((r) => r.review_status), 'created_at').length),
        kpi('À relire', a.filter((r) => r.review_status === 'pending').length, null, 'int', 'en attente'),
      ],
    });
  }
  return { periode: days, libelle: PERIODES[days] || `${days} derniers jours`, maj: new Date(now).toISOString(), sections: out };
}
