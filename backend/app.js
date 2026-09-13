/**
 * Builds the Express application without starting a listener, so tests can
 * exercise the real middleware and routes. server.js is the entry point that
 * actually listens.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const { ipLimiter, authFailureLimiter, parseTrustProxy } = require('./middleware/rateLimits');

function createApp() {
    const app = express();
    const isProduction = process.env.NODE_ENV === 'production';

    // --- Proxy trust ---
    // Render terminates TLS at a load balancer and forwards the client address
    // in X-Forwarded-For. Without this, req.ip is the balancer for every user
    // and all rate limits become one shared bucket. Default to one trusted hop
    // in production; set TRUST_PROXY if the hosting topology differs (e.g. add
    // a CDN in front). Never set it to `true`: that lets clients spoof their IP.
    app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY ?? (isProduction ? '1' : 'loopback')));

    app.use(helmet());

    // --- CORS ---
    // Native Capacitor requests carry the https://localhost origin; requests
    // with no Origin (curl, server-to-server) are allowed because auth is by
    // bearer token, not cookies.
    const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
        : ['https://spendly-iota.vercel.app', 'http://localhost', 'http://localhost:5173', 'https://localhost'];

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            return callback(null, false);
        },
    }));

    // Small default body limit. The receipt scan route raises its own limit
    // for the image; everything else is small JSON.
    const smallJson = express.json({ limit: '100kb' });
    const receiptJson = express.json({ limit: '8mb' });
    app.use((req, res, next) => (
        req.method === 'POST' && req.path === '/api/expenses/scan' ? receiptJson : smallJson
    )(req, res, next));

    // --- Rate limiting (see middleware/rateLimits.js) ---
    app.use('/api/', ipLimiter);
    app.use('/api/', authFailureLimiter);

    app.get('/api/health', (req, res) => {
        const body = { status: 'ok', timestamp: new Date(), version: process.env.RENDER_GIT_COMMIT ? process.env.RENDER_GIT_COMMIT.slice(0, 7) : undefined };
        // ?diag=proxy shows how the server sees the caller's own address, so the
        // TRUST_PROXY setting can be verified after deployment. It only ever
        // reveals the requester's own IP back to them, plus proxy hop count.
        if (req.query.diag === 'proxy') {
            const xff = String(req.headers['x-forwarded-for'] || '');
            body.proxy = { ipSeen: req.ip, xffHops: xff ? xff.split(',').length : 0, trustProxy: app.get('trust proxy') === undefined ? null : String(app.get('trust proxy')) };
        }
        res.json(body);
    });

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/expenses', require('./routes/expenses'));
    app.use('/api/groups', require('./routes/groups'));
    app.use('/api/ai', require('./routes/ai'));
    app.use('/api/admin', require('./routes/admin'));
    app.use('/api/safe-to-spend', require('./routes/safeToSpend'));
    app.use('/api/subscriptions', require('./routes/subscriptions'));
    app.use('/api/burn-rate', require('./routes/burnRate'));
    app.use('/api/pdf-import', require('./routes/pdfImport'));
    app.use('/api/paisa-score', require('./routes/paisaScore'));
    app.use('/api/streaks', require('./routes/streaks'));
    app.use('/api/pro', require('./routes/pro'));
    app.use('/api/account', require('./routes/account'));
    app.use('/api/wealth', require('./routes/wealth'));

    // Unknown API routes are JSON 404s, never the SPA's index.html.
    app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Not found' }));

    const frontendDist = path.join(__dirname, '../frontend/dist');
    if (isProduction && fs.existsSync(path.join(frontendDist, 'index.html'))) {
        app.use(express.static(frontendDist));
        app.get(/(.*)/, (req, res) => {
            res.sendFile(path.resolve(__dirname, '../frontend', 'dist', 'index.html'));
        });
    } else {
        app.get('/', (req, res) => res.send('Spendly API running'));
    }

    // --- Global error handler ---
    app.use((err, req, res, _next) => {
        // Body parser errors carry their own 4xx status.
        const statusCode = err.status || err.statusCode || 500;
        if (statusCode >= 500) {
            // Never serialise request data, tokens, or provider responses into logs.
            console.error(`Unhandled ${statusCode} error: ${err.name || 'Error'}`);
        }
        const message = statusCode === 413
            ? 'That request is too large.'
            : statusCode < 500 && err.expose
                ? err.message
                : 'Internal server error';
        res.status(statusCode).json({
            success: false,
            message: isProduction || statusCode < 500 ? message : err.message,
        });
    });

    return app;
}

module.exports = { createApp };
