import { registerPlugin } from '@capacitor/core';

/**
 * PlayBilling — native bridge to Google Play Billing
 * (android/app/src/main/java/com/vittova/app/PlayBillingPlugin.java).
 *
 *   getProducts({ productIds })  -> { products: [{ productId, title, offers: [{ offerToken, basePlanId, offerId, price, billingPeriod }] }] }
 *   purchase({ productId, offerToken, obfuscatedAccountId })
 *                                -> { status: 'purchased'|'pending'|'cancelled'|'already_owned', purchases }
 *   getPurchases()               -> { purchases }
 *
 * Purchase: { purchaseToken, productIds, state: 'purchased'|'pending', acknowledged, orderId, obfuscatedAccountId }
 *
 * Nothing on the device grants Pro: every token goes to POST /api/pro/verify-purchase.
 */
export const PlayBilling = registerPlugin('PlayBilling');
