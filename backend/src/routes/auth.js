const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const { pool } = require('../config/database');
const { writeLog } = require('../utils/logger');
const { loginLimiter } = require('../middleware/rateLimiter');
const { handleValidation, verifyCaptcha, PATTERNS } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');

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
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie(process.env.SESSION_COOKIE_NAME || 'securebank.sid');
    writeLog({ userId: id, userRole: role, action: 'LOGOUT', status: 'success' });
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

module.exports = router;
