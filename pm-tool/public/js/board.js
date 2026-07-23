/* ============================================================
   board.js - Kanban board page logic
   ============================================================ */

Auth.requireLogin();
const me = Auth.getUser();
initThemeToggle();
initHamburger();
initNotifDropdown();

const params = new URLSearchParams(window.location.search);
const projectId = parseInt(params.get('id'));
if (!projectId) window.location.href = 'dashboard.html';

document.getElementById('navAvatar').src = me.avatar;
document.getElementById('navAvatar').addEventListener('click', () => Auth.logout());

const COLUMNS = [
  { key: 'todo', label: 'To Do', icon: 'circle' },
  { key: 'inprogress', label: 'In Progress', icon: 'spinner' },
  { key: 'done', label: 'Done', icon: 'circle-check' }
];

let project = null;
let allTasks = [];
let currentFilters = { search: '', priority: '', assignee: '', sort: 'order' };
let currentView = 'board';
let openTaskId = null;
let draggedTaskId = null;

/* ---------- Socket setup ---------- */
const sock = initSocket();
if (sock) {
  sock.emit('join:project', projectId);
  sock.on('task:created', (task) => { if (task.projectId === projectId) { upsertTask(task); renderAll(); } });
  sock.on('task:updated', (task) => {
    if (task.projectId === projectId) {
      upsertTask(task);
      renderAll();
      if (openTaskId === task.id) populateTaskModal(task);
    }
  });
  sock.on('task:deleted', ({ id }) => { allTasks = allTasks.filter(t => t.id !== id); renderAll(); });
  sock.on('tasks:reordered', (tasks) => { allTasks = tasks; renderAll(); });
  sock.on('comment:created', ({ taskId, comment }) => {
    const task = allTasks.find(t => t.id === taskId);
    if (task) task.commentCount = (task.commentCount || 0) + 1;
    if (openTaskId === taskId) appendCommentToDOM(comment);
    renderAll();
  });
  sock.on('typing', ({ taskId, name }) => {
    if (openTaskId === taskId) {
      const el = document.getElementById('typingIndicator');
      el.textContent = `${name} is typing...`;
      clearTimeout(window.__typingTimeout);
      window.__typingTimeout = setTimeout(() => { el.textContent = ''; }, 2000);
    }
  });
}

function upsertTask(task) {
  const idx = allTasks.findIndex(t => t.id === task.id);
  if (idx >= 0) allTasks[idx] = task; else allTasks.push(task);
}

/* ---------- Load project header ---------- */
async function loadProject() {
  try {
    project = await api(`/projects/${projectId}`);
    document.title = `${project.name} | TaskFlow`;
    document.getElementById('boardName').textContent = project.name;
    document.getElementById('boardDesc').textContent = project.description || 'No description provided.';
    document.getElementById('boardColorDot').style.background = project.color;
    document.getElementById('boardMembers').innerHTML = project.members.map(m =>
      `<img class="avatar avatar-sm" src="${m.avatar}" title="${escapeHTML(m.name)}" />`
    ).join('');
    document.getElementById('deleteProjectBtn').style.display = project.owner.id === me.id ? 'inline-flex' : 'none';

    const assigneeFilter = document.getElementById('filterAssignee');
    const taskAssigneeSelect = document.getElementById('taskAssignee');
    assigneeFilter.innerHTML = '<option value="">All assignees</option>' + project.members.map(m => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join('');
    taskAssigneeSelect.innerHTML = '<option value="">Unassigned</option>' + project.members.map(m => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join('');
  } catch (err) {
    toast(err.message, 'error');
    setTimeout(() => window.location.href = 'dashboard.html', 1200);
  }
}

/* ---------- Load tasks ---------- */
async function loadTasks() {
  const loading = document.getElementById('boardLoading');
  loading.style.display = 'block';
  try {
    const params2 = new URLSearchParams({ projectId, sort: currentFilters.sort });
    if (currentFilters.search) params2.set('search', currentFilters.search);
    if (currentFilters.priority) params2.set('priority', currentFilters.priority);
    if (currentFilters.assignee) params2.set('assignee', currentFilters.assignee);
    allTasks = await api(`/tasks?${params2.toString()}`);
    loading.style.display = 'none';
    renderAll();
  } catch (err) {
    loading.style.display = 'none';
    toast(err.message, 'error');
  }
}

function renderAll() {
  renderKanban();
  renderTaskTable();
}

/* ---------- Render Kanban board ---------- */
function renderKanban() {
  const board = document.getElementById('kanbanBoard');
  board.innerHTML = COLUMNS.map(col => {
    const colTasks = allTasks.filter(t => t.status === col.key).sort((a, b) => a.order - b.order);
    return `
    <div class="kanban-column" data-status="${col.key}">
      <div class="kanban-column-header">
        <h3><span class="column-dot ${col.key}"></span> ${col.label}</h3>
        <span class="column-count">${colTasks.length}</span>
      </div>
      <div class="kanban-column-body" data-status="${col.key}">
        ${colTasks.map(t => renderTaskCard(t)).join('')}
      </div>
      <button class="add-task-btn" data-status="${col.key}"><i class="fa-solid fa-plus"></i> Add task</button>
    </div>`;
  }).join('');

  attachColumnDragEvents();
  attachCardEvents();

  board.querySelectorAll('.add-task-btn').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(null, btn.dataset.status));
  });
}

