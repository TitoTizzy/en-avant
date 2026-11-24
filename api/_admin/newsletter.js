// /api/admin/newsletter — Newsletter hebdomadaire (permission « Gérer la newsletter »).
//   GET                         → historique + semaine en cours
//   GET ?view=options           → pays / départements / villes connus, événements à venir
//   GET ?view=audience&filtres= → nombre de destinataires et répartition
//   GET ?view=detail&id=        → newsletter, progression, échecs
//   GET ?view=apercu&id=        → HTML de l'email (destinataire fictif)
//   POST { action:'enregistrer', id?, sujet, apercu, contenu, evenement_id, cta_label, cta_url, filtres }
//   POST { action:'test', id }  → envoi à l'adresse de l'admin connecté
//   POST { action:'envoyer', id, confirmation, forcer? } → envoi à tous les destinataires filtrés
//   POST { action:'continuer', id } / { action:'relancer_echecs', id } / { action:'dupliquer', id }
//   POST { action:'image', image_base64, image_ext } → photo du contenu (stockage public) → { url }
//   DELETE { id }               → supprime un brouillon
//   Invitation au quiz de la semaine (envoyée aussi automatiquement le mardi à minuit) :
//   GET ?view=quiz              → semaine, invitation éventuelle, destinataires, déjà joué
//   POST { action:'quiz_test' } → invitation envoyée à l'admin connecté
//   POST { action:'quiz_envoyer', confirmation } → invitation à tous les adhérents qui n'ont pas joué
import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import { getServiceClient, requirePermission } from '../_lib/supabase.js';
import { json, getBody, handleError, clean } from '../_lib/http.js';
import { sanitizeArticleHtml } from '../_lib/sanitize.js';
import { senderAddress } from '../_lib/notify.js';
import { PAYS, REGIONS, geoFacets } from '../_lib/geo.js';
import {
  cleanFiltres, loadContacts, applyFiltres, breakdown, renderNewsletter, processQueue,
  tokensFor, unsubscribePageUrl,
} from '../_lib/newsletter.js';
import { inviteContent, inviteRecipients, inviteOf, startInvite } from '../_lib/quiz-invite.js';
import { renderQuizInvite } from '../_lib/quiz-email.js';
import { logTeamAction } from '../_lib/activity.js';

const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;

