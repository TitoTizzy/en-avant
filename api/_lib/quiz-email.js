// Email d'invitation au quiz de la semaine — design de marque En Avant :
// fond nuit, orange En Avant, cartes « verre dépoli » (fonds translucides, bordures
// claires, coins arrondis). Le flou (backdrop-filter) n'existe pas dans les
// messageries : l'effet repose sur la transparence, les dégradés et la photo de fond.
// Repli sûr partout : couleurs pleines (bgcolor) si dégradés ou image ne sont pas lus.
import { escapeHtml } from './notify.js';

const site = () => (String(process.env.SITE_URL || '').trim() || 'https://enavant.org').replace(/\/+$/, '');
const prenom = (nom) => String(nom || '').trim().split(/\s+/)[0] || '';

const C = {
  nuit: '#050b1d',
  nuit2: '#0b1830',
  orange: '#ff6a2a',
  orange2: '#ff8a4c',
  peche: '#ffd9c6',
  texte: '#eef3fa',
  doux: '#aab6c8',
};
const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function semaineLabel(semaine) {
  if (!semaine) return '';
  try {
    return `Semaine du ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(`${String(semaine).slice(0, 10)}T12:00:00Z`))}`;
  } catch {
    return '';
  }
}

/** Pastille « verre » (cellule de tableau). */
const chip = (icone, titre, detail) => `
  <td class="ea-chip" width="33%" valign="top" style="padding:6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:rgba(255,255,255,0.06);background-color:#121f38;border:1px solid rgba(255,255,255,0.14);border-radius:16px">
      <tr><td align="center" style="padding:16px 10px;${FONT}">
        <div style="font-size:22px;line-height:1">${icone}</div>
        <div class="ea-chip-t" style="margin-top:8px;font-size:14px;font-weight:700;color:${C.texte}">${titre}</div>
        <div class="ea-chip-d" style="margin-top:3px;font-size:12px;color:${C.doux}">${detail}</div>
      </td></tr>
    </table>
  </td>`;

/** Email de l'invitation (HTML + texte). */
export function renderQuizInvite({ invitation, nom = '', unsubscribeUrl, semaine = null }) {
  const s = site();
  const url = invitation.cta_url || `${s}/quiz`;
  const hello = prenom(nom) ? `Bonjour ${escapeHtml(prenom(nom))},` : 'Bonjour,';
  const label = semaineLabel(semaine);

  const html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(invitation.sujet)}</title>
<style>
  @media (max-width: 600px) {
    .ea-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .ea-h1 { font-size: 28px !important; }
    .ea-chip { padding: 3px !important; }
    .ea-chip-t { font-size: 12px !important; }
    .ea-chip-d { display: none !important; }
    .ea-btn2 { display: block !important; width: 100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.nuit}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(invitation.apercu || '')}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.nuit}" style="background-color:${C.nuit};background-image:radial-gradient(circle at 15% 0%,rgba(255,106,42,0.22),transparent 45%),radial-gradient(circle at 90% 100%,rgba(255,138,76,0.14),transparent 40%),linear-gradient(180deg,${C.nuit} 0%,${C.nuit2} 100%)">
