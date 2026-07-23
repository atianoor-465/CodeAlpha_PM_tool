const express = require('express');
const router = express.Router();
const { load, save } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { emitToProject } = require('../sockets');
const { pushNotification } = require('../notify');

function safeUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}
function enrichComment(db, comment) {
  return { ...comment, author: safeUser(db.users.find(u => u.id === comment.userId)) };
}

// GET /api/comments/task/:taskId
router.get('/task/:taskId', requireAuth, (req, res) => {
  const db = load();
  const taskId = parseInt(req.params.taskId);
  const comments = db.comments
    .filter(c => c.taskId === taskId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(c => enrichComment(db, c));
  res.json(comments);
});

// POST /api/comments/task/:taskId
router.post('/task/:taskId', requireAuth, (req, res) => {
  const db = load();
  const taskId = parseInt(req.params.taskId);
  const task = db.tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const project = db.projects.find(p => p.id === task.projectId);
  if (!project || (project.ownerId !== req.user.id && !project.memberIds.includes(req.user.id))) {
    return res.status(403).json({ error: 'You do not have access to this task.' });
  }

  const { content } = req.body;
  if (!content || content.trim().length === 0) return res.status(400).json({ error: 'Comment cannot be empty.' });
  if (content.length > 500) return res.status(400).json({ error: 'Comment must be under 500 characters.' });

  const comment = {
    id: db.nextIds.comments++,
    taskId,
    userId: req.user.id,
    content: content.trim(),
    createdAt: new Date().toISOString()
  };
  db.comments.push(comment);

  // Notify the task assignee and creator (if different from the commenter)
  const author = db.users.find(u => u.id === req.user.id);
  const notifyTargets = new Set();
  if (task.assigneeId && task.assigneeId !== req.user.id) notifyTargets.add(task.assigneeId);
  if (task.createdBy !== req.user.id) notifyTargets.add(task.createdBy);
  notifyTargets.forEach(uid => {
    pushNotification(db, {
      userId: uid,
      type: 'new_comment',
      message: `${author.name} commented on "${task.title}".`,
      link: `board.html?id=${project.id}&task=${task.id}`
    });
  });

  save(db);
  const enriched = enrichComment(db, comment);
  emitToProject(project.id, 'comment:created', { taskId, comment: enriched });
  res.status(201).json(enriched);
});

// DELETE /api/comments/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = load();
  const idx = db.comments.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Comment not found.' });
  if (db.comments[idx].userId !== req.user.id) return res.status(403).json({ error: 'You can only delete your own comments.' });

  const taskId = db.comments[idx].taskId;
  const task = db.tasks.find(t => t.id === taskId);
  db.comments.splice(idx, 1);
  save(db);
  if (task) emitToProject(task.projectId, 'comment:deleted', { taskId, commentId: parseInt(req.params.id) });
  res.json({ success: true });
});

module.exports = router;
