const { pool } = require('../config/database');
const { writeLog } = require('../utils/logger');

// Enforce absolute maximum session lifespan (e.g., 1 hour in milliseconds max regardless of rolling user activity)
const ABSOLUTE_TIMEOUT_MS = 60 * 60 * 1000; 

function requireAuth(role) {
  return async (req, res, next) => {
    // 1. Basic active session verification
    if (!req.session || !req.session.user) {
      await writeLog({ userRole: 'anonymous', action: 'AUTH_REQUIRED', status: 'failure', ipAddress: req.ip });
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id, role: userRole } = req.session.user;
    
    // 2. Concurrent Session Hijacking Verification
    try {
      const isAdminRow = userRole !== 'user';
      const table = isAdminRow ? 'admins' : 'users';
      const idCol = isAdminRow ? 'admin_id' : 'user_id';
      
      const [rows] = await pool.execute(
        `SELECT active_session_id FROM ${table} WHERE ${idCol} = ? LIMIT 1`,
        [id]
      );
      
      // If the token doesn't match the current database record, another device has logged in
      if (!rows.length || rows[0].active_session_id !== req.sessionID) {
        return req.session.destroy(async (err) => {
          res.clearCookie(process.env.SESSION_COOKIE_NAME || 'securebank.sid');
          await writeLog({ userId: id, userRole, action: 'SESSION_TERMINATED_CONCURRENT', status: 'success', ipAddress: req.ip });
          return res.status(401).json({ error: 'Your account was logged in from another location. This session has been terminated.' });
        });
      }
    } catch (dbErr) {
      console.error('Session validation error:', dbErr);
      return res.status(500).json({ error: 'Internal server safety verification failed.' });
    }

    // 3. Absolute Timeout Verification
    const sessionAge = Date.now() - (req.session.createdAt || 0);
    if (sessionAge > ABSOLUTE_TIMEOUT_MS) {
      return req.session.destroy(async (err) => {
        res.clearCookie(process.env.SESSION_COOKIE_NAME || 'securebank.sid');
        await writeLog({ userId: id, userRole, action: 'SESSION_EXPIRED', status: 'success', ipAddress: req.ip });
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      });
    }

    // 4. Role-based access control verification
    if (role && req.session.user.role !== role) {
      await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'AUTH_REQUIRED', status: 'failure', ipAddress: req.ip });
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}

module.exports = { requireAuth };