package com.vittova.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** What the app does with each result of Google's in-app sign-in sheet. */
public class GoogleAuthErrorsTest {

    @Test
    public void theUserClosingTheSheetIsACancellation() {
        assertEquals("USER_CANCELLED", GoogleAuthErrors.classify(16, "16: Cancelled by the user."));
        assertEquals("USER_CANCELLED", GoogleAuthErrors.classify(16, null));
        assertEquals("USER_CANCELLED", GoogleAuthErrors.classify(12501, "12501: "));
        // Backed out with no result at all.
        assertEquals("USER_CANCELLED", GoogleAuthErrors.classify(-1, null));
    }

    @Test
    public void aBuildGoogleRefusesIsAConfigurationErrorEvenThoughItArrivesAsCancelled() {
        // Seen on a vivo with the upload-key APK and no matching Android OAuth
        // client: status 16, the same as a real cancellation, but this message.
        assertEquals("OAUTH_CONFIGURATION_ERROR", GoogleAuthErrors.classify(16, "16: Account reauth failed."));
        assertEquals("OAUTH_CONFIGURATION_ERROR", GoogleAuthErrors.classify(16, "[16] Account reauth failed."));
        assertEquals("OAUTH_CONFIGURATION_ERROR", GoogleAuthErrors.classify(8, "Unknown error [status=UNREGISTERED_ON_API_CONSOLE]."));
        assertEquals("OAUTH_CONFIGURATION_ERROR", GoogleAuthErrors.classify(10, "10: "));
        assertEquals("OAUTH_CONFIGURATION_ERROR", GoogleAuthErrors.classify(0, "[28444] Developer console is not set up correctly."));
    }

    @Test
    public void aNetworkFailureIsNotAConfigurationProblem() {
        assertEquals("NETWORK_ERROR", GoogleAuthErrors.classify(7, "7: "));
        assertEquals("NETWORK_ERROR", GoogleAuthErrors.classify(15, "15: Timeout"));
        assertEquals("NETWORK_ERROR", GoogleAuthErrors.classify(8, "A network error occurred"));
    }

    @Test
    public void aPhoneWithoutGooglePlayServicesIsUnsupported() {
        assertEquals("UNSUPPORTED", GoogleAuthErrors.classify(1, "SERVICE_MISSING"));
        assertEquals("UNSUPPORTED", GoogleAuthErrors.classify(2, "SERVICE_VERSION_UPDATE_REQUIRED"));
        assertEquals("UNSUPPORTED", GoogleAuthErrors.classify(3, "SERVICE_DISABLED"));
        assertEquals("UNSUPPORTED", GoogleAuthErrors.classify(17, "17: API not connected"));
    }

    @Test
    public void anythingElseIsAGenericGoogleFailure() {
        assertEquals("GOOGLE_AUTH_FAILED", GoogleAuthErrors.classify(8, "8: Internal error"));
        assertEquals("GOOGLE_AUTH_FAILED", GoogleAuthErrors.classify(13, null));
        assertEquals("GOOGLE_AUTH_FAILED", GoogleAuthErrors.classify(0, null));
    }
}
