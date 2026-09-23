package com.vittova.app;

import android.util.Log;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * PlayBillingPlugin — the device side of Vittova Pro purchases.
 *
 * It never decides who is Pro. It only:
 *   getProducts({ productIds })            -> { products: [{ productId, title, offers: [{ offerToken, basePlanId, offerId, price, billingPeriod }] }] }
 *   purchase({ productId, offerToken, obfuscatedAccountId })
 *                                           -> { status: 'purchased'|'pending'|'cancelled', purchases: [...] }
 *   getPurchases()                          -> { purchases: [...] }   (restore)
 * Each purchase is { purchaseToken, productIds, state, acknowledged, orderId, obfuscatedAccountId }.
 *
 * The web layer sends each purchaseToken to POST /api/pro/verify-purchase;
 * the backend checks it with Google, binds it to the account (the
 * obfuscatedAccountId comes from the backend) and acknowledges it. Prices come
 * from Google Play, never from the app.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin {

    private static final String TAG = "PlayBilling";

    private BillingClient client;
    private final Map<String, ProductDetails> productCache = new HashMap<>();
    private PluginCall pendingPurchaseCall;

    private final PurchasesUpdatedListener purchasesUpdated = (billingResult, purchases) -> {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        if (call == null) return;
        int code = billingResult.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            boolean anyPending = false;
            for (Purchase p : purchases) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) anyPending = true;
            }
            JSObject result = new JSObject();
            result.put("status", anyPending ? "pending" : "purchased");
            result.put("purchases", toJs(purchases));
            call.resolve(result);
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject result = new JSObject();
            result.put("status", "cancelled");
            result.put("purchases", new JSArray());
            call.resolve(result);
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            JSObject result = new JSObject();
            result.put("status", "already_owned");
            result.put("purchases", new JSArray());
            call.resolve(result);
        } else {
            call.reject(billingResult.getDebugMessage(), String.valueOf(code));
        }
    };

    @Override
    public void load() {
        super.load();
        client = BillingClient.newBuilder(getContext())
                .setListener(purchasesUpdated)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enablePrepaidPlans().build())
                .enableAutoServiceReconnection()
                .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) client.endConnection();
        super.handleOnDestroy();
    }

    private interface Ready { void run(); }

    private void whenReady(PluginCall call, Ready ready) {
        if (client.isReady()) {
            ready.run();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) ready.run();
                else call.reject("Google Play Billing is not available on this device.", String.valueOf(result.getResponseCode()));
            }

            @Override
            public void onBillingServiceDisconnected() {
                Log.w(TAG, "Billing service disconnected");
            }
        });
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray ids = call.getArray("productIds");
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        try {
            for (int i = 0; ids != null && i < ids.length(); i++) {
                products.add(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(ids.getString(i))
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build());
            }
        } catch (Exception e) {
            call.reject("productIds must be a list of strings");
            return;
        }
        if (products.isEmpty()) {
            call.reject("productIds is required");
            return;
        }
        whenReady(call, () -> client.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                (billingResult, detailsResult) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject(billingResult.getDebugMessage(), String.valueOf(billingResult.getResponseCode()));
                        return;
                    }
                    JSArray out = new JSArray();
                    for (ProductDetails pd : detailsResult.getProductDetailsList()) {
                        productCache.put(pd.getProductId(), pd);
                        JSObject p = new JSObject();
                        p.put("productId", pd.getProductId());
                        p.put("title", pd.getName());
                        JSArray offers = new JSArray();
                        List<ProductDetails.SubscriptionOfferDetails> details = pd.getSubscriptionOfferDetails();
                        if (details != null) {
                            for (ProductDetails.SubscriptionOfferDetails o : details) {
                                JSObject offer = new JSObject();
                                offer.put("offerToken", o.getOfferToken());
                                offer.put("basePlanId", o.getBasePlanId());
                                offer.put("offerId", o.getOfferId());
                                List<ProductDetails.PricingPhase> phases = o.getPricingPhases().getPricingPhaseList();
                                if (!phases.isEmpty()) {
                                    ProductDetails.PricingPhase last = phases.get(phases.size() - 1);
                                    offer.put("price", last.getFormattedPrice());
                                    offer.put("billingPeriod", last.getBillingPeriod());
                                }
                                offers.put(offer);
                            }
                        }
                        p.put("offers", offers);
                        out.put(p);
                    }
                    JSObject result = new JSObject();
                    result.put("products", out);
                    call.resolve(result);
                }));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String offerToken = call.getString("offerToken");
        String accountId = call.getString("obfuscatedAccountId");
        ProductDetails details = productId == null ? null : productCache.get(productId);
        if (details == null || offerToken == null || accountId == null || accountId.isEmpty()) {
            call.reject("Load products first, then pass productId, offerToken and obfuscatedAccountId.");
            return;
        }
        if (pendingPurchaseCall != null) {
            call.reject("A purchase is already in progress.");
            return;
        }
        whenReady(call, () -> {
            BillingFlowParams params = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                    .setProductDetails(details)
                                    .setOfferToken(offerToken)
                                    .build()))
                    // Binds the purchase to this Vittova account; the backend rejects a mismatch.
                    .setObfuscatedAccountId(accountId)
                    .build();
            pendingPurchaseCall = call;
            BillingResult launch = client.launchBillingFlow(getActivity(), params);
            if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                pendingPurchaseCall = null;
                call.reject(launch.getDebugMessage(), String.valueOf(launch.getResponseCode()));
            }
        });
    }

    @PluginMethod
    public void getPurchases(PluginCall call) {
        whenReady(call, () -> client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (billingResult, purchases) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject(billingResult.getDebugMessage(), String.valueOf(billingResult.getResponseCode()));
                        return;
                    }
                    JSObject result = new JSObject();
                    result.put("purchases", toJs(purchases));
                    call.resolve(result);
                }));
    }

    private static JSArray toJs(List<Purchase> purchases) {
        JSArray out = new JSArray();
        if (purchases == null) return out;
        for (Purchase p : purchases) {
            JSObject o = new JSObject();
            o.put("purchaseToken", p.getPurchaseToken());
            o.put("productIds", new JSArray(p.getProducts()));
            o.put("state", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased"
                    : p.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending" : "unspecified");
            o.put("acknowledged", p.isAcknowledged());
            o.put("orderId", p.getOrderId());
            if (p.getAccountIdentifiers() != null) o.put("obfuscatedAccountId", p.getAccountIdentifiers().getObfuscatedAccountId());
            out.put(o);
        }
        return out;
    }
}
