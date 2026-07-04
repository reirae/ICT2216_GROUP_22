const { validationResult } = require('express-validator');

// Validation regex patterns reused on backend (frontend mirrors these).
const PATTERNS = {
  username: /^[a-zA-Z][a-zA-Z0-9._-]{2,49}$/,
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$/,
  phone: /^\+?[0-9]{8,15}$/,
  // Singapore local mobile/landline: exactly 8 digits, no country code/+65.
  phoneSG: /^[0-9]{8}$/,
  // 6-digit numeric login PIN.
  pin: /^[0-9]{6}$/,
  name: /^[a-zA-Z][a-zA-Z\s'-]{0,49}$/,
  accountNumber: /^[0-9]{10,20}$/,
  amount: /^\d{1,13}(\.\d{1,2})?$/,
};

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({ field: e.path, msg: e.msg })),
    });
  }
  next();
}

async function verifyCaptcha(req, res, next) {
  const token = (req.body.captcha || '').toString().trim();

  // 1. Check if token exists
  if (!token) {
    return res.status(400).json({ error: 'Verification token missing. Please refresh.' });
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', process.env.CFTS_SECRET_KEY);
    formData.append('response', token);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });

    const data = await response.json();

    if (!data.success) {
      // Log error codes for debugging
      console.log('Turnstile verification failed:', data['error-codes']);
      return res.status(400).json({ error: 'Verification failed. Please try again.' });
    }

    next();

  } catch (error) {
    console.error('Turnstile API error:', error);
    return res.status(500).json({ error: 'Verification service unavailable. Please try again.' });
  }
}

// Catches cross-pollinated or switched session cookies at the server layer.
function validateSessionPathContext(req, res, next) {
  const currentPath = req.originalUrl || req.url;

  if (currentPath.startsWith('/api/auth')) {
    return next();
  }

  // 1. If no session user exists, let requireAuth middleware handle standard 401 routing
  if (!req.session || !req.session.user) {
    return next();
  }
  
  const isApiAdminRoute = currentPath.startsWith('/api/admin');
  
  const rawRole = req.session.user.role || '';
  const usernameLower = (req.session.user.username || '').toLowerCase();

  // 2. Normalize administrative classifications
  let effectiveRole = rawRole;
  if (rawRole === 'admin') {
    if (usernameLower.includes('bus') || usernameLower.includes('business')) {
      effectiveRole = 'business_admin';
    } else {
      effectiveRole = 'it_admin';
    }
  }

  const isAdminGroup = effectiveRole === 'business_admin' || effectiveRole === 'it_admin';

  // 3. SECURE CROSS-POLLINATION GATE:
  // Threat Vector A: An admin profile tries to trigger regular customer user routes
  // Threat Vector B: A regular customer cookie tries to fetch admin control endpoints
  const isCrossPollinatedSession = 
    (isApiAdminRoute && !isAdminGroup) || 
    (!isApiAdminRoute && currentPath.startsWith('/api/user') && effectiveRole !== 'user');

  if (isCrossPollinatedSession) {
    // Force complete server-side destruction of the mismatched session context
    return req.session.destroy((err) => {
      res.clearCookie(process.env.SESSION_COOKIE_NAME || 'securebank.sid');
      return res.status(401).json({ 
        error: 'Session context integrity invalid. Switched session detected.' 
      });
    });
  }

  next();
}

module.exports = { 
  PATTERNS, 
  handleValidation, 
  verifyCaptcha, 
  validateSessionPathContext // Export the new validation handler
};
