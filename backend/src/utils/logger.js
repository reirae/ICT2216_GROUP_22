const { pool } = require('../config/database');

function normalizeIp(ip) {
  if (ip === '::1') return '127.0.0.1';
  if (ip && ip.startsWith('::ffff:')) return ip.replace('::ffff:', '');
  return ip;
}

async function writeLog({ userId = null, userRole, action, status = 'success', ipAddress = null }) {
  try {
    await pool.execute(
      'INSERT INTO logs (user_id, user_role, action, status, ip_address) VALUES (?, ?, ?, ?, ?)',
      [userId, userRole, action, status, normalizeIp(ipAddress)]
    );
  } catch (err) {
    // Logging must never break the request flow.
    // Surface to stderr so ops can pick it up.
    console.error('[audit-log] failed to write log:', err.message);
  }
}

module.exports = { writeLog };