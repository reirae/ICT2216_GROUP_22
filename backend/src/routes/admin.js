const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const { pool, runTransaction } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { writeLog } = require('../utils/logger');
const { handleValidation, PATTERNS } = require('../middleware/validation');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const MAX_BALANCE_ADJUSTMENT = 9999999999999.99;

// Helper middleware to verify specific admin sub-roles
const requireAdminRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(403).json({ error: 'Access denied: Insufficient administrative privileges.' });
    }

    const role = req.session.user.role;

    // Allow generic 'admin' role to act as a Super Admin bypass, 
    // or verify if their specific sub-role is allowed
    if (role !== 'admin' && !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Access denied: Insufficient administrative privileges.' });
    }
    next();
  };
};

/* ==========================================================================
   BUSINESS ADMIN ROUTES (User Management & Transactions)
   ========================================================================== */

// All users (Business Admin view)
// FIXED: Removed 'admin' string restriction constraint from requireAuth
router.get('/users', requireAuth(), requireAdminRole(['business_admin']), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, username, first_name, last_name, email, phone_number,
              account_number, balance, status, failed_attempts, locked_until,
              created_at, updated_at
         FROM users
         ORDER BY user_id ASC`
    );
    await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'VIEW_USERS', status: 'success', ipAddress: req.ip });
    res.json({ users: rows });
  } catch (err) {
    console.error('[admin-users]', err);
    await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'VIEW_USERS', status: 'failure', ipAddress: req.ip });
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// Create banking user (Business Admin)
// FIXED: Removed 'admin' string restriction constraint from requireAuth
router.post(
  '/users',
  requireAuth(),
  requireAdminRole(['business_admin']),
  [
    body('username').matches(PATTERNS.username),
    body('password').matches(PATTERNS.password),
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
        await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'USER_CREATE', status: 'failure', ipAddress: req.ip });
        return res.status(409).json({ error: 'Username, email, or phone number already exists' });
      }

      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const accountNumber = randomAcct();
      await pool.execute(
        `INSERT INTO users (username, password_hash, first_name, last_name, email, phone_number, account_number, balance, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active')`,
        [username, hash, first_name, last_name, email, phone_number || null, accountNumber]
      );
      await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'USER_CREATE', status: 'success', ipAddress: req.ip });
      res.status(201).json({ message: 'User created' });
    } catch (err) {
      console.error('[admin-users-create]', err);
      await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'USER_CREATE', status: 'failure', ipAddress: req.ip });
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Update user status only (Business Admin) — separated from profile edits for auditability
router.put(
  '/users/:id/status',
  requireAuth(),
  requireAdminRole(['business_admin']),
  [body('status').isIn(['active', 'suspended', 'deactivated'])],
  handleValidation,
  async (req, res) => {
    const idStr = req.params.id;

    if (!/^\d+$/.test(idStr)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    const { status } = req.body;

    try {
      // Confirm the user exists and fetch their current status
      const [[target]] = await pool.execute('SELECT user_id, status FROM users WHERE user_id = ?', [idStr]);
      if (!target) return res.status(404).json({ error: `User with ID ${idStr} not found.` });

      await pool.execute('UPDATE users SET status = ? WHERE user_id = ?', [status, idStr]);

      await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'USER_STATUS_CHANGE', status: 'success', ipAddress: req.ip });
      return res.json({ message: 'User status updated successfully' });
    } catch (err) {
      console.error('[admin-users-status]', err);
      await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'USER_STATUS_CHANGE', status: 'failure', ipAddress: req.ip });
      res.status(500).json({ error: 'Failed to update user status' });
    }
  }
);

