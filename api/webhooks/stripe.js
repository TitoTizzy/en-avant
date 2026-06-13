// POST /api/webhooks/stripe — Réception des paiements (DAT Corr. 2)
// Vérification de la signature sur le corps BRUT (bodyParser désactivé,
// pattern officiel Vercel), puis log du don dans Supabase `donations`.
import Stripe from 'stripe';
import getRawBody from 'raw-body';
import { getServiceClient } from '../_lib/supabase.js';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return res.status(503).json({ error: 'Webhook non configuré.' });
  }

  let event;
  try {
    const stripe = new Stripe(secretKey);
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      req.headers['stripe-signature'],
      webhookSecret
    );
  } catch (error) {
    console.error('Signature Stripe invalide:', error.message);
    return res.status(400).json({ error: 'Signature invalide.' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // On ne logge que les paiements réellement encaissés.
      if (session.payment_status === 'paid') {
        const supabase = getServiceClient();
        const { error } = await supabase.from('donations').insert({
          montant: session.amount_total,            // centimes
          devise: session.currency || 'usd',
          provider: 'stripe',
          transaction_id: String(session.payment_intent || session.id),
          email: session.customer_details?.email || null,
          statut: 'completed',
        });

        // 23505 = doublon (retry Stripe) → idempotent, on acquitte.
        if (error && error.code !== '23505') throw error;
      }
    }

    // Tout autre type d'événement est acquitté sans traitement.
    return res.status(200).json({ received: true });
  } catch (error) {
    // 500 → Stripe réessaiera automatiquement (livraison garantie).
    console.error('Webhook Stripe:', error);
    return res.status(500).json({ error: 'Erreur de traitement.' });
  }
}
