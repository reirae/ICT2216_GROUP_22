const crypto = require('crypto');

// ====================================================================
// Anti-CSRF Framework (synchronizer token pattern)
//
// A cryptographically random token is generated server-side and bound
// to the user's session (never exposed via a readable cookie). The
// frontend must echo this token back in the X-CSRF-Token header on
// every state-changing request. Because the token lives only in the
// server-side session store and in memory on the legitimate client,
// a cross-site attacker who can only make the victim's browser send
// the ambient session cookie cannot also supply a valid token.
// ====================================================================

const CSRF_HEADER = 'x-csrf-token';
const TOKEN_BYTES = 32;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Routes that legitimately run before an authenticated session (and
// therefore before any CSRF token) exists: registration, login, and
// the pre-2FA-completion steps of the login handshake. These are
// protected instead by rate-limiting, CAPTCHA, and the fact that they
// don't act on an authenticated session, so there is nothing yet for
// a forged cross-site request to ride.
const EXEMPT_ROUTES = new Set([
  'POST /api/auth/register-send-otp',
  'POST /api/auth/register-verify-otp',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/admin/login',
  'POST /api/auth/verify-otp',
  'POST /api/auth/generate-onboarding-2fa',
  'POST /api/auth/check-email',
  'POST /api/auth/reset-password',
  'POST /api/auth/email-send-otp',
  'POST /api/auth/email-verify-otp',
]);

function generateCsrfToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

// Mints a session-bound CSRF token if the current session doesn't have
// one yet. Call this whenever a request establishes/confirms an
// authenticated session (login success, verify-otp success, /me) so a
// token is always available to hand back to the client.
function ensureCsrfToken(req) {
  if (!req.session) return null;
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }
  return req.session.csrfToken;
}

function isExempt(req) {
  const path = req.originalUrl.split('?')[0];
  return EXEMPT_ROUTES.has(`${req.method} ${path}`);
}

// Verifies the X-CSRF-Token header against the token bound to the
// caller's session for every state-changing request.
function verifyCsrfToken(req, res, next) {
  if (SAFE_METHODS.has(req.method) || isExempt(req)) {
    return next();
  }

  // No authenticated (or semi-authenticated) session exists yet, so
  // there is nothing session-bound for a forged request to ride on;
  // let the route's own auth middleware reject with 401 rather than
  // masking that with a 403 here.
  const hasSessionContext = req.session && (req.session.user || req.session.pendingUser);
  if (!hasSessionContext) {
    return next();
  }

  const sessionToken = req.session.csrfToken;
  const suppliedToken = req.get(CSRF_HEADER);

  if (!sessionToken || !suppliedToken) {
    return res.status(403).json({ error: 'CSRF token missing.' });
  }

  const sessionBuf = Buffer.from(sessionToken, 'utf8');
  const suppliedBuf = Buffer.from(suppliedToken, 'utf8');

  const valid =
    sessionBuf.length === suppliedBuf.length &&
    crypto.timingSafeEqual(sessionBuf, suppliedBuf);

  if (!valid) {
    return res.status(403).json({ error: 'Invalid CSRF token.' });
  }

  next();
}

module.exports = { ensureCsrfToken, verifyCsrfToken, CSRF_HEADER };