function renderTaskCard(t) {
  const overdue = isOverdue(t.dueDate, t.status);
  return `
    <div class="task-card" draggable="true" data-id="${t.id}">
      <div class="task-card-top">
        <span class="task-card-title">${escapeHTML(t.title)}</span>
        <span class="badge badge-${t.priority}">${t.priority}</span>
      </div>
      ${t.description ? `<div class="task-card-desc">${escapeHTML(t.description)}</div>` : ''}
      <div class="task-card-footer">
        <div class="task-card-meta">
          ${t.dueDate ? `<span class="${overdue ? 'overdue' : ''}"><i class="fa-regular fa-calendar"></i> ${formatDate(t.dueDate)}</span>` : ''}
          ${t.commentCount ? `<span><i class="fa-regular fa-comment"></i> ${t.commentCount}</span>` : ''}
        </div>
        ${t.assignee ? `<img class="avatar avatar-xs" src="${t.assignee.avatar}" title="${escapeHTML(t.assignee.name)}" />` : '<i class="fa-regular fa-circle-user" style="color:var(--text-muted);"></i>'}
      </div>
    </div>
  `;
}

function attachCardEvents() {
  document.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => {
      const task = allTasks.find(t => t.id === parseInt(card.dataset.id));
      if (task) openTaskModal(task);
    });
    card.addEventListener('dragstart', () => {
      draggedTaskId = parseInt(card.dataset.id);
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
}

/* ---------- Drag & drop between/within columns ---------- */
function attachColumnDragEvents() {
  document.querySelectorAll('.kanban-column-body').forEach(colBody => {
    colBody.addEventListener('dragover', (e) => {
      e.preventDefault();
      colBody.closest('.kanban-column').classList.add('drag-over');
      const afterEl = getDragAfterElement(colBody, e.clientY);
      const dragged = document.querySelector('.task-card.dragging');
      if (!dragged) return;
      if (afterEl == null) colBody.appendChild(dragged);
      else colBody.insertBefore(dragged, afterEl);
    });
    colBody.addEventListener('dragleave', (e) => {
      if (!colBody.contains(e.relatedTarget)) colBody.closest('.kanban-column').classList.remove('drag-over');
    });
    colBody.addEventListener('drop', async (e) => {
      e.preventDefault();
      colBody.closest('.kanban-column').classList.remove('drag-over');
      await persistColumnOrder();
    });
  });
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.task-card:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element;
}

async function persistColumnOrder() {
  const updates = [];
  document.querySelectorAll('.kanban-column-body').forEach(colBody => {
    const status = colBody.dataset.status;
    [...colBody.querySelectorAll('.task-card')].forEach((card, index) => {
      updates.push({ id: parseInt(card.dataset.id), status, order: index });
    });
  });
  updates.forEach(u => {
    const t = allTasks.find(t => t.id === u.id);
    if (t) { t.status = u.status; t.order = u.order; }
  });
  renderTaskTable();
  try {
    await api('/tasks/reorder', { method: 'POST', body: JSON.stringify({ projectId, updates }) });
  } catch (err) {
    toast(err.message, 'error');
    loadTasks();
  }
}

/* ---------- List (table) view ---------- */
let listSortKey = null, listSortDir = 'asc';
function renderTaskTable() {
  const body = document.getElementById('taskTableBody');
  let list = [...allTasks];
  if (listSortKey) {
    list.sort((a, b) => {
      let av = listSortKey === 'assignee' ? (a.assignee?.name || '') : a[listSortKey];
      let bv = listSortKey === 'assignee' ? (b.assignee?.name || '') : b[listSortKey];
      av = av || ''; bv = bv || '';
      if (typeof av === 'string') return listSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return listSortDir === 'asc' ? av - bv : bv - av;
    });
  }
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">No tasks match your filters.</td></tr>`;
    return;
  }
  body.innerHTML = list.map(t => `
    <tr data-id="${t.id}">
      <td>${escapeHTML(t.title)}</td>
      <td><span class="badge badge-${t.status}">${t.status === 'inprogress' ? 'In Progress' : t.status === 'todo' ? 'To Do' : 'Done'}</span></td>
      <td><span class="badge badge-${t.priority}">${t.priority}</span></td>
      <td>${t.assignee ? `<span class="user-cell"><img class="avatar avatar-xs" src="${t.assignee.avatar}" /> ${escapeHTML(t.assignee.name)}</span>` : '<span style="color:var(--text-muted);">Unassigned</span>'}</td>
      <td style="${isOverdue(t.dueDate, t.status) ? 'color:var(--danger); font-weight:700;' : ''}">${t.dueDate ? formatDate(t.dueDate) : '—'}</td>
    </tr>
  `).join('');
  body.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => {
      const task = allTasks.find(t => t.id === parseInt(row.dataset.id));
      if (task) openTaskModal(task);
    });
  });
}
document.querySelectorAll('#taskTable th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    listSortDir = (listSortKey === key && listSortDir === 'asc') ? 'desc' : 'asc';
    listSortKey = key;
    document.querySelectorAll('#taskTable th').forEach(t => t.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(listSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    renderTaskTable();
  });
});

