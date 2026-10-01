package com.vittova.app;

import java.util.Locale;

/**
 * Turns a Credential Manager failure into the code the web layer acts on.
 * No Android imports, so it is unit tested (GoogleAuthErrorsTest).
 *
 * Credential Manager only tells us the exception class and Google Play
 * services' message. The message matters: Google reports "no Android OAuth
 * client matches this package and signing certificate" as a CANCELLATION
 * ("[16] Account reauth failed."), which is not the user closing the picker.
 *
 *   USER_CANCELLED             the user closed the picker: stay on the login screen
 *   OAUTH_CONFIGURATION_ERROR  no Android OAuth client for this build's package and
 *                              signing certificate (Google Cloud Console), or the
 *                              provider is misconfigured: use the browser sign-in
 *   NO_CREDENTIAL              no Google account on the phone: use the browser sign-in
 *   NETWORK_ERROR              Google could not be reached: ask to retry
 *   INTERRUPTED                transient: ask to retry
 *   UNSUPPORTED                Credential Manager / Play services unavailable: browser
 *   GOOGLE_AUTH_FAILED         anything else: browser
 */
final class GoogleAuthErrors {

    /** Which Credential Manager exception was thrown. */
    enum Kind { CANCELLATION, NO_CREDENTIAL, INTERRUPTED, PROVIDER_CONFIGURATION, UNSUPPORTED, OTHER }

    static final String USER_CANCELLED = "USER_CANCELLED";
    static final String OAUTH_CONFIGURATION_ERROR = "OAUTH_CONFIGURATION_ERROR";
    static final String NO_CREDENTIAL = "NO_CREDENTIAL";
    static final String NETWORK_ERROR = "NETWORK_ERROR";
    static final String INTERRUPTED = "INTERRUPTED";
    static final String UNSUPPORTED = "UNSUPPORTED";
    static final String GOOGLE_AUTH_FAILED = "GOOGLE_AUTH_FAILED";

    private GoogleAuthErrors() { }

    static String classify(Kind kind, String message) {
        String m = message == null ? "" : message.toLowerCase(Locale.ROOT);

        // Play services status texts for a missing or mismatched Android OAuth client.
        if (m.contains("reauth") || m.contains("unregistered_on_api_console") || m.contains("developer console")
                || m.contains("developer_error") || m.contains("[28444]") || m.contains("[10]")) {
            return OAUTH_CONFIGURATION_ERROR;
        }
        if (m.contains("network") || m.contains("[7]") || m.contains("timeout") || m.contains("[15]")) {
            return NETWORK_ERROR;
        }
        switch (kind) {
            case CANCELLATION: return USER_CANCELLED;
            case NO_CREDENTIAL: return NO_CREDENTIAL;
            case INTERRUPTED: return INTERRUPTED;
            case PROVIDER_CONFIGURATION: return OAUTH_CONFIGURATION_ERROR;
            case UNSUPPORTED: return UNSUPPORTED;
            default: return GOOGLE_AUTH_FAILED;
        }
    }
}
