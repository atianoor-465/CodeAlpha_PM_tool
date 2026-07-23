/* ============================================================
   dashboard.js - Dashboard page logic
   ============================================================ */

Auth.requireLogin();
const me = Auth.getUser();
initThemeToggle();
initHamburger();
initNotifDropdown();
initSocket();

document.getElementById('navAvatar').src = me.avatar;
document.getElementById('navAvatar').addEventListener('click', () => Auth.logout());
document.getElementById('heroGreeting').textContent = `Welcome back, ${me.name.split(' ')[0]}!`;

const PROJECT_COLORS = ['#2563eb', '#0ea5a4', '#f59e0b', '#ef4444', '#8b5cf6', '#0f172a'];
let selectedColor = PROJECT_COLORS[0];
let allProjects = [];
let currentSort = 'newest';
let currentSearch = '';
let currentView = 'grid';

/* ---------- Load projects + stats ---------- */
async function loadProjects() {
  const loading = document.getElementById('projectsLoading');
  loading.style.display = 'block';
  try {
    allProjects = await api('/projects');
    loading.style.display = 'none';
    computeStats();
    renderProjects();
  } catch (err) {
    loading.style.display = 'none';
    toast(err.message, 'error');
  }
}

function computeStats() {
  const totalTasks = allProjects.reduce((sum, p) => sum + p.taskCount, 0);
  const totalDone = allProjects.reduce((sum, p) => sum + p.doneCount, 0);
  const allMemberIds = new Set();
  allProjects.forEach(p => p.members.forEach(m => allMemberIds.add(m.id)));
  document.getElementById('statProjects').textContent = allProjects.length;
  document.getElementById('statTasks').textContent = totalTasks;
  document.getElementById('statDone').textContent = totalDone;
  document.getElementById('statMembers').textContent = allMemberIds.size;
}

function getFilteredSorted() {
  let list = allProjects.filter(p => p.name.toLowerCase().includes(currentSearch.toLowerCase()));
  if (currentSort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  else if (currentSort === 'tasks') list = [...list].sort((a, b) => b.taskCount - a.taskCount);
  else list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}

function renderProjects() {
  const list = getFilteredSorted();
  renderGrid(list);
  renderTable(list);
}

function renderGrid(list) {
  const grid = document.getElementById('projectsGrid');
  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state card" style="grid-column: 1 / -1;"><i class="fa-solid fa-folder-plus"></i><p>No projects yet. Create your first project board!</p></div>`;
    return;
  }
  grid.innerHTML = list.map(p => {
    const pct = p.taskCount > 0 ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
    return `
    <div class="project-card card fade-in-up" data-id="${p.id}">
      <div class="project-card-top" style="background:${p.color};"></div>
      <div class="project-card-body">
        <h3>${escapeHTML(p.name)}</h3>
        <p>${escapeHTML(p.description || 'No description provided.')}</p>
        <div class="project-card-progress">
          <div class="progress-label"><span>${p.taskCount} tasks</span><span>${pct}% done</span></div>
          <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%; background:${p.color};"></div></div>
        </div>
        <div class="project-card-footer">
          <div class="avatar-stack">
            ${p.members.slice(0, 4).map(m => `<img class="avatar avatar-xs" src="${m.avatar}" title="${escapeHTML(m.name)}" />`).join('')}
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">${timeAgo(p.createdAt)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => window.location.href = `board.html?id=${card.dataset.id}`);
  });
}

function renderTable(list) {
  const body = document.getElementById('projectsTableBody');
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:30px;">No projects found.</td></tr>`;
    return;
  }
  body.innerHTML = list.map(p => `
    <tr data-id="${p.id}">
      <td class="user-cell"><span class="board-color-dot" style="background:${p.color};"></span> ${escapeHTML(p.name)}</td>
      <td>${p.taskCount} (${p.doneCount} done)</td>
      <td>${p.members.length}</td>
      <td>${formatDate(p.createdAt)}</td>
    </tr>
  `).join('');
  body.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => window.location.href = `board.html?id=${row.dataset.id}`);
  });
}

/* Table column sort */
let tableSortKey = null, tableSortDir = 'asc';
document.querySelectorAll('#projectsTable th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    tableSortDir = (tableSortKey === key && tableSortDir === 'asc') ? 'desc' : 'asc';
    tableSortKey = key;
    document.querySelectorAll('#projectsTable th').forEach(t => t.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(tableSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');

    let list = getFilteredSorted();
    list = [...list].sort((a, b) => {
      let av = key === 'members' ? a.members.length : a[key];
      let bv = key === 'members' ? b.members.length : b[key];
      if (typeof av === 'string') return tableSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return tableSortDir === 'asc' ? av - bv : bv - av;
    });
    renderTable(list);
  });
});

/* ---------- Search / sort / view toggle ---------- */
let searchDebounce;
document.getElementById('projectSearch').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { currentSearch = e.target.value.trim(); renderProjects(); }, 250);
});
document.getElementById('projectSort').addEventListener('change', (e) => { currentSort = e.target.value; renderProjects(); });

document.querySelectorAll('.view-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    document.getElementById('projectsGrid').classList.toggle('hidden', currentView !== 'grid');
    document.getElementById('projectsTableWrap').classList.toggle('active', currentView === 'table');
  });
});

/* ---------- Create project modal ---------- */
const colorPicker = document.getElementById('colorPicker');
colorPicker.innerHTML = PROJECT_COLORS.map(c => `<div class="member-chip" data-color="${c}" style="cursor:pointer; background:${c}; width:34px; height:34px; border-radius:50%; padding:0; border: 3px solid ${c === selectedColor ? 'var(--text)' : 'transparent'};"></div>`).join('');
colorPicker.querySelectorAll('[data-color]').forEach(el => {
  el.addEventListener('click', () => {
    selectedColor = el.dataset.color;
    colorPicker.querySelectorAll('[data-color]').forEach(c => c.style.border = '3px solid transparent');
    el.style.border = '3px solid var(--text)';
  });
});

document.getElementById('newProjectBtn').addEventListener('click', () => {
  document.getElementById('createProjectModal').classList.add('open');
});
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')));
});
document.getElementById('createProjectModal').addEventListener('click', (e) => {
  if (e.target.id === 'createProjectModal') e.target.classList.remove('open');
});

document.getElementById('projDesc').addEventListener('input', (e) => {
  document.getElementById('projDescCounter').textContent = `${e.target.value.length} / 200`;
});

document.getElementById('createProjectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('projName');
  const err = Validators.minLength(nameInput.value.trim(), 2);
  showFieldError(nameInput, err);
  if (err) return;

  const btn = document.getElementById('createProjectBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Creating...';
  try {
    const project = await api('/projects', {
      method: 'POST',
      body: JSON.stringify({ name: nameInput.value.trim(), description: document.getElementById('projDesc').value.trim(), color: selectedColor })
    });
    toast('Project created!', 'success');
    document.getElementById('createProjectModal').classList.remove('open');
    e.target.reset();
    document.getElementById('projDescCounter').textContent = '0 / 200';
    window.location.href = `board.html?id=${project.id}`;
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-plus"></i> Create Project';
  }
});

/* ---------- Init ---------- */
loadProjects();
