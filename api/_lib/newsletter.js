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
import { effectiveLocation, matchesGeo, geoFacets } from './geo.js';
import { renderQuizInvite } from './quiz-email.js';
import { logActivity } from './activity.js';

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
    fetchAll(() => supabase.from('newsletter_subscribers').select('email, nom, pays, departement, ville, source')
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
  // Abonnement créé par l'adhésion : la personne compte comme adhérent, pas comme
  // « inscrit au formulaire » (filtre « Inscrits au formulaire seulement »).
  subscribers.forEach((s) => add(s, s.source === 'adhesion' ? 'adherent' : 'abonne'));
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

/** Répartition par pays / région / ville (aperçu de l'audience et suggestions). */
export function breakdown(contacts) {
  const facets = geoFacets(contacts);
  return {
    total: contacts.length,
    adherents: contacts.filter((c) => c.types.has('adherent')).length,
    abonnes: contacts.filter((c) => c.types.has('abonne')).length,
    pays: facets.pays,
    regions: facets.regions,
    villes: facets.communes.slice(0, 60).map(({ nom, total, pays, region }) => ({ nom, total, pays, region })),
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
/**
 * Adapte le HTML de l'éditeur (classes Quill) aux messageries, qui ignorent
 * les feuilles de style : alignements, tailles, polices et photos en styles en ligne.
 */
export function emailifyHtml(html) {
  const STYLES = {
    'ql-align-center': 'text-align:center', 'ql-align-right': 'text-align:right', 'ql-align-justify': 'text-align:justify',
    'ql-size-small': 'font-size:13px', 'ql-size-large': 'font-size:20px', 'ql-size-huge': 'font-size:28px;line-height:1.3',
    'ql-font-serif': 'font-family:Georgia,serif', 'ql-font-monospace': 'font-family:Menlo,Consolas,monospace',
  };
  const BLOCS = {
    h1: `margin:30px 0 12px;font-family:${SERIF};font-size:26px;line-height:1.3;font-weight:normal;color:${NAVY}`,
    h2: `margin:28px 0 10px;font-family:${SERIF};font-size:22px;line-height:1.3;font-weight:normal;color:${NAVY}`,
    h3: `margin:24px 0 8px;font-size:13px;line-height:1.4;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:${ORANGE}`,
    blockquote: `margin:22px 0;padding:4px 0 4px 18px;border-left:3px solid ${ORANGE};font-family:${SERIF};font-size:18px;line-height:1.6;font-style:italic;color:${NAVY}`,
    ul: 'margin:0 0 16px;padding-left:22px', ol: 'margin:0 0 16px;padding-left:22px', li: 'margin:0 0 6px',
  };
  return String(html || '')
    .replace(/<img ([^>]*?)\/?>/g, (m, attrs) =>
      `<img ${attrs.replace(/\s*(width|height)="[^"]*"/g, '')} style="display:block;max-width:100%;height:auto;margin:22px auto;border-radius:6px">`)
    .replace(/<(\w+)([^>]*?) class="([^"]*)"([^>]*)>/g, (m, tag, before, classes, after) => {
      const style = classes.split(/\s+/).map((c) => STYLES[c]).filter(Boolean).join(';');
      return style ? `<${tag}${before} style="${style}"${after}>` : `<${tag}${before}${after}>`;
    })
    .replace(/<(h1|h2|h3|blockquote|ul|ol|li)( style="([^"]*)")?>/g, (m, tag, _a, extra) => `<${tag} style="${BLOCS[tag]}${extra ? `;${extra}` : ''}">`)
    .replace(/<p>/g, '<p style="margin:0 0 16px">')
    .replace(/<a /g, `<a style="color:${ORANGE};text-decoration:underline" `);
}

/** Boutons présents dans chaque newsletter. */
export const BOUTONS_FIXES = [
  { label: 'Adhérer à En Avant', path: '/adherer', verre: 'orange' },
  { label: 'Faire un don', path: '/don', verre: 'givre' },
];

export const RESEAUX = [
  { label: 'Facebook', url: 'https://www.facebook.com/enavant.ht' },
  { label: 'Instagram', url: 'https://www.instagram.com/enavant.ht' },
  { label: 'X', url: 'https://x.com/EnAvantHT' },
  { label: 'YouTube', url: 'https://www.youtube.com/@mouvementenavant9694' },
];

const NAVY = '#0b1730';
const ORANGE = '#e0551f';
const INK = '#2b3446';
const MUTED = '#7a8699';
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";

const dateLettre = (d = new Date()) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Port-au-Prince' }).format(d);

/** Effets « verre » des boutons : dégradé translucide, reflet en haut, liseré clair, ombre douce.
 *  `fond` reste la couleur pleine de secours (Outlook ignore dégradés et ombres). */
