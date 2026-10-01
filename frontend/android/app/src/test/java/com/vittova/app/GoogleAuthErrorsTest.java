package com.vittova.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.vittova.app.GoogleAuthErrors.Kind;

import org.junit.Test;

/** What the app does with each native Google sign-in failure. */
public class GoogleAuthErrorsTest {

    @Test
    public void theUserClosingThePickerIsACancellation() {
        assertEquals("USER_CANCELLED", GoogleAuthErrors.classify(Kind.CANCELLATION, "activity is cancelled by the user."));
        assertEquals("USER_CANCELLED", GoogleAuthErrors.classify(Kind.CANCELLATION, "[16] Cancelled by user."));
        assertEquals("USER_CANCELLED", GoogleAuthErrors.classify(Kind.CANCELLATION, null));
    }

    @Test
    public void accountReauthFailedIsAConfigurationErrorNotACancellation() {
        // Seen on a vivo with the upload-key APK and no matching Android OAuth
        // client: Credential Manager delivers this as a cancellation.
        assertEquals("OAUTH_CONFIGURATION_ERROR", GoogleAuthErrors.classify(Kind.CANCELLATION, "[16] Account reauth failed."));
    }

    @Test
    public void anUnregisteredAppIsAConfigurationError() {
        assertEquals("OAUTH_CONFIGURATION_ERROR",
            GoogleAuthErrors.classify(Kind.OTHER, "Unknown error [status=UNREGISTERED_ON_API_CONSOLE]."));
        assertEquals("OAUTH_CONFIGURATION_ERROR",
            GoogleAuthErrors.classify(Kind.OTHER, "[28444] Developer console is not set up correctly."));
        assertEquals("OAUTH_CONFIGURATION_ERROR", GoogleAuthErrors.classify(Kind.OTHER, "10: DEVELOPER_ERROR"));
        assertEquals("OAUTH_CONFIGURATION_ERROR", GoogleAuthErrors.classify(Kind.PROVIDER_CONFIGURATION, "provider missing"));
    }

    @Test
    public void aNetworkFailureAsksForARetryInsteadOfOpeningABrowser() {
        assertEquals("NETWORK_ERROR", GoogleAuthErrors.classify(Kind.OTHER, "[7] A network error occurred."));
        assertEquals("NETWORK_ERROR", GoogleAuthErrors.classify(Kind.CANCELLATION, "NETWORK_ERROR"));
        assertEquals("NETWORK_ERROR", GoogleAuthErrors.classify(Kind.OTHER, "[15] Timeout"));
        // "[17]" (API not connected) is not "[7]".
        assertEquals("GOOGLE_AUTH_FAILED", GoogleAuthErrors.classify(Kind.OTHER, "[17] API not connected"));
    }

    @Test
    public void theOtherFailuresKeepTheirOwnCodes() {
        assertEquals("NO_CREDENTIAL", GoogleAuthErrors.classify(Kind.NO_CREDENTIAL, "No credentials available"));
        assertEquals("INTERRUPTED", GoogleAuthErrors.classify(Kind.INTERRUPTED, "interrupted"));
        assertEquals("UNSUPPORTED", GoogleAuthErrors.classify(Kind.UNSUPPORTED, "not supported"));
        assertEquals("GOOGLE_AUTH_FAILED", GoogleAuthErrors.classify(Kind.OTHER, "something else"));
        assertEquals("GOOGLE_AUTH_FAILED", GoogleAuthErrors.classify(Kind.OTHER, null));
    }

    @Test
    public void theAuthLogOnlyAcceptsItsFixedCodes() {
        assertTrue(GoogleAuthPlugin.AUTH_EVENTS.contains("AUTH_START"));
        assertTrue(GoogleAuthPlugin.AUTH_EVENTS.contains("SUPABASE_SESSION_CREATED"));
        for (String code : GoogleAuthPlugin.AUTH_EVENTS) {
            assertTrue(code, code.matches("^[A-Z_]{3,40}$"));
        }
        // Nothing that could carry a token, a code or an address.
        assertFalse(GoogleAuthPlugin.AUTH_EVENTS.contains("eyJhbGciOiJIUzI1NiJ9.token"));
        assertFalse(GoogleAuthPlugin.AUTH_EVENTS.contains("someone@example.com"));
    }
}
