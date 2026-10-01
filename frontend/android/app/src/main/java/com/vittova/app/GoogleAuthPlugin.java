package com.vittova.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.GetSignInIntentRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.SignInClient;
import com.google.android.gms.auth.api.identity.SignInCredential;
import com.google.android.gms.common.api.ApiException;

/**
 * GoogleAuthPlugin — "Sign in with Google" inside the app: Google's own account
 * sheet opens over Vittova and the user never leaves for a browser.
 *
 *   signIn({ serverClientId, nonce }) -> { idToken }
 *       Shows Google's sheet and returns a Google ID token whose audience is the
 *       Web client id and whose nonce is the SHA-256 the web layer passed. The
 *       web layer gives the token and the raw nonce to Supabase
 *       (signInWithIdToken), which verifies Google's signature, audience,
 *       expiry and nonce. The app never trusts an email or user id from here.
 *   signOut() -> {}
 *       So the next sign-in asks which account again.
 *
 * Why Google's Identity sign-in intent and not androidx Credential Manager:
 * Credential Manager's Play-services bridge discards Google's status whenever
 * the sheet returns "cancelled" and reports the fixed text "activity is
 * cancelled by the user". A build Google refuses (no Android OAuth client for
 * its package + signing certificate) also returns "cancelled", so the two were
 * indistinguishable and "Continue with Google" silently did nothing (seen on a
 * vivo, 1 Oct 2026). Reading the result here keeps Google's real status and
 * message, which GoogleAuthErrors turns into a code.
 *
 * Rejection codes: see GoogleAuthErrors. Only the code and Google's numeric
 * status go to logcat (tag VittovaAuth); never the token or the message.
 */
@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;

    @Override
    public void load() {
        super.load();
        // Must be registered while the activity is being created.
        launcher = getActivity().registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(), this::onSheetResult);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        String nonce = call.getString("nonce");
        if (serverClientId == null || serverClientId.isEmpty() || nonce == null || nonce.length() < 32) {
            fail(call, GoogleAuthErrors.GOOGLE_AUTH_FAILED, 0);
            return;
        }
        if (pending != null) {
            // One sheet at a time; the web layer already prevents this.
            fail(call, GoogleAuthErrors.GOOGLE_AUTH_FAILED, 0);
            return;
        }
        AuthLogPlugin.trail("GOOGLE_NATIVE_START");
        GetSignInIntentRequest request = GetSignInIntentRequest.builder()
                .setServerClientId(serverClientId)
                .setNonce(nonce)
                .build();
        client().getSignInIntent(request)
                .addOnSuccessListener((PendingIntent sheet) -> {
                    try {
                        pending = call;
                        launcher.launch(new IntentSenderRequest.Builder(sheet.getIntentSender()).build());
                    } catch (Exception e) {
                        pending = null;
                        fail(call, GoogleAuthErrors.GOOGLE_AUTH_FAILED, 0);
                    }
                })
                .addOnFailureListener((Exception e) -> failWith(call, e));
    }

    private void onSheetResult(ActivityResult result) {
        PluginCall call = pending;
        pending = null;
        if (call == null) return;

        Intent data = result.getData();
        if (data == null) {
            // Backed out with no result at all.
            fail(call, GoogleAuthErrors.classify(result.getResultCode() == Activity.RESULT_CANCELED ? GoogleAuthErrors.CANCELED : -1, null),
                    GoogleAuthErrors.CANCELED);
            return;
        }
        try {
            // Reads Google's Status from the result even when the sheet reported
            // "cancelled": that is where a refused build is told apart.
            SignInCredential credential = client().getSignInCredentialFromIntent(data);
            String idToken = credential.getGoogleIdToken();
            if (idToken == null || idToken.isEmpty()) {
                fail(call, GoogleAuthErrors.GOOGLE_AUTH_FAILED, 0);
                return;
            }
            JSObject out = new JSObject();
            // Only the token: Supabase derives the user from it.
            out.put("idToken", idToken);
            AuthLogPlugin.trail("GOOGLE_NATIVE_SUCCESS");
            call.resolve(out);
        } catch (Exception e) {
            failWith(call, e);
        }
    }

    private void failWith(PluginCall call, Exception e) {
        if (e instanceof ApiException) {
            ApiException api = (ApiException) e;
            fail(call, GoogleAuthErrors.classify(api.getStatusCode(), api.getMessage()), api.getStatusCode());
        } else {
            fail(call, GoogleAuthErrors.GOOGLE_AUTH_FAILED, 0);
        }
    }

    /** Reject with a GoogleAuthErrors code. The log line holds the code and Google's numeric status only. */
    private static void fail(PluginCall call, String code, int status) {
        AuthLogPlugin.trail(GoogleAuthErrors.USER_CANCELLED.equals(code)
                ? "GOOGLE_NATIVE_CANCELLED"
                : "GOOGLE_NATIVE_FAILURE " + code + " status=" + status);
        call.reject(code, code);
    }

    private SignInClient client() {
        return Identity.getSignInClient(getActivity());
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        try {
            // Signing out of Vittova must never fail because of this.
            client().signOut().addOnCompleteListener(task -> call.resolve());
        } catch (Exception e) {
            call.resolve();
        }
    }
}
