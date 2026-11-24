import { processStripeEvent } from '../_lib/stripe-events.js';
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
import { createNotification } from '../_lib/notifications.js';
import { notifyTeam } from '../_lib/notify.js';
import { logActivity } from '../_lib/activity.js';

export const config = { api: { bodyParser: false } };

const API_VERSION = '2025-08-27.basil';

const money = (cents, currency) =>
  `${((Number(cents) || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${String(currency || 'usd').toUpperCase()}`;

async function notifyDonation(supabase, row, transaction) {
  await logActivity(supabase, {
    categorie: 'dons',
    message: `${row.frequence === 'mensuel' ? 'Échéance de don mensuel reçue' : 'Don reçu'} : ${money(row.montant, row.devise)}${row.nom ? ` de ${row.nom}` : ''}${row.pays ? ` (${row.pays})` : ''}, par carte.`,
    ref: transaction ? `don_tx:${transaction}` : null,
  });
  await createNotification(supabase, {
    type: 'don',
    title: `${row.frequence === 'mensuel' ? 'Don mensuel' : 'Don'} reçu — ${money(row.montant, row.devise)}`,
    body: row.nom || '',
    link: 'donations',
    permission: 'voir_dons',
  });
  return notifyTeam({
    subject: `Don ${row.frequence} reçu — ${money(row.montant, row.devise)}`,
    title: row.frequence === 'mensuel' ? 'Échéance de don mensuel reçue' : 'Nouveau don reçu',
    rows: [['Montant', money(row.montant, row.devise)], ['Donateur', row.nom || '—'], ['Pays', row.pays || '—']],
    note: 'Détails et reçu dans le tableau de bord Stripe et l’onglet Dons.',
  });
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
    const { record, fresh } = await processStripeEvent(event, stripe, supabase);
    if (!fresh) return res.status(200).json({ received: true });
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'invoice.paid':
        await notifyDonation(supabase, record.p_row, record.p_transaction);
        break;
      case 'charge.refunded': {
        await logActivity(supabase, { categorie: 'dons', niveau: 'attention', message: `Un don a été remboursé : ${money(obj.amount_refunded, obj.currency)}.`, ref: `refund:${obj.id}` });
        await createNotification(supabase, {
          type: 'don_alerte',
          title: `Don remboursé — ${money(obj.amount_refunded, obj.currency)}`,
          link: 'donations',
          permission: 'voir_dons',
          refId: `refund:${obj.id}`,
        });
        await notifyTeam({
          subject: `Don remboursé — ${money(obj.amount_refunded, obj.currency)}`,
          title: 'Un don a été remboursé',
          rows: [['Montant remboursé', money(obj.amount_refunded, obj.currency)], ['Référence Stripe', obj.id]],
        });
        break;
      }

      case 'charge.dispute.created': {
        console.warn('Litige Stripe ouvert:', obj.id);
        await logActivity(supabase, { categorie: 'dons', niveau: 'erreur', message: `Un donateur conteste un paiement de ${money(obj.amount, obj.currency)} (motif : ${obj.reason || 'non précisé'}). À traiter dans Stripe avant la date limite.`, ref: `dispute:${obj.id}` });
        await createNotification(supabase, {
          type: 'don_alerte',
          title: `URGENT — litige sur un don (${money(obj.amount, obj.currency)})`,
          body: 'Répondez dans Stripe avant la date limite.',
          link: 'donations',
          permission: 'voir_dons',
          refId: `dispute:${obj.id}`,
        });
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