// Deposit into or withdraw from a customer's account (Business Admin).
// The balance update and matching history row are committed atomically.
router.post(
  '/users/:id/balance-adjustment',
  requireAuth(),
  requireAdminRole(['business_admin']),
  [
    body('operation')
      .isIn(['deposit', 'withdrawal'])
      .withMessage('Operation must be deposit or withdrawal'),
    body('amount')
      .custom((value) => {
        const raw = typeof value === 'number' ? value.toString() : value;
        return typeof raw === 'string' && PATTERNS.amount.test(raw);
      })
      .withMessage('Amount must be a positive number with at most two decimal places')
      .custom((value) => Number(value) > 0 && Number(value) <= MAX_BALANCE_ADJUSTMENT)
      .withMessage(`Amount must be between 0.01 and ${MAX_BALANCE_ADJUSTMENT}`),
  ],
  handleValidation,
  async (req, res) => {
    const targetId = req.params.id;
    const adminId = req.session.user.id;
    const adminRole = req.session.user.role;
    const operation = req.body.operation;
    // Preserve the validated decimal string for exact DECIMAL arithmetic in MySQL.
    const rawAmount = typeof req.body.amount === 'number'
      ? req.body.amount.toString()
      : req.body.amount;

    if (!/^\d+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    const [wholePart, fractionalPart = ''] = rawAmount.split('.');
    const amount = `${wholePart.replace(/^0+(?=\d)/, '')}.${fractionalPart.padEnd(2, '0')}`;
    const auditAction = operation === 'deposit'
      ? `ADMIN_DEPOSIT $${amount} TO ${targetId}`
      : `ADMIN_WITHDRAWAL $${amount} FROM ${targetId}`;

    try {
      const result = await runTransaction(async (conn) => {
        const [[customer]] = await conn.execute(
          'SELECT user_id, balance, status FROM users WHERE user_id = ? FOR UPDATE',
          [targetId]
        );

        if (!customer) {
          throw { status: 404, json: { error: 'Customer not found' } };
        }
        if (customer.status !== 'active') {
          throw { status: 403, json: { error: 'Balance adjustments require an active customer account' } };
        }

        if (operation === 'withdrawal') {
          // The balance predicate is a second line of defence against overdrafts.
          const [update] = await conn.execute(
            'UPDATE users SET balance = balance - ? WHERE user_id = ? AND balance >= ?',
            [amount, targetId, amount]
          );
          if (update.affectedRows !== 1) {
            throw { status: 400, json: { error: 'Insufficient balance' } };
          }
        } else {
          await conn.execute(
            'UPDATE users SET balance = balance + ? WHERE user_id = ?',
            [amount, targetId]
          );
        }

        const signedAmount = operation === 'withdrawal' ? `-${amount}` : amount;
        const description = operation === 'withdrawal'
          ? `ADMIN_WITHDRAWAL $${amount} FROM ${targetId} BY ADMIN ${adminId}`
          : `ADMIN_DEPOSIT $${amount} TO ${targetId} BY ADMIN ${adminId}`;

        await conn.execute(
          `INSERT INTO transaction_history (user_id, recipient_id, amount, description)
           VALUES (?, NULL, ?, ?)`,
          [targetId, signedAmount, description]
        );

        const [[updated]] = await conn.execute(
          'SELECT balance FROM users WHERE user_id = ?',
          [targetId]
        );
        return { newBalance: updated.balance };
      });

      await writeLog({
        userId: adminId,
        userRole: adminRole,
        action: auditAction,
        status: 'success',
        ipAddress: req.ip,
      });
      return res.json({
        message: operation === 'deposit' ? 'Deposit completed' : 'Withdrawal completed',
        balance: result.newBalance,
      });
    } catch (err) {
      await writeLog({
        userId: adminId,
        userRole: adminRole,
        action: auditAction,
        status: 'failure',
        ipAddress: req.ip,
      });
      if (err && err.status && err.json) return res.status(err.status).json(err.json);
      console.error('[admin-balance-adjustment]', err);
      return res.status(500).json({ error: 'Balance adjustment failed' });
    }
  }
);

// View all transactions (Business Admin)
// FIXED: Removed 'admin' string restriction constraint from requireAuth
router.get('/transactions', requireAuth(), requireAdminRole(['business_admin']), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.transaction_id, t.user_id, t.recipient_id,
              CASE WHEN t.amount < 0 THEN 'debit' ELSE 'credit' END AS type,
              ABS(t.amount) AS amount,
              t.description, t.created_at,
              CONCAT_WS(' ', u.first_name, u.last_name) AS user_name,
              u.account_number AS user_account,
              CONCAT_WS(' ', r.first_name, r.last_name) AS recipient_name
         FROM transaction_history t
         LEFT JOIN users u ON u.user_id = t.user_id
         LEFT JOIN users r ON r.user_id = t.recipient_id
        ORDER BY t.created_at DESC`
    );
    await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'VIEW_TRANSACTIONS', status: 'success', ipAddress: req.ip });
    res.json({ transactions: rows });
  } catch (err) {
    console.error('[admin-transactions]', err);
    await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'VIEW_TRANSACTIONS', status: 'failure', ipAddress: req.ip });
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});


/* ==========================================================================
   IT ADMIN ROUTES (Audit Logs & Business Admin Provisioning)
   ========================================================================== */

// View system logs (IT Admin)
// FIXED: Removed 'admin' string restriction constraint from requireAuth
router.get('/logs', requireAuth(), requireAdminRole(['it_admin']), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT log_id, user_id, user_role, action, status, created_at
         FROM logs
         ORDER BY created_at DESC
         LIMIT 1000`
    );
    await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'VIEW_LOGS', status: 'success', ipAddress: req.ip });
    res.json({ logs: rows });
  } catch (err) {
    console.error('[admin-logs]', err);
    await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'VIEW_LOGS', status: 'failure', ipAddress: req.ip });
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

