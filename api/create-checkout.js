import { enforceDurableRateLimit } from './_lib/rate-limit.js';
// /api/create-checkout — Dons Stripe Checkout (En Avant Miami Inc)
//
// GET  → { enabled, amounts } : état public des dons (aucun secret exposé).
// POST → { frequency: 'unique'|'mensuel', amount: '10'|'25'|…|'1000'|'libre' }
//        → { url } vers la page Stripe hébergée.
//
// Le navigateur ne choisit JAMAIS un prix Stripe ni un montant arbitraire :
// il choisit une clé, et le serveur la traduit via une liste blanche de
// variables d'environnement (STRIPE_PRICE_*). Aucune donnée de carte ne
// transite par nos serveurs (PCI géré par Stripe).
import Stripe from 'stripe';
import {
  json, getBody, handleError, clean,
} from './_lib/http.js';

export const STRIPE_API_VERSION = '2025-08-27.basil';

const AMOUNTS = ['10', '25', '50', '100', '250', '500', '1000'];
const FREQUENCIES = {
  unique: [...AMOUNTS, 'libre'],
  mensuel: AMOUNTS, // Stripe n'autorise pas le montant libre en abonnement.
};

function priceEnvName(frequency, amount) {
  return `STRIPE_PRICE_${frequency.toUpperCase()}_${amount.toUpperCase()}`;
}

/** Liste blanche { frequency: { amount: priceId } } construite depuis l'env. */
export function availablePrices(env = process.env) {
  const out = {};
  for (const [frequency, amounts] of Object.entries(FREQUENCIES)) {
    out[frequency] = {};
    for (const amount of amounts) {
      const id = clean(env[priceEnvName(frequency, amount)]);
      if (/^price_[A-Za-z0-9]{8,}$/.test(id)) out[frequency][amount] = id;
    }
  }
  return out;
}

export function donationsEnabled(env = process.env) {
  return env.DONATIONS_ENABLED === 'true'
    && /^(sk|rk)_(live|test)_/.test(clean(env.STRIPE_SECRET_KEY))
    && /^whsec_/.test(clean(env.STRIPE_WEBHOOK_SECRET))
    && /^https:\/\//.test(clean(env.SITE_URL))
    && Object.values(availablePrices(env)).some(prices => Object.keys(prices).length > 0);
}

export function validDonationPrice(price, frequency, amount) {
  if (!price?.active || price.currency !== 'usd') return false;
  if (frequency === 'mensuel') {
    if (price.type !== 'recurring' || price.recurring?.interval !== 'month'
      || price.recurring?.interval_count !== 1) return false;
  } else if (price.type !== 'one_time') return false;
  return amount === 'libre'
    ? !!price.custom_unit_amount && Number.isInteger(price.custom_unit_amount.minimum)
      && Number.isInteger(price.custom_unit_amount.maximum) && price.custom_unit_amount.minimum >= 100
      && price.custom_unit_amount.maximum <= 1000000
    : price.unit_amount === Number(amount) * 100 && !price.custom_unit_amount;
}

export function createCheckoutHandler({ rateLimit = enforceDurableRateLimit,
  createStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION }),
} = {}) {
return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const enabled = donationsEnabled();
    const prices = availablePrices();
    const amounts = Object.fromEntries(
      Object.entries(prices).map(([f, map]) => [f, enabled ? Object.keys(map) : []])
    );
    return json(res, 200, { enabled, amounts });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Méthode non autorisée.' });
  }


  try {
    if (!donationsEnabled()) {
      return json(res, 503, { error: 'Les dons en ligne ne sont pas encore ouverts.' });
    }

    // Refuse les appels venant d'un autre site (défense CSRF légère).
    const siteUrl = new URL(process.env.SITE_URL).origin;
    const origin = clean(req.headers.origin);
    if (origin && origin !== siteUrl && origin !== siteUrl.replace('://', '://www.')) {
      return json(res, 403, { error: 'Origine non autorisée.' });
    }

    const body = getBody(req);
    if (clean(body.website)) return json(res, 200, { ok: true }); // honeypot

    const frequency = clean(body.frequency);
    const amount = clean(body.amount);
    const priceId = availablePrices()[frequency]?.[amount];
    if (!priceId) {
      return json(res, 422, { error: 'Montant ou fréquence invalide.' });
    }

    if (!await rateLimit(req, res, { key: 'checkout', limit: 10 })) return;
    const requestId = clean(body.request_id);
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json(res, 422, { error: 'Identifiant de tentative invalide.' });
    const stripe = createStripe();
    const price = await stripe.prices.retrieve(priceId);
    if (!validDonationPrice(price, frequency, amount)) {
      return json(res, 503, { error: 'Ce montant est temporairement indisponible.' });
    }
    const isMonthly = frequency === 'mensuel';
    const metadata = { source: 'enavant.org', type: `don_${frequency}`, montant: amount };

    const params = {
      mode: isMonthly ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      // Carte (Apple Pay et Google Pay inclus) et Link uniquement. Le compte a
      // d'autres moyens actifs (Amazon Pay, Pix, Bancontact, ACH…) : sans cette
      // liste, Stripe les proposerait aux donateurs. Ils sont exclus pour une
      // organisation qui finance un parti politique, et inadaptés à un don.
      payment_method_types: ['card', 'link'],
      billing_address_collection: 'required',
      custom_text: {
        submit: {
          message: 'Contribution au financement des activités du parti politique En Avant (Haïti), '
            + 'collectée par En Avant Miami Inc. Ce don n\'est pas déductible des impôts.',
        },
      },
      metadata,
      success_url: `${siteUrl}/don?statut=succes&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/don?statut=annule`,
    };

    if (isMonthly) {
      params.subscription_data = { description: 'Don mensuel — En Avant', metadata };
    } else {
      params.submit_type = 'donate';
      params.customer_creation = 'always';
      params.payment_intent_data = { description: 'Don unique — En Avant', metadata };
    }

    const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `don:${requestId}` });
    return json(res, 200, { url: session.url });
  } catch (error) {
    return handleError(res, error, 'Impossible de créer la session de paiement.');
  }
}

}

export default createCheckoutHandler();
