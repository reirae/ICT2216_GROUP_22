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

// Fail fast if required secrets are missing or left as insecure defaults.
// Silently falling back to a hardcoded value (e.g. 'change-me') means anyone
// who reads the public repo knows exactly what secret a misconfigured
// deployment is using. Better to crash loudly at startup than run insecurely.
// IMPORTANT: this must run BEFORE the route modules below are required —
// routes/auth.js reads process.env.DB_ENCRYPTION_KEY at module load time,
// so it needs to already be validated by then.
const REQUIRED_SECRETS = {
  SESSION_SECRET: { minLength: 32, insecureValues: ['change-me'] },
  DB_ENCRYPTION_KEY: {
    minLength: 64, // 32 bytes as hex
    insecureValues: ['0'.repeat(64)],
    validate: (v) => /^[0-9a-fA-F]{64}$/.test(v) || 'must be a 64-character hex string (32 bytes)',
  },
};

for (const [name, rule] of Object.entries(REQUIRED_SECRETS)) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Set it in your .env file before starting the app.`);
  }
  if (rule.minLength && value.length < rule.minLength) {
    throw new Error(`Environment variable ${name} is too short (min ${rule.minLength} chars).`);
  }
  if (rule.insecureValues && rule.insecureValues.includes(value)) {
    throw new Error(`Environment variable ${name} is set to a known insecure default value. Generate a real secret.`);
  }
  if (rule.validate) {
    const result = rule.validate(value);
    if (result !== true) {
      throw new Error(`Environment variable ${name} is invalid: ${result}`);
    }
  }
}

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
      frameSrc: ["https://challenges.cloudflare.com"], // Turnstile renders in an iframe
      connectSrc: ["'self'", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'"], // needed if using inline styles (e.g. styled-components, CSS-in-JS)
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"], // prevents clickjacking via iframe embedding
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
}));
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
  secret: process.env.SESSION_SECRET,
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