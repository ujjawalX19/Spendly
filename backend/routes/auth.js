const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// --- Strict Auth Rate Limiter: 10 requests per 1 hour ---
// Prevents brute-force attacks on login/signup endpoints.
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: {
        success: false,
        message: 'Too many auth attempts. Try again in an hour, bro.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

router.use(authLimiter);

// --- Helper: Format validation errors ---
const handleValidationErrors = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
        });
    }
    return null;
};

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user via Supabase Auth
 * @access  Public
 */
router.post(
    '/signup',
    [
        body('name')
            .trim()
            .notEmpty().withMessage('Name is required')
            .isLength({ max: 50 }).withMessage('Name cannot exceed 50 characters'),
        body('email')
            .trim()
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Please provide a valid email')
            .normalizeEmail(),
        body('password')
            .notEmpty().withMessage('Password is required')
            .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ],
    async (req, res) => {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { name, email, password } = req.body;

        try {
            // Supabase Auth handles password hashing.
            // full_name is stored in user_metadata and picked up by
            // the handle_new_user trigger to populate public.profiles.
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: name }
                }
            });

            if (error) {
                // Supabase returns a specific message for duplicate emails
                if (error.message.toLowerCase().includes('already registered')) {
                    return res.status(409).json({
                        success: false,
                        message: 'Account already exists with this email'
                    });
                }
                return res.status(400).json({ success: false, message: error.message });
            }

            res.status(201).json({
                success: true,
                message: 'Signup successful. Please verify your email if required.',
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    full_name: name
                },
                session: data.session
            });
        } catch (error) {
            console.error('Signup Error:', error);
            res.status(500).json({ success: false, message: 'Server error during signup' });
        }
    }
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return Supabase session
 * @access  Public
 */
router.post(
    '/login',
    [
        body('email')
            .trim()
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Please provide a valid email')
            .normalizeEmail(),
        body('password')
            .notEmpty().withMessage('Password is required')
    ],
    async (req, res) => {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { email, password } = req.body;

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            res.json({
                success: true,
                user: {
                    id: data.user.id,
                    email: data.user.email
                },
                session: data.session
            });
        } catch (error) {
            console.error('Login Error:', error);
            res.status(500).json({ success: false, message: 'Server error during login' });
        }
    }
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user's profile from public.profiles
 * @access  Protected
 */
router.get('/me', protect, async (req, res) => {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (error) {
            return res.status(404).json({ success: false, message: 'Profile not found' });
        }

        res.json({ success: true, user: profile });
    } catch (error) {
        console.error('Get Profile Error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching profile' });
    }
});

module.exports = router;