<tr><td align="center" style="padding:28px 12px 36px">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">

  <!-- Logo -->
  <tr><td align="center" style="padding:6px 0 22px">
    <a href="${s}" style="text-decoration:none"><img src="${s}/pictures/logo/logo.png" alt="En Avant" height="48" style="height:48px;width:auto;border:0;display:block"></a>
  </td></tr>

  <!-- Bandeau photo + titre -->
  <tr><td style="border-radius:24px;overflow:hidden;background-color:${C.nuit2};background-image:url('${s}/pictures/hero.jpeg');background-size:cover;background-position:center 30%" bgcolor="${C.nuit2}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-radius:24px;background:linear-gradient(180deg,rgba(5,11,29,0.35) 0%,rgba(5,11,29,0.92) 78%);border:1px solid rgba(255,255,255,0.12)">
      <tr><td class="ea-pad" style="padding:150px 36px 30px;${FONT}">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>
          <td style="padding:7px 14px;border-radius:999px;background:rgba(255,106,42,0.18);background-color:#3a2016;border:1px solid rgba(255,138,76,0.55);${FONT};font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${C.peche}">
            &#9679;&nbsp; Défi de la semaine
          </td>
        </tr></table>
        <h1 class="ea-h1" style="margin:16px 0 0;${FONT};font-size:34px;line-height:1.12;letter-spacing:-0.02em;font-weight:800;color:#ffffff">
          Le quiz de la semaine<br><span style="color:${C.orange2}">est ouvert.</span>
        </h1>
        ${label ? `<p style="margin:10px 0 0;${FONT};font-size:14px;color:${C.peche}">${escapeHtml(label)}</p>` : ''}
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="height:18px;line-height:18px">&nbsp;</td></tr>

  <!-- Carte verre principale -->
  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0f1b33" style="border-collapse:separate;border-radius:24px;background:rgba(255,255,255,0.05);background-color:#0f1b33;background-image:linear-gradient(145deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.13)">
      <tr><td class="ea-pad" style="padding:32px 36px 12px;${FONT};color:${C.texte}">
        <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#ffffff">${hello}</p>
        <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:${C.texte}">Le <strong style="color:#ffffff">défi de la semaine</strong> vous attend : de nouvelles questions sur le programme d’En Avant et les <strong style="color:${C.orange2}">20 chantiers</strong> du Livre blanc.</p>
        <p style="margin:0;font-size:16px;line-height:1.65;color:${C.doux}">Testez vos connaissances, défiez les autres adhérents et grimpez au classement.</p>
      </td></tr>

      <!-- Pastilles -->
      <tr><td class="ea-pad" style="padding:16px 30px 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          ${chip('&#127919;', 'Mêmes questions', 'pour tous les adhérents')}
          ${chip('&#9201;&#65039;', 'Une tentative', 'pas de seconde chance')}
          ${chip('&#127942;', 'Classement', 'de la semaine')}
        </tr></table>
      </td></tr>

      <!-- Bouton principal -->
      <tr><td align="center" style="padding:24px 36px 34px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>
          <td align="center" bgcolor="${C.orange}" style="border-radius:999px;background-color:${C.orange};background-image:linear-gradient(135deg,${C.orange} 0%,${C.orange2} 100%);box-shadow:0 12px 30px rgba(255,106,42,0.45)">
            <a href="${escapeHtml(url)}" style="display:inline-block;padding:17px 40px;${FONT};font-size:17px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(invitation.cta_label || 'Jouer maintenant')} &nbsp;&#8594;</a>
          </td>
        </tr></table>
        <p style="margin:14px 0 0;${FONT};font-size:12px;color:${C.doux}">Connectez-vous à votre espace membre pour jouer.</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="height:18px;line-height:18px">&nbsp;</td></tr>

  <!-- Adhérer / don -->
  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0f1b33" style="border-collapse:separate;border-radius:20px;background:rgba(255,255,255,0.04);background-color:#0d182e;border:1px solid rgba(255,255,255,0.1)">
      <tr><td class="ea-pad" align="center" style="padding:22px 24px;${FONT}">
        <p style="margin:0 0 14px;font-size:14px;color:${C.doux}">Faites grandir le mouvement</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>
          <td class="ea-btn2" align="center" style="padding:5px">
            <a href="${s}/adherer" style="display:inline-block;padding:12px 24px;border-radius:999px;border:1px solid rgba(255,138,76,0.7);background:rgba(255,106,42,0.12);background-color:#2a1a17;${FONT};font-size:14px;font-weight:700;color:${C.peche};text-decoration:none">Adhérer à En Avant</a>
          </td>
          <td class="ea-btn2" align="center" style="padding:5px">
            <a href="${s}/don" style="display:inline-block;padding:12px 24px;border-radius:999px;border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.08);background-color:#1a2640;${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">&#9829;&nbsp; Faire un don</a>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Pied -->
  <tr><td align="center" style="padding:26px 20px 0;${FONT};font-size:12px;line-height:1.6;color:#7f8ca3">
    <p style="margin:0 0 6px">Vous recevez cet email parce que vous êtes adhérent d’En Avant.</p>
    <p style="margin:0"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#aab6c8;text-decoration:underline">Se désinscrire</a> &nbsp;·&nbsp; <a href="${s}" style="color:#aab6c8;text-decoration:underline">enavant.org</a></p>
    <p style="margin:10px 0 0;color:#5d6a80">En Avant — Pour changer Haïti ensemble</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `${invitation.sujet}${label ? ` (${label})` : ''}`, '',
    prenom(nom) ? `Bonjour ${prenom(nom)},` : 'Bonjour,', '',
    'Le défi de la semaine vous attend : de nouvelles questions sur le programme d’En Avant et les 20 chantiers du Livre blanc.',
    'Mêmes questions pour tous les adhérents, une seule tentative, classement de la semaine.', '',
    `${invitation.cta_label || 'Jouer maintenant'} : ${url}`, '',
    `Adhérer à En Avant : ${s}/adherer`,
    `Faire un don : ${s}/don`,
    '', '—', `Se désinscrire : ${unsubscribeUrl}`,
  ].join('\n');
  return { html, text };
}
