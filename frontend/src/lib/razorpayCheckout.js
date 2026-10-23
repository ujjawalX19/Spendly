/**
 * razorpayCheckout — the app's half of a Vittova Pro pass paid with Razorpay
 * (website and the Indus Appstore build).
 *
 *   server creates the order (amount is the server's) -> Razorpay Checkout
 *   -> checkout's ids and signature go to the server, which confirms the
 *   payment with Razorpay before granting Pro -> the app reads /api/pro/status.
 *
 * Checkout saying "success" never turns Pro on by itself.
 */

import { apiJson } from './apiConfig';
import { passCards, outcomeFromVerify } from './razorpayPlan';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loading = null;
function loadCheckout() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CHECKOUT_SRC;
      s.async = true;
      s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('checkout_unavailable')));
      s.onerror = () => { loading = null; reject(new Error('checkout_unavailable')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export async function loadPassConfig(session) {
  const config = await apiJson('/pro/razorpay/config', { session });
  if (!config?.available) return null;
  return { cards: passCards(config.plans), passes: config.passes || [] };
}

/**
 * Pay for a pass. @returns {'active'|'pending'|'failed'|'cancelled'}
 * Throws only for problems before Checkout opened (network, server refusal).
 */
export async function buyPass(planKey, session, { email } = {}) {
  const [{ order }, Razorpay] = await Promise.all([
    apiJson('/pro/razorpay/order', { session, method: 'POST', body: { plan: planKey } }),
    loadCheckout(),
  ]);
  const result = await new Promise((resolve) => {
    const checkout = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'Vittova',
      description: order.label,
      prefill: email ? { email } : undefined,
      theme: { color: '#C2410C' },
      handler: (r) => resolve({ paid: r }),
      modal: { ondismiss: () => resolve({ cancelled: true }), confirm_close: true },
    });
    checkout.on('payment.failed', () => { /* Checkout lets the user retry; dismissal resolves */ });
    checkout.open();
  });
  if (result.cancelled) return 'cancelled';
  const body = await apiJson('/pro/razorpay/verify', {
    session,
    method: 'POST',
    body: { orderId: result.paid.razorpay_order_id, paymentId: result.paid.razorpay_payment_id, signature: result.paid.razorpay_signature },
  });
  return outcomeFromVerify(body);
}