/* ---------- View toggle ---------- */
document.querySelectorAll('.view-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    document.getElementById('kanbanView').classList.toggle('hidden', currentView !== 'board');
    document.getElementById('taskListView').classList.toggle('active', currentView === 'list');
  });
});

/* ---------- Filters ---------- */
let filterDebounce;
document.getElementById('taskSearch').addEventListener('input', (e) => {
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => { currentFilters.search = e.target.value.trim(); loadTasks(); }, 300);
});
document.getElementById('filterPriority').addEventListener('change', (e) => { currentFilters.priority = e.target.value; loadTasks(); });
document.getElementById('filterAssignee').addEventListener('change', (e) => { currentFilters.assignee = e.target.value; loadTasks(); });
document.getElementById('sortTasks').addEventListener('change', (e) => { currentFilters.sort = e.target.value; loadTasks(); });

/* ---------- Task modal (create/edit) ---------- */
const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
let pendingAttachments = [];

function openTaskModal(task, presetStatus = 'todo') {
  openTaskId = task ? task.id : null;
  taskForm.reset();
  pendingAttachments = task ? [...(task.attachments || [])] : [];
  document.getElementById('taskModalTitle').innerHTML = task
    ? `<i class="fa-solid fa-note-sticky"></i> Edit Task`
    : `<i class="fa-solid fa-note-sticky"></i> New Task`;
  document.getElementById('taskTitle').value = task ? task.title : '';
  document.getElementById('taskDesc').value = task ? task.description : '';
  document.getElementById('taskStatus').value = task ? task.status : presetStatus;
  document.getElementById('taskPriority').value = task ? task.priority : 'medium';
  document.getElementById('taskAssignee').value = task && task.assigneeId ? task.assigneeId : '';
  document.getElementById('taskDueDate').value = task && task.dueDate ? task.dueDate.slice(0, 10) : '';
  document.getElementById('deleteTaskBtn').style.display = task ? 'flex' : 'none';
  document.getElementById('commentsSection').style.display = task ? 'block' : 'none';
  document.getElementById('attachmentsHeading').style.display = 'block';
  document.getElementById('attachGallery').style.display = 'grid';

  renderAttachGallery();
  if (task) loadTaskComments(task.id);
  taskModal.classList.add('open');
}

function renderAttachGallery() {
  const gallery = document.getElementById('attachGallery');
  gallery.innerHTML = pendingAttachments.map((url, i) => `
    <div class="attach-item" data-idx="${i}">
      <img src="${url}" alt="attachment ${i + 1}" />
    </div>
  `).join('') + `<button type="button" class="attach-add-btn" id="addAttachBtn"><i class="fa-solid fa-plus"></i></button>`;

  gallery.querySelectorAll('.attach-item').forEach(item => {
    item.addEventListener('click', () => openLightbox(parseInt(item.dataset.idx), pendingAttachments));
  });
  document.getElementById('addAttachBtn').addEventListener('click', () => {
    const url = prompt('Paste an image URL to attach:');
    if (url && url.trim()) {
      pendingAttachments.push(url.trim());
      renderAttachGallery();
    }
  });
}

