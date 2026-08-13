const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
        '❌ Missing Supabase config. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.'
    );
}

// Admin client: uses service role key so it can verify JWTs and
// perform privileged writes (e.g. profile updates after expense logging).
// autoRefreshToken and persistSession MUST be false for a server-side client.
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

module.exports = { supabase };
