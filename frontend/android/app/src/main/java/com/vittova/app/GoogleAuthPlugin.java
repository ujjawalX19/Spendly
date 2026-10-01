package com.vittova.app;

import android.os.CancellationSignal;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialInterruptedException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialUnsupportedException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * GoogleAuthPlugin — native "Sign in with Google" through Android Credential
 * Manager, so the user never leaves Vittova for a browser.
 *
 *   signIn({ serverClientId, nonce }) -> { idToken }
 *       Shows Google's own account picker (bottom sheet) and returns a Google
 *       ID token whose audience is the Web client id and whose nonce is the
 *       SHA-256 the web layer passed. The web layer hands the token and the
 *       raw nonce to Supabase (signInWithIdToken), which verifies Google's
 *       signature, audience, expiry and nonce. The app never trusts an email
 *       or user id from here.
 *   signOut() -> {}
 *       Clears Credential Manager state so a later sign-in asks again.
 *
 *   logEvent({ code }) -> {}
 *       Writes one of the fixed AUTH_EVENTS codes to logcat (tag VittovaAuth),
 *       in release builds too, so a sign-in problem on a real phone can be
 *       diagnosed. Only those exact codes are accepted: never a token, an
 *       authorization code, an email address or any other text.
 *
 * Rejection codes for the web layer: see GoogleAuthErrors.
 */
@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    static final String TAG = "VittovaAuth";

    /** The only texts logEvent will write. */
    static final Set<String> AUTH_EVENTS = new HashSet<>(Arrays.asList(
            "AUTH_START", "GOOGLE_NATIVE_START", "GOOGLE_NATIVE_SUCCESS", "GOOGLE_NATIVE_FAILURE",
            "BROWSER_FALLBACK_STARTED", "BROWSER_FALLBACK_FAILED", "BROWSER_CLOSED",
            "BROWSER_CALLBACK_RECEIVED", "BROWSER_CALLBACK_DUPLICATE", "BROWSER_CALLBACK_INVALID",
            "BROWSER_CALLBACK_PROVIDER_ERROR", "CODE_EXCHANGE_FAILED",
            "SUPABASE_SESSION_CREATED", "SUPABASE_AUTH_FAILED", "AUTH_COMPLETE", "AUTH_CANCELLED",
            "AUTH_OFFLINE", "AUTH_ALREADY_RUNNING", "EMAIL_LOGIN_FAILED", "EMAIL_SIGNUP_FAILED",
            "EMAIL_RATE_LIMITED", "SIGNED_OUT", "SESSION_RESTORED",
            "AGE_REQUIRED", "AGE_SAVED", "AGE_SAVE_FAILED"));

    @PluginMethod
    public void logEvent(PluginCall call) {
        String code = call.getString("code");
        if (code != null && AUTH_EVENTS.contains(code)) trail(code);
        call.resolve();
    }

    /**
     * One line of the auth trail. Some phones (vivo, for one) discard every app
     * log line below ERROR; there the line is written as an error so the trail
     * can still be read with `adb logcat -s VittovaAuth`. Fixed codes only.
     */
    static void trail(String line) {
        int level = Log.isLoggable(TAG, Log.INFO) ? Log.INFO : Log.ERROR;
        Log.println(level, TAG, line);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        String nonce = call.getString("nonce");
        if (serverClientId == null || serverClientId.isEmpty() || nonce == null || nonce.length() < 32) {
            fail(call, GoogleAuthErrors.GOOGLE_AUTH_FAILED);
            return;
        }
        trail("GOOGLE_NATIVE_START");

        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId)
                .setNonce(nonce)
                .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .build();

        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(
                getActivity(),
                request,
                new CancellationSignal(),
                ContextCompat.getMainExecutor(getContext()),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        Credential credential = response.getCredential();
                        if (credential instanceof CustomCredential
                                && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                            try {
                                GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                                JSObject result = new JSObject();
                                // Only the token: Supabase derives the user from it.
                                result.put("idToken", google.getIdToken());
                                trail("GOOGLE_NATIVE_SUCCESS");
                                call.resolve(result);
                            } catch (Exception e) {
                                fail(call, GoogleAuthErrors.GOOGLE_AUTH_FAILED);
                            }
                        } else {
                            fail(call, GoogleAuthErrors.GOOGLE_AUTH_FAILED);
                        }
                    }

                    @Override
                    public void onError(@NonNull GetCredentialException e) {
                        GoogleAuthErrors.Kind kind;
                        if (e instanceof GetCredentialCancellationException) kind = GoogleAuthErrors.Kind.CANCELLATION;
                        else if (e instanceof NoCredentialException) kind = GoogleAuthErrors.Kind.NO_CREDENTIAL;
                        else if (e instanceof GetCredentialInterruptedException) kind = GoogleAuthErrors.Kind.INTERRUPTED;
                        else if (e instanceof GetCredentialProviderConfigurationException) kind = GoogleAuthErrors.Kind.PROVIDER_CONFIGURATION;
                        else if (e instanceof GetCredentialUnsupportedException) kind = GoogleAuthErrors.Kind.UNSUPPORTED;
                        else kind = GoogleAuthErrors.Kind.OTHER;
                        // The message decides between "the user cancelled" and "this
                        // build has no Android OAuth client"; it never holds a token
                        // and is not passed on or logged, only its classification.
                        fail(call, GoogleAuthErrors.classify(kind, e.getMessage()));
                    }
                });
    }

    /** Reject with a GoogleAuthErrors code; the code is also the (safe) log line. */
    private static void fail(PluginCall call, String code) {
        trail(GoogleAuthErrors.USER_CANCELLED.equals(code) ? "AUTH_CANCELLED" : "GOOGLE_NATIVE_FAILURE " + code);
        call.reject(code, code);
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        CredentialManager.create(getContext()).clearCredentialStateAsync(
                new ClearCredentialStateRequest(),
                new CancellationSignal(),
                ContextCompat.getMainExecutor(getContext()),
                new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override
                    public void onResult(Void unused) {
                        call.resolve();
                    }

                    @Override
                    public void onError(@NonNull ClearCredentialException e) {
                        // Signing out of Vittova must never fail because of this.
                        call.resolve();
                    }
                });
    }
}
