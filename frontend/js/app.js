// NestMatch Main App Controller
let currentUser = null;
let currentMatch = null;
let socket = null;

const App = {
  init() {
    // Fix viewport height for mobile browsers (Safari/Chrome address bar)
    this.fixViewportHeight();
    window.addEventListener('resize', () => this.fixViewportHeight());

    // Simulate loading
    setTimeout(() => {
      document.getElementById('loading-screen').style.display = 'none';
      const token = localStorage.getItem('pm_token');
      if (token) {
        this.loadUser();
      } else {
        this.showAuthContainer();
        this.showPage('landing');
      }
    }, 1500);
  },

  fixViewportHeight() {
    // Set real viewport height excluding mobile browser chrome
    // This is the JS polyfill for older browsers that don't support dvh
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    // Also directly fix #app height for maximum compatibility
    const app = document.getElementById('app');
    if (app) app.style.height = window.innerHeight + 'px';
  },

  showAuthContainer() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
  },

  showMainApp() {
    document.getElementById('auth-container').classList.add('hidden');
    const mainApp = document.getElementById('main-app');
    mainApp.classList.remove('hidden');
    // Small timeout to let browser paint before switching tab
    requestAnimationFrame(() => {
      this.switchTab('discover');
      this.initSocket();
    });
  },

  showPage(page) {
    document.querySelectorAll('#auth-container .page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${page}`)?.classList.remove('hidden');
  },

  async loadUser() {
    try {
      currentUser = await API.getMe();
      this.showMainApp();
    } catch (e) {
      localStorage.removeItem('pm_token');
      this.showAuthContainer();
      this.showPage('landing');
    }
  },

  switchTab(tab) {
    // Deactivate all nav items + hide all tabs via CSS class only
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => {
      t.classList.remove('active');
      // Remove any inline style.display that might override CSS
      t.style.removeProperty('display');
    });

    const navItem = document.querySelector(`[data-tab="${tab}"]`);
    const tabEl = document.getElementById(`tab-${tab}`);

    if (navItem) navItem.classList.add('active');
    if (tabEl) {
      tabEl.classList.add('active');
      tabEl.scrollTop = 0;
    }

    // Load tab data on demand
    if (tab === 'discover' && !Discover.loaded) Discover.load();
    if (tab === 'matches') Matches.load();
    if (tab === 'chat') Chat.loadList();
    if (tab === 'profile') Profile.load();
  },

  logout() {
    localStorage.removeItem('pm_token');
    currentUser = null;
    if (socket) { socket.disconnect(); socket = null; }
    Discover.loaded = false;
    Discover.profiles = [];
    this.showAuthContainer();
    this.showPage('landing');
  },

  goToChat(conversationId) {
    UI.closeMatchPopup();
    this.switchTab('chat');
    setTimeout(() => Chat.openConversation(conversationId), 100);
  },

  initSocket() {
    const token = localStorage.getItem('pm_token');
    if (!token) return;

    socket = io({ auth: { token } });

    socket.on('connect', () => console.log('Socket connected'));
    socket.on('disconnect', () => console.log('Socket disconnected'));

    socket.on('new_message', (msg) => {
      if (Chat.currentConvId === msg.conversation_id || Chat.currentConvId === undefined) {
        Chat.appendMessage(msg);
      }
    });

    socket.on('message_notification', (data) => {
      UI.showNotificationBadge('chat');
      if (data.conversation_id !== Chat.currentConvId) {
        UI.showToast(`💬 ${data.sender_name}: ${data.preview}`);
      }
    });

    socket.on('user_typing', (data) => {
      if (data.conversation_id === Chat.currentConvId) {
        Chat.showTyping();
      }
    });
  },

  // Register steps
  regStep: 1,
  regZones: [],

  regNext(step) {
    const errors = this.validateRegStep(step);
    const errEl = document.getElementById(`reg-error-${step}`);
    if (errors) {
      if (errEl) { errEl.textContent = errors; errEl.classList.remove('hidden'); }
      return;
    }
    if (errEl) errEl.classList.add('hidden');

    if (step < 4) {
      document.getElementById(`reg-step-${step}`).classList.add('hidden');
      document.getElementById(`reg-step-${step + 1}`).classList.remove('hidden');
      this.regStep = step + 1;
      this.updateRegProgress(step + 1);
      // Init zone map when reaching step 3
      if (step + 1 === 3) setTimeout(() => ZoneMap.init(), 50);
    }
  },

  goRegisterBack() {
    if (this.regStep <= 1) {
      this.showPage('landing');
    } else {
      document.getElementById(`reg-step-${this.regStep}`).classList.add('hidden');
      document.getElementById(`reg-step-${this.regStep - 1}`).classList.remove('hidden');
      this.regStep--;
      this.updateRegProgress(this.regStep);
    }
  },

  updateRegProgress(step) {
    document.getElementById('register-step-label').textContent = `Paso ${step} de 4`;
    document.querySelectorAll('.progress-dots .dot').forEach((d, i) => {
      d.classList.remove('active', 'done');
      if (i + 1 === step) d.classList.add('active');
      if (i + 1 < step) d.classList.add('done');
    });
  },

  validateRegStep(step) {
    if (step === 1) {
      const name = document.getElementById('reg-name').value.trim();
      const age = document.getElementById('reg-age').value;
      const email = document.getElementById('reg-email').value.trim();
      const pass = document.getElementById('reg-password').value;
      if (!name) return 'El nombre es obligatorio';
      if (!age || age < 18) return 'Debes tener al menos 18 años';
      if (!email || !/\S+@\S+\.\S+/.test(email)) return 'Email inválido';
      if (!pass || pass.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
    }
    return null;
  },

  addZone() {
    const input = document.getElementById('zone-input');
    const val = input.value.trim();
    if (!val) return;
    this.regZones.push(val);
    input.value = '';
    this.renderZones();
  },

  removeZone(zone) {
    this.regZones = this.regZones.filter(z => z !== zone);
    this.renderZones();
  },

  renderZones() {
    const container = document.getElementById('zones-tags');
    container.innerHTML = this.regZones.map(z =>
      `<span class="tag">${z}<button class="tag-remove" onclick="App.removeZone('${z}')">×</button></span>`
    ).join('');
  },

  async submitRegister() {
    const btn = document.getElementById('register-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Creando perfil...';

    const hobbies = Array.from(document.querySelectorAll('.hobby-btn.selected')).map(b => b.dataset.hobby);
    const genderPref = document.querySelector('#gender-pref .toggle-btn.active')?.dataset.val || 'any';
    const roomType = document.querySelector('#room-type .toggle-btn.active')?.dataset.val || 'private';

    const data = {
      name: document.getElementById('reg-name').value.trim(),
      age: parseInt(document.getElementById('reg-age').value),
      gender: document.getElementById('reg-gender').value || null,
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
      profession: document.getElementById('reg-profession').value.trim() || null,
      bio: document.getElementById('reg-bio').value.trim() || null,
      hobbies,
      is_smoker: document.getElementById('reg-smoker').checked,
      has_pets: document.getElementById('reg-pets').checked,
      city: document.getElementById('reg-city').value.trim(),
      neighborhood: document.getElementById('reg-neighborhood').value.trim() || null,
      preferred_zones: this.regZones,
      budget_min: parseInt(document.getElementById('reg-budget-min').value) || null,
      budget_max: parseInt(document.getElementById('reg-budget-max').value) || null,
      move_in_date: document.getElementById('reg-movein').value || null,
      stay_duration: document.getElementById('reg-duration').value,
      looking_for_gender: genderPref,
      age_min: parseInt(document.getElementById('reg-age-min').value) || 18,
      age_max: parseInt(document.getElementById('reg-age-max').value) || 65,
      accepts_smokers: document.getElementById('reg-accept-smokers').checked,
      accepts_pets: document.getElementById('reg-accept-pets').checked,
      room_type: roomType,
    };

    try {
      const result = await API.register(data);
      localStorage.setItem('pm_token', result.token);
      currentUser = result.user;
      await App.loadUser();
    } catch (err) {
      const errEl = document.getElementById('reg-error-4');
      errEl.textContent = err.error || 'Error al crear la cuenta. Inténtalo de nuevo.';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = '🎉 Crear mi perfil';
    }
  }
};

// Hobby buttons
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('hobby-btn')) {
    e.target.classList.toggle('selected');
  }
  if (e.target.classList.contains('toggle-btn')) {
    const group = e.target.closest('.toggle-group');
    if (group) {
      group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    }
  }
});

