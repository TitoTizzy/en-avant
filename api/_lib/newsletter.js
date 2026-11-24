// Newsletter : destinataires filtrés, rendu de l'email, envoi par lots suivis.
// Règles :
// - destinataires = adhérents (fiches approuvées) et/ou abonnés au formulaire,
//   moins toute adresse désinscrite ; une adresse ne reçoit qu'un exemplaire ;
// - chaque email contient un lien de désinscription personnel (+ en-tête
//   List-Unsubscribe en un clic) ;
// - chaque destinataire est suivi (newsletter_deliveries) : un envoi interrompu
//   reprend là où il s'est arrêté, sans doublon.
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { escapeHtml, senderAddress } from './notify.js';
import { effectiveLocation, matchesGeo } from './geo.js';

export const PUBLICS = ['tous', 'adherents', 'abonnes'];
const PAGE = 1000;
const BATCH = 100;

export function siteUrl() {
  return (String(process.env.SITE_URL || '').trim() || 'https://enavant.org').replace(/\/+$/, '');
}

const normEmail = (value) => String(value ?? '').trim().toLowerCase();
const list = (value, max = 50) => (Array.isArray(value) ? value : [])
  .map((v) => String(v ?? '').trim()).filter(Boolean).slice(0, max);

/** Filtres validés : { public, pays[], departements[], villes[] }. */
export function cleanFiltres(raw = {}) {
  return {
    public: PUBLICS.includes(raw.public) ? raw.public : 'tous',
    pays: list(raw.pays),
    departements: list(raw.departements, 10),
    villes: list(raw.villes, 100),
  };
}

/** Lit toutes les lignes d'une requête Supabase, page par page (limite de 1000). */
export async function fetchAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Toutes les personnes joignables (avant filtres), dédoublonnées, désinscrits exclus. */
export async function loadContacts(supabase) {
  const [members, subscribers, optouts] = await Promise.all([
    fetchAll(() => supabase.from('members').select('email, nom, pays, departement, ville')
      .eq('status', 'approved').order('created_at')),
    fetchAll(() => supabase.from('newsletter_subscribers').select('email, nom, pays, departement, ville')
      .is('unsubscribed_at', null).order('created_at')),
    fetchAll(() => supabase.from('newsletter_optouts').select('email').order('email')),
  ]);
  const blocked = new Set(optouts.map((o) => o.email));
  const byEmail = new Map();
  const add = (row, type) => {
    const email = normEmail(row.email);
    if (!email.includes('@') || blocked.has(email)) return;
    const existing = byEmail.get(email);
    if (existing) { existing.types.add(type); return; }
    byEmail.set(email, { email, nom: row.nom || '', types: new Set([type]), ...effectiveLocation(row) });
  };
  members.forEach((m) => add(m, 'adherent'));
  subscribers.forEach((s) => add(s, 'abonne'));
  return [...byEmail.values()];
}

/** Applique le public et les filtres géographiques. */
export function applyFiltres(contacts, filtres) {
  const f = cleanFiltres(filtres);
  return contacts.filter((c) => {
    if (f.public === 'adherents' && !c.types.has('adherent')) return false;
    if (f.public === 'abonnes' && !c.types.has('abonne')) return false;
    return matchesGeo(c, f);
  });
}

