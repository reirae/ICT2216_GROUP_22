require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const compression = require('compression');

const { ping } = require('./config/database');
const { generalLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // Adjust per deployment; the React dev server handles its own.
  })
);
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(cookieParser());

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(
  session({
    name: process.env.SESSION_COOKIE_NAME || 'securebank.sid',
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: Number(process.env.SESSION_MAX_AGE_MS || 15 * 60 * 1000),
    },
  })
);

app.use(generalLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

(async () => {
  try {
    await ping();
    console.log('[db] connection OK');
  } catch (err) {
    console.error('[db] connection failed:', err.message);
  }
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
})();
