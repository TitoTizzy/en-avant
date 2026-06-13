// POST /api/create-checkout — Création d'une Stripe Checkout Session (DAT Corr. 2)
// Le frontend n'envoie que le montant ; la clé secrète Stripe reste serveur.
// Aucune donnée bancaire ne transite par nos serveurs (PCI-DSS géré par Stripe).
import Stripe from 'stripe';
import {
  json, methodGuard, getBody, handleError, isEmail, clean, enforceRateLimit,
} from './_lib/http.js';

const MIN_USD = 1;
const MAX_USD = 10000;

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!enforceRateLimit(req, res, { key: 'checkout', limit: 20 })) return;

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return json(res, 503, { error: 'Le service de paiement n\'est pas encore configuré.' });
    }

    const body = getBody(req);

    if (clean(body.website)) {
      return json(res, 200, { ok: true }); // honeypot
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < MIN_USD || amount > MAX_USD) {
      return json(res, 422, { error: `Montant invalide (entre ${MIN_USD} et ${MAX_USD} USD).` });
    }

    const email = clean(body.email).toLowerCase();
    if (email && !isEmail(email)) {
      return json(res, 422, { error: 'Adresse email invalide.' });
    }

    const siteUrl =
      process.env.SITE_URL ||
      `https://${req.headers['x-forwarded-host'] || req.headers.host}`;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      submit_type: 'donate',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: 'Don — Parti Politique En Avant',
              description: 'Soutien à l\'action du mouvement En Avant pour Haïti.',
            },
          },
        },
      ],
      customer_email: email || undefined,
      metadata: { source: 'don-page' },
      success_url: `${siteUrl}/don.html?statut=succes`,
      cancel_url: `${siteUrl}/don.html?statut=annule`,
    });

    return json(res, 200, { url: session.url });
  } catch (error) {
    return handleError(res, error, 'Impossible de créer la session de paiement.');
  }
}
