package com.vittova.app;

import java.util.Locale;

/**
 * Turns Google's sign-in result into the code the web layer acts on.
 * No Android imports, so it is unit tested (GoogleAuthErrorsTest).
 *
 * The inputs are Google Play services' own status code and message, read from
 * the sign-in result (GoogleAuthPlugin). They are what make it possible to
 * tell "the user closed the sheet" from "Google refused this build": both
 * arrive as status 16 (CANCELED), but a refused build says
 * "Account reauth failed" (no Android OAuth client for this package and
 * signing certificate: UNREGISTERED_ON_API_CONSOLE in Google's log).
 *
 *   USER_CANCELLED             the user closed the sheet: stay on the login screen
 *   OAUTH_CONFIGURATION_ERROR  Google Cloud has no Android OAuth client for this
 *                              build's package + signing certificate (SHA-1)
 *   NETWORK_ERROR              Google could not be reached
 *   UNSUPPORTED                Google Play services missing or too old on this phone
 *   GOOGLE_AUTH_FAILED         anything else
 */
final class GoogleAuthErrors {

    static final String USER_CANCELLED = "USER_CANCELLED";
    static final String OAUTH_CONFIGURATION_ERROR = "OAUTH_CONFIGURATION_ERROR";
    static final String NETWORK_ERROR = "NETWORK_ERROR";
    static final String UNSUPPORTED = "UNSUPPORTED";
    static final String GOOGLE_AUTH_FAILED = "GOOGLE_AUTH_FAILED";

    // com.google.android.gms.common.api.CommonStatusCodes / GoogleSignInStatusCodes
    static final int SERVICE_MISSING = 1;
    static final int SERVICE_VERSION_UPDATE_REQUIRED = 2;
    static final int SERVICE_DISABLED = 3;
    static final int NETWORK = 7;
    static final int DEVELOPER_ERROR = 10;
    static final int TIMEOUT = 15;
    static final int CANCELED = 16;
    static final int API_NOT_CONNECTED = 17;
    static final int SIGN_IN_CANCELLED = 12501;

    private GoogleAuthErrors() { }

    /**
     * @param statusCode Google's status code; -1 when the sheet returned no result at all
     * @param message    Google's status message (may be null); never shown or logged
     */
    static String classify(int statusCode, String message) {
        String m = message == null ? "" : message.toLowerCase(Locale.ROOT);

        if (statusCode == DEVELOPER_ERROR || m.contains("reauth") || m.contains("unregistered_on_api_console")
                || m.contains("developer console") || m.contains("developer_error") || m.contains("28444")) {
            return OAUTH_CONFIGURATION_ERROR;
        }
        if (statusCode == NETWORK || statusCode == TIMEOUT || m.contains("network")) return NETWORK_ERROR;
        if (statusCode == SERVICE_MISSING || statusCode == SERVICE_VERSION_UPDATE_REQUIRED
                || statusCode == SERVICE_DISABLED || statusCode == API_NOT_CONNECTED) {
            return UNSUPPORTED;
        }
        if (statusCode == CANCELED || statusCode == SIGN_IN_CANCELLED || statusCode == -1) return USER_CANCELLED;
        return GOOGLE_AUTH_FAILED;
    }
}