// Zone input enter
document.getElementById('zone-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); App.addZone(); }
});

// Login form
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  errEl.classList.add('hidden');

  try {
    const result = await API.login(
      document.getElementById('login-email').value,
      document.getElementById('login-password').value
    );
    localStorage.setItem('pm_token', result.token);
    currentUser = result.user;
    await App.loadUser();
  } catch (err) {
    errEl.textContent = err.error || 'Credenciales incorrectas';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

// UI utilities
const UI = {
  toggleFilters() {
    document.getElementById('filters-panel').classList.toggle('hidden');
  },

  resetFilters() {
    ['filter-city', 'filter-age-min', 'filter-age-max', 'filter-budget'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('filter-gender').value = '';
  },

  applyFilters() {
    this.toggleFilters();
    Discover.load();
  },

  closePaywall() {
    document.getElementById('paywall').classList.add('hidden');
  },

  closeMatchPopup() {
    document.getElementById('match-popup').classList.add('hidden');
    currentMatch = null;
  },

  showMatchPopup(matchData, otherUser) {
    currentMatch = matchData;
    document.getElementById('match-name').textContent = otherUser.name;

    const meAvatar = document.getElementById('match-avatar-me');
    const themAvatar = document.getElementById('match-avatar-them');

    if (currentUser?.avatar_url) {
      meAvatar.style.backgroundImage = `url(${currentUser.avatar_url})`;
      meAvatar.textContent = '';
    } else {
      meAvatar.textContent = (currentUser?.name || 'Tú')[0].toUpperCase();
    }

    if (otherUser.avatar_url) {
      themAvatar.style.backgroundImage = `url(${otherUser.avatar_url})`;
      themAvatar.textContent = '';
    } else {
      themAvatar.textContent = otherUser.name[0].toUpperCase();
    }

    document.getElementById('match-popup').classList.remove('hidden');
  },

  showNotificationBadge(tab) {
    const badge = document.getElementById(`${tab}-badge`);
    if (badge) {
      const count = (parseInt(badge.textContent) || 0) + 1;
      badge.textContent = count;
      badge.classList.remove('hidden');
    }
  },

  clearBadge(tab) {
    const badge = document.getElementById(`${tab}-badge`);
    if (badge) { badge.textContent = '0'; badge.classList.add('hidden'); }
  },

  updateSwipeCounter(swipesUsed, isPremium) {
    const pips = document.getElementById('swipe-pips');
    const text = document.getElementById('swipe-text');

    if (isPremium) {
      pips.innerHTML = '<span class="pip unlimited"></span>'.repeat(5);
      text.textContent = '⭐ Premium — ilimitado';
      return;
    }

    pips.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip' + (i < swipesUsed ? ' used' : '');
      pips.appendChild(pip);
    }
    const remaining = Math.max(0, 5 - swipesUsed);
    text.textContent = remaining > 0 ? `${remaining} perfil${remaining !== 1 ? 'es' : ''} restante${remaining !== 1 ? 's' : ''} hoy` : 'Límite diario alcanzado';
  },

  showToast(message, duration = 3000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      background: #1a1a2e; color: white; padding: 12px 20px; border-radius: 99px;
      font-size: 14px; font-family: var(--font-body); z-index: 999;
      animation: fadeIn 0.3s ease; white-space: nowrap; max-width: 90vw;
      overflow: hidden; text-overflow: ellipsis;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }
};

// Init
document.addEventListener('DOMContentLoaded', () => App.init());
