const express = require('express');
const router = express.Router();
const { load, save } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { pushNotification } = require('../notify');

function safeUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}

function enrichProject(db, project) {
  const owner = db.users.find(u => u.id === project.ownerId);
  const members = project.memberIds.map(id => safeUser(db.users.find(u => u.id === id))).filter(Boolean);
  const taskCount = db.tasks.filter(t => t.projectId === project.id).length;
  const doneCount = db.tasks.filter(t => t.projectId === project.id && t.status === 'done').length;
  return { ...project, owner: safeUser(owner), members, taskCount, doneCount };
}

// GET /api/projects -- all projects the current user owns or is a member of
router.get('/', requireAuth, (req, res) => {
  const db = load();
  const mine = db.projects.filter(p => p.ownerId === req.user.id || p.memberIds.includes(req.user.id));
  const enriched = mine.map(p => enrichProject(db, p)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(enriched);
});

// POST /api/projects -- create a new project board
router.post('/', requireAuth, (req, res) => {
  const { name, description, color } = req.body;
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Project name must be at least 2 characters.' });
  }
  if (name.length > 60) {
    return res.status(400).json({ error: 'Project name must be under 60 characters.' });
  }
  const db = load();
  const project = {
    id: db.nextIds.projects++,
    name: name.trim(),
    description: description || '',
    color: color || '#2563eb',
    ownerId: req.user.id,
    memberIds: [req.user.id],
    createdAt: new Date().toISOString()
  };
  db.projects.push(project);
  save(db);
  res.status(201).json(enrichProject(db, project));
});

// GET /api/projects/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = load();
  const project = db.projects.find(p => p.id === parseInt(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  if (project.ownerId !== req.user.id && !project.memberIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'You do not have access to this project.' });
  }
  res.json(enrichProject(db, project));
});

// PUT /api/projects/:id -- update name/description/color (owner only)
router.put('/:id', requireAuth, (req, res) => {
  const db = load();
  const project = db.projects.find(p => p.id === parseInt(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  if (project.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the project owner can edit it.' });

  const { name, description, color } = req.body;
  if (name && name.trim().length < 2) return res.status(400).json({ error: 'Project name too short.' });
  if (name) project.name = name.trim();
  if (description !== undefined) project.description = description;
  if (color) project.color = color;
  save(db);
  res.json(enrichProject(db, project));
});

// DELETE /api/projects/:id -- owner only
router.delete('/:id', requireAuth, (req, res) => {
  const db = load();
  const idx = db.projects.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Project not found.' });
  if (db.projects[idx].ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete this project.' });
  const projectId = db.projects[idx].id;
  const taskIds = db.tasks.filter(t => t.projectId === projectId).map(t => t.id);
  db.tasks = db.tasks.filter(t => t.projectId !== projectId);
  db.comments = db.comments.filter(c => !taskIds.includes(c.taskId));
  db.projects.splice(idx, 1);
  save(db);
  res.json({ success: true });
});

// POST /api/projects/:id/members -- invite a member by username
router.post('/:id/members', requireAuth, (req, res) => {
  const db = load();
  const project = db.projects.find(p => p.id === parseInt(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  if (project.ownerId !== req.user.id && !project.memberIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'You do not have access to this project.' });
  }
  const { username } = req.body;
  if (!username || !username.trim()) return res.status(400).json({ error: 'Please provide a username to invite.' });

  const targetUser = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!targetUser) return res.status(404).json({ error: 'No user found with that username.' });
  if (project.memberIds.includes(targetUser.id)) {
    return res.status(409).json({ error: 'This user is already a member of the project.' });
  }

  project.memberIds.push(targetUser.id);
  const inviter = db.users.find(u => u.id === req.user.id);
  pushNotification(db, {
    userId: targetUser.id,
    type: 'project_invite',
    message: `${inviter.name} added you to the project "${project.name}".`,
    link: `board.html?id=${project.id}`
  });
  save(db);
  res.status(201).json(enrichProject(db, project));
});

// DELETE /api/projects/:id/members/:userId -- remove a member (owner only, or self-leave)
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  const db = load();
  const project = db.projects.find(p => p.id === parseInt(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  const targetId = parseInt(req.params.userId);
  const isSelf = targetId === req.user.id;
  if (project.ownerId !== req.user.id && !isSelf) {
    return res.status(403).json({ error: 'Only the owner can remove other members.' });
  }
  if (targetId === project.ownerId) {
    return res.status(400).json({ error: 'The project owner cannot be removed.' });
  }
  project.memberIds = project.memberIds.filter(id => id !== targetId);
  save(db);
  res.json(enrichProject(db, project));
});

module.exports = router;