/** Répartition par pays / département / ville (pour l'aperçu de l'audience). */
export function breakdown(contacts) {
  const count = (key) => {
    const map = new Map();
    for (const c of contacts) {
      const value = c[key] || 'Non renseigné';
      map.set(value, (map.get(value) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([nom, total]) => ({ nom, total }));
  };
  return {
    total: contacts.length,
    adherents: contacts.filter((c) => c.types.has('adherent')).length,
    abonnes: contacts.filter((c) => c.types.has('abonne')).length,
    pays: count('pays'),
    departements: count('departement').filter((d) => d.nom !== 'Non renseigné'),
    villes: count('commune').slice(0, 60),
  };
}

const prenom = (nom) => String(nom || '').trim().split(/\s+/)[0] || '';

function formatEventDate(value) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Port-au-Prince',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

/**
 * Email d'une newsletter pour un destinataire.
 * `contenu` est du HTML déjà assaini (sanitizeArticleHtml) à l'enregistrement.
 */
export function renderNewsletter({ newsletter, event = null, nom = '', unsubscribeUrl }) {
  const site = siteUrl();
  const hello = prenom(nom) ? `Bonjour ${escapeHtml(prenom(nom))},` : 'Bonjour,';
  const eventBlock = event ? `
  <table role="presentation" width="100%" style="margin:24px 0;border-collapse:separate;border:1px solid #f3c7b0;border-radius:14px;background:#fff7f2">
    <tr><td style="padding:18px 20px">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#e0551f;font-weight:bold">Événement</p>
      <p style="margin:0 0 8px;font-size:19px;font-weight:bold;color:#0e1726">${escapeHtml(event.titre)}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#0e1726">📅 ${escapeHtml(formatEventDate(event.date_cible))}</p>
      ${event.lieu ? `<p style="margin:0 0 4px;font-size:14px;color:#0e1726">📍 ${escapeHtml(event.lieu)}</p>` : ''}
      ${event.description ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.5;color:#33415c">${escapeHtml(event.description)}</p>` : ''}
    </td></tr>
  </table>` : '';
  const cta = newsletter.cta_label && newsletter.cta_url ? `
  <p style="margin:28px 0;text-align:center"><a href="${escapeHtml(newsletter.cta_url)}" style="background:#e0551f;color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;font-size:16px">${escapeHtml(newsletter.cta_label)}</a></p>` : '';
  const preheader = newsletter.apercu
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(newsletter.apercu)}</div>` : '';

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(newsletter.sujet)}</title></head>
<body style="margin:0;padding:0;background:#f2f4f8">${preheader}
<table role="presentation" width="100%" style="background:#f2f4f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#0e1726">
  <tr><td style="background:#0e1726;padding:22px;text-align:center">
    <img src="${site}/pictures/logo/logo.png" alt="En Avant" height="56" style="height:56px;width:auto">
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#0e1726">${escapeHtml(newsletter.sujet)}</h1>
    <p style="margin:0 0 14px;font-size:16px">${hello}</p>
    <div style="font-size:16px;line-height:1.6;color:#1d2a44">${newsletter.contenu || ''}</div>
    ${eventBlock}${cta}
  </td></tr>
  <tr><td style="padding:18px 28px 26px;border-top:1px solid #e6e9f0;font-size:12px;line-height:1.5;color:#5b6b82">
    <p style="margin:0 0 6px">Vous recevez cette lettre parce que vous êtes adhérent d’En Avant ou inscrit à sa newsletter.</p>
    <p style="margin:0"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#5b6b82">Se désinscrire</a> · <a href="${site}" style="color:#5b6b82">enavant.org</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    newsletter.sujet, '',
    prenom(nom) ? `Bonjour ${prenom(nom)},` : 'Bonjour,', '',
    htmlToText(newsletter.contenu),
    event ? `\nÉvénement : ${event.titre}\n${formatEventDate(event.date_cible)}${event.lieu ? `\n${event.lieu}` : ''}${event.description ? `\n${event.description}` : ''}` : '',
    newsletter.cta_label && newsletter.cta_url ? `\n${newsletter.cta_label} : ${newsletter.cta_url}` : '',
    `\n—\nSe désinscrire : ${unsubscribeUrl}`,
  ].join('\n');
  return { html, text };
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const unsubscribePageUrl = (token) => `${siteUrl()}/newsletter?desinscription=${token}`;
export const unsubscribeOneClickUrl = (token) => `${siteUrl()}/api/newsletter?op=desinscription&t=${token}`;

