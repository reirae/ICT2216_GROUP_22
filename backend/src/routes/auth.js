const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const { pool } = require('../config/database');
const { writeLog } = require('../utils/logger');
const { loginLimiter } = require('../middleware/rateLimiter');
const { handleValidation, verifyCaptcha, PATTERNS } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { sendOtpEmail, verifyOtp } = require("../utils/otp");

const crypto = require('crypto');
const { verifyTOTP } = require('../utils/totp');

const router = express.Router();

const LOCK_THRESHOLD = Number(process.env.ACCOUNT_LOCK_THRESHOLD || 5);
const LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES || 15);
const BCRYPT_ROUNDS = 12;

// Generate a tiny arithmetic captcha and store the expected answer in the session.
router.get('/captcha', (req, res) => {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  req.session.captchaAnswer = String(a + b);
  res.json({ question: `What is ${a} + ${b}?` });
});

// Current session info (used by the frontend on app boot).
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  res.status(401).json({ user: null });
});

// User registration.
router.post(
  '/register',
  [
    body('username').matches(PATTERNS.username).withMessage('Invalid username'),
    body('password').matches(PATTERNS.password).withMessage('Password too weak'),
    body('first_name').matches(PATTERNS.name),
    body('last_name').matches(PATTERNS.name),
    body('email').matches(PATTERNS.email),
    body('phone_number').optional({ checkFalsy: true }).matches(PATTERNS.phone),
  ],
  handleValidation,
  async (req, res) => {
    const { username, password, first_name, last_name, email, phone_number } = req.body;

    try {
      const [dupes] = await pool.execute(
        'SELECT user_id FROM users WHERE username = ? OR email = ? OR phone_number = ? LIMIT 1',
        [username, email, phone_number || null]
      );
      if (dupes.length) {
        return res.status(409).json({ error: 'Username, email, or phone number already in use' });
      }

      const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const accountNumber = generateAccountNumber();

      await pool.execute(
        `INSERT INTO users
          (username, password_hash, first_name, last_name, email, phone_number, account_number, balance, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [username, password_hash, first_name, last_name, email, phone_number || null, accountNumber, 0]
      );

      await writeLog({ userRole: 'user', action: 'REGISTER', status: 'success' });
      res.status(201).json({ message: 'Account created. You can now sign in.' });
    } catch (err) {
      console.error('[register]', err);
      await writeLog({ userRole: 'user', action: 'REGISTER', status: 'failure' });
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// User login.
router.post(
  '/login',
  loginLimiter,
  [
    body('username').matches(PATTERNS.username).withMessage('Invalid username format'),
    body('password').isString().isLength({ min: 1, max: 128 }),
    body('captcha').isString().isLength({ min: 1, max: 8 }),
  ],
  handleValidation,
  verifyCaptcha,
  (req, res) => handleLogin(req, res, 'user')
);

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { otp } = req.body;

  // 1. Generic check: Ensure 2FA state exists
  if (!req.session.pendingUser || !req.session.pendingUser.otp_secret) {
    await writeLog({ userRole: 'user', action: 'LOGIN_2FA', status: 'failure' });
    return res.status(401).json({ error: 'Invalid verification session.' });
  }

  // 2. Verify the math using Google Authenticator logic
  const isValid = verifyTOTP(otp, req.session.pendingUser.otp_secret);

  if (!isValid) {
    req.session.otpAttempts = (req.session.otpAttempts || 0) + 1;
    await writeLog({ userId: req.session.pendingUser?.id || null, userRole: 'user', action: 'LOGIN_2FA', status: 'failure' });
    if (req.session.otpAttempts >= 3) {
      delete req.session.pendingUser;
      delete req.session.otpAttempts;
      
      return req.session.save((err) => {
        if (err) return res.status(500).json({ error: 'Session save error' });
        res.status(401).json({ error: 'Too many failed attempts. Please sign in again.' });
      });
    }
    
    return req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save error' });
      res.status(401).json({ error: 'Invalid verification code.' });
    });
  }

  // 3. Success: Log the user in
  const user = req.session.pendingUser;
  delete user.otp_secret; // Security: Never leak the secret to the frontend
  
  req.session.regenerate(async (err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    
    req.session.user = user;
    
    await writeLog({ userId: user.id, userRole: user.role, action: 'LOGIN_2FA', status: 'success' });
    res.json({ user: req.session.user });
  });
});

// Resend OTP
/*
router.post('/resend-otp', async (req, res) => {
  // We don't need a captcha here because the user is already in the 2FA flow (pendingUser exists)
  if (!req.session.pendingUser || !req.session.pendingUser.phone_number) {
    return res.status(400).json({ error: 'No 2FA session found.' });
  }

  const otpCode = crypto.randomInt(100000, 1000000).toString();
  
  // Reuse the same logic for formatting
  let formattedNumber = req.session.pendingUser.phone_number;
  if (!formattedNumber.startsWith('+')) {
    formattedNumber = '+65' + formattedNumber;
  }

  try {
    await sendOTP(formattedNumber, otpCode);
    req.session.expectedOTP = otpCode;
    req.session.otpCreatedAt = Date.now();
    req.session.otpAttempts = 0; // Reset attempts on resend
    
    // SMART FIX: Save session before responding
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save error' });
      res.json({ message: 'OTP resent' });
    });
  } catch (err) {
    console.error('[resend-otp]', err);
    res.status(500).json({ error: 'Failed to resend code' });
  }
});
*/

// Admin login.
router.post(
  '/admin/login',
  loginLimiter,
  [
    body('username').matches(PATTERNS.username),
    body('password').isString().isLength({ min: 1, max: 128 }),
    body('captcha').isString().isLength({ min: 1, max: 8 }),
  ],
  handleValidation,
  verifyCaptcha,
  (req, res) => handleLogin(req, res, 'admin')
);

// Logout for both roles.
router.post('/logout', requireAuth(), (req, res) => {
  const { id, role } = req.session.user;
  req.session.destroy(async (err) => {
    if (err) {
      await writeLog({ userId: id, userRole: role, action: 'LOGOUT', status: 'failure' });
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie(process.env.SESSION_COOKIE_NAME || 'securebank.sid');
    await writeLog({ userId: id, userRole: role, action: 'LOGOUT', status: 'success' });
    res.json({ message: 'Logged out' });
  });
});

async function handleLogin(req, res, role) {
  const { username, password } = req.body;
  const table = role === 'admin' ? 'admins' : 'users';
  const idCol = role === 'admin' ? 'admin_id' : 'user_id';

  try {
    const [rows] = await pool.execute(
      `SELECT * FROM ${table} WHERE username = ? LIMIT 1`,
      [username]
    );
    const account = rows[0];

    if (!account) {
      await writeLog({ userRole: role, action: 'LOGIN', status: 'failure' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (role === 'user') {
      if (account.locked_until && new Date(account.locked_until) > new Date()) {
        await writeLog({ userId: account[idCol], userRole: 'user', action: 'LOGIN', status: 'failure' });
        return res.status(423).json({ error: 'Account is temporarily locked. Try again later.' });
      }
      if (account.status !== 'active') {
        await writeLog({ userId: account[idCol], userRole: 'user', action: 'LOGIN', status: 'failure' });
        return res.status(403).json({ error: 'Account is not active.' });
      }
    }

    const match = await bcrypt.compare(password, account.password_hash);
    if (!match) {
      if (role === 'user') {
        const attempts = (account.failed_attempts || 0) + 1;
        if (attempts >= LOCK_THRESHOLD) {
          await pool.execute(
            'UPDATE users SET failed_attempts = ?, locked_until = (NOW() + INTERVAL ? MINUTE) WHERE user_id = ?',
            [attempts, LOCK_MINUTES, account.user_id]
          );
        } else {
          await pool.execute(
            'UPDATE users SET failed_attempts = ? WHERE user_id = ?',
            [attempts, account.user_id]
          );
        }
      }
      await writeLog({ userId: account[idCol], userRole: role, action: 'LOGIN', status: 'failure' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (role === 'user') {
      await pool.execute(
        'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?',
        [account.user_id]
      );
    }

    // --- 2FA IMPLEMENTATION ---
    if (role === 'user' && account.otp_enabled && account.otp_secret) {
      
      // We don't log them in yet! We save the user details AND their secret in their temporary session
      req.session.pendingUser = {
        id: account[idCol],
        username: account.username,
        first_name: account.first_name,
        last_name: account.last_name,
        email: account.email,
        phone_number: account.phone_number,
        role: role,
        account_number: account.account_number || null,
        otp_secret: account.otp_secret // Need this for the verify route
      };
      
      req.session.otpAttempts = 0;

      return req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        return res.status(202).json({ 
            message: 'Awaiting Authenticator Code', 
            requires2FA: true 
        });
      });
    }
    // ------------------------------------------

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      req.session.user = {
        id: account[idCol],
        username: account.username,
        first_name: account.first_name,
        last_name: account.last_name,
        email: account.email,
        role,
        account_number: account.account_number || null,
      };
      writeLog({ userId: account[idCol], userRole: role, action: 'LOGIN', status: 'success' });
      res.json({ user: req.session.user });
    });
  } catch (err) {
    console.error('[login]', err);
    await writeLog({ userRole: role, action: 'LOGIN', status: 'failure' });
    res.status(500).json({ error: 'Login failed' });
  }
}

function generateAccountNumber() {
  let n = '';
  for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10).toString();
  return n;
}

router.post('/check-email', async (req, res) => {
  const { email } = req.body;
  const [rows] = await pool.execute(
    'SELECT username FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  if (!rows.length) return res.json({ exists: false });
  res.json({ exists: true, username: rows[0].username });
});

router.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const password_hash = await bcrypt.hash(newPassword, 12);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE email = ?',
      [password_hash, email]
    );
    await writeLog({ userRole: 'user', action: 'RESET_PASSWORD', status: 'success' });
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('[reset-password]', err);
    await writeLog({ userRole: 'user', action: 'RESET_PASSWORD', status: 'failure' });
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// POST /api/auth/send-otp
router.post("/email-send-otp", async (req, res) => {
  try {
    const { email, username } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    await sendOtpEmail(email, username);
    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("Failed to send OTP:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// POST /api/auth/verify-otp
router.post("/email-verify-otp", (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    const valid = verifyOtp(email, otp);
    if (!valid) return res.status(400).json({ error: "Invalid or expired OTP" });

    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("Failed to verify OTP:", err);
    res.status(500).json({ error: "Failed to verify OTP" });
  }
});

module.exports = router;
