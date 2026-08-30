require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { startBurnRateChecker } = require('./jobs/burnRateChecker');

const app = express();

// --- Security Headers via Helmet ---
app.use(helmet());

// --- CORS ---
// In production, restrict to known origins. Capacitor apps send no Origin header
// so null must be allowed. In dev, allow everything.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['*'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (Capacitor, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

app.use(express.json({ limit: '10mb' })); // 10mb for receipt images + PDF uploads

// --- Global Rate Limiter: 200 requests per 15 min ---
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
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

// --- Core Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/chatbot', require('./routes/chatbot'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/admin', require('./routes/admin'));

// --- v1 Feature Routes ---
app.use('/api/safe-to-spend', require('./routes/safeToSpend'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/burn-rate', require('./routes/burnRate'));
app.use('/api/pdf-import', require('./routes/pdfImport'));
app.use('/api/paisa-score', require('./routes/paisaScore'));
app.use('/api/streaks', require('./routes/streaks'));
app.use('/api/pro', require('./routes/pro'));
app.use('/api/account', require('./routes/account'));

// --- Serve frontend in production ---
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/dist')));
    app.get(/(.*)/, (req, res) => {
        res.sendFile(path.resolve(__dirname, '../frontend', 'dist', 'index.html'));
    });
} else {
    app.get('/', (req, res) => res.send('Spendly API Running 🚀'));
}

// --- Global Error Handler ---
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
    console.log(`🔥 v1 Features: Safe-to-Spend, Subscriptions, Burn Rate, PDF Import, Paisa Score, Streaks, Pro`);

    // Start daily burn-rate cron checker
    startBurnRateChecker();
});
