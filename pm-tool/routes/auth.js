const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { load, save } = require('../db');
const { SECRET } = require('../middleware/auth');

router.post('/register', (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'All fields (name, username, email, password) are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, underscore only).' });
  }

  const db = load();
  const existing = db.users.find(
    u => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase()
  );
  if (existing) {
    return res.status(409).json({ error: 'A user with that email or username already exists.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: db.nextIds.users++,
    username,
    name,
    email,
    passwordHash: hash,
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundType=gradientLinear`,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  save(db);

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
  const { passwordHash, ...safeUser } = user;
  res.status(201).json({ token, user: safeUser });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const db = load();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
  const { passwordHash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// GET /api/auth/search-users?q= -- used when inviting members to a project
router.get('/search-users', (req, res) => {
  const db = load();
  const q = (req.query.q || '').toLowerCase();
  const results = db.users
    .filter(u => u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map(({ passwordHash, ...safe }) => safe);
  res.json(results);
});

module.exports = router;
