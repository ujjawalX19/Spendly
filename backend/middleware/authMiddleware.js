const { supabase } = require('../config/supabase');

/**
 * Supabase JWT Auth Middleware — `protect`
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it against Supabase Auth, and attaches `req.user`
 * with the user's UUID and email.
 *
 * Supabase RLS uses the authenticated user's UUID automatically,
 * so no explicit DB lookup is needed here.
 *
 * Usage: router.get('/protected', protect, handler)
 */
const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer ')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized — no token provided'
        });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized — invalid or expired token'
        });
    }

    // Attach the Supabase user UUID and email to the request.
    // Controllers use req.user.id as the UUID for all Supabase queries.
    req.user = {
        id: data.user.id,
        email: data.user.email
    };

    next();
};

module.exports = { protect };
