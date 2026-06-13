// POST /api/leads-livreblanc — Lead Magnet (DAT Branche 1 §3)
// INSERT Supabase `leads_livreblanc` → envoi du lien PDF (URL signée 7 jours
// sur le bucket privé `documents`) par email via Resend.
import { Resend } from 'resend';
import { getServiceClient } from './_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError,
  isEmail, isText, isPhone, clean,
} from './_lib/http.js';

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 jours

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = getBody(req);

    if (clean(body.website)) {
      return json(res, 200, { ok: true }); // honeypot
    }

    const nom = clean(body.nom);
    const email = clean(body.email).toLowerCase();
    const ville = clean(body.ville);
    const telephone = clean(body.telephone);
    const sexe = clean(body.sexe).toLowerCase() || null;

    if (!isText(nom, 2, 120) || !isEmail(email)) {
      return json(res, 422, { error: 'Nom ou email invalide.' });
    }
    if (telephone && !isPhone(telephone)) {
      return json(res, 422, { error: 'Téléphone invalide.' });
    }

    const supabase = getServiceClient();

    const { error: insertError } = await supabase.from('leads_livreblanc').insert({
      nom, email,
      ville: ville || null,
      telephone: telephone || null,
      sexe: ['femme', 'homme', 'autre'].includes(sexe) ? sexe : null,
    });
    if (insertError) throw insertError;

    // URL signée du PDF (bucket privé) — fallback : copie statique du site.
    let downloadUrl = '/docs/livre-blanc.pdf';
    const pdfPath = process.env.LIVRE_BLANC_PDF_PATH || 'livre-blanc.pdf';
    const { data: signed } = await supabase.storage
      .from('documents')
      .createSignedUrl(pdfPath, SIGNED_URL_TTL);
    if (signed?.signedUrl) downloadUrl = signed.signedUrl;

    // Envoi de l'email (non bloquant pour l'utilisateur si Resend indisponible).
    let emailSent = false;
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.RESEND_FROM || 'En Avant <onboarding@resend.dev>',
          to: email,
          subject: 'Votre exemplaire du Livre Blanc — En Avant',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0e1726">
              <h2 style="color:#e0551f">Merci infiniment, ${nom} !</h2>
              <p>Merci de votre intérêt pour le projet <strong>En Avant</strong>.</p>
              <p>Voici votre lien de téléchargement du Livre Blanc — une vision
              sur 30 ans pour redresser Haïti (lien valable 7 jours) :</p>
              <p style="margin:28px 0">
                <a href="${downloadUrl}"
                   style="background:#ff6a2a;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:bold">
                  Télécharger le Livre Blanc
                </a>
              </p>
              <p style="color:#5b6b82;font-size:13px">
                Parti Politique En Avant — 44, Impasse Lescot, Laboule 12, Pétion-Ville, Haïti
              </p>
            </div>`,
        });
        emailSent = true;
      } catch (mailError) {
        console.error('Resend:', mailError);
      }
    }

    return json(res, 201, { ok: true, email_envoye: emailSent, url: downloadUrl });
  } catch (error) {
    return handleError(res, error);
  }
}