export const VERRES = {
  orange: {
    fond: '#e0551f', texte: '#ffffff',
    style: 'background-image:linear-gradient(135deg,rgba(255,150,96,.96) 0%,rgba(224,85,31,.94) 55%,rgba(196,66,18,.96) 100%);border:1px solid rgba(255,255,255,.55);box-shadow:0 10px 24px rgba(224,85,31,.30),inset 0 1px 0 rgba(255,255,255,.55),inset 0 -1px 0 rgba(120,35,5,.25)',
  },
  nuit: {
    fond: '#0b1730', texte: '#ffffff',
    style: 'background-image:linear-gradient(135deg,rgba(43,74,128,.94) 0%,rgba(16,33,66,.96) 55%,rgba(11,23,48,.98) 100%);border:1px solid rgba(255,255,255,.28);box-shadow:0 10px 24px rgba(11,23,48,.28),inset 0 1px 0 rgba(255,255,255,.30),inset 0 -1px 0 rgba(0,0,0,.25)',
  },
  givre: {
    fond: '#ffffff', texte: '#0b1730',
    style: 'background-image:linear-gradient(135deg,rgba(255,255,255,.95) 0%,rgba(241,244,250,.75) 100%);border:1px solid rgba(11,23,48,.16);box-shadow:0 8px 20px rgba(11,23,48,.10),inset 0 1px 0 #ffffff,inset 0 -1px 0 rgba(11,23,48,.06)',
  },
};

/** Bouton compatible avec toutes les messageries (y compris Outlook). */
function bouton({ href, label, verre = 'nuit' }) {
  const v = VERRES[verre];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
    <td align="center" bgcolor="${v.fond}" style="background-color:${v.fond};${v.style};border-radius:12px">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:14px;font-weight:bold;letter-spacing:.03em;color:${v.texte};text-decoration:none;border-radius:12px">${escapeHtml(label)}</a>
    </td></tr></table>`;
}

export function renderNewsletter({ newsletter, event = null, nom = '', unsubscribeUrl, date = new Date() }) {
  const site = siteUrl();
  const hello = prenom(nom) ? `Bonjour ${escapeHtml(prenom(nom))},` : 'Bonjour,';
  const eventBlock = event ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 8px;border-collapse:collapse">
        <tr><td bgcolor="#f6f7fa" style="background:#f6f7fa;border-left:3px solid ${ORANGE};padding:22px 24px">
          <p style="margin:0 0 8px;font-family:${SANS};font-size:11px;font-weight:bold;letter-spacing:.16em;text-transform:uppercase;color:${ORANGE}">Événement</p>
          <p style="margin:0 0 14px;font-family:${SERIF};font-size:21px;line-height:1.3;color:${NAVY}">${escapeHtml(event.titre)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${SANS};font-size:14px;line-height:1.5;color:${INK}">
            <tr><td style="padding:0 16px 4px 0;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:.06em;vertical-align:top">Date</td><td style="padding:0 0 4px">${escapeHtml(formatEventDate(event.date_cible))}</td></tr>
            ${event.lieu ? `<tr><td style="padding:0 16px 4px 0;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:.06em;vertical-align:top">Lieu</td><td style="padding:0 0 4px">${escapeHtml(event.lieu)}</td></tr>` : ''}
          </table>
          ${event.description ? `<p style="margin:12px 0 0;font-family:${SANS};font-size:14px;line-height:1.65;color:${INK}">${escapeHtml(event.description)}</p>` : ''}
        </td></tr>
      </table>` : '';
  const cta = newsletter.cta_label && newsletter.cta_url ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 4px"><tr><td>
        ${bouton({ href: escapeHtml(newsletter.cta_url), label: newsletter.cta_label, verre: 'nuit' })}
      </td></tr></table>` : '';
  const preheader = newsletter.apercu
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(newsletter.apercu)}&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>` : '';
  const agir = BOUTONS_FIXES.map((b) => `<td class="nl-btn" style="padding:0 10px 10px 0">${bouton({ ...b, href: `${site}${b.path}` })}</td>`).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(newsletter.sujet)}</title>
<style>
  @media only screen and (max-width:620px){
    .nl-pad{padding-left:24px!important;padding-right:24px!important}
    .nl-head td{display:block!important;width:100%!important;text-align:left!important}
    .nl-meta{padding-top:12px!important}
    .nl-title{font-size:25px!important}
    .nl-btn{display:block!important;padding-right:0!important}
  }
