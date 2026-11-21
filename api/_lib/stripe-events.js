const idOf = value => typeof value === 'string' ? value : value?.id;
const ours = metadata => metadata?.source === 'enavant.org';
const fields = details => ({ email: details?.email || null, nom: details?.name || null,
  pays: details?.address?.country || null });

async function transactionForCharge(stripe, charge) {
  const pi = idOf(charge.payment_intent);
  if (!pi) throw new Error('Charge without PaymentIntent cannot be reconciled.');
  // Recurring invoice PaymentIntents do not inherit subscription metadata.
  // Resolve their invoice first; all lookup failures must trigger a retry.
  const payments = await stripe.invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: pi }, limit: 1,
  });
  const invoiceId = idOf(payments.data[0]?.invoice);
  if (invoiceId) {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    return ours(invoice.parent?.subscription_details?.metadata) ? invoiceId : null;
  }
  const intent = await stripe.paymentIntents.retrieve(pi);
  return ours(intent.metadata) ? pi : null;
}

export async function stripeRecord(event, stripe) {
  const obj = event.data.object;
  const base = { p_id: event.id, p_created: event.created };
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (!ours(obj.metadata) || obj.mode !== 'payment' || obj.payment_status !== 'paid' || !(obj.amount_total > 0)) return null;
      if (!idOf(obj.payment_intent)) throw new Error('Paid session without PaymentIntent.');
      return { ...base, p_transaction: idOf(obj.payment_intent), p_kind: 'payment', p_row: {
        montant: obj.amount_total, devise: obj.currency, frequence: 'unique', ...fields(obj.customer_details),
      } };
    case 'invoice.paid':
      if (!(obj.amount_paid > 0) || !ours(obj.parent?.subscription_details?.metadata)) return null;
      return { ...base, p_transaction: obj.id, p_kind: 'payment', p_row: {
        montant: obj.amount_paid, devise: obj.currency, frequence: 'mensuel',
        email: obj.customer_email || null, nom: obj.customer_name || null, pays: obj.customer_address?.country || null,
      } };
    case 'charge.refunded': {
      const transaction = await transactionForCharge(stripe, obj);
      return transaction ? { ...base, p_transaction: transaction, p_kind: 'refund', p_refunded: obj.amount_refunded } : null;
    }
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed': {
      const charge = await stripe.charges.retrieve(idOf(obj.charge));
      const transaction = await transactionForCharge(stripe, charge);
      return transaction ? { ...base, p_transaction: transaction, p_kind: 'dispute', p_dispute: obj.status } : null;
    }
    default: return null;
  }
}

export async function processStripeEvent(event, stripe, supabase) {
  const record = await stripeRecord(event, stripe);
  if (!record) return { record: null, fresh: false };
  const { data, error } = await supabase.rpc('ea_record_stripe_event', record);
  if (error) throw error;
  return { record, fresh: data === true };
}

