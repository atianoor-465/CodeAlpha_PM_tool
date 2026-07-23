const jwt = require('jsonwebtoken');
const SECRET = 'codealpha-pm-tool-secret-2026';

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please login.' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET); // { id, username }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token. Please login again.' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (header && header.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.split(' ')[1], SECRET); } catch (e) { req.user = null; }
  }
  next();
}

module.exports = { requireAuth, optionalAuth, SECRET };
