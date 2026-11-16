// Notifications internes vers la boîte de l'équipe (contact@enavant.org) via Resend.
//
// Règles de sécurité :
// - JAMAIS de données sensibles dans un email (NINU, téléphone, adresse) :
//   l'email donne le minimum et renvoie vers le tableau de bord protégé.
// - Toutes les valeurs saisies par les visiteurs sont échappées (pas d'injection HTML).
// - Une notification ne fait jamais échouer l'action du visiteur : erreurs journalisées.
import { Resend } from 'resend';

const DEFAULT_TO = 'contact@enavant.org';
const DEFAULT_FROM = 'En Avant <notifications@enavant.org>';
const TIMEOUT_MS = 4000;

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Valeur courte et sans retour à la ligne (évite l'injection d'en-têtes dans le sujet). */
const oneLine = (value, max = 120) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

export function senderAddress() {
  return process.env.RESEND_FROM || DEFAULT_FROM;
}

function siteUrl() {
  return String(process.env.SITE_URL || 'https://enavant.org').replace(/\/+$/, '');
}

/**
 * Envoie une notification interne. Ne lève jamais d'exception.
 * @param {{ subject: string, title: string, rows?: [string, string][], note?: string, adminPath?: string }} n
 * @returns {Promise<boolean>} true si l'email est parti.
 */
export async function notifyTeam({ subject, title, rows = [], note, adminPath = '/admin' }) {
  if (!process.env.RESEND_API_KEY) return false;
  const to = (process.env.NOTIFY_EMAIL || DEFAULT_TO).split(',').map((s) => s.trim()).filter(Boolean);
  const link = `${siteUrl()}${adminPath}`;

  const rowsHtml = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5b6b82">${escapeHtml(k)}</td>`
      + `<td style="padding:4px 0;font-weight:600">${escapeHtml(oneLine(v, 200))}</td></tr>`)
    .join('');
  const rowsText = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k} : ${oneLine(v, 200)}`).join('\n');

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0e1726">
  <h2 style="color:#e0551f;margin:0 0 12px">${escapeHtml(title)}</h2>
  ${rowsHtml ? `<table style="border-collapse:collapse;font-size:14px">${rowsHtml}</table>` : ''}
  ${note ? `<p style="font-size:14px">${escapeHtml(note)}</p>` : ''}
  <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#ff6a2a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Ouvrir le tableau de bord</a></p>
  <p style="color:#5b6b82;font-size:12px">Notification automatique de enavant.org. Les données personnelles complètes sont consultables uniquement dans le tableau de bord.</p>
</div>`;
  const text = `${title}\n\n${rowsText}${note ? `\n\n${note}` : ''}\n\nTableau de bord : ${link}`;

  return deliver({ to, subject: `[enavant.org] ${oneLine(subject, 140)}`, html, text, label: subject });
}

/** Envoi effectif via Resend, avec délai maximal. Ne lève jamais d'exception. */
async function deliver({ to, subject, html, text, replyTo, label }) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const send = resend.emails.send({
      from: senderAddress(),
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
    const { error } = (await Promise.race([send, timeout])) || {};
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[notify] échec :', label || subject, error?.message || error);
    return false;
  }
}

/** Construit un email adressé à une personne (adhérent). Réponses renvoyées vers contact@. */
function buildMemberEmail({ to, subject, title, paragraphs = [], cta, footer }) {
  const replyTo = (process.env.NOTIFY_EMAIL || DEFAULT_TO).split(',')[0].trim();
  const parasHtml = paragraphs.map((p) => `<p style="font-size:15px;line-height:1.55">${escapeHtml(p)}</p>`).join('');
  const button = cta
    ? `<p style="margin:28px 0"><a href="${escapeHtml(cta.url)}" style="background:#ff6a2a;color:#fff;padding:13px 24px;border-radius:999px;text-decoration:none;font-weight:bold">${escapeHtml(cta.label)}</a></p>`
      + `<p style="color:#5b6b82;font-size:12px">Si le bouton ne fonctionne pas, copiez ce lien : ${escapeHtml(cta.url)}</p>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0e1726">
  <h2 style="color:#e0551f;margin:0 0 12px">${escapeHtml(title)}</h2>
  ${parasHtml}${button}
  <p style="color:#5b6b82;font-size:12px">${escapeHtml(footer || 'En Avant — enavant.org. Pour toute question, répondez simplement à cet email.')}</p>
</div>`;
  const text = `${title}\n\n${paragraphs.join('\n\n')}${cta ? `\n\n${cta.label} : ${cta.url}` : ''}`;
  return { from: senderAddress(), to: [to], subject: oneLine(subject, 140), html, text, replyTo };
}

/**
 * Email adressé à une personne. Ne contient jamais de donnée sensible.
 * Ne lève jamais d'exception.
 * @param {{ to: string, subject: string, title: string, paragraphs: string[], cta?: { label: string, url: string }, footer?: string }} m
 * @returns {Promise<boolean>}
 */
export async function sendToMember(message) {
  if (!process.env.RESEND_API_KEY || !message?.to) return false;
  const { to, subject, html, text, replyTo } = buildMemberEmail(message);
  return deliver({ to, subject, html, text, replyTo, label: message.subject });
}

/**
 * Envoi groupé (API batch de Resend, 100 emails par appel).
 * @returns {Promise<string[]>} adresses effectivement envoyées.
 */
export async function sendBatchToMembers(messages) {
  if (!process.env.RESEND_API_KEY) return [];
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sent = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).filter((m) => m?.to);
    if (!chunk.length) continue;
    try {
      const { error } = await resend.batch.send(chunk.map(buildMemberEmail));
      if (error) throw error;
      sent.push(...chunk.map((m) => m.to));
    } catch (error) {
      console.error('[notify] échec envoi groupé :', error?.message || error);
    }
  }
  return sent;
}

export { siteUrl };
