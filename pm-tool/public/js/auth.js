/* ============================================================
   auth.js - Login/register page interactivity
   ============================================================ */

if (Auth.getToken()) window.location.href = 'dashboard.html';

/* Floating particles for background animation */
(function createParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDuration = 7 + Math.random() * 9 + 's';
    p.style.animationDelay = Math.random() * 6 + 's';
    p.style.width = p.style.height = 3 + Math.random() * 5 + 'px';
    container.appendChild(p);
  }
})();

/* Tab switching */
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const tabSlider = document.getElementById('tabSlider');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function activateTab(which) {
  const isLogin = which === 'login';
  tabLogin.classList.toggle('active', isLogin);
  tabRegister.classList.toggle('active', !isLogin);
  tabSlider.classList.toggle('to-register', !isLogin);
  loginForm.classList.toggle('active', isLogin);
  registerForm.classList.toggle('active', !isLogin);
}
tabLogin.addEventListener('click', () => activateTab('login'));
tabRegister.addEventListener('click', () => activateTab('register'));

/* Login */
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
loginEmail.addEventListener('blur', () => showFieldError(loginEmail, Validators.email(loginEmail.value)));
loginPassword.addEventListener('blur', () => showFieldError(loginPassword, Validators.required(loginPassword.value)));

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailErr = Validators.email(loginEmail.value);
  const passErr = Validators.required(loginPassword.value);
  showFieldError(loginEmail, emailErr);
  showFieldError(loginPassword, passErr);
  if (emailErr || passErr) return;

  const btn = document.getElementById('loginSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Logging in...';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPassword.value }) });
    Auth.setSession(data.token, data.user);
    toast(`Welcome back, ${data.user.name}!`, 'success');
    setTimeout(() => window.location.href = 'dashboard.html', 400);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Log In';
  }
});

/* Register */
const regName = document.getElementById('regName');
const regUsername = document.getElementById('regUsername');
const regEmail = document.getElementById('regEmail');
const regPassword = document.getElementById('regPassword');
const regConfirmPassword = document.getElementById('regConfirmPassword');

regName.addEventListener('blur', () => showFieldError(regName, Validators.minLength(regName.value.trim(), 2)));
regUsername.addEventListener('blur', () => showFieldError(regUsername, Validators.username(regUsername.value)));
regEmail.addEventListener('blur', () => showFieldError(regEmail, Validators.email(regEmail.value)));
regPassword.addEventListener('blur', () => showFieldError(regPassword, Validators.minLength(regPassword.value, 6)));
regConfirmPassword.addEventListener('blur', () => {
  showFieldError(regConfirmPassword, regConfirmPassword.value !== regPassword.value ? 'Passwords do not match.' : '');
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errors = {
    name: Validators.minLength(regName.value.trim(), 2),
    username: Validators.username(regUsername.value.trim()),
    email: Validators.email(regEmail.value.trim()),
    password: Validators.minLength(regPassword.value, 6),
    confirm: regConfirmPassword.value !== regPassword.value ? 'Passwords do not match.' : ''
  };
  showFieldError(regName, errors.name);
  showFieldError(regUsername, errors.username);
  showFieldError(regEmail, errors.email);
  showFieldError(regPassword, errors.password);
  showFieldError(regConfirmPassword, errors.confirm);
  if (Object.values(errors).some(e => e)) { toast('Please fix the highlighted fields.', 'error'); return; }

  const btn = document.getElementById('registerSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Creating account...';
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: regName.value.trim(), username: regUsername.value.trim(), email: regEmail.value.trim(), password: regPassword.value })
    });
    Auth.setSession(data.token, data.user);
    toast(`Account created! Welcome, ${data.user.name}.`, 'success');
    setTimeout(() => window.location.href = 'dashboard.html', 400);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
  }
});
