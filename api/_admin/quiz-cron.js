// GET /api/cron/quiz — Invitation automatique au quiz de la semaine (Vercel Cron).
// Planifiée le mardi à 04:00 et 05:00 UTC : l'une des deux tombe juste après minuit
// à Port-au-Prince, en heure d'hiver comme d'été. Elle n'envoie rien si :
//   - nous ne sommes pas encore mardi à Port-au-Prince ;
//   - l'invitation de la semaine est déjà partie (à la main lundi, ou par l'autre passage) ;
//   - aucun adhérent n'est à inviter.
// Une invitation en cours (coupée par la limite de temps) est poursuivie.
import { getServiceClient } from '../_lib/supabase.js';
import { json, handleError } from '../_lib/http.js';
import { cronAuthorized } from '../_lib/cron.js';
import { processQueue } from '../_lib/newsletter.js';
import { autoSendDue, inviteOf, startInvite, haitiDate } from '../_lib/quiz-invite.js';
import { createNotification } from '../_lib/notifications.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET) return json(res, 503, { error: 'Tâche non configurée.' });
  if (!cronAuthorized(req)) return json(res, 401, { error: 'Non autorisé.' });
  try {
    const supabase = getServiceClient();
    const { data: week, error } = await supabase.rpc('quiz_week_start', {});
    if (error) throw error;
    if (!autoSendDue(week)) return json(res, 200, { ok: true, sent: false, reason: `pas encore mardi (${haitiDate()})` });

    const existing = await inviteOf(supabase, week);
    if (existing) {
      if (existing.statut === 'en_cours') {
        const progression = await processQueue(supabase, existing.id, { deadlineMs: 45000 });
        return json(res, 200, { ok: true, sent: false, reason: 'invitation poursuivie', progression });
      }
      return json(res, 200, { ok: true, sent: false, reason: 'déjà envoyée' });
    }
    try {
      const { id, progression } = await startInvite(supabase, { week, auto: true, deadlineMs: 45000 });
      await createNotification(supabase, {
        type: 'quiz_invitation',
        title: 'Invitation au quiz envoyée automatiquement',
        body: `${progression.envoyes} adhérent(s) invité(s) au défi de la semaine (rien n’avait été envoyé lundi).`,
        link: 'trivia:defi',
        permission: 'gerer_newsletter',
        refId: `quiz_invitation:${week}`,
      }).catch((e) => console.error('[quiz-cron] notification :', e?.message));
      return json(res, 200, { ok: true, sent: true, id, progression });
    } catch (sendError) {
      if (sendError.code === 'deja_envoyee' || sendError.code === 'personne') {
        return json(res, 200, { ok: true, sent: false, reason: sendError.message });
      }
      throw sendError;
    }
  } catch (error) {
    return handleError(res, error, 'Invitation au quiz indisponible.');
  }
}
