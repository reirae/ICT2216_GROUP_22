const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { writeLog } = require('../utils/logger');
const { handleValidation, PATTERNS } = require('../middleware/validation');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

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
router.get('/users', requireAuth('admin'), requireAdminRole(['business_admin']), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, username, first_name, last_name, email, phone_number,
              account_number, balance, status, failed_attempts, locked_until,
              created_at, updated_at
         FROM users
         ORDER BY user_id ASC`
    );
    await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'VIEW_USERS', status: 'success' });
    res.json({ users: rows });
  } catch (err) {
    console.error('[admin-users]', err);
    await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'VIEW_USERS', status: 'failure' });
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// Create banking user (Business Admin)
router.post(
  '/users',
  requireAuth('admin'),
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
        await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'USER_CREATE', status: 'failure' });
        return res.status(409).json({ error: 'Username, email, or phone number already exists' });
      }

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
      await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'USER_CREATE', status: 'failure' });
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Update user details/status (Business Admin)
router.put(
  '/users/:id',
  requireAuth('admin'),
  requireAdminRole(['business_admin']),
  [
    body('first_name').optional().matches(PATTERNS.name),
    body('last_name').optional().matches(PATTERNS.name),
    body('email').optional().matches(PATTERNS.email),
    body('phone_number').optional({ checkFalsy: true }).matches(PATTERNS.phone),
    body('status').optional().isIn(['active', 'suspended', 'deactivated']),
  ],
  handleValidation,
  async (req, res) => {
    // 1. Keep the ID as a string or cast to BigInt to prevent losing precision
    const idStr = req.params.id;
    
    // Simple regex check to ensure the route parameter contains only digits
    if (!/^\d+$/.test(idStr)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

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
    
    // 2. Push the uncorrupted string representation of the BIGINT
    values.push(idStr);

    try {
      const query = `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`;
      const [result] = await pool.execute(query, values);
      
      if (result.affectedRows === 0) {
        await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'USER_UPDATE_FAIL', status: 'failure' });
        return res.status(404).json({ error: `User with ID ${idStr} not found.` });
      }

      await writeLog({
        userId: req.session.user.id,
        userRole: 'admin',
        action: req.body.status ? 'USER_STATUS_CHANGE' : 'USER_UPDATE',
        status: 'success',
      });
      
      return res.json({ message: 'User updated successfully' });
    } catch (err) {
      console.error('[admin-users-update]', err);
      await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'USER_UPDATE', status: 'failure' });
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// View all transactions (Business Admin)
router.get('/transactions', requireAuth('admin'), requireAdminRole(['business_admin']), async (req, res) => {
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
    await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'VIEW_TRANSACTIONS', status: 'success' });
    res.json({ transactions: rows });
  } catch (err) {
    console.error('[admin-transactions]', err);
    await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'VIEW_TRANSACTIONS', status: 'failure' });
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});


/* ==========================================================================
   IT ADMIN ROUTES (Audit Logs & Business Admin Provisioning)
   ========================================================================== */

// View system logs (IT Admin)
router.get('/logs', requireAuth('admin'), requireAdminRole(['it_admin']), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT log_id, user_id, user_role, action, status, created_at
         FROM logs
         ORDER BY created_at DESC
         LIMIT 1000`
    );
    await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'VIEW_LOGS', status: 'success' });
    res.json({ logs: rows });
  } catch (err) {
    console.error('[admin-logs]', err);
    await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'VIEW_LOGS', status: 'failure' });
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

// Create New Business Admin Account (IT Admin)
router.post(
  '/create-business-admin',
  requireAuth('admin'),
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
      // Check if username is taken in the admins table
      const [dupes] = await pool.execute('SELECT admin_id FROM admins WHERE username = ? LIMIT 1', [username]);
      if (dupes.length) {
        await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'BUSINESS_ADMIN_CREATE', status: 'failure' });
        return res.status(409).json({ error: 'Admin username already exists' });
      }

      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      
      // Save all administrative profile fields accurately into the database
      await pool.execute(
        `INSERT INTO admins (username, password_hash, first_name, last_name, email, phone_number, role, otp_enabled)
         VALUES (?, ?, ?, ?, ?, ?, 'business_admin', 1)`,
        [username, hash, first_name, last_name, email, phone_number]
      );

      await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'BUSINESS_ADMIN_CREATE', status: 'success' });
      res.status(201).json({ message: 'Business Admin account successfully created' });
    } catch (err) {
      console.error('[admin-create-business]', err);
      await writeLog({ userId: req.session.user.id, userRole: 'admin', action: 'BUSINESS_ADMIN_CREATE', status: 'failure' });
      res.status(500).json({ error: 'Failed to create business admin' });
    }
  }
);
// List all administrative accounts (IT Admin view)
router.get('/list-admins', requireAuth('admin'), requireAdminRole(['it_admin']), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT admin_id, username, first_name, last_name, email, phone_number, role, otp_enabled, created_at
         FROM admins
         ORDER BY admin_id ASC`
    );
    
    // Log the successful view action to the audit logs
    await writeLog({ 
      userId: req.session.user.id, 
      userRole: 'admin', 
      action: 'VIEW_ADMIN_DIRECTORY', 
      status: 'success' 
    });
    
    res.json({ admins: rows });
  } catch (err) {
    console.error('[admin-list-admins]', err);
    
    // Log the failure to the audit logs
    await writeLog({ 
      userId: req.session.user.id, 
      userRole: 'admin', 
      action: 'VIEW_ADMIN_DIRECTORY', 
      status: 'failure' 
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