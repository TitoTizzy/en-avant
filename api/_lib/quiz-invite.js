// Invitation hebdomadaire au quiz : email aux adhérents qui n'ont pas encore joué
// le défi de la semaine. Envoyée à la main depuis l'admin, ou automatiquement le
// mardi à minuit (heure d'Haïti) si personne ne l'a envoyée le lundi.
// Règles :
// - destinataires = adhérents approuvés (et abonnés venus de l'adhésion), moins les
//   désinscrits et moins ceux qui ont terminé le défi de la semaine ;
// - une seule invitation par semaine de quiz (index unique en base), séparée de la
//   newsletter hebdomadaire ;
// - envoi par le système de la newsletter : lots, suivi, reprise sans doublon,
//   lien de désinscription.
import { loadContacts, processQueue, fetchAll, siteUrl } from './newsletter.js';

export const QUIZ_TZ = 'America/Port-au-Prince';

/** Contenu de l'invitation (HTML fixe, sans donnée externe). */
export function inviteContent() {
  return {
    sujet: 'Le quiz de la semaine est ouvert',
    apercu: 'Nouvelles questions sur le programme d’En Avant : à vous de jouer !',
    contenu: '<p>Le <strong>défi de la semaine</strong> vous attend : de nouvelles questions sur le programme d’En Avant et les 20 chantiers du Livre blanc.</p>'
      + '<p>Mêmes questions pour tous les adhérents, une seule tentative : testez vos connaissances et grimpez au classement.</p>',
    cta_label: 'Jouer maintenant',
    cta_url: `${siteUrl()}/quiz`,
  };
}

/** Date du jour à Port-au-Prince (AAAA-MM-JJ). */
export function haitiDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: QUIZ_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Envoi automatique dû : nous sommes au plus tôt le mardi 00:00 (heure d'Haïti)
 * de la semaine de quiz `week` (son lundi, AAAA-MM-JJ).
 */
export function autoSendDue(week, now = new Date()) {
  return Boolean(week) && haitiDate(now) > String(week).slice(0, 10);
}

/** Adhérents à inviter pour la semaine `week`, et nombre de ceux qui ont déjà joué. */
export async function inviteRecipients(supabase, week) {
  const [contacts, games, members] = await Promise.all([
    loadContacts(supabase),
    fetchAll(() => supabase.from('quiz_games').select('user_id')
      .eq('mode', 'defi').eq('week_start', week).not('finished_at', 'is', null).order('user_id')),
    fetchAll(() => supabase.from('members').select('user_id, email').eq('status', 'approved')
      .not('user_id', 'is', null).order('created_at')),
  ]);
  const played = new Set(games.map((g) => g.user_id));
  const playedEmails = new Set(members.filter((m) => played.has(m.user_id))
    .map((m) => String(m.email || '').trim().toLowerCase()));
  const adherents = contacts.filter((c) => c.types.has('adherent'));
  const recipients = adherents.filter((c) => !playedEmails.has(c.email));
  return { recipients, dejaJoue: adherents.length - recipients.length };
}

/** Invitation de la semaine, si elle existe. */
export async function inviteOf(supabase, week) {
  const { data, error } = await supabase.from('newsletters')
    .select('id, statut, destinataires, envoyes, echecs, envoi_auto, started_at, sent_at')
    .eq('type', 'quiz').eq('semaine', week).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Lance l'invitation de la semaine. `expected` (envoi manuel) : nombre confirmé par
 * l'admin, qui doit être celui qui part réellement. Erreurs avec `status` et `code`.
 */
export async function startInvite(supabase, { week, userId = null, auto = false, expected = null, deadlineMs }) {
  const existing = await inviteOf(supabase, week);
  if (existing) {
    throw Object.assign(new Error('L’invitation de cette semaine a déjà été envoyée.'), { status: 409, code: 'deja_envoyee', invitation: existing });
  }
  const { recipients } = await inviteRecipients(supabase, week);
  if (!recipients.length) throw Object.assign(new Error('Aucun adhérent à inviter : tout le monde a déjà joué.'), { status: 422, code: 'personne' });
  if (expected !== null && Number(expected) !== recipients.length) {
    throw Object.assign(new Error(`Le nombre de destinataires a changé (${recipients.length}). Vérifiez puis confirmez à nouveau.`),
      { status: 409, code: 'audience_changee', destinataires: recipients.length });
  }
  const { data: row, error } = await supabase.from('newsletters').insert({
    ...inviteContent(), type: 'quiz', filtres: { public: 'adherents', pays: [], departements: [], villes: [] },
    statut: 'en_cours', semaine: week, destinataires: recipients.length, envoi_auto: auto,
    created_by: userId, envoyee_par: userId, started_at: new Date().toISOString(),
  }).select('id').single();
  if (error) {
    // Deux envois simultanés (admin et tâche automatique) : l'index unique n'en garde qu'un.
    if (error.code === '23505') throw Object.assign(new Error('L’invitation de cette semaine a déjà été envoyée.'), { status: 409, code: 'deja_envoyee' });
    throw error;
  }
  for (let i = 0; i < recipients.length; i += 500) {
    const { error: deliveryError } = await supabase.from('newsletter_deliveries').upsert(
      recipients.slice(i, i + 500).map((r) => ({ newsletter_id: row.id, email: r.email, nom: r.nom || null })),
      { onConflict: 'newsletter_id,email', ignoreDuplicates: true });
    if (deliveryError) throw deliveryError;
  }
  const progression = await processQueue(supabase, row.id, deadlineMs ? { deadlineMs } : {});
  return { id: row.id, progression };
}