// Create New Business Admin Account (IT Admin)
router.post(
  '/create-business-admin',
  requireAuth(),
  requireAdminRole(['it_admin']),
  [
    body('username').matches(PATTERNS.username),
    body('password').matches(PATTERNS.password),
    body('first_name').matches(PATTERNS.name),
    body('last_name').matches(PATTERNS.name),
    body('email').matches(PATTERNS.email),
    body('phone_number').matches(PATTERNS.phone),
  ],
  handleValidation,
  async (req, res) => {
    const { username, password, first_name, last_name, email, phone_number } = req.body;
    try {
      const [dupes] = await pool.execute('SELECT admin_id FROM admins WHERE username = ? LIMIT 1', [username]);
      if (dupes.length) {
        await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'BUSINESS_ADMIN_CREATE', status: 'failure', ipAddress: req.ip });
        return res.status(409).json({ error: 'Admin username already exists' });
      }

      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      
      await pool.execute(
        `INSERT INTO admins (username, password_hash, first_name, last_name, email, phone_number, role, otp_enabled)
         VALUES (?, ?, ?, ?, ?, ?, 'business_admin', 1)`,
        [username, hash, first_name, last_name, email, phone_number]
      );

      await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'BUSINESS_ADMIN_CREATE', status: 'success', ipAddress: req.ip });
      res.status(201).json({ message: 'Business Admin account successfully created' });
    } catch (err) {
      console.error('[admin-create-business]', err);
      await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'BUSINESS_ADMIN_CREATE', status: 'failure', ipAddress: req.ip });
      res.status(500).json({ error: 'Failed to create business admin' });
    }
  }
);

// List all administrative accounts (IT Admin view)
router.get('/list-admins', requireAuth(), requireAdminRole(['it_admin']), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT admin_id, username, first_name, last_name, email, phone_number, role, otp_enabled, created_at
         FROM admins
         ORDER BY admin_id ASC`
    );
    
    await writeLog({ 
      userId: req.session.user.id, 
      userRole: req.session.user.role, 
      action: 'VIEW_ADMIN_DIRECTORY', 
      status: 'success', 
      ipAddress: req.ip 
    });
    
    res.json({ admins: rows });
  } catch (err) {
    console.error('[admin-list-admins]', err);
    
    await writeLog({ 
      userId: req.session.user.id, 
      userRole: req.session.user.role, 
      action: 'VIEW_ADMIN_DIRECTORY', 
      status: 'failure', 
      ipAddress: req.ip 
    });
    
    res.status(500).json({ error: 'Failed to load administrative directory' });
  }
});

function randomAcct() {
  let n = '';
  for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10).toString();
  return n;
}

module.exports = router;
