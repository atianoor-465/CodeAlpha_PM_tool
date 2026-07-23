/* ============================================================
   utils.js - Shared utilities used across all pages
   ============================================================ */

const API_BASE = '/api';

/* ---------- Auth/token storage ---------- */
const Auth = {
  getToken() { return localStorage.getItem('pm_token'); },
  getUser() {
    const raw = localStorage.getItem('pm_user');
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem('pm_token', token);
    localStorage.setItem('pm_user', JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem('pm_token');
    localStorage.removeItem('pm_user');
    window.location.href = 'index.html';
  },
  requireLogin() {
    if (!this.getToken()) window.location.href = 'index.html';
  }
};

/* ---------- API wrapper ---------- */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = Auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data;
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

/* ---------- Toast notifications ---------- */
function toast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
  el.innerHTML = `<strong>${icon}</strong> ${message}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ---------- Custom confirm popup (replaces plain browser confirm) ---------- */
function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Delete', onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay confirm-modal open';
  overlay.innerHTML = `
    <div class="modal">
      <div class="confirm-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <h2 style="justify-content:center;">${title}</h2>
      <p style="color:var(--text-muted); font-size:0.9rem;">${message}</p>
      <div class="confirm-actions">
        <button class="btn btn-ghost" id="confirmCancelBtn">Cancel</button>
        <button class="btn btn-danger" id="confirmOkBtn">${confirmText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#confirmCancelBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#confirmOkBtn').addEventListener('click', () => {
    overlay.remove();
    onConfirm && onConfirm();
  });
}

/* ---------- Theme toggle (dark/light mode) ---------- */
function initThemeToggle() {
  const toggle = document.querySelector('.theme-toggle');
  const saved = localStorage.getItem('pm_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pm_theme', next);
  });
}

/* ---------- Mobile nav hamburger toggle ---------- */
function initHamburger() {
  const burger = document.querySelector('.hamburger');
  const links = document.querySelector('.nav-links');
  if (!burger || !links) return;
  burger.addEventListener('click', () => links.classList.toggle('open'));
}

/* ---------- Relative time ---------- */
function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  const intervals = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [label, secs] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}
function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function isOverdue(dueDate, status) {
  if (!dueDate || status === 'done') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

/* ---------- Escape HTML ---------- */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/* ---------- Validators ---------- */
const Validators = {
  required(value) { return value && value.trim().length > 0 ? '' : 'This field is required.'; },
  email(value) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(value) ? '' : 'Please enter a valid email address.';
  },
  minLength(value, n) { return value.length >= n ? '' : `Must be at least ${n} characters.`; },
  username(value) {
    const re = /^[a-zA-Z0-9_]{3,20}$/;
    return re.test(value) ? '' : 'Username: 3-20 chars, letters/numbers/underscore only.';
  }
};
function showFieldError(inputEl, message) {
  const errorEl = inputEl.parentElement.querySelector('.field-error');
  if (message) {
    inputEl.classList.add('invalid'); inputEl.classList.remove('valid');
    if (errorEl) errorEl.textContent = message;
  } else {
    inputEl.classList.remove('invalid'); inputEl.classList.add('valid');
    if (errorEl) errorEl.textContent = '';
  }
}

/* ---------- Socket.io connection (shared across board pages) ---------- */
let socket = null;
function initSocket() {
  if (socket) return socket;
  const token = Auth.getToken();
  if (!token || typeof io === 'undefined') return null;
  socket = io({ auth: { token } });
  socket.on('notification:new', (notif) => {
    toast(notif.message, 'info');
    const bell = document.querySelector('.notif-bell');
    if (bell) { bell.classList.add('shake'); setTimeout(() => bell.classList.remove('shake'), 600); }
    refreshNotifBadge();
  });
  return socket;
}

/* ---------- Notification bell dropdown (shared component) ---------- */
async function refreshNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  try {
    const data = await api('/notifications');
    badge.textContent = data.unreadCount;
    badge.style.display = data.unreadCount > 0 ? 'flex' : 'none';
  } catch (e) { /* silent */ }
}

async function initNotifDropdown() {
  const bell = document.getElementById('notifBellBtn');
  const dropdown = document.getElementById('notifDropdown');
  if (!bell || !dropdown) return;

  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
    if (dropdown.classList.contains('open')) await loadNotifDropdown();
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !bell.contains(e.target)) dropdown.classList.remove('open');
  });

  await refreshNotifBadge();
}

async function loadNotifDropdown() {
  const list = document.getElementById('notifList');
  list.innerHTML = '<div class="spinner" style="width:24px;height:24px;"></div>';
  try {
    const data = await api('/notifications');
    if (data.notifications.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:24px;"><i class="fa-solid fa-bell-slash"></i><p style="font-size:0.85rem;">No notifications yet.</p></div>`;
      return;
    }
    list.innerHTML = data.notifications.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" data-link="${n.link || ''}">
        <div class="notif-icon"><i class="fa-solid fa-${n.type === 'task_assigned' ? 'user-check' : n.type === 'new_comment' ? 'comment' : 'users'}"></i></div>
        <div class="notif-text">
          <p>${escapeHTML(n.message)}</p>
          <span>${timeAgo(n.createdAt)}</span>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        await api(`/notifications/${item.dataset.id}/read`, { method: 'POST' });
        if (item.dataset.link) window.location.href = item.dataset.link;
        refreshNotifBadge();
      });
    });
  } catch (err) {
    list.innerHTML = `<p style="padding:16px; color:var(--danger); font-size:0.85rem;">Could not load notifications.</p>`;
  }
}

document.addEventListener('click', async (e) => {
  if (e.target.id === 'markAllReadBtn') {
    await api('/notifications/read-all', { method: 'POST' });
    refreshNotifBadge();
    loadNotifDropdown();
  }
});
