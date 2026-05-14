const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { writeLog } = require('../utils/logger');
const { handleValidation, PATTERNS } = require('../middleware/validation');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// All users (admin view).
router.get('/users', requireAuth('admin'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, username, first_name, last_name, email, phone_number,
              account_number, balance, status, failed_attempts, locked_until,
              created_at, updated_at
         FROM users
         ORDER BY user_id ASC`
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('[admin-users]', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// Create user (admin).
router.post(
  '/users',
  requireAuth('admin'),
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
        'SELECT user_id FROM users WHERE username = ? OR email = ? LIMIT 1',
        [username, email]
      );
      if (dupes.length) return res.status(409).json({ error: 'Username or email already exists' });

      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const accountNumber = randomAcct();
      await pool.execute(
        `INSERT INTO users (username, password_hash, first_name, last_name, email, phone_number, account_number, balance, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active')`,
        [username, hash, first_name, last_name, email, phone_number || null, accountNumber]
      );
      await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'USER_CREATE', status: 'success' });
      res.status(201).json({ message: 'User created' });
    } catch (err) {
      console.error('[admin-users-create]', err);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Update user (admin).
router.put(
  '/users/:id',
  requireAuth('admin'),
  [
    body('first_name').optional().matches(PATTERNS.name),
    body('last_name').optional().matches(PATTERNS.name),
    body('email').optional().matches(PATTERNS.email),
    body('phone_number').optional({ checkFalsy: true }).matches(PATTERNS.phone),
    body('status').optional().isIn(['active', 'suspended', 'deactivated']),
  ],
  handleValidation,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const allowed = ['first_name', 'last_name', 'email', 'phone_number', 'status'];
    const fields = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(id);

    try {
      const [result] = await pool.execute(
        `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`,
        values
      );
      if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });

      if (req.body.status) {
        await writeLog({
          userId: req.session.user.id,
          userRole: 'admin',
          action: 'USER_STATUS_CHANGE',
          status: 'success',
        });
      } else {
        await writeLog({
          userId: req.session.user.id,
          userRole: 'admin',
          action: 'USER_UPDATE',
          status: 'success',
        });
      }
      res.json({ message: 'User updated' });
    } catch (err) {
      console.error('[admin-users-update]', err);
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// Deactivate user (soft delete).
router.delete('/users/:id', requireAuth('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  try {
    const [result] = await pool.execute(
      "UPDATE users SET status = 'deactivated' WHERE user_id = ?",
      [id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    await writeLog({
      userId: req.session.user.id,
      userRole: 'admin',
      action: 'USER_DEACTIVATE',
      status: 'success',
    });
    res.json({ message: 'User deactivated' });
  } catch (err) {
    console.error('[admin-users-delete]', err);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// All transactions.
router.get('/transactions', requireAuth('admin'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.transaction_id, t.user_id, t.recipient_id, t.type, t.amount,
              t.description, t.created_at,
              CONCAT_WS(' ', u.first_name, u.last_name) AS user_name,
              u.account_number AS user_account,
              CONCAT_WS(' ', r.first_name, r.last_name) AS recipient_name
         FROM transaction_history t
         LEFT JOIN users u ON u.user_id = t.user_id
         LEFT JOIN users r ON r.user_id = t.recipient_id
        ORDER BY t.created_at DESC`
    );
    res.json({ transactions: rows });
  } catch (err) {
    console.error('[admin-transactions]', err);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

// Logs.
router.get('/logs', requireAuth('admin'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT log_id, user_id, user_role, action, status, created_at
         FROM logs
         ORDER BY created_at DESC
         LIMIT 1000`
    );
    res.json({ logs: rows });
  } catch (err) {
    console.error('[admin-logs]', err);
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

function randomAcct() {
  let n = '';
  for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10).toString();
  return n;
}

module.exports = router;
