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
const { sendPasswordChangedEmail } = require("../utils/notifications");
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

// Anti-Replay Cache Registry
const usedTokensCache = new Set();
setInterval(() => usedTokensCache.clear(), 30000);

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
  if (!text.includes(':')) return text;

  const [ivHex, encrypted, tagHex] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decipher.final('utf8'); // Complete cryptographic validation
  return decrypted;
}

function generateAccountNumber() {
  let n = '';
  for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10).toString();
  return n;
}

// Attach utilities to the router object directly so other files can require them safely 
// without altering Express router middleware exports!
router.encryptSecret = encryptSecret;
router.decryptSecret = decryptSecret;

// ====================================================================
// AUTHENTICATION ROUTES
// ====================================================================

router.get('/captcha', (req, res) => {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  req.session.captchaAnswer = String(a + b);
  res.json({ question: `What is ${a} + ${b}?` });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  res.status(401).json({ user: null });
});

// POST /api/auth/register-send-otp
// Validates registration data and sends OTP before creating the account
router.post(
  '/register-send-otp',
  [
    body('username').matches(PATTERNS.username).withMessage('Invalid username'),
    body('password').matches(PATTERNS.pin).withMessage('PIN must be exactly 6 digits'),
    body('first_name').matches(PATTERNS.name).withMessage('Invalid first name'),
    body('last_name').matches(PATTERNS.name).withMessage('Invalid last name'),
    body('email').matches(PATTERNS.email).withMessage('Invalid email')
      .bail()
      .matches(/@(gmail|googlemail)\.com$/i).withMessage('Please use a Gmail address (@gmail.com) to register'),
    body('phone_number').matches(PATTERNS.phoneSG).withMessage('Invalid phone number'),
    body('captcha').isString().isLength({ min: 20, max: 2000 }),
  ],
  handleValidation,
  async (req, res) => {
    const { username, email } = req.body;
    try {
      // Check for duplicates before sending OTP
      const [dupes] = await pool.execute(
        'SELECT user_id FROM users WHERE username = ? OR email = ? LIMIT 1',
        [username, email]
      );
      if (dupes.length) {
        return res.status(409).json({ error: 'Username or email already in use' });
      }

      // Send OTP to the provided email
      await sendOtpEmail(email, req.body.first_name);

      // Store pending registration data in session
      req.session.pendingRegistration = {
        username: req.body.username,
        password: req.body.password,
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        email: req.body.email,
        phone_number: req.body.phone_number,
      };
      req.session.registrationOtpVerified = false;

      req.session.save((err) => {
        if (err) return res.status(500).json({ error: 'Session error' });
        res.json({ message: 'OTP sent successfully' });
      });
    } catch (err) {
      console.error('[register-send-otp]', err);
      res.status(500).json({ error: 'Failed to send verification code' });
    }
  }
);

// POST /api/auth/register-verify-otp
router.post('/register-verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  // Ensure registration session exists
  if (!req.session.pendingRegistration || req.session.pendingRegistration.email !== email) {
    return res.status(400).json({ error: 'Invalid registration session' });
  }

  const valid = verifyOtp(email, otp);
  if (!valid) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  req.session.registrationOtpVerified = true;

  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json({ message: 'OTP verified successfully' });
  });
});