/** Vrai si les premiers octets correspondent bien au format annoncé. */
export function imageMatches(buffer, ext) {
  if (!buffer || buffer.length < 12) return false;
  if (ext === 'png') return buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (ext === 'jpg' || ext === 'jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (ext === 'webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const SELECT = 'id, sujet, apercu, contenu, evenement_id, cta_label, cta_url, filtres, statut, semaine, destinataires, envoyes, echecs, forcee, created_at, updated_at, started_at, sent_at';

async function currentWeek(supabase) {
  const { data, error } = await supabase.rpc('quiz_week_start', {});
  if (error) throw error;
  return data;
}

async function sentThisWeek(supabase, week) {
  const { data, error } = await supabase.from('newsletters').select('id, sujet, statut, sent_at, started_at')
    .eq('type', 'newsletter').eq('semaine', week).neq('statut', 'brouillon').order('started_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getNewsletter(supabase, id) {
  if (!isUuid(id)) throw Object.assign(new Error('Newsletter invalide.'), { status: 422 });
  const { data, error } = await supabase.from('newsletters').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('Newsletter introuvable.'), { status: 404 });
  return data;
}

async function eventFor(supabase, id) {
  if (!id) return null;
  const { data } = await supabase.from('events').select('id, titre, date_cible, lieu, description').eq('id', id).maybeSingle();
  return data || null;
}

function cleanDraft(body) {
  const sujet = clean(body.sujet).replace(/[\r\n]+/g, ' ').slice(0, 150);
  if (sujet.length < 3) return { error: 'Objet requis (3 caractères minimum).' };
  const contenu = sanitizeArticleHtml(body.contenu).slice(0, 100000);
  if (contenu.replace(/<[^>]+>/g, '').trim().length < 10) return { error: 'Le contenu est trop court.' };
  const ctaUrl = clean(body.cta_url);
  const ctaLabel = clean(body.cta_label).slice(0, 60);
  if (ctaUrl && !/^https:\/\/[^\s"'<>]+$/.test(ctaUrl)) return { error: 'Le lien du bouton doit commencer par https://' };
  if (ctaUrl && !ctaLabel) return { error: 'Indiquez le texte du bouton.' };
  if (body.evenement_id && !isUuid(body.evenement_id)) return { error: 'Événement invalide.' };
  return {
    sujet,
    apercu: clean(body.apercu).replace(/[\r\n]+/g, ' ').slice(0, 200) || null,
    contenu,
    evenement_id: body.evenement_id || null,
    cta_label: ctaUrl ? ctaLabel : null,
    cta_url: ctaUrl || null,
    filtres: cleanFiltres(body.filtres),
  };
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const { user } = await requirePermission(req, 'gerer_newsletter');
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const view = String(req.query?.view || '');

      if (view === 'options') {
        const contacts = await loadContacts(supabase);
        const all = breakdown(contacts);
        const since = new Date(Date.now() - 864e5).toISOString();
        const { data: events, error } = await supabase.from('events')
          .select('id, titre, date_cible, lieu').gte('date_cible', since).order('date_cible').limit(50);
        if (error) throw error;
        // Suggestions : d'abord ce qui existe dans la base (avec effectifs), puis les listes de référence.
        return json(res, 200, {
          pays: all.pays,
          regions: all.regions,
          villes: geoFacets(contacts).communes,
          pays_reference: PAYS,
          regions_reference: REGIONS,
          evenements: events || [],
          contacts: { total: all.total, adherents: all.adherents, abonnes: all.abonnes },
        });
      }

      if (view === 'audience') {
        let filtres = {};
        try { filtres = JSON.parse(String(req.query?.filtres || '{}')); } catch { /* filtres vides */ }
        const contacts = applyFiltres(await loadContacts(supabase), filtres);
        return json(res, 200, { filtres: cleanFiltres(filtres), ...breakdown(contacts) });
      }

      if (view === 'detail') {
        const newsletter = await getNewsletter(supabase, req.query?.id);
        const [{ data: progress }, { data: echecs }] = await Promise.all([
          supabase.rpc('newsletter_progress', { p_newsletter: newsletter.id }),
          supabase.from('newsletter_deliveries').select('email, erreur').eq('newsletter_id', newsletter.id)
            .eq('statut', 'echec').limit(50),
        ]);
        return json(res, 200, { newsletter, progression: progress, echecs: echecs || [] });
      }

      if (view === 'apercu') {
        const newsletter = await getNewsletter(supabase, req.query?.id);
        const { html } = renderNewsletter({
          newsletter, event: await eventFor(supabase, newsletter.evenement_id),
          nom: 'Prénom', unsubscribeUrl: unsubscribePageUrl('apercu'),
        });
        return json(res, 200, { html });
      }

      if (view === 'quiz') {
        const week = await currentWeek(supabase);
        const [invitation, { recipients, dejaJoue }] = await Promise.all([inviteOf(supabase, week), inviteRecipients(supabase, week)]);
        let progression = null;
        if (invitation) {
          const { data } = await supabase.rpc('newsletter_progress', { p_newsletter: invitation.id });
          progression = data || null;
        }
        return json(res, 200, { semaine: week, invitation, progression, destinataires: recipients.length, deja_joue: dejaJoue });
      }

      const week = await currentWeek(supabase);
      const { data, error } = await supabase.from('newsletters').select(SELECT)
        .eq('type', 'newsletter').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return json(res, 200, { newsletters: data || [], semaine: week, envois_semaine: await sentThisWeek(supabase, week) });
    }

    if (req.method === 'DELETE') {
      const newsletter = await getNewsletter(supabase, getBody(req).id);
      if (newsletter.statut !== 'brouillon') return json(res, 409, { error: 'Une newsletter envoyée ne peut pas être supprimée.' });
      const { error } = await supabase.from('newsletters').delete().eq('id', newsletter.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }

    const body = getBody(req);
    switch (body.action) {
      case 'enregistrer': {
        const draft = cleanDraft(body);
        if (draft.error) return json(res, 422, { error: draft.error });
        if (body.id) {
          const existing = await getNewsletter(supabase, body.id);
          if (existing.statut !== 'brouillon') return json(res, 409, { error: 'Cette newsletter est déjà envoyée : dupliquez-la pour en faire une nouvelle.' });
          const { data, error } = await supabase.from('newsletters')
            .update({ ...draft, updated_at: new Date().toISOString() }).eq('id', existing.id).select(SELECT).single();
          if (error) throw error;
          return json(res, 200, { newsletter: data });
        }
        const { data, error } = await supabase.from('newsletters').insert({ ...draft, created_by: user.id }).select(SELECT).single();
        if (error) throw error;
        return json(res, 201, { newsletter: data });
      }

      case 'image': {
        // Photo insérée dans le contenu : hébergée publiquement pour s'afficher dans les emails.
        const ext = String(body.image_ext || '').toLowerCase();
        if (!IMAGE_TYPES[ext] || !body.image_base64) return json(res, 422, { error: 'Image JPG, PNG ou WebP requise.' });
        const buffer = Buffer.from(String(body.image_base64), 'base64');
        if (!buffer.length || buffer.length > IMAGE_MAX_BYTES) return json(res, 422, { error: 'Image trop lourde (3 Mo maximum).' });
        if (!imageMatches(buffer, ext)) return json(res, 422, { error: 'Ce fichier n’est pas une image valide.' });
        const path = `newsletter/${randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`;
        const { error: uploadError } = await supabase.storage.from('assets')
          .upload(path, buffer, { contentType: IMAGE_TYPES[ext], upsert: false });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('assets').getPublicUrl(path);
        return json(res, 201, { url: data.publicUrl });
      }

      case 'dupliquer': {
        const source = await getNewsletter(supabase, body.id);
        const { data, error } = await supabase.from('newsletters').insert({
          sujet: source.sujet.slice(0, 140) + (source.sujet.length > 140 ? '' : ' (copie)'),
          apercu: source.apercu, contenu: source.contenu, evenement_id: source.evenement_id,
          cta_label: source.cta_label, cta_url: source.cta_url, filtres: source.filtres, created_by: user.id,
        }).select(SELECT).single();
        if (error) throw error;
        return json(res, 201, { newsletter: data });
      }

      case 'test': {
        const newsletter = await getNewsletter(supabase, body.id);
        if (!process.env.RESEND_API_KEY) return json(res, 503, { error: 'Envoi d’emails non configuré.' });
        const email = String(user.email || '').toLowerCase();
        if (!email) return json(res, 422, { error: 'Votre compte n’a pas d’adresse email.' });
        const token = (await tokensFor(supabase, [email])).get(email);
        const { html, text } = renderNewsletter({
          newsletter, event: await eventFor(supabase, newsletter.evenement_id),
          nom: user.user_metadata?.nom || '', unsubscribeUrl: unsubscribePageUrl(token),
        });
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: senderAddress(), to: [email], subject: `[TEST] ${newsletter.sujet}`, html, text,
        });
        if (error) throw Object.assign(new Error(error.message || 'Envoi du test impossible.'), { status: 502 });
        return json(res, 200, { ok: true, email });
      }

      case 'quiz_test': {
        if (!process.env.RESEND_API_KEY) return json(res, 503, { error: 'Envoi d’emails non configuré.' });
        const email = String(user.email || '').toLowerCase();
        if (!email) return json(res, 422, { error: 'Votre compte n’a pas d’adresse email.' });
        const token = (await tokensFor(supabase, [email])).get(email);
        const invitation = inviteContent();
        const { html, text } = renderQuizInvite({
          invitation, nom: user.user_metadata?.nom || '', unsubscribeUrl: unsubscribePageUrl(token), semaine: await currentWeek(supabase),
        });
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: senderAddress(), to: [email], subject: `[TEST] ${invitation.sujet}`, html, text,
        });
        if (error) throw Object.assign(new Error(error.message || 'Envoi du test impossible.'), { status: 502 });
        return json(res, 200, { ok: true, email });
      }

      case 'quiz_envoyer': {
        if (!Number.isInteger(Number(body.confirmation)) || Number(body.confirmation) < 1) {
          return json(res, 422, { error: 'Retapez le nombre de destinataires pour confirmer.' });
        }
        try {
          await logTeamAction(supabase, user, { categorie: 'quiz', message: `a lancé l’invitation au quiz de la semaine (${Number(body.confirmation)} adhérent(s)).` });
          const result = await startInvite(supabase, { week: await currentWeek(supabase), userId: user.id, expected: Number(body.confirmation) });
          return json(res, 200, { ok: true, ...result });
        } catch (error) {
          if (error.code && error.status) return json(res, error.status, { error: error.message, code: error.code, destinataires: error.destinataires });
          throw error;
        }
      }

      case 'envoyer': {
        const newsletter = await getNewsletter(supabase, body.id);
        if (newsletter.statut !== 'brouillon') return json(res, 409, { error: 'Cette newsletter a déjà été envoyée.' });
        const week = await currentWeek(supabase);
        const deja = await sentThisWeek(supabase, week);
        if (deja.length && body.forcer !== true) {
          return json(res, 409, {
            code: 'deja_cette_semaine',
            error: `Une newsletter est déjà partie cette semaine (« ${deja[0].sujet} »). Cochez « Envoyer quand même » pour un envoi exceptionnel.`,
          });
        }
        const recipients = applyFiltres(await loadContacts(supabase), newsletter.filtres);
        if (!recipients.length) return json(res, 422, { error: 'Aucun destinataire ne correspond à ces filtres.' });
        // Le nombre confirmé par l'admin doit être celui qui va réellement partir.
        if (Number(body.confirmation) !== recipients.length) {
          return json(res, 409, {
            code: 'audience_changee', destinataires: recipients.length,
            error: `Le nombre de destinataires a changé (${recipients.length}). Vérifiez puis confirmez à nouveau.`,
          });
        }
        // Verrou : un seul passage de brouillon à en_cours.
        const { data: locked, error: lockError } = await supabase.from('newsletters')
          .update({ statut: 'en_cours', semaine: week, destinataires: recipients.length, forcee: Boolean(deja.length),
            envoyee_par: user.id, started_at: new Date().toISOString() })
          .eq('id', newsletter.id).eq('statut', 'brouillon').select('id').maybeSingle();
        if (lockError) throw lockError;
        if (!locked) return json(res, 409, { error: 'Envoi déjà lancé.' });
        for (let i = 0; i < recipients.length; i += 500) {
          const { error } = await supabase.from('newsletter_deliveries').upsert(
            recipients.slice(i, i + 500).map((r) => ({ newsletter_id: newsletter.id, email: r.email, nom: r.nom || null })),
            { onConflict: 'newsletter_id,email', ignoreDuplicates: true });
          if (error) throw error;
        }
        await logTeamAction(supabase, user, { categorie: 'newsletter', message: `a lancé l’envoi de la newsletter « ${newsletter.sujet} » à ${recipients.length} personne(s)${deja.length ? ' (envoi exceptionnel : une newsletter était déjà partie cette semaine)' : ''}.` });
        const progression = await processQueue(supabase, newsletter.id);
        return json(res, 200, { ok: true, progression });
      }

      case 'continuer': {
        const newsletter = await getNewsletter(supabase, body.id);
        if (newsletter.statut === 'brouillon') return json(res, 409, { error: 'Cette newsletter n’a pas été envoyée.' });
        return json(res, 200, { ok: true, progression: await processQueue(supabase, newsletter.id) });
      }

      case 'relancer_echecs': {
        const newsletter = await getNewsletter(supabase, body.id);
        if (newsletter.statut === 'brouillon') return json(res, 409, { error: 'Cette newsletter n’a pas été envoyée.' });
        const { error } = await supabase.from('newsletter_deliveries').update({ statut: 'en_attente', erreur: null })
          .eq('newsletter_id', newsletter.id).eq('statut', 'echec');
        if (error) throw error;
        await supabase.from('newsletters').update({ statut: 'en_cours' }).eq('id', newsletter.id);
        return json(res, 200, { ok: true, progression: await processQueue(supabase, newsletter.id) });
      }

      default:
        return json(res, 400, { error: 'Action inconnue.' });
    }
  } catch (error) {
    return handleError(res, error, 'Newsletter indisponible.');
  }
}

