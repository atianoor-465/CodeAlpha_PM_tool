const express = require('express');
const router = express.Router();
const { load, save } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/notifications -- most recent 30 for the current user
router.get('/', requireAuth, (req, res) => {
  const db = load();
  const mine = db.notifications
    .filter(n => n.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 30);
  const unreadCount = db.notifications.filter(n => n.userId === req.user.id && !n.read).length;
  res.json({ notifications: mine, unreadCount });
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, (req, res) => {
  const db = load();
  const notif = db.notifications.find(n => n.id === parseInt(req.params.id) && n.userId === req.user.id);
  if (!notif) return res.status(404).json({ error: 'Notification not found.' });
  notif.read = true;
  save(db);
  res.json({ success: true });
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, (req, res) => {
  const db = load();
  db.notifications.forEach(n => { if (n.userId === req.user.id) n.read = true; });
  save(db);
  res.json({ success: true });
});

module.exports = router;
