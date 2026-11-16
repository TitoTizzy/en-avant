// Logique partagée de l'adhésion unifiée (compte de connexion + fiche d'adhésion).
//
// Règles :
// - Un compte créé par le formulaire démarre avec le rôle « pending » : aucune
//   route serveur ne l'accepte, donc pas d'accès à l'espace membre.
// - L'approbation de la fiche passe le compte « pending » en « member ».
//   Un rejet ne retire jamais un accès existant (cela se fait dans le panneau Équipe).
// - Les fiches anciennes sans compte reçoivent, à l'approbation, un lien sécurisé
//   pour choisir leur mot de passe (le compte est créé à ce moment-là).
import { isPhone, isText, clean } from './http.js';
import { sendToMember, siteUrl } from './notify.js';

export const SEXES = ['femme', 'homme', 'autre'];

/** Valide les champs propres à la fiche d'adhésion. */
export function validateFiche(body) {
  const values = {
    sexe: clean(body.sexe).toLowerCase(),
    ninu: clean(body.ninu).replace(/\D/g, ''),
    telephone: clean(body.telephone),
    ville: clean(body.ville),
  };
  const errors = {};
  if (!SEXES.includes(values.sexe)) errors.sexe = 'Valeur non reconnue.';
  if (!/^1\d{9}$/.test(values.ninu)) errors.ninu = 'NINU invalide : 10 chiffres requis (carte ONI).';
  if (!isPhone(values.telephone)) errors.telephone = 'Numéro de téléphone invalide.';
  if (!isText(values.ville, 2, 80)) errors.ville = 'Ville invalide.';
  if (body.consent !== true) errors.consent = 'Le consentement est requis.';
  return { values, errors };
}

/** Message 409 adapté à la contrainte d'unicité violée sur `members`. */
export function duplicateFicheMessage(error) {
  const surNinu = /ninu/i.test(`${error?.message || ''} ${error?.details || ''}`);
  return surNinu
    ? { field: 'ninu', error: 'Ce NINU est déjà associé à une candidature.' }
    : { field: 'email', error: 'Cette adresse email a déjà soumis une candidature.' };
}

const passwordPageUrl = () => `${siteUrl()}/mot-de-passe`;
const loginUrl = () => `${siteUrl()}/login`;

/** Passe un compte « pending » en « member ». Ne touche à aucun autre rôle. */
async function promote(supabase, userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ role: 'member' })
    .eq('id', userId)
    .eq('role', 'pending');
  if (error) throw error;
}

/** Retrouve un compte existant par son email (profil). */
async function findUserIdByEmail(supabase, email) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', String(email || '').toLowerCase())
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

/** Relie une fiche à un compte. */
async function linkFiche(supabase, memberId, userId) {
  const { error } = await supabase.from('members').update({ user_id: userId }).eq('id', memberId);
  if (error) throw error;
}

/**
 * Lien sécurisé pour choisir son mot de passe.
 * Crée le compte (invitation) s'il n'existe pas encore, sinon lien de réinitialisation.
 * @returns {Promise<{ link: string, userId: string }>}
 */
async function passwordLink(supabase, member) {
  const options = { redirectTo: passwordPageUrl() };

  if (!member.user_id) {
    const invite = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: member.email,
      options: { ...options, data: { nom: member.nom } },
    });
    if (!invite.error && invite.data?.user?.id) {
      return { link: invite.data.properties.action_link, userId: invite.data.user.id };
    }
    // Adresse déjà inscrite (compte créé séparément) : on la reprend.
    if (!/already|registered|exists/i.test(invite.error?.message || '')) throw invite.error;
  }

  const userId = member.user_id || (await findUserIdByEmail(supabase, member.email));
  if (!userId) throw new Error('Compte introuvable pour cette adhésion.');
  const recovery = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: member.email,
    options,
  });
  if (recovery.error) throw recovery.error;
  return { link: recovery.data.properties.action_link, userId };
}

/** Email « choisissez votre mot de passe ». */
function sendPasswordEmail(member, link) {
  return sendToMember({
    to: member.email,
    subject: 'Votre adhésion à En Avant est approuvée',
    title: 'Bienvenue chez En Avant',
    paragraphs: [
      `Bonjour ${member.nom || ''},`.replace(' ,', ','),
      'Votre adhésion a été approuvée. Pour accéder à votre espace membre, choisissez votre mot de passe en cliquant sur le bouton ci-dessous.',
      'Ce lien est personnel et expire rapidement. S’il ne fonctionne plus, répondez à cet email et nous vous en enverrons un nouveau.',
    ],
    cta: { label: 'Choisir mon mot de passe', url: link },
  });
}

/**
 * Actions à l'approbation d'une fiche.
 * @param {object} member  { id, nom, email, user_id }
 * @returns {Promise<{ emailSent: boolean, mode: 'login' | 'password' }>}
 */
export async function onApproved(supabase, member) {
  if (member.user_id) {
    await promote(supabase, member.user_id);
    const emailSent = await sendToMember({
      to: member.email,
      subject: 'Votre adhésion à En Avant est approuvée',
      title: 'Bienvenue chez En Avant',
      paragraphs: [
        `Bonjour ${member.nom || ''},`.replace(' ,', ','),
        'Votre adhésion a été approuvée : votre espace membre est maintenant ouvert.',
        'Si vous n’avez pas encore confirmé votre adresse email, ouvrez d’abord le lien reçu lors de votre inscription.',
      ],
      cta: { label: 'Me connecter', url: loginUrl() },
    });
    return { emailSent, mode: 'login' };
  }

  const { link, userId } = await passwordLink(supabase, member);
  await linkFiche(supabase, member.id, userId);
  await promote(supabase, userId);
  const emailSent = await sendPasswordEmail(member, link);
  return { emailSent, mode: 'password' };
}

/**
 * Bouton « Envoyer le lien d'accès » : (re)crée un lien pour choisir le mot de passe.
 * Réservé aux fiches approuvées.
 */
export async function sendAccessLink(supabase, member) {
  const { link, userId } = await passwordLink(supabase, member);
  if (!member.user_id) await linkFiche(supabase, member.id, userId);
  await promote(supabase, userId);
  return sendPasswordEmail(member, link);
}

/** Contenu de l'email de relance « complétez votre adhésion ». */
export function relanceEmail(profile) {
  return {
    to: profile.email,
    subject: 'Complétez votre adhésion à En Avant',
    title: 'Complétez votre adhésion',
    paragraphs: [
      `Bonjour ${profile.nom || ''},`.replace(' ,', ','),
      'Vous avez un compte sur enavant.org, mais votre fiche d’adhésion n’est pas encore complète.',
      'Connectez-vous à votre espace membre et renseignez les informations demandées (cela prend une minute). Votre accès reste ouvert pendant ce temps.',
    ],
    cta: { label: 'Compléter mon adhésion', url: `${siteUrl()}/membre` },
  };
}
