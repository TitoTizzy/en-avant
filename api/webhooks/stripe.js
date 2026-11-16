// POST /api/webhooks/stripe — Événements Stripe des dons (En Avant Miami Inc)
//
// Signature vérifiée sur le corps BRUT (bodyParser désactivé). Chaque
// traitement est idempotent : Stripe peut livrer plusieurs fois le même
// événement, et `transaction_id` est UNIQUE en base.
//
//   checkout.session.completed / async_payment_succeeded (mode payment)
//                                   → don unique enregistré
//   invoice.paid                    → chaque échéance d'un don mensuel
//   charge.refunded                 → statut 'refunded'
//   charge.dispute.created          → statut 'disputed'
//   autres événements abonnés       → acquittés (journalisés)
import Stripe from 'stripe';
import getRawBody from 'raw-body';
import { getServiceClient } from '../_lib/supabase.js';
import { notifyTeam } from '../_lib/notify.js';

export const config = { api: { bodyParser: false } };

const API_VERSION = '2025-08-27.basil';

/** Retourne true si le don est nouveau (false si rejeu Stripe déjà enregistré). */
async function insertDonation(supabase, row) {
  const { error } = await supabase.from('donations').insert({ provider: 'stripe', ...row });
  // 23505 = doublon (rejeu Stripe) → déjà enregistré, on acquitte.
  if (error && error.code !== '23505') throw error;
  return !error;
}

const money = (cents, currency) =>
  `${((Number(cents) || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${String(currency || 'usd').toUpperCase()}`;

function notifyDonation(row) {
  return notifyTeam({
    subject: `Don ${row.frequence} reçu — ${money(row.montant, row.devise)}`,
    title: row.frequence === 'mensuel' ? 'Échéance de don mensuel reçue' : 'Nouveau don reçu',
    rows: [['Montant', money(row.montant, row.devise)], ['Donateur', row.nom || '—'], ['Pays', row.pays || '—']],
    note: 'Détails et reçu dans le tableau de bord Stripe et l’onglet Dons.',
  });
}

async function setStatus(supabase, transactionIds, statut) {
  const ids = transactionIds.filter(Boolean);
  if (!ids.length) return 0;
  const { data, error } = await supabase
    .from('donations').update({ statut }).in('transaction_id', ids).select('id');
  if (error) throw error;
  return data?.length || 0;
}

/** Retrouve l'identifiant de facture associé à un PaymentIntent (dons mensuels). */
async function invoiceIdForPaymentIntent(stripe, paymentIntentId) {
  if (!paymentIntentId) return null;
  try {
    const list = await stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: paymentIntentId },
      limit: 1,
    });
    const inv = list.data[0]?.invoice;
    return typeof inv === 'string' ? inv : inv?.id || null;
  } catch {
    return null;
  }
}

function donorFields(details) {
  return {
    email: details?.email || null,
    nom: details?.name || null,
    pays: details?.address?.country || null,
  };
}

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

  const stripe = new Stripe(secretKey, { apiVersion: API_VERSION });
  let event;
  try {
    const rawBody = await getRawBody(req, { limit: '1mb' });
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], webhookSecret);
  } catch (error) {
    console.error('Signature Stripe invalide:', error.message);
    return res.status(400).json({ error: 'Signature invalide.' });
  }

  try {
    const supabase = getServiceClient();
    const obj = event.data.object;

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        // Les dons mensuels sont enregistrés par invoice.paid (1re échéance incluse).
        if (obj.mode === 'payment' && obj.payment_status === 'paid') {
          const row = {
            montant: obj.amount_total,
            devise: obj.currency || 'usd',
            transaction_id: String(obj.payment_intent || obj.id),
            frequence: 'unique',
            statut: 'completed',
            ...donorFields(obj.customer_details),
          };
          if (await insertDonation(supabase, row)) await notifyDonation(row);
        }
        break;
      }

      case 'invoice.paid': {
        if (obj.amount_paid > 0 && obj.parent?.type === 'subscription_details') {
          const row = {
            montant: obj.amount_paid,
            devise: obj.currency || 'usd',
            transaction_id: obj.id,
            frequence: 'mensuel',
            statut: 'completed',
            email: obj.customer_email || null,
            nom: obj.customer_name || null,
            pays: obj.customer_address?.country || null,
          };
          if (await insertDonation(supabase, row)) await notifyDonation(row);
        }
        break;
      }

      case 'charge.refunded': {
        const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
        const updated = await setStatus(supabase, [pi], 'refunded');
        if (!updated) {
          await setStatus(supabase, [await invoiceIdForPaymentIntent(stripe, pi)], 'refunded');
        }
        await notifyTeam({
          subject: `Don remboursé — ${money(obj.amount_refunded, obj.currency)}`,
          title: 'Un don a été remboursé',
          rows: [['Montant remboursé', money(obj.amount_refunded, obj.currency)], ['Référence Stripe', obj.id]],
        });
        break;
      }

      case 'charge.dispute.created': {
        const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
        const updated = await setStatus(supabase, [pi], 'disputed');
        if (!updated) {
          await setStatus(supabase, [await invoiceIdForPaymentIntent(stripe, pi)], 'disputed');
        }
        console.warn('Litige Stripe ouvert:', obj.id);
        await notifyTeam({
          subject: `URGENT — litige ouvert sur un don (${money(obj.amount, obj.currency)})`,
          title: 'Un donateur conteste un paiement',
          rows: [['Montant', money(obj.amount, obj.currency)], ['Motif', obj.reason || '—'], ['Référence Stripe', obj.id]],
          note: 'Répondez au litige dans le tableau de bord Stripe avant la date limite indiquée, sinon il est perdu automatiquement.',
        });
        break;
      }

      default:
        console.info('Événement Stripe acquitté sans traitement:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    // 500 → Stripe réessaiera automatiquement.
    console.error('Webhook Stripe:', event.type, error);
    return res.status(500).json({ error: 'Erreur de traitement.' });
  }
}
