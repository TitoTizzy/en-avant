import { enforceDurableRateLimit } from './_lib/rate-limit.js';
// POST /api/members — Formulaire unique d'adhésion (/adherer).
//
// Crée en une fois :
//   1. le compte de connexion (Supabase Auth, signUp → email de confirmation) ;
//   2. la fiche d'adhésion (`members`, statut « pending »), reliée au compte.
// Le compte démarre avec le rôle « pending » : l'espace membre ne s'ouvre
// qu'après approbation de la fiche dans le tableau de bord.
import { getAnonClient, getServiceClient } from './_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError,
  isEmail, isText, clean,
} from './_lib/http.js';
import { notifyTeam, siteUrl } from './_lib/notify.js';
import { createNotification } from './_lib/notifications.js';
import { validateFiche, duplicateFicheMessage } from './_lib/adhesion.js';
import { logActivity, lieu } from './_lib/activity.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = getBody(req);

    // Honeypot anti-bot : un humain ne remplit jamais ce champ.
    if (clean(body.website)) {
      return json(res, 200, { ok: true });
    }

    const nom = clean(body.nom);
    const pseudo = clean(body.pseudo).slice(0, 30);
    const email = clean(body.email).toLowerCase();
    const password = String(body.password || '');
    const { values: fiche, errors } = validateFiche(body);

    if (!isText(nom, 2, 120)) errors.nom = 'Nom invalide (2 à 120 caractères).';
    if (!/^[\p{L}\p{N}_.-]{2,30}$/u.test(pseudo)) {
      errors.pseudo = 'Pseudo invalide : 2 à 30 lettres, chiffres, « . », « - » ou « _ ».';
    }
    if (!isEmail(email)) errors.email = 'Adresse email invalide.';
    if (password.length < 10) errors.password = 'Mot de passe trop court (10 caractères minimum).';
    if (password.length > 200) errors.password = 'Mot de passe trop long.';

    if (Object.keys(errors).length > 0) {
      return json(res, 422, { error: 'Formulaire invalide.', fields: errors });
    }

  if (!await enforceDurableRateLimit(req, res, { key: 'members', limit: 8 })) return;

    const supabase = getServiceClient();

    // Doublons détectés AVANT de créer le compte (évite un compte orphelin).
    for (const [column, value] of [['ninu', fiche.ninu], ['email', email]]) {
      const { data: existing, error: dupError } = await supabase
        .from('members')
        .select('id')
        .eq(column, value)
        .limit(1);
      if (dupError) throw dupError;
      if (existing?.length) {
        const dup = duplicateFicheMessage({ message: column });
        return json(res, 409, { error: dup.error, fields: { [dup.field]: dup.error } });
      }
    }

    const { data: pseudoTaken, error: pseudoError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', pseudo.replace(/[%_\\]/g, '\\$&'))
      .limit(1);
    if (pseudoError) throw pseudoError;
    if (pseudoTaken?.length) {
      const message = 'Ce pseudo est déjà utilisé : choisissez-en un autre.';
      return json(res, 409, { error: message, fields: { pseudo: message } });
    }

    // 1. Compte de connexion (email de confirmation envoyé par Supabase).
    const { data, error } = await getAnonClient().auth.signUp({
      email,
      password,
      options: {
        data: { nom, pseudo, username: pseudo },
        emailRedirectTo: `${siteUrl()}/login?confirme=1`,
      },
    });

    if (error) {
      if (/password/i.test(error.message || '')) {
        const message = 'Mot de passe refusé : choisissez-en un plus robuste.';
        return json(res, 422, { error: message, fields: { password: message } });
      }
      if (/already registered|already been registered/i.test(error.message || '')) {
        return json(res, 409, alreadyAccount());
      }
      throw error;
    }

    // Adresse déjà inscrite : Supabase renvoie un utilisateur sans identité.
    const user = data?.user;
    if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) {
      return json(res, 409, alreadyAccount());
    }

    // 2. Profil : rôle « pending » explicite (le défaut SQL l'est aussi).
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ role: 'pending', nom, username: pseudo })
      .eq('id', user.id);

    // 3. Fiche d'adhésion reliée au compte.
    const insertResult = profileError
      ? { error: profileError }
      : await supabase.from('members').insert({
        nom,
        email,
        ...fiche,
        consent: true,
        status: 'pending',
        user_id: user.id,
      }).select('id').single();
    const insertError = insertResult.error;

    if (insertError) {
      // Pas de compte sans fiche : on annule la création du compte.
      await supabase.auth.admin.deleteUser(user.id).catch((e) => console.error('Rollback compte :', e?.message));
      if (insertError.code === '23505') {
        const dup = duplicateFicheMessage(insertError);
        return json(res, 409, { error: dup.error, fields: { [dup.field]: dup.error } });
      }
      throw insertError;
    }

    await logActivity(supabase, {
      categorie: 'adhesions',
      message: `${nom}${lieu(fiche.ville, fiche.pays)} a envoyé sa demande d’adhésion — en attente d’examen.`,
      ref: insertResult?.data?.id ? `adhesion:${insertResult.data.id}` : null,
    });
    await createNotification(supabase, {
      type: 'adhesion',
      title: `Nouvelle demande d’adhésion — ${nom}`,
      body: fiche.ville,
      link: 'members:en_attente',
      permission: 'voir_membres',
    });
    await notifyTeam({
      subject: `Nouvelle demande d'adhésion — ${nom}`,
      title: 'Nouvelle demande d’adhésion',
      rows: [['Nom', nom], ['Pseudo', pseudo], ['Ville', fiche.ville]],
      note: 'Email, téléphone et NINU sont consultables dans le tableau de bord (onglet Membres). '
        + 'L’accès à l’espace membre s’ouvrira quand vous approuverez la demande.',
    });

    return json(res, 201, {
      ok: true,
      message: 'Candidature enregistrée. Confirmez votre adresse email via le lien reçu ; '
        + 'votre espace membre s’ouvrira dès que votre adhésion sera approuvée.',
    });
  } catch (error) {
    return handleError(res, error, 'Inscription momentanément indisponible.');
  }
}

function alreadyAccount() {
  const message = 'Un compte existe déjà avec cette adresse : connectez-vous pour compléter votre adhésion depuis votre espace membre.';
  return { error: message, fields: { email: message }, login: true };
}