</style></head>
<body style="margin:0;padding:0;background:#eef0f4;-webkit-text-size-adjust:100%">${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef0f4" style="background:#eef0f4"><tr><td align="center" style="padding:32px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse">

  <tr><td bgcolor="${NAVY}" class="nl-pad" style="background:${NAVY};padding:24px 44px;border-bottom:3px solid ${ORANGE};border-radius:6px 6px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="nl-head"><tr>
      <td valign="middle"><a href="${site}"><img src="${site}/pictures/logo/logo.png" alt="En Avant" width="120" style="display:block;width:120px;height:auto;border:0"></a></td>
      <td valign="middle" align="right" class="nl-meta" style="font-family:${SANS}">
        <p style="margin:0;font-size:10px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase;color:#c9d2e3">La lettre d’En Avant</p>
        <p style="margin:4px 0 0;font-size:12px;color:#8a97ad">${escapeHtml(dateLettre(date))}</p>
      </td>
    </tr></table>
  </td></tr>

  <tr><td bgcolor="#ffffff" class="nl-pad" style="background:#ffffff;padding:46px 44px 40px">
    <h1 class="nl-title" style="margin:0;font-family:${SERIF};font-size:30px;line-height:1.25;font-weight:normal;color:${NAVY}">${escapeHtml(newsletter.sujet)}</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 28px"><tr><td width="48" height="2" bgcolor="${ORANGE}" style="width:48px;height:2px;background:${ORANGE};font-size:0;line-height:0">&nbsp;</td></tr></table>
    <p style="margin:0 0 18px;font-family:${SANS};font-size:16px;line-height:1.75;color:${INK}">${hello}</p>
    <div style="font-family:${SANS};font-size:16px;line-height:1.75;color:${INK}">${emailifyHtml(newsletter.contenu)}</div>
    ${eventBlock}${cta}
    <p style="margin:34px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK}">Bien cordialement,</p>
    <p style="margin:4px 0 0;font-family:${SERIF};font-size:17px;font-style:italic;color:${NAVY}">L’équipe En Avant</p>
  </td></tr>

  <tr><td bgcolor="#f8f9fb" class="nl-pad" style="background-color:#f8f9fb;background-image:linear-gradient(135deg,#fdf0e8 0%,#f4f6fb 55%,#eaf0f9 100%);padding:28px 44px 24px;border-top:1px solid #e6e9ef;border-radius:0 0 6px 6px">
    <p style="margin:0 0 4px;font-family:${SANS};font-size:11px;font-weight:bold;letter-spacing:.16em;text-transform:uppercase;color:${ORANGE}">Agir avec nous</p>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK}">Chaque adhésion et chaque don font avancer notre projet pour Haïti.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${agir}</tr></table>
  </td></tr>

  <tr><td align="center" style="padding:26px 24px 0;font-family:${SANS};font-size:12px;line-height:1.7;color:${MUTED}">
    <p style="margin:0 0 10px">${RESEAUX.map((r) => `<a href="${r.url}" style="color:${NAVY};text-decoration:none;font-weight:bold">${r.label}</a>`).join(' &nbsp;·&nbsp; ')}</p>
    <p style="margin:0 0 6px"><strong style="color:${INK}">En Avant</strong> — Pour changer Haïti ensemble · <a href="${site}" style="color:${MUTED}">enavant.org</a></p>
    <p style="margin:0 0 6px">Vous recevez cette lettre parce que vous êtes adhérent d’En Avant ou inscrit à sa newsletter.</p>
    <p style="margin:0"><a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline">Se désinscrire</a></p>
  </td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    'LA LETTRE D’EN AVANT', dateLettre(date), '',
    newsletter.sujet, '',
    prenom(nom) ? `Bonjour ${prenom(nom)},` : 'Bonjour,', '',
    htmlToText(newsletter.contenu),
    event ? `\nÉvénement : ${event.titre}\n${formatEventDate(event.date_cible)}${event.lieu ? `\n${event.lieu}` : ''}${event.description ? `\n${event.description}` : ''}` : '',
    newsletter.cta_label && newsletter.cta_url ? `\n${newsletter.cta_label} : ${newsletter.cta_url}` : '',
    '\nBien cordialement,\nL’équipe En Avant',
    `\nAgir avec nous\n${BOUTONS_FIXES.map((b) => `${b.label} : ${site}${b.path}`).join('\n')}`,
    `\n—\n${RESEAUX.map((r) => `${r.label} : ${r.url}`).join('\n')}`,
    `\nSe désinscrire : ${unsubscribeUrl}`,
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
      const { html, text } = newsletter.type === 'quiz'
        ? renderQuizInvite({ invitation: newsletter, nom: r.nom, unsubscribeUrl: unsubscribePageUrl(token), semaine: newsletter.semaine })
        : renderNewsletter({ newsletter, event, nom: r.nom, unsubscribeUrl: unsubscribePageUrl(token) });
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
  if (!progress.restants && newsletter.statut !== 'envoyee') {
    const quoi = newsletter.type === 'quiz'
      ? `Invitation au quiz de la semaine envoyée${newsletter.envoi_auto ? ' automatiquement' : ''}`
      : `Newsletter « ${newsletter.sujet} » envoyée`;
    await logActivity(supabase, {
      categorie: newsletter.type === 'quiz' ? 'quiz' : 'newsletter',
      niveau: progress.echecs ? 'attention' : 'info',
      message: `${quoi} à ${progress.envoyes} personne(s)${progress.echecs ? ` — ${progress.echecs} email(s) non parti(s) : utilisez « Relancer les échecs »` : ''}.`,
      ref: `envoi:${newsletterId}`,
    });
  }
  return { ...progress, termine: !progress.restants };
}
