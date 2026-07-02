const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const { pool, runTransaction } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { writeLog } = require('../utils/logger');
const { handleValidation, PATTERNS } = require('../middleware/validation');
const { generateSecret, generateQRCode, verifyTOTP } = require('../utils/totp');

// Securely borrow the attached decryption engine from your auth module
const authRouter = require('./auth');
const decryptSecret = authRouter.decryptSecret;

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const crypto = require('crypto');
const ENCRYPTION_KEY = Buffer.from(process.env.DB_ENCRYPTION_KEY || '0'.repeat(64), 'hex');
const IV_LENGTH = 16;

function encryptSecret(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

// Anti-Replay Cache Registry for Settings Onboarding Flow
const profileReplayCache = new Set();
setInterval(() => profileReplayCache.clear(), 30000);

// Dashboard summary: balance + recent transactions.
router.get('/dashboard', requireAuth('user'), async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [[user]] = await pool.execute(
      'SELECT first_name, last_name, account_number, balance, status FROM users WHERE user_id = ?',
      [userId]
    );
    const [recent] = await pool.execute(
      `SELECT transaction_id, recipient_id,
              CASE WHEN amount < 0 THEN 'debit' ELSE 'credit' END AS type,
              ABS(amount) AS amount,
              description, created_at
         FROM transaction_history
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 5`,
      [userId]
    );
    res.json({ user, recent });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Profile.
router.get('/profile', requireAuth('user'), async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      'SELECT user_id, username, first_name, last_name, email, phone_number, account_number, status, created_at, otp_enabled AS hasMfaEnabled FROM users WHERE user_id = ?',
      [req.session.user.id]
    );
    res.json({ user });
  } catch (err) {
    console.error('[profile]', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Generate 2FA QR Code (Step 1: Ephemeral Setup Phase)
router.post('/generate-2fa', requireAuth('user'), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const username = req.session.user.username;

    const secret = generateSecret();
    const qrCode = await generateQRCode(username, secret);

    res.json({ qrCode, tempSecret: secret });
  } catch (err) {
    console.error('[generate-2fa]', err);
    res.status(500).json({ error: 'Failed to generate 2FA' });
  }
});

// Verify and Activate 2FA (Step 2: Enrolment Verification Gate)
router.post('/verify-and-activate-2fa', requireAuth('user'), async (req, res) => {
  const userId = req.session.user.id;
  const { token, tempSecret } = req.body;

  if (!token || !tempSecret) {
    return res.status(400).json({ error: 'Token and temporary secret are required.' });
  }

  try {
    const replayCacheKey = `${userId}:${token}`;
    if (profileReplayCache.has(replayCacheKey)) {
      return res.status(400).json({ error: 'This token has already been used to bind a device configuration. Please wait for a new code.' });
    }

    const isValid = verifyTOTP(token, tempSecret);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification token. Activation failed.' });
    }

    profileReplayCache.add(replayCacheKey);

    const encryptedSecret = encryptSecret(tempSecret);

    await pool.execute(
      'UPDATE users SET otp_secret = ?, otp_enabled = 1 WHERE user_id = ?',
      [encryptedSecret, userId]
    );

    await writeLog({ userId, userRole: 'user', action: '2FA_SETUP', status: 'success', ipAddress: req.ip });

    res.json({ message: '2FA Authenticator successfully verified and activated!' });
  } catch (err) {
    console.error('[verify-and-activate-2fa]', err);
    res.status(500).json({ error: 'Failed to verify and activate 2FA' });
  }
});

