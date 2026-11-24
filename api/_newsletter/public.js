// /api/newsletter — Inscription publique et désinscription.
//   POST { op:'inscription', email, nom?, pays, departement?, ville, consent:true, site:'' (piège à robots) }
//   GET  ?op=jeton&t=<jeton>          → adresse masquée + statut (aucune action)
//   POST { op:'desinscription', t }    → désinscription (page /newsletter)
//   POST ?op=desinscription&t=<jeton>  → désinscription en un clic (en-tête List-Unsubscribe)
// Un GET ne désinscrit jamais : les antivirus des messageries ouvrent les liens.
import { getServiceClient } from '../_lib/supabase.js';
import { json, getBody, handleError, clean, isEmail } from '../_lib/http.js';
import { enforceDurableRateLimit } from '../_lib/rate-limit.js';
import { cleanLocation } from '../_lib/geo.js';
import { sendToMember } from '../_lib/notify.js';
import { tokensFor, unsubscribePageUrl } from '../_lib/newsletter.js';
import { logActivity, lieu } from '../_lib/activity.js';

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const mask = (email) => {
  const [user, domain] = String(email).split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
};

async function emailForToken(supabase, token) {
  if (!isUuid(token)) return null;
  const { data, error } = await supabase.from('newsletter_tokens').select('email').eq('token', token).maybeSingle();
  if (error) throw error;
  return data?.email || null;
}

async function unsubscribe(supabase, email, source) {
  const { error } = await supabase.from('newsletter_optouts').upsert({ email, source }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) throw error;
  await supabase.from('newsletter_subscribers').update({ unsubscribed_at: new Date().toISOString() })
    .ilike('email', email).is('unsubscribed_at', null);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const supabase = getServiceClient();
    const body = getBody(req);
    const op = String(body.op || req.query?.op || '');

    if (req.method === 'GET' && op === 'jeton') {
      if (!await enforceDurableRateLimit(req, res, { key: 'newsletter-jeton', limit: 30 })) return;
      const email = await emailForToken(supabase, req.query?.t);
      if (!email) return json(res, 404, { error: 'Lien de désinscription invalide.' });
      const { data } = await supabase.from('newsletter_optouts').select('email').eq('email', email).maybeSingle();
      return json(res, 200, { email: mask(email), desinscrit: Boolean(data) });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }

    if (op === 'desinscription') {
      if (!await enforceDurableRateLimit(req, res, { key: 'newsletter-desinscription', limit: 30 })) return;
      const email = await emailForToken(supabase, body.t || req.query?.t);
      if (!email) return json(res, 404, { error: 'Lien de désinscription invalide.' });
      await unsubscribe(supabase, email, body.t ? 'page' : 'un_clic');
      await logActivity(supabase, { categorie: 'newsletter', message: `Une personne s’est désinscrite de la newsletter (${mask(email)}).` });
      return json(res, 200, { ok: true, email: mask(email) });
    }

    if (op === 'inscription') {
      if (!await enforceDurableRateLimit(req, res, { key: 'newsletter-inscription', limit: 5 })) return;
      if (clean(body.site)) return json(res, 201, { ok: true }); // robot : on ne dit rien
      const email = clean(body.email).toLowerCase();
      if (!isEmail(email)) return json(res, 422, { error: 'Adresse email invalide.' });
      if (body.consent !== true) return json(res, 422, { error: 'Merci d’accepter de recevoir la newsletter.' });
      const location = cleanLocation(body);
      if (location.error) return json(res, 422, { error: location.error });
      const nom = clean(body.nom).replace(/\s+/g, ' ').slice(0, 120) || null;

      const { data: existing, error: findError } = await supabase.from('newsletter_subscribers')
        .select('id, unsubscribed_at').ilike('email', email).maybeSingle();
      if (findError) throw findError;
      const row = { email, nom, ...location, consent_at: new Date().toISOString(), unsubscribed_at: null };
      const { data: saved, error } = existing
        ? await supabase.from('newsletter_subscribers').update(row).eq('id', existing.id).select('id').single()
        : await supabase.from('newsletter_subscribers').insert(row).select('id').single();
      if (error) throw error;
      await logActivity(supabase, {
        categorie: 'newsletter',
        message: `${existing ? 'Réinscription' : 'Nouvelle inscription'} à la newsletter${nom ? ` : ${nom}` : ''}${lieu(location.ville, location.pays)}.`,
        ref: !existing && saved?.id ? `abonnement:${saved.id}` : null,
      });
      // Une nouvelle inscription annule une désinscription passée.
      await supabase.from('newsletter_optouts').delete().eq('email', email);

      const token = (await tokensFor(supabase, [email])).get(email);
      await sendToMember({
        to: email,
        subject: 'Bienvenue dans la newsletter d’En Avant',
        title: 'Votre inscription est confirmée',
        paragraphs: [
          'Merci ! Vous recevrez la newsletter d’En Avant : l’actualité du parti, le programme et les événements près de chez vous.',
          'Une lettre au maximum par semaine. Vous pouvez vous désinscrire à tout moment avec le lien présent dans chaque email.',
          `Ce n’est pas vous ? Désinscrivez cette adresse : ${unsubscribePageUrl(token)}`,
        ],
        cta: { label: 'Découvrir le programme', url: 'https://enavant.org/vingt-chantiers' },
      });
      return json(res, 201, { ok: true });
    }

    return json(res, 400, { error: 'Opération inconnue.' });
  } catch (error) {
    return handleError(res, error, 'Newsletter indisponible.');
  }
}
