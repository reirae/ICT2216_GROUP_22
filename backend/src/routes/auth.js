const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { writeLog } = require('../utils/logger');
const { loginLimiter } = require('../middleware/rateLimiter');
const { handleValidation, verifyCaptcha, PATTERNS } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { sendOtpEmail, verifyOtp } = require("../utils/otp");
const { verifyTOTP } = require('../utils/totp');

const router = express.Router();

// ====================================================================
// CONSTANTS & SECURITY CONFIGURATIONS
// ====================================================================
const LOCK_THRESHOLD = Number(process.env.ACCOUNT_LOCK_THRESHOLD || 5);
const LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES || 15);
const BCRYPT_ROUNDS = 12;

const ENCRYPTION_KEY = Buffer.from(process.env.DB_ENCRYPTION_KEY || '0'.repeat(64), 'hex');
const IV_LENGTH = 16;

// Anti-Replay Cache Registry (Sitting at top scope to ensure clean instantiation)
const usedTokensCache = new Set();
setInterval(() => usedTokensCache.clear(), 30000); // Clear entries automatically every 30s

// ====================================================================
// CRYPTOGRAPHIC HELPER UTILITIES
// ====================================================================
function encryptSecret(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

function decryptSecret(text) {
  if (!text) return null;
  if (!text.includes(':')) return text; // Backward compatibility fallback for legacy plain text rows
  
  const [ivHex, encrypted, tagHex] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function generateAccountNumber() {
  let n = '';
  for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10).toString();
  return n;
}

// ====================================================================
// AUTHENTICATION ROUTES
// ====================================================================

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
    body('captcha').isString().isLength({ min: 20, max: 2000 }),
  ],
  handleValidation,
  verifyCaptcha,
  (req, res) => handleLogin(req, res, 'user')
);

// Verify OTP Challenge & Onboarding Complete
router.post('/verify-otp', async (req, res) => {
  const { otp, tempSecret } = req.body;

  // 1. Structural Check: Verify that an active login handshake session frame is alive
  if (!req.session.pendingUser) {
    await writeLog({ userRole: 'user', action: 'LOGIN_2FA', status: 'failure' });
    return res.status(401).json({ error: 'Invalid verification session. Please sign in again.' });
  }

  const activeSecret = req.session.pendingUser.isSetupPending ? tempSecret : req.session.pendingUser.otp_secret;

  if (!otp || !activeSecret) {
    return res.status(400).json({ error: 'Verification token parameters are missing.' });
  }

  // 2. Anti-Replay Verification Guard Check
  const replayCacheKey = `${req.session.pendingUser.id}:${otp}`;
  if (usedTokensCache.has(replayCacheKey)) {
    return res.status(401).json({ error: 'This verification code has already been used. Please wait for a new token.' });
  }

  // Cryptographically evaluate the math using your speakeasy utility
  const isValid = verifyTOTP(otp, activeSecret);

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

  // Token is valid! Mark it as spent for the remainder of its 30-second window
  usedTokensCache.add(replayCacheKey);

  // 3. Handshake Success: Finalize the state configurations
  const user = req.session.pendingUser;
  const userId = user.id;

  try {
    // SECURE WRITEBACK: Commit the key encrypted to the DB row ONLY after token roundtrip verification succeeds
    if (user.isSetupPending) {
      const encryptedSecret = encryptSecret(activeSecret);
      
      // Select the correct storage row coordinates dynamically
      const targetTable = user.role === 'admin' ? 'admins' : 'users';
      const targetIdColumn = user.role === 'admin' ? 'admin_id' : 'user_id';

      await pool.execute(
        `UPDATE ${targetTable} SET otp_secret = ?, otp_enabled = 1 WHERE ${targetIdColumn} = ?`,
        [encryptedSecret, userId]
      );
      await writeLog({ userId, userRole: user.role, action: '2FA_SETUP', status: 'success' });
    }

    delete user.otp_secret; // Data Minimization: Wipe memory references before serialization
    delete user.isSetupPending;
    
    req.session.regenerate(async (err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      
      req.session.user = user;
      
      // Forces the server to finish saving the session memory before replying
      req.session.save(async (saveErr) => {
        if (saveErr) return res.status(500).json({ error: 'Session save failure' });
        
        await writeLog({ userId: user.id, userRole: user.role, action: 'LOGIN_2FA', status: 'success' });
        res.json({ user: req.session.user });
      });
    });
  } catch (err) {
    console.error('[verify-otp-onboarding]', err);
    res.status(500).json({ error: 'Failed to complete authentication sequence.' });
  }
});

// Admin login.
router.post(
  '/admin/login',
  loginLimiter,
  [
    body('username').matches(PATTERNS.username),
    body('password').isString().isLength({ min: 1, max: 128 }),
    body('captcha').isString().isLength({ min: 20, max: 2000 }),
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

// Core internal identity evaluator logic handler
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

    // --- 2FA IMPLEMENTATION CONTROL ENGINE (UNIFIED FOR USER & ADMIN) ---
    const hasDisabledMFA = role === 'user' && account.otp_enabled === 0 && account.otp_secret === null;

    if (!hasDisabledMFA) {
      const isSetupPending = account.otp_secret === null;
      const plainSecret = account.otp_secret ? decryptSecret(account.otp_secret) : null;

      req.session.pendingUser = {
        id: String(account[idCol]),
        username: account.username,
        first_name: account.first_name || 'Admin', // Safe fallback property for admin table rows
        last_name: account.last_name || 'User',
        email: account.email || '',
        role: role,                                // Dynamic role context preservation ('user' or 'admin')
        account_number: account.account_number || null,
        otp_secret: plainSecret,
        isSetupPending: isSetupPending
      };
      
      req.session.otpAttempts = 0;

      return req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        
        return res.status(202).json({ 
          message: isSetupPending ? 'Awaiting Mandatory 2FA Onboarding' : 'Awaiting Authenticator Challenge Code', 
          requires2FA: true,
          isSetupPending: isSetupPending
        });
      });
    }
    // --------------------------------------------------------------------

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      req.session.user = {
        id: String(account[idCol]),
        username: account.username,
        first_name: account.first_name,
        last_name: account.last_name,
        email: account.email,
        role,
        account_number: account.account_number || null,
      };

      req.session.save(async (saveErr) => {
        if (saveErr) return res.status(500).json({ error: 'Session save failure' });
        
        writeLog({ userId: req.session.user.id, userRole: role, action: 'LOGIN', status: 'success' });
        res.json({ user: req.session.user });
      });
    });
  } catch (err) {
    console.error('[login]', err);
    await writeLog({ userRole: role, action: 'LOGIN', status: 'failure' });
    res.status(500).json({ error: 'Login failed' });
  }
}

router.post('/check-email', verifyCaptcha, async (req, res) => {
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

// PUBLIC HANDSHAKE 2FA ONBOARDING RESOURCE GENERATOR
router.post('/generate-onboarding-2fa', async (req, res) => {
  try {
    if (!req.session.pendingUser || !req.session.pendingUser.isSetupPending) {
      return res.status(403).json({ error: 'Access denied. Session parameters are out of bounds.' });
    }

    const { username } = req.session.pendingUser;
    const secret = require('../utils/totp').generateSecret();
    const qrCode = await require('../utils/totp').generateQRCode(username, secret);

    res.json({ qrCode, tempSecret: secret });
  } catch (err) {
    console.error('[generate-onboarding-2fa]', err);
    res.status(500).json({ error: 'Failed to safely generate onboarding security streams.' });
  }
});

module.exports = router;