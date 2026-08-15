require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

// --- Security Headers via Helmet ---
// Replaces manual X-Content-Type-Options, X-Frame-Options, etc.
// Helmet sets 15+ secure headers automatically including CSP, HSTS, etc.
app.use(helmet());

// --- CORS ---
// Allow all origins for Capacitor mobile + web browser compatibility.
app.use(cors({ origin: '*', credentials: true }));

app.use(express.json({ limit: '5mb' })); // 5mb for receipt image uploads

// --- Global Rate Limiter: 100 requests per 15 min ---
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        message: 'Too many requests. Slow down, yaar.'
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', globalLimiter);

// --- Health Check (for Render / uptime monitors) ---
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// --- Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/chatbot', require('./routes/chatbot'));
app.use('/api/investments', require('./routes/investments'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/admin', require('./routes/admin'));

// --- Serve frontend in production ---
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/dist')));
    app.get(/(.*)/, (req, res) => {
        res.sendFile(path.resolve(__dirname, '../frontend', 'dist', 'index.html'));
    });
} else {
    app.get('/', (req, res) => res.send('FinDost API Running 🚀'));
}

// --- Global Error Handler ---
// Catches unhandled errors and strips stack traces in production.
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';

    console.error('Unhandled Error:', err);

    res.status(statusCode).json({
        success: false,
        message: isProduction ? 'Internal server error' : err.message,
        ...(isProduction ? {} : { stack: err.stack }),
    });
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Spendly API running on port ${PORT}`);
    console.log(`📦 Database: Supabase PostgreSQL`);
});
