const { writeLog } = require('../utils/logger');

function requireAuth(role) {
  return async (req, res, next) => {
    if (!req.session || !req.session.user) {
      await writeLog({ userRole: 'anonymous', action: 'AUTH_REQUIRED', status: 'failure', ipAddress: req.ip });
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (role && req.session.user.role !== role) {
      await writeLog({ userId: req.session.user.id, userRole: req.session.user.role, action: 'AUTH_REQUIRED', status: 'failure', ipAddress: req.ip });
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { requireAuth };