/** Jetons de désinscription (créés au besoin) pour une liste d'adresses. */
export async function tokensFor(supabase, emails) {
  const map = new Map();
  for (let i = 0; i < emails.length; i += 200) {
    const chunk = emails.slice(i, i + 200);
    const { error: upsertError } = await supabase.from('newsletter_tokens')
      .upsert(chunk.map((email) => ({ email })), { onConflict: 'email', ignoreDuplicates: true });
    if (upsertError) throw upsertError;
    const { data, error } = await supabase.from('newsletter_tokens').select('email, token').in('email', chunk);
    if (error) throw error;
    for (const row of data || []) map.set(row.email, row.token);
  }
  return map;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envoie les destinataires restants d'une newsletter, lot par lot, jusqu'à
 * épuisement ou jusqu'à la limite de temps. Renvoie la progression.
 */
export async function processQueue(supabase, newsletterId, { deadlineMs = 40000, resend = null } = {}) {
  const started = Date.now();
  const client = resend || (process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null);
  if (!client) throw Object.assign(new Error('Envoi d’emails non configuré (clé Resend absente).'), { status: 503 });

  const { data: newsletter, error } = await supabase.from('newsletters').select('*').eq('id', newsletterId).single();
  if (error) throw error;
  let event = null;
  if (newsletter.evenement_id) {
    const { data } = await supabase.from('events').select('titre, date_cible, lieu, description')
      .eq('id', newsletter.evenement_id).maybeSingle();
    event = data || null;
  }
  const replyTo = (process.env.NOTIFY_EMAIL || 'contact@enavant.org').split(',')[0].trim();

  while (Date.now() - started < deadlineMs) {
    const { data: claimed, error: claimError } = await supabase.rpc('newsletter_claim', {
      p_newsletter: newsletterId, p_count: BATCH,
    });
    if (claimError) throw claimError;
    if (!claimed?.length) break;

    // Désinscrit entre la préparation de l'envoi et ce lot : on ne lui écrit pas.
    const { data: outs, error: outError } = await supabase.from('newsletter_optouts').select('email')
      .in('email', claimed.map((r) => r.email));
    if (outError) throw outError;
    const optedOut = new Set((outs || []).map((o) => o.email));
    if (optedOut.size) {
      await supabase.from('newsletter_deliveries').update({ statut: 'echec', erreur: 'Désinscrit avant l’envoi', claimed_at: null })
        .eq('newsletter_id', newsletterId).in('email', [...optedOut]);
      claimed.splice(0, claimed.length, ...claimed.filter((r) => !optedOut.has(r.email)));
      if (!claimed.length) continue;
    }

    const tokens = await tokensFor(supabase, claimed.map((r) => r.email));
    const messages = claimed.map((r) => {
      const token = tokens.get(r.email);
      const { html, text } = renderNewsletter({ newsletter, event, nom: r.nom, unsubscribeUrl: unsubscribePageUrl(token) });
      return {
        from: senderAddress(), to: [r.email], subject: newsletter.sujet, html, text, replyTo,
        headers: {
          'List-Unsubscribe': `<${unsubscribeOneClickUrl(token)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      };
    });

    let failure = null;
    try {
      // Même lot repris après une coupure = même clé : Resend ne renvoie pas (24 h).
      const lot = createHash('sha256').update(claimed.map((r) => r.email).sort().join(',')).digest('hex');
      const { error: sendError } = await client.batch.send(messages, { idempotencyKey: `nl-${newsletterId}-${lot}` });
      if (sendError) failure = sendError.message || String(sendError);
    } catch (sendError) {
      failure = sendError?.message || String(sendError);
    }

    const emails = claimed.map((r) => r.email);
    const update = failure
      ? { statut: 'echec', erreur: String(failure).slice(0, 300), claimed_at: null }
      : { statut: 'envoye', sent_at: new Date().toISOString(), erreur: null, claimed_at: null };
    const { error: markError } = await supabase.from('newsletter_deliveries').update(update)
      .eq('newsletter_id', newsletterId).in('email', emails);
    if (markError) throw markError;
    if (failure) console.error('[newsletter] lot en échec :', failure);
    await sleep(600); // Limite de débit de Resend (2 requêtes/s).
  }

  const { data: progress, error: progressError } = await supabase.rpc('newsletter_progress', { p_newsletter: newsletterId });
  if (progressError) throw progressError;
  const patch = { envoyes: progress.envoyes, echecs: progress.echecs, destinataires: progress.destinataires, updated_at: new Date().toISOString() };
  if (!progress.restants) { patch.statut = 'envoyee'; patch.sent_at = new Date().toISOString(); }
  await supabase.from('newsletters').update(patch).eq('id', newsletterId);
  return { ...progress, termine: !progress.restants };
}
