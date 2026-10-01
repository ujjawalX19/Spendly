package com.vittova.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The auth trail can only ever contain its fixed step codes. */
public class AuthLogPluginTest {

    @Test
    public void onlyFixedCodesCanBeWritten() {
        assertTrue(AuthLogPlugin.AUTH_EVENTS.contains("AUTH_START"));
        assertTrue(AuthLogPlugin.AUTH_EVENTS.contains("SUPABASE_SESSION_CREATED"));
        for (String code : AuthLogPlugin.AUTH_EVENTS) {
            assertTrue(code, code.matches("^[A-Z_]{3,40}$"));
        }
        // Nothing that could carry a token, a code or an address.
        assertFalse(AuthLogPlugin.AUTH_EVENTS.contains("eyJhbGciOiJIUzI1NiJ9.token"));
        assertFalse(AuthLogPlugin.AUTH_EVENTS.contains("someone@example.com"));
    }
}
