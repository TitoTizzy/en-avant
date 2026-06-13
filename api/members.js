// POST /api/members — Inscription adhérent (DAT Branche 1 §3)
// Formulaire HTML natif → validation serveur → INSERT Supabase `members`.
// La table est protégée par RLS : seule cette route (service_role) peut écrire.
import { getServiceClient } from './_lib/supabase.js';
import {
  json, methodGuard, getBody, handleError,
  isEmail, isText, isPhone, clean, enforceRateLimit,
} from './_lib/http.js';

const SEXES = ['femme', 'homme', 'autre'];

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, { key: 'members', limit: 8 })) return;

  try {
    const body = getBody(req);

    // Honeypot anti-bot : un humain ne remplit jamais ce champ.
    if (clean(body.website)) {
      return json(res, 200, { ok: true });
    }

    const nom = clean(body.nom);
    const sexe = clean(body.sexe).toLowerCase();
    const ninu = clean(body.ninu).replace(/\D/g, '');
    const email = clean(body.email).toLowerCase();
    const telephone = clean(body.telephone);
    const ville = clean(body.ville);

    const errors = {};
    if (!isText(nom, 2, 120)) errors.nom = 'Nom invalide (2 à 120 caractères).';
    if (!SEXES.includes(sexe)) errors.sexe = 'Valeur non reconnue.';
    if (!/^1\d{9}$/.test(ninu)) errors.ninu = 'NINU invalide : 10 chiffres requis (carte ONI).';
    if (!isEmail(email)) errors.email = 'Adresse email invalide.';
    if (!isPhone(telephone)) errors.telephone = 'Numéro de téléphone invalide.';
    if (!isText(ville, 2, 80)) errors.ville = 'Ville invalide.';
    if (body.consent !== true) errors.consent = 'Le consentement RGPD est requis.';

    if (Object.keys(errors).length > 0) {
      return json(res, 422, { error: 'Formulaire invalide.', fields: errors });
    }

    const supabase = getServiceClient();
    const { error } = await supabase.from('members').insert({
      nom, sexe, ninu, email, telephone, ville,
      consent: true,
      status: 'pending',
    });

    if (error) {
      if (error.code === '23505') {
        const surNinu = /ninu/i.test(`${error.message} ${error.details || ''}`);
        return json(res, 409, {
          error: surNinu
            ? 'Ce NINU est déjà associé à une candidature.'
            : 'Cette adresse email a déjà soumis une candidature.',
        });
      }
      throw error;
    }

    return json(res, 201, { ok: true, message: 'Candidature enregistrée.' });
  } catch (error) {
    return handleError(res, error);
  }
}
