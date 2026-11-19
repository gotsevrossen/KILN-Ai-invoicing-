import { serviceClient, setting } from '../_shared/invoice.ts';
import { stripe } from '../_shared/stripe.ts';

interface Adjustment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  charge?: string | null;
  payment_intent?: string | null;
}

export function adjustmentState(kind: 'refund' | 'dispute', status: string): 'pending' | 'debit' | 'closed' | null {
  if (kind === 'refund') {
    if (status === 'succeeded') return 'debit';
    if (status === 'failed' || status === 'canceled') return 'closed';
    if (status === 'pending' || status === 'requires_action') return 'pending';
  } else {
    if (status === 'lost') return 'debit';
    if (status === 'won' || status === 'warning_closed' || status === 'prevented') return 'closed';
    if (['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review'].includes(status)) return 'pending';
  }
  return null;
}

export async function reconcileAdjustment(event: {
  type?: string; account?: string; created?: number; livemode?: boolean; data?: { object?: { id?: string } };
}): Promise<Response | null> {
  const type = event.type ?? '';
  const kind = type.startsWith('refund.') || type === 'charge.refund.updated' ? 'refund'
    : type.startsWith('charge.dispute.') ? 'dispute' : null;
  if (!kind) return null;
  const id = event.data?.object?.id;
  const account = event.account;
  if (!id || !account || !Number.isSafeInteger(event.created) ||
    !(kind === 'refund' ? /^re_[A-Za-z0-9]+$/ : /^du_[A-Za-z0-9]+$/).test(id)) return new Response('ok');

  try {
    // Retrieve current provider state so replayed or out-of-order webhooks do not undo newer changes.
    const key = setting('STRIPE_SECRET_KEY');
    const current = await stripe<Adjustment>(key, { method: 'GET', path: `/v1/${kind}s/${id}`, account });
    const state = adjustmentState(kind, current.status);
    if (!state || current.id !== id || current.currency !== 'usd') return new Response('ok');
    let intent = current.payment_intent;
    if (!intent && current.charge && /^ch_[A-Za-z0-9]+$/.test(current.charge)) {
      const charge = await stripe<{ payment_intent?: string }>(key, { method: 'GET', path: `/v1/charges/${current.charge}`, account });
      intent = charge.payment_intent;
    }
    if (!intent || !/^pi_[A-Za-z0-9]+$/.test(intent)) return new Response('ok');
    const result = await serviceClient().rpc('reconcile_stripe_adjustment', {
      p_account: account, p_test: !event.livemode, p_intent: intent, p_provider: id,
      p_kind: kind, p_amount: current.amount, p_state: state, p_event_at: event.created,
    });
    if (result.error || !result.data) return new Response('try again', { status: 500 });
    return new Response('ok');
  } catch {
    return new Response('try again', { status: 500 });
  }
}
