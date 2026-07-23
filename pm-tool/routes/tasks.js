const express = require('express');
const router = express.Router();
const { load, save } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { emitToProject } = require('../sockets');
const { pushNotification } = require('../notify');

const VALID_STATUSES = ['todo', 'inprogress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

function safeUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}

function enrichTask(db, task) {
  const assignee = task.assigneeId ? db.users.find(u => u.id === task.assigneeId) : null;
  const creator = db.users.find(u => u.id === task.createdBy);
  const commentCount = db.comments.filter(c => c.taskId === task.id).length;
  return { ...task, assignee: safeUser(assignee), creator: safeUser(creator), commentCount };
}

function checkProjectAccess(db, projectId, userId) {
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return null;
  if (project.ownerId !== userId && !project.memberIds.includes(userId)) return false;
  return project;
}

// GET /api/tasks?projectId=&search=&status=&priority=&assignee=&sort=
router.get('/', requireAuth, (req, res) => {
  const db = load();
  const { projectId, search = '', status, priority, assignee, sort = 'order' } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId query parameter is required.' });

  const access = checkProjectAccess(db, parseInt(projectId), req.user.id);
  if (access === null) return res.status(404).json({ error: 'Project not found.' });
  if (access === false) return res.status(403).json({ error: 'You do not have access to this project.' });

  let tasks = db.tasks.filter(t => t.projectId === parseInt(projectId));

  if (search) {
    tasks = tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(search.toLowerCase()));
  }
  if (status && VALID_STATUSES.includes(status)) tasks = tasks.filter(t => t.status === status);
  if (priority && VALID_PRIORITIES.includes(priority)) tasks = tasks.filter(t => t.priority === priority);
  if (assignee) tasks = tasks.filter(t => String(t.assigneeId) === String(assignee));

  let enriched = tasks.map(t => enrichTask(db, t));

  if (sort === 'dueDate') {
    enriched.sort((a, b) => (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity));
  } else if (sort === 'priority') {
    const rank = { high: 0, medium: 1, low: 2 };
    enriched.sort((a, b) => rank[a.priority] - rank[b.priority]);
  } else if (sort === 'newest') {
    enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sort === 'title') {
    enriched.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    enriched.sort((a, b) => a.order - b.order);
  }

  res.json(enriched);
});

// POST /api/tasks -- create a new task card
router.post('/', requireAuth, (req, res) => {
  const db = load();
  const { projectId, title, description, priority, assigneeId, dueDate, status, attachments } = req.body;

  const access = checkProjectAccess(db, parseInt(projectId), req.user.id);
  if (access === null) return res.status(404).json({ error: 'Project not found.' });
  if (access === false) return res.status(403).json({ error: 'You do not have access to this project.' });

  if (!title || title.trim().length === 0) return res.status(400).json({ error: 'Task title is required.' });
  if (title.length > 100) return res.status(400).json({ error: 'Task title must be under 100 characters.' });
  const finalStatus = VALID_STATUSES.includes(status) ? status : 'todo';
  const finalPriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium';

  if (assigneeId && !access.memberIds.includes(parseInt(assigneeId))) {
    return res.status(400).json({ error: 'Assignee must be a member of this project.' });
  }

  const columnTasks = db.tasks.filter(t => t.projectId === access.id && t.status === finalStatus);
  const task = {
    id: db.nextIds.tasks++,
    projectId: access.id,
    title: title.trim(),
    description: description || '',
    status: finalStatus,
    priority: finalPriority,
    assigneeId: assigneeId ? parseInt(assigneeId) : null,
    dueDate: dueDate || null,
    createdBy: req.user.id,
    order: columnTasks.length,
    attachments: Array.isArray(attachments) ? attachments.slice(0, 12) : [],
    createdAt: new Date().toISOString()
  };
  db.tasks.push(task);

  if (task.assigneeId && task.assigneeId !== req.user.id) {
    const creator = db.users.find(u => u.id === req.user.id);
    pushNotification(db, {
      userId: task.assigneeId,
      type: 'task_assigned',
      message: `${creator.name} assigned you to "${task.title}".`,
      link: `board.html?id=${access.id}&task=${task.id}`
    });
  }
  save(db);

  const enriched = enrichTask(db, task);
  emitToProject(access.id, 'task:created', enriched);
  res.status(201).json(enriched);
});

// PUT /api/tasks/:id -- update fields, including drag-and-drop status/order changes
router.put('/:id', requireAuth, (req, res) => {
  const db = load();
  const task = db.tasks.find(t => t.id === parseInt(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const access = checkProjectAccess(db, task.projectId, req.user.id);
  if (access === false) return res.status(403).json({ error: 'You do not have access to this project.' });

  const { title, description, priority, assigneeId, dueDate, status, order, attachments } = req.body;

  if (title !== undefined) {
    if (title.trim().length === 0) return res.status(400).json({ error: 'Task title cannot be empty.' });
    task.title = title.trim();
  }
  if (description !== undefined) task.description = description;
  if (priority !== undefined && VALID_PRIORITIES.includes(priority)) task.priority = priority;
  if (dueDate !== undefined) task.dueDate = dueDate;
  if (status !== undefined && VALID_STATUSES.includes(status)) task.status = status;
  if (order !== undefined) task.order = order;
  if (Array.isArray(attachments)) task.attachments = attachments.slice(0, 12);

  const previousAssignee = task.assigneeId;
  if (assigneeId !== undefined) {
    if (assigneeId && !access.memberIds.includes(parseInt(assigneeId))) {
      return res.status(400).json({ error: 'Assignee must be a member of this project.' });
    }
    task.assigneeId = assigneeId ? parseInt(assigneeId) : null;
  }

  if (assigneeId !== undefined && task.assigneeId && task.assigneeId !== previousAssignee && task.assigneeId !== req.user.id) {
    const actor = db.users.find(u => u.id === req.user.id);
    pushNotification(db, {
      userId: task.assigneeId,
      type: 'task_assigned',
      message: `${actor.name} assigned you to "${task.title}".`,
      link: `board.html?id=${access.id}&task=${task.id}`
    });
  }

  save(db);
  const enriched = enrichTask(db, task);
  emitToProject(access.id, 'task:updated', enriched);
  res.json(enriched);
});

// POST /api/tasks/reorder -- bulk update order/status after a drag-and-drop move
router.post('/reorder', requireAuth, (req, res) => {
  const db = load();
  const { projectId, updates } = req.body; // updates: [{ id, status, order }]
  const access = checkProjectAccess(db, parseInt(projectId), req.user.id);
  if (access === false || access === null) return res.status(403).json({ error: 'You do not have access to this project.' });

  (updates || []).forEach(u => {
    const task = db.tasks.find(t => t.id === u.id && t.projectId === access.id);
    if (task) {
      task.status = VALID_STATUSES.includes(u.status) ? u.status : task.status;
      task.order = u.order;
    }
  });
  save(db);
  const tasks = db.tasks.filter(t => t.projectId === access.id).map(t => enrichTask(db, t));
  emitToProject(access.id, 'tasks:reordered', tasks);
  res.json(tasks);
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = load();
  const idx = db.tasks.findIndex(t => t.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Task not found.' });
  const task = db.tasks[idx];
  const access = checkProjectAccess(db, task.projectId, req.user.id);
  if (access === false) return res.status(403).json({ error: 'You do not have access to this project.' });

  db.tasks.splice(idx, 1);
  db.comments = db.comments.filter(c => c.taskId !== task.id);
  save(db);
  emitToProject(task.projectId, 'task:deleted', { id: task.id });
  res.json({ success: true });
});

module.exports = router;
