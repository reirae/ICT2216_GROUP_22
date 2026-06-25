const { validationResult } = require('express-validator');

// Validation regex patterns reused on backend (frontend mirrors these).
const PATTERNS = {
  username: /^[a-zA-Z][a-zA-Z0-9._-]{2,49}$/,
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$/,
  phone: /^\+?[0-9]{8,15}$/,
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

module.exports = { PATTERNS, handleValidation, verifyCaptcha };
