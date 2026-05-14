const { pool } = require('../config/database');

async function writeLog({ userId = null, userRole, action, status = 'success' }) {
  try {
    await pool.execute(
      'INSERT INTO logs (user_id, user_role, action, status) VALUES (?, ?, ?, ?)',
      [userId, userRole, action, status]
    );
  } catch (err) {
    // Logging must never break the request flow.
    // Surface to stderr so ops can pick it up.
    console.error('[audit-log] failed to write log:', err.message);
  }
}

module.exports = { writeLog };