// POST /api/auth/register — updated to require OTP verification
router.post('/register', async (req, res) => {
  // GATE: Reject if OTP was never verified
  if (
    !req.session.registrationOtpVerified ||
    !req.session.pendingRegistration ||
    req.session.pendingRegistration.email !== req.body.email
  ) {
    return res.status(403).json({ error: 'Please complete email verification first' });
  }

  const { username, password, first_name, last_name, email, phone_number } =
    req.session.pendingRegistration;

  try {
    const [dupes] = await pool.execute(
      'SELECT user_id FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username, email]
    );
    if (dupes.length) {
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const accountNumber = generateAccountNumber();

    await pool.execute(
      `INSERT INTO users
        (username, password_hash, first_name, last_name, email, phone_number, account_number, balance, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [username, password_hash, first_name, last_name, email, phone_number || null, accountNumber, 0]
    );

    // Clear registration session flags
    delete req.session.pendingRegistration;
    delete req.session.registrationOtpVerified;

    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      writeLog({ userRole: 'user', action: 'REGISTER', status: 'success' });
      res.status(201).json({ message: 'Account created. You can now sign in.' });
    });
  } catch (err) {
    console.error('[register]', err);
    await writeLog({ userRole: 'user', action: 'REGISTER', status: 'failure' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

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

router.post('/verify-otp', async (req, res) => {
  const { otp, tempSecret } = req.body;

  if (!req.session.pendingUser) {
    await writeLog({ userRole: 'user', action: 'LOGIN_2FA', status: 'failure' });
    return res.status(401).json({ error: 'Invalid verification session. Please sign in again.' });
  }

  // FIXED: Decrypt the master secret from storage session frame safely at runtime evaluation loop
  const activeSecret = req.session.pendingUser.isSetupPending
    ? tempSecret
    : decryptSecret(req.session.pendingUser.encrypted_otp_secret);

  if (!otp || !activeSecret) {
    return res.status(400).json({ error: 'Verification token parameters are missing.' });
  }

  const replayCacheKey = `${req.session.pendingUser.id}:${otp}`;
  if (usedTokensCache.has(replayCacheKey)) {
    return res.status(401).json({ error: 'This verification code has already been used. Please wait for a new token.' });
  }

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

  usedTokensCache.add(replayCacheKey);

  const user = req.session.pendingUser;
  const userId = user.id;

  try {
    if (user.isSetupPending) {
      const encryptedSecret = encryptSecret(activeSecret);
      const targetTable = user.role === 'admin' ? 'admins' : 'users';
      const targetIdColumn = user.role === 'admin' ? 'admin_id' : 'user_id';

      await pool.execute(
        `UPDATE ${targetTable} SET otp_secret = ?, otp_enabled = 1 WHERE ${targetIdColumn} = ?`,
        [encryptedSecret, userId]
      );
      await writeLog({ userId, userRole: user.role, action: '2FA_SETUP', status: 'success' });
    }

    delete user.encrypted_otp_secret; // Data Minimization removal before cookie compilation
    delete user.isSetupPending;

    req.session.regenerate(async (err) => {
      if (err) return res.status(500).json({ error: 'Session error' });

      req.session.user = user;
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

    const hasDisabledMFA = role === 'user' && account.otp_enabled === 0 && account.otp_secret === null;

    if (!hasDisabledMFA) {
      const isSetupPending = account.otp_secret === null;

      req.session.pendingUser = {
        id: String(account[idCol]),
        username: account.username,
        first_name: account.first_name || 'Admin',
        last_name: account.last_name || 'User',
        email: account.email || '',
        role: account.role || role,
        account_number: account.account_number || null,
        encrypted_otp_secret: account.otp_secret,
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
    // GATE: Reject if OTP was never verified in this session
    if (!req.session.otpVerified || req.session.resetEmail !== email) {
      return res.status(403).json({ error: 'Unauthorized. Please complete OTP verification first.' });
    }

    // Validate PIN: exactly 6 digits
    if (!newPassword || !/^\d{6}$/.test(newPassword)) {
      return res.status(400).json({ error: 'PIN must be exactly 6 digits.' });
    }

    // Look up username for the confirmation email
    const [rows] = await pool.execute(
      'SELECT username FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const username = rows[0]?.username;

    const password_hash = await bcrypt.hash(newPassword, 12);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE email = ?',
      [password_hash, email]
    );

    // Clear reset session flags
    delete req.session.otpVerified;
    delete req.session.resetEmail;

    // Notify the user their PIN changed. This is best-effort: a mail
    // failure here must not undo or block the reset that already succeeded.
    try {
      await sendPasswordChangedEmail(email, username);
    } catch (mailErr) {
      console.error('[reset-password] failed to send confirmation email:', mailErr);
    }

    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      writeLog({ userRole: 'user', action: 'RESET_PASSWORD', status: 'success' });
      res.json({ message: 'PIN reset successfully' });
    });
  } catch (err) {
    console.error('[reset-password]', err);
    await writeLog({ userRole: 'user', action: 'RESET_PASSWORD', status: 'failure' });
    res.status(500).json({ error: 'PIN reset failed' });
  }
});

router.post("/email-send-otp", verifyCaptcha, async (req, res) => {
  try {
    const { email, username } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    await sendOtpEmail(email, username);

    // Save email in session and mark OTP as not yet verified
    req.session.resetEmail = email;
    req.session.otpVerified = false;

    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      res.json({ message: "OTP sent successfully" });
    });
  } catch (err) {
    console.error("Failed to send OTP:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/email-verify-otp", (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    // Ensure the email matches what was sent to
    if (req.session.resetEmail !== email) {
      return res.status(400).json({ error: 'Invalid reset session' });
    }

    const valid = verifyOtp(email, otp);
    if (!valid) return res.status(400).json({ error: "Invalid or expired OTP" });

    // Mark OTP as verified in session
    req.session.otpVerified = true;

    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      res.json({ message: "OTP verified successfully" });
    });
  } catch (err) {
    console.error("Failed to verify OTP:", err);
    res.status(500).json({ error: "Failed to verify OTP" });
  }
});

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