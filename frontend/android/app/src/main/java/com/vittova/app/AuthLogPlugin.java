package com.vittova.app;

import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * AuthLogPlugin — a trail of sign-in steps in logcat (tag VittovaAuth), in
 * release builds too, so a sign-in problem on a real phone can be diagnosed
 * with `adb logcat -s VittovaAuth`.
 *
 *   logEvent({ code }) -> {}
 *
 * Only the exact codes in AUTH_EVENTS are written: never a token, an
 * authorization code, a password, an email address or any other text.
 * This plugin takes no part in signing in.
 */
@CapacitorPlugin(name = "AuthLog")
public class AuthLogPlugin extends Plugin {

    static final String TAG = "VittovaAuth";

    /** The only texts logEvent will write (same list as src/lib/authLog.js). */
    static final Set<String> AUTH_EVENTS = new HashSet<>(Arrays.asList(
            "AUTH_START", "AUTH_OFFLINE", "AUTH_ALREADY_RUNNING", "AUTH_COMPLETE",
            "GOOGLE_BROWSER_OPENED", "GOOGLE_START_FAILED", "BROWSER_CLOSED",
            "BROWSER_CALLBACK_RECEIVED", "BROWSER_CALLBACK_DUPLICATE", "BROWSER_CALLBACK_INVALID",
            "BROWSER_CALLBACK_PROVIDER_ERROR", "CODE_EXCHANGE_FAILED",
            "SUPABASE_SESSION_CREATED", "SUPABASE_AUTH_FAILED", "SESSION_RESTORED", "SIGNED_OUT",
            "EMAIL_LOGIN_FAILED", "EMAIL_SIGNUP_FAILED", "EMAIL_RATE_LIMITED",
            "PROFILE_LOADED", "PROFILE_LOAD_FAILED",
            "AGE_REQUIRED", "AGE_SAVED", "AGE_SAVE_FAILED"));

    @PluginMethod
    public void logEvent(PluginCall call) {
        String code = call.getString("code");
        if (code != null && AUTH_EVENTS.contains(code)) trail(code);
        call.resolve();
    }

    /**
     * One line of the trail, for this app's own native code (GoogleAuthPlugin):
     * a fixed step name, at most with a code and Google's numeric status.
     * Some phones (vivo, for one) discard every app log line below ERROR; there
     * the line is written as an error so it can be read.
     */
    static void trail(String line) {
        int level = Log.isLoggable(TAG, Log.INFO) ? Log.INFO : Log.ERROR;
        Log.println(level, TAG, line);
    }
}
