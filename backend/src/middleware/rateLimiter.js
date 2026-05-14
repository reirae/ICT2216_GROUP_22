const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RL_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.LOGIN_RL_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  // Rate-limit per IP + username so a shared NAT does not lock everyone out.
  keyGenerator: (req) => `${req.ip}:${(req.body && req.body.username) || ''}`,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, generalLimiter };
