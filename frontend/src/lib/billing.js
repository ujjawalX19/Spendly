/**
 * billing — the app's half of Vittova Pro purchases.
 *
 * The app starts a Google Play purchase and hands the purchase token to the
 * backend (POST /api/pro/verify-purchase). The backend verifies it with Google
 * and is the only thing that can grant Pro. Prices shown are Google Play's
 * own formatted prices; the app never hard-codes one.
 */

import { Capacitor } from '@capacitor/core';
import { apiJson } from './apiConfig';
import { PlayBilling } from '../plugins/PlayBilling';
import { planCards, tokensToVerify } from './billingPlan';

export { periodLabel, pickPlan, planCards, describeOffer, tokensToVerify } from './billingPlan';

export const MANAGE_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions?package=com.vittova.app';

export const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/**
 * The paywall's plan cards: plans the server allows, matched to what Google
 * Play returned for this user, with Google's prices. Null when Pro cannot be
 * bought here (web, or billing switched off).
 */
export async function loadPlans(session) {
  if (!isAndroidApp()) return null;
  const config = await apiJson('/pro/billing-config', { session });
  if (!config.purchasesAvailable) return null;
  const { products } = await PlayBilling.getProducts({ productIds: config.productIds });
  const cards = planCards(products, config.plans || []);
  return { cards, obfuscatedAccountId: config.obfuscatedAccountId };
}

async function verifyAll(tokens, session) {
  let last = null;
  for (const purchaseToken of tokens) {
    last = await apiJson('/pro/verify-purchase', { session, method: 'POST', body: { purchaseToken } });
  }
  return last;
}

/** @returns {'active'|'pending'|'cancelled'|'not_active'} */
export async function subscribe(card, obfuscatedAccountId, session) {
  const result = await PlayBilling.purchase({ productId: card.productId, offerToken: card.offerToken, obfuscatedAccountId });
  if (result.status === 'cancelled') return 'cancelled';
  if (result.status === 'pending') return 'pending';
  const tokens = result.status === 'already_owned'
    ? tokensToVerify((await PlayBilling.getPurchases()).purchases)
    : tokensToVerify(result.purchases);
  const verified = await verifyAll(tokens, session);
  return verified?.pro?.isPro ? 'active' : 'not_active';
}

/** Restore: send every completed subscription on this Google account to the server. */
export async function restorePurchases(session) {
  const { purchases } = await PlayBilling.getPurchases();
  const tokens = tokensToVerify(purchases);
  if (!tokens.length) return 'none';
  const verified = await verifyAll(tokens, session);
  return verified?.pro?.isPro ? 'active' : 'not_active';
}
