require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const compression = require('compression');

const { generalLimiter } = require('./middleware/rateLimiter');
const { verifyCsrfToken } = require('./middleware/csrf');
const { validateSessionPathContext } = require('./middleware/validation');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(cookieParser());

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.use(session({
  name: process.env.SESSION_COOKIE_NAME || 'securebank.sid',
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging',
    maxAge: Number(process.env.SESSION_MAX_AGE_MS || 15 * 60 * 1000),
    // Only restrict path and domain if explicitly deployed to production/staging
    // Keeps local development working flawlessly on localhost/127.0.0.1
    ...(process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
      ? { path: '/api', domain: process.env.COOKIE_DOMAIN }
      : {}
    ),
  },
}));

app.use(generalLimiter);

// Anti-CSRF Framework: verify a session-bound token on every
// state-changing request (see middleware/csrf.js for the exemption
// list covering pre-authentication endpoints).
app.use(verifyCsrfToken);

// Backend Session Gatekeeper: Intercepts multi-tab session switching/cross-pollination
app.use(validateSessionPathContext);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes.router);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;