document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    openTaskId = null;
  });
});
taskModal.addEventListener('click', (e) => { if (e.target === taskModal) { taskModal.classList.remove('open'); openTaskId = null; } });

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const titleInput = document.getElementById('taskTitle');
  const err = Validators.minLength(titleInput.value.trim(), 2);
  showFieldError(titleInput, err);
  if (err) return;

  const payload = {
    projectId,
    title: titleInput.value.trim(),
    description: document.getElementById('taskDesc').value.trim(),
    status: document.getElementById('taskStatus').value,
    priority: document.getElementById('taskPriority').value,
    assigneeId: document.getElementById('taskAssignee').value || null,
    dueDate: document.getElementById('taskDueDate').value || null,
    attachments: pendingAttachments
  };

  const btn = document.getElementById('taskSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Saving...';
  try {
    if (openTaskId) {
      await api(`/tasks/${openTaskId}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Task updated!', 'success');
    } else {
      const created = await api('/tasks', { method: 'POST', body: JSON.stringify(payload) });
      openTaskId = created.id;
      toast('Task created!', 'success');
    }
    loadTasks();
    taskModal.classList.remove('open');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Task';
  }
});

document.getElementById('deleteTaskBtn').addEventListener('click', () => {
  confirmDialog({
    title: 'Delete this task?',
    message: 'This will permanently remove the task and its comments.',
    confirmText: 'Delete Task',
    onConfirm: async () => {
      try {
        await api(`/tasks/${openTaskId}`, { method: 'DELETE' });
        toast('Task deleted.', 'success');
        taskModal.classList.remove('open');
        loadTasks();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
});

function populateTaskModal(task) {
  if (openTaskId !== task.id) return;
  document.getElementById('taskStatus').value = task.status;
  document.getElementById('taskPriority').value = task.priority;
  document.getElementById('taskAssignee').value = task.assigneeId || '';
  pendingAttachments = [...(task.attachments || [])];
  renderAttachGallery();
}

/* ---------- Comments ---------- */
async function loadTaskComments(taskId) {
  const list = document.getElementById('taskCommentsList');
  list.innerHTML = '<div class="spinner" style="width:24px;height:24px;"></div>';
  try {
    const comments = await api(`/comments/task/${taskId}`);
    list.innerHTML = comments.length === 0
      ? `<p style="font-size:0.85rem; color:var(--text-muted); padding:6px 0;">No comments yet. Start the discussion!</p>`
      : comments.map(c => commentHTML(c)).join('');
    list.scrollTop = list.scrollHeight;
  } catch (err) {
    list.innerHTML = `<p style="color:var(--danger); font-size:0.85rem;">Could not load comments.</p>`;
  }
}
function commentHTML(c) {
  return `
    <div class="comment-item">
      <img class="avatar avatar-xs" src="${c.author?.avatar || ''}" alt="" />
      <div class="comment-bubble">
        <strong>${escapeHTML(c.author?.name || 'Unknown')}</strong>
        <p>${escapeHTML(c.content)}</p>
        <span class="comment-time">${timeAgo(c.createdAt)}</span>
      </div>
    </div>`;
}
function appendCommentToDOM(comment) {
  const list = document.getElementById('taskCommentsList');
  const emptyMsg = list.querySelector('p');
  if (emptyMsg) list.innerHTML = '';
  list.insertAdjacentHTML('beforeend', commentHTML(comment));
  list.scrollTop = list.scrollHeight;
  const task = allTasks.find(t => t.id === openTaskId);
  if (task) task.commentCount = (task.commentCount || 0) + 1;
}

document.getElementById('commentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('commentInput');
  const content = input.value.trim();
  if (!content || !openTaskId) return;
  try {
    await api(`/comments/task/${openTaskId}`, { method: 'POST', body: JSON.stringify({ content }) });
    input.value = '';
  } catch (err) { toast(err.message, 'error'); }
});
document.getElementById('commentInput').addEventListener('input', () => {
  if (sock && openTaskId) sock.emit('typing', { projectId, taskId: openTaskId, name: me.name.split(' ')[0] });
});

/* ---------- Lightbox for attachments ---------- */
let lightboxImages = [];
let lightboxIdx = 0;
function openLightbox(idx, images) {
  lightboxImages = images; lightboxIdx = idx;
  document.getElementById('lightboxImg').src = lightboxImages[lightboxIdx];
  document.getElementById('lightboxOverlay').classList.add('open');
}
document.getElementById('lightboxClose').addEventListener('click', () => document.getElementById('lightboxOverlay').classList.remove('open'));
document.getElementById('lightboxOverlay').addEventListener('click', (e) => { if (e.target.id === 'lightboxOverlay') e.target.classList.remove('open'); });
document.getElementById('lightboxPrev').addEventListener('click', () => {
  lightboxIdx = (lightboxIdx - 1 + lightboxImages.length) % lightboxImages.length;
  document.getElementById('lightboxImg').src = lightboxImages[lightboxIdx];
});
document.getElementById('lightboxNext').addEventListener('click', () => {
  lightboxIdx = (lightboxIdx + 1) % lightboxImages.length;
  document.getElementById('lightboxImg').src = lightboxImages[lightboxIdx];
});

/* ---------- Invite member modal ---------- */
document.getElementById('inviteMemberBtn').addEventListener('click', () => {
  document.getElementById('inviteModal').classList.add('open');
  document.getElementById('inviteUsernameInput').value = '';
  document.getElementById('inviteResults').innerHTML = '';
  renderCurrentMembers();
});

function renderCurrentMembers() {
  document.getElementById('currentMembersList').innerHTML = project.members.map(m => `
    <div class="member-chip">
      <img class="avatar avatar-xs" src="${m.avatar}" />
      ${escapeHTML(m.name)} ${m.id === project.owner.id ? '<i class="fa-solid fa-crown" style="color:var(--warning); font-size:0.7rem;"></i>' : ''}
    </div>
  `).join('');
}

let inviteDebounce;
document.getElementById('inviteUsernameInput').addEventListener('input', (e) => {
  clearTimeout(inviteDebounce);
  const q = e.target.value.trim();
  if (!q) { document.getElementById('inviteResults').innerHTML = ''; return; }
  inviteDebounce = setTimeout(async () => {
    try {
      const users = await api(`/auth/search-users?q=${encodeURIComponent(q)}`);
      const results = document.getElementById('inviteResults');
      const available = users.filter(u => !project.members.some(m => m.id === u.id));
      results.innerHTML = available.length === 0
        ? `<p style="font-size:0.85rem; color:var(--text-muted); padding:10px 0;">No matching users to invite.</p>`
        : available.map(u => `
          <div class="notif-item" style="cursor:default;">
            <img class="avatar avatar-sm" src="${u.avatar}" />
            <div class="notif-text" style="flex:1;">
              <p><strong>${escapeHTML(u.name)}</strong></p>
              <span>@${escapeHTML(u.username)}</span>
            </div>
            <button class="btn btn-sm btn-primary" data-username="${u.username}">Add</button>
          </div>
        `).join('');
      results.querySelectorAll('[data-username]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            project = await api(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ username: btn.dataset.username }) });
            toast('Member added!', 'success');
            document.getElementById('boardMembers').innerHTML = project.members.map(m => `<img class="avatar avatar-sm" src="${m.avatar}" title="${escapeHTML(m.name)}" />`).join('');
            const assigneeFilter = document.getElementById('filterAssignee');
            const taskAssigneeSelect = document.getElementById('taskAssignee');
            assigneeFilter.innerHTML = '<option value="">All assignees</option>' + project.members.map(m => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join('');
            taskAssigneeSelect.innerHTML = '<option value="">Unassigned</option>' + project.members.map(m => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join('');
            renderCurrentMembers();
            document.getElementById('inviteUsernameInput').value = '';
            document.getElementById('inviteResults').innerHTML = '';
          } catch (err) { toast(err.message, 'error'); }
        });
      });
    } catch (err) { toast(err.message, 'error'); }
  }, 300);
});

/* ---------- Delete project ---------- */
document.getElementById('deleteProjectBtn').addEventListener('click', () => {
  confirmDialog({
    title: 'Delete this project?',
    message: `"${project.name}" and all of its tasks and comments will be permanently deleted.`,
    confirmText: 'Delete Project',
    onConfirm: async () => {
      try {
        await api(`/projects/${projectId}`, { method: 'DELETE' });
        toast('Project deleted.', 'success');
        setTimeout(() => window.location.href = 'dashboard.html', 500);
      } catch (err) { toast(err.message, 'error'); }
    }
  });
});

/* ---------- Init ---------- */
(async function init() {
  await loadProject();
  await loadTasks();
  const taskParam = params.get('task');
  if (taskParam) {
    const t = allTasks.find(t => t.id === parseInt(taskParam));
    if (t) openTaskModal(t);
  }
})();
