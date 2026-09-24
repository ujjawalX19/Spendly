package com.vittova.app;

import android.os.CancellationSignal;

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
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

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
 * Error codes for the web layer:
 *   CANCELLED     the user closed the picker (stay on the login screen)
 *   NO_CREDENTIAL no Google account available / not set up for this app
 *   INTERRUPTED   transient, retry
 *   FAILED        anything else (e.g. the Android OAuth client is missing)
 */
@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        String nonce = call.getString("nonce");
        if (serverClientId == null || serverClientId.isEmpty() || nonce == null || nonce.length() < 32) {
            call.reject("serverClientId and a hashed nonce are required", "FAILED");
            return;
        }

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
                                call.resolve(result);
                            } catch (Exception e) {
                                call.reject("Unreadable Google credential", "FAILED");
                            }
                        } else {
                            call.reject("Unexpected credential type", "FAILED");
                        }
                    }

                    @Override
                    public void onError(@NonNull GetCredentialException e) {
                        if (e instanceof GetCredentialCancellationException) call.reject("Cancelled", "CANCELLED");
                        else if (e instanceof NoCredentialException) call.reject("No Google account available", "NO_CREDENTIAL");
                        else if (e instanceof GetCredentialInterruptedException) call.reject("Interrupted", "INTERRUPTED");
                        // The message can name the failure type but never contains a token.
                        else call.reject(e.getType(), "FAILED");
                    }
                });
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