// Change password.
router.put(
  '/password',
  requireAuth('user'),
  [
    body('current_password').isString().isLength({ min: 1, max: 128 }),
    body('new_password').matches(PATTERNS.password).withMessage('New password too weak'),
  ],
  handleValidation,
  async (req, res) => {
    const userId = req.session.user.id;
    const { current_password, new_password } = req.body;
    try {
      const [[row]] = await pool.execute(
        'SELECT password_hash FROM users WHERE user_id = ?',
        [userId]
      );
      if (!row || !(await bcrypt.compare(current_password, row.password_hash))) {
        await writeLog({ userId, userRole: 'user', action: 'PASSWORD_CHANGE', status: 'failure', ipAddress: req.ip });
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
      await pool.execute('UPDATE users SET password_hash = ? WHERE user_id = ?', [newHash, userId]);
      await writeLog({ userId, userRole: 'user', action: 'PASSWORD_CHANGE', status: 'success',ipAddress: req.ip });
      res.json({ message: 'Password updated' });
    } catch (err) {
      console.error('[password]', err);
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);

// Transaction history.
router.get('/transactions', requireAuth('user'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.transaction_id,
              CASE WHEN t.amount < 0 THEN 'debit' ELSE 'credit' END AS type,
              ABS(t.amount) AS amount,
              t.description, t.created_at,
              CONCAT_WS(' ', u.first_name, u.last_name) AS user_name,
              u.account_number AS user_account,
              t.recipient_id,
              CONCAT_WS(' ', r.first_name, r.last_name) AS recipient_name,
              r.account_number AS recipient_account
         FROM transaction_history t
         LEFT JOIN users r ON r.user_id = t.recipient_id
         LEFT JOIN users u ON u.user_id = t.user_id
        WHERE t.user_id = ?
        ORDER BY t.created_at DESC`,
      [req.session.user.id]
    );
    res.json({ transactions: rows });
  } catch (err) {
    console.error('[transactions]', err);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

// Saved recipients.
router.get('/recipients', requireAuth('user'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ur.user_recipient_id, ur.recipient_id, ur.created_at,
              u.first_name, u.last_name, u.account_number
         FROM user_recipients ur
         JOIN users u ON u.user_id = ur.recipient_id
        WHERE ur.user_id = ?
        ORDER BY ur.created_at DESC`,
      [req.session.user.id]
    );
    res.json({ recipients: rows });
  } catch (err) {
    console.error('[recipients]', err);
    res.status(500).json({ error: 'Failed to load recipients' });
  }
});

router.post(
  '/recipients',
  requireAuth('user'),
  [body('identifier').isString().isLength({ min: 6, max: 30 })],
  handleValidation,
  async (req, res) => {
    const userId = req.session.user.id;
    const identifier = req.body.identifier.trim();
    try {
      const [[recipient]] = await pool.execute(
        `SELECT user_id FROM users
          WHERE (account_number = ? OR phone_number = ?) AND status = 'active'
          LIMIT 1`,
        [identifier, identifier]
      );
      if (!recipient) return res.status(404).json({ error: 'No active account found for that identifier' });
      if (recipient.user_id === userId) return res.status(400).json({ error: 'You cannot add yourself' });

      await pool.execute(
        'INSERT IGNORE INTO user_recipients (user_id, recipient_id) VALUES (?, ?)',
        [userId, recipient.user_id]
      );
      await writeLog({ userId, userRole: 'user', action: 'BENEFICIARY_ADDED', status: 'success', ipAddress: req.ip });
      res.status(201).json({ message: 'Recipient saved' });
    } catch (err) {
      console.error('[recipients-add]', err);
      res.status(500).json({ error: 'Failed to add recipient' });
    }
  }
);

router.delete('/recipients/:id', requireAuth('user'), async (req, res) => {
  const userId = req.session.user.id;
  const id = String(req.params.id);
  if (!/^[0-9]+$/.test(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const [result] = await pool.execute(
      'DELETE FROM user_recipients WHERE user_recipient_id = ? AND user_id = ?',
      [id, userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Recipient not found' });
    await writeLog({ userId, userRole: 'user', action: 'BENEFICIARY_REMOVED', status: 'success', ipAddress: req.ip });
    res.json({ message: 'Recipient removed' });
  } catch (err) {
    console.error('[recipients-del]', err);
    res.status(500).json({ error: 'Failed to remove recipient' });
  }
});

// Lookup recipient by account number or phone (used by transfer form).
router.get('/lookup', requireAuth('user'), async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    const [[hit]] = await pool.execute(
      `SELECT user_id, first_name, last_name, account_number
         FROM users
        WHERE (account_number = ? OR phone_number = ?) AND status = 'active'
          AND user_id <> ?
        LIMIT 1`,
      [q, q, req.session.user.id]
    );
    if (!hit) return res.status(404).json({ error: 'No active account found' });
    res.json({ recipient: hit });
  } catch (err) {
    console.error('[lookup]', err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// Fund transfer.
router.post(
  '/transfer',
  requireAuth('user'),
  [
    body('recipient_id').isInt({ min: 1 }),
    body('amount').matches(PATTERNS.amount),
    body('description')
      .optional({ checkFalsy: true })
      .isString()
      .isLength({ max: 100 })
      .matches(/^[a-zA-Z0-9 ]+$/)
      .withMessage('Description must contain only letters, numbers, and spaces'),
  ],
  handleValidation,
  async (req, res) => {
    const userId = req.session.user.id;
    const recipientId = req.body.recipient_id.toString();
    const amount = Number.parseFloat(req.body.amount);
    const description = (req.body.description || 'Fund transfer')
      .toString()
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .slice(0, 100);

    if (recipientId === userId) {
      await writeLog({ userId, userRole: 'user', action: 'TRANSFER', status: 'failure', ipAddress: req.ip });
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }
    if (!(amount > 0)) {
      await writeLog({ userId, userRole: 'user', action: 'TRANSFER', status: 'failure', ipAddress: req.ip });
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    try {
      await runTransaction(async (conn) => {
        const [[sender]] = await conn.execute(
          'SELECT user_id, balance, status FROM users WHERE user_id = ? FOR UPDATE',
          [userId]
        );
        const [[recipient]] = await conn.execute(
          'SELECT user_id, status FROM users WHERE user_id = ? FOR UPDATE',
          [recipientId]
        );
        if (!sender || sender.status !== 'active') {
          throw { status: 403, json: { error: 'Your account is not active' } };
        }
        if (!recipient || recipient.status !== 'active') {
          throw { status: 404, json: { error: 'Recipient is not available' } };
        }
        if (Number(sender.balance) < amount) {
          throw { status: 400, json: { error: 'Insufficient balance' } };
        }

        await conn.execute(
          'UPDATE users SET balance = balance - ? WHERE user_id = ?',
          [amount, userId]
        );
        await conn.execute(
          'UPDATE users SET balance = balance + ? WHERE user_id = ?',
          [amount, recipientId]
        );
        await conn.execute(
          `INSERT INTO transaction_history (user_id, recipient_id, amount, description)
           VALUES (?, ?, ?, ?)`,
          [userId, recipientId, -amount, description]
        );
        await conn.execute(
          `INSERT INTO transaction_history (user_id, recipient_id, amount, description)
           VALUES (?, ?, ?, ?)`,
          [recipientId, userId, amount, description]
        );
      });

      await writeLog({ userId, userRole: 'user', action: 'TRANSFER', status: 'success', ipAddress: req.ip });
      res.json({ message: 'Transfer completed' });
    } catch (err) {
      await writeLog({ userId, userRole: 'user', action: 'TRANSFER', status: 'failure', ipAddress: req.ip });
      if (err && err.status && err.json) return res.status(err.status).json(err.json);
      console.error('[transfer]', err);
      res.status(500).json({ error: 'Transfer failed' });
    }
  }
);

// Disable Multi-Factor Opt-Out Route
router.post('/disable-2fa', requireAuth('user'), async (req, res) => {
  const userId = req.session.user.id;
  try {
    await pool.execute(
      'UPDATE users SET otp_secret = NULL, otp_enabled = 0 WHERE user_id = ?',
      [userId]
    );

    await writeLog({ userId, userRole: 'user', action: '2FA_DISABLE', status: 'success', ipAddress: req.ip });
    res.json({ message: 'Two-Factor Authentication has been successfully disabled.' });
  } catch (err) {
    console.error('[disable-2fa]', err);
    res.status(500).json({ error: 'Failed to modify security configurations.' });
  }
});

// Update User Profile Details Context with Step-Up Security Verification
router.put(
  '/profile',
  requireAuth('user'),
  [
    body('first_name').matches(PATTERNS.name).withMessage('Invalid first name format'),
    body('last_name').matches(PATTERNS.name).withMessage('Invalid last name format'),
    body('email').matches(PATTERNS.email).withMessage('Invalid email address format'),
    body('phone_number').optional({ checkFalsy: true }).isLength({ min: 8, max: 8 }).isNumeric().withMessage('Phone number must be exactly 8 numeric digits')
  ],
  handleValidation,
  async (req, res) => {
    const userId = req.session.user.id;
    const { first_name, last_name, email, phone_number, token } = req.body;

    try {
      // 1. Fetch user's security configuration parameters
      const [[account]] = await pool.execute(
        'SELECT otp_secret, otp_enabled FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      // 2. Step-Up Security Check: Mandate code verification if MFA status is active
      if (account && account.otp_enabled === 1) {
        if (!token || token.length !== 6) {
          return res.status(400).json({ error: 'Security challenge verification token is required.' });
        }
        
        const plainSecret = account.otp_secret ? decryptSecret(account.otp_secret) : null;
        if (plainSecret) {
          const isValid = verifyTOTP(token, plainSecret);
          if (!isValid) {
            return res.status(401).json({ error: 'Security token mismatch. Alteration request rejected.' });
          }
        }
      }

      // 3. Structural Duplicate Check (Email or Phone number collision)
      const [dupes] = await pool.execute(
        'SELECT user_id FROM users WHERE (email = ? OR (phone_number = ? AND phone_number IS NOT NULL)) AND user_id <> ? LIMIT 1',
        [email.trim(), phone_number ? phone_number.trim() : null, userId]
      );
      
      if (dupes.length) {
        return res.status(409).json({ error: 'This email address or phone number is already bound to another profile.' });
      }

      // 4. Secure Parameterized SQL Writeback execution
      await pool.execute(
        'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone_number = ? WHERE user_id = ?',
        [first_name.trim(), last_name.trim(), email.trim(), phone_number ? phone_number.trim() : null, userId]
      );

      await writeLog({ userId, userRole: 'user', action: 'PROFILE_UPDATE', status: 'success', ipAddress: req.ip });
      res.json({ message: 'Profile details successfully synchronized!' });
    } catch (err) {
      console.error('[update-profile-error]', err);
      res.status(500).json({ error: 'Internal server synchronization error.' });
    }
  }
);

module.exports = router;