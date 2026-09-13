# Premium entitlement and billing architecture

Status (2026-09-13): **entitlement enforcement is implemented; billing is not.**
Spendly Pro cannot be purchased. The app shows "coming soon" with no price and
no purchase button, and every purchase endpoint returns `501 BILLING_NOT_AVAILABLE`.

## Principle

```
Google Play purchase ──► backend verifies with Google ──► backend stores entitlement ──► app reads it
```

Never:

```
button tapped ──► is_pro = true
client sends { is_pro: true } ──► accepted
```

## What exists today (entitlement side)

| Piece | Where | Guarantee |
|---|---|---|
| Entitlement record | `profiles.is_pro`, `profiles.pro_expires_at` | A cache of a verified entitlement. |
| Write protection | `supabase/v1_2_security_p0.sql` | Clients (anon/authenticated keys) have **no UPDATE/INSERT privilege** on any table. Only the service-role backend can write. Proven by `supabase/tests/rls.test.mjs`. |
| No API accepts entitlement | all routes | Profile edit endpoints use `.strict()` Zod schemas; `is_pro`, `pro_expires_at`, `role` in a body → 400. Proven by `backend/tests/security.test.js`. |
| Single decision function | `backend/lib/entitlements.js` → `hasActivePro(profile, now)` | Pro only if `is_pro === true` and not expired. Used by `proGate`, `/api/pro/status`. |
| Enforcement | `backend/middleware/proGate.js` | Pro-only features → 403 `PRO_REQUIRED`; free quotas reserved atomically → 429 `QUOTA_EXCEEDED`; paid features fail closed if the DB can't be read. |
| Purchase switch | `backend/lib/entitlements.js` → `purchasesEnabled()` | Hard-coded `false`. No env var can turn it on. |
| Client | `frontend/src/contexts/ProContext.jsx`, `ProUpgrade.jsx` | Display only. Shows server-reported limits; never grants anything. |

## What must be built before Pro can be sold

1. **Play Console:** create the subscription product(s) (e.g.
   `spendly_pro_monthly`) with base plans and prices. *(Manual.)*
2. **Android client:** integrate Google Play Billing Library (directly via a
   small Capacitor plugin, or a maintained plugin/RevenueCat SDK). Set
   `obfuscatedAccountId` to a hash of the Spendly user id so purchases are tied
   to the account. The client sends only the **purchase token** to the backend.
3. **Backend verification endpoint** (replace the 501 stub in
   `routes/pro.js`):
   - authenticate the user (`protect`);
   - call the Google Play Developer API
     `purchases.subscriptionsv2.get(packageName, token)` with a service account
     that has *View financial data* access;
   - check `subscriptionState` is ACTIVE/GRACE, the product id is known,
     `externalAccountIdentifiers.obfuscatedExternalAccountId` matches the user,
     and the token is not already bound to another account;
   - store an **entitlements** row (user_id, product_id, purchase_token hash,
     state, expiry, source=`play`) and update `is_pro` / `pro_expires_at`;
   - **acknowledge** the purchase within 3 days (or it is refunded).
4. **Real-time developer notifications (RTDN):** Pub/Sub push endpoint that
   verifies the Google-signed JWT, then re-queries the Developer API for
   renewals, cancellations, expiry, grace period, account hold, revocation and
   refunds, updating the entitlement. Never trust the notification body alone.
5. **Periodic reconciliation job** for missed notifications.
6. **Restore purchases** on reinstall/new device: client queries existing
   purchases and re-submits tokens for verification.
7. **Tests:** forged token rejected; token reused on another account rejected;
   expired subscription loses Pro; refund/revocation removes Pro; client body
   `is_pro` ignored (exists).
8. Update `purchasesEnabled()`, `ProUpgrade.jsx`, Terms of Service, Privacy
   Policy (Google Play Billing becomes a processor), and the Play Data safety
   form, all in the same release.

## Streak freezes

`streak_freezes_remaining` is server-owned and currently can only be granted
manually. Any future purchase of freezes follows the same verified flow
(consumable products, consumed server-side after verification).
