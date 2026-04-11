// NestMatch Main App Controller
let currentUser = null;
let currentMatch = null;
let socket = null;

const TOTAL_REG_STEPS = 5;

const App = {
  init() {
    this.fixViewportHeight();
    window.addEventListener('resize', () => this.fixViewportHeight());

    // Initialize i18n
    const lang = I18n.getLang();
    document.getElementById('lang-current').textContent = lang.toUpperCase();
    I18n.translatePage();

    // Browser back button support
    this.initHistory();

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
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    const app = document.getElementById('app');
    if (app) app.style.height = window.innerHeight + 'px';
  },

  // ── History / Back button ──
  initHistory() {
    window.addEventListener('popstate', (e) => {
      const state = e.state;
      if (!state) return;

      if (state.page) {
        // Auth pages
        this._showPageDirect(state.page);
        if (state.page === 'register' && state.regStep) {
          this._showRegStepDirect(state.regStep);
        }
      } else if (state.tab) {
        // Main app tabs
        if (state.tab === 'chat' && state.chatRoom) {
          // Don't re-push state
        } else {
          this._switchTabDirect(state.tab);
        }
      }
    });
  },

  _pushState(stateObj) {
    history.pushState(stateObj, '', '/');
  },

  showAuthContainer() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
  },

  showMainApp() {
    document.getElementById('auth-container').classList.add('hidden');
    const mainApp = document.getElementById('main-app');
    mainApp.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.switchTab('discover');
      this.initSocket();
    });
  },

  showPage(page) {
    this._showPageDirect(page);
    this._pushState({ page });
  },

  _showPageDirect(page) {
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
    this._switchTabDirect(tab);
    this._pushState({ tab });
  },

  _switchTabDirect(tab) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => {
      t.classList.remove('active');
      t.style.removeProperty('display');
    });

    const navItem = document.querySelector(`[data-tab="${tab}"]`);
    const tabEl = document.getElementById(`tab-${tab}`);

    if (navItem) navItem.classList.add('active');
    if (tabEl) {
      tabEl.classList.add('active');
      tabEl.scrollTop = 0;
    }

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

  // ── Register flow ──
  regStep: 1,
  regZones: [],
  regMethod: 'email', // 'email' or 'phone'
  regVerified: false,
  resendTimer: null,

  setRegMethod(method) {
    this.regMethod = method;
    const emailGroup = document.getElementById('reg-email-group');
    const phoneGroup = document.getElementById('reg-phone-group');
    if (method === 'email') {
      emailGroup.classList.remove('hidden');
      phoneGroup.classList.add('hidden');
    } else {
      emailGroup.classList.add('hidden');
      phoneGroup.classList.remove('hidden');
    }
    // Toggle active state
    document.querySelectorAll('#reg-method-toggle .toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.val === method);
    });
  },

  async regNext(step) {
    const errors = this.validateRegStep(step);
    const errEl = document.getElementById(`reg-error-${step}`);
    if (errors) {
      if (errEl) { errEl.textContent = errors; errEl.classList.remove('hidden'); }
      return;
    }
    if (errEl) errEl.classList.add('hidden');

    // Special handling for step 1 → 2 (send verification code)
    if (step === 1) {
      const btn = document.querySelector('#reg-step-1 .btn-submit');
      btn.disabled = true;
      btn.textContent = t('reg2_sending');
      try {
        const contact = this.regMethod === 'email'
          ? document.getElementById('reg-email').value.trim()
          : document.getElementById('reg-phone').value.trim();
        await API.sendVerificationCode(contact, this.regMethod);
        // Show verification target
        document.getElementById('verification-target').textContent = contact;
        document.getElementById('reg2-sub').setAttribute('data-i18n',
          this.regMethod === 'email' ? 'reg2_sub_email' : 'reg2_sub_phone');
        document.getElementById('reg2-sub').textContent =
          t(this.regMethod === 'email' ? 'reg2_sub_email' : 'reg2_sub_phone');
        this.startResendTimer();
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.error || 'Error sending code';
          errEl.classList.remove('hidden');
        }
        btn.disabled = false;
        btn.textContent = t('reg1_continue');
        return;
      }
      btn.disabled = false;
      btn.textContent = t('reg1_continue');
    }

    // Special handling for step 2 (verify code)
    if (step === 2) {
      const code = document.getElementById('reg-code').value.trim();
      const btn = document.getElementById('verify-btn');
      btn.disabled = true;
      btn.textContent = t('reg2_verifying');
      try {
        const contact = this.regMethod === 'email'
          ? document.getElementById('reg-email').value.trim()
          : document.getElementById('reg-phone').value.trim();
        await API.verifyCode(contact, code, this.regMethod);
        this.regVerified = true;
      } catch (err) {
        const errEl2 = document.getElementById('reg-error-2');
        errEl2.textContent = t('reg2_invalid');
        errEl2.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = t('reg2_verify');
        return;
      }
      btn.disabled = false;
      btn.textContent = t('reg2_verify');
    }

    if (step < TOTAL_REG_STEPS) {
      document.getElementById(`reg-step-${step}`).classList.add('hidden');
      document.getElementById(`reg-step-${step + 1}`).classList.remove('hidden');
      this.regStep = step + 1;
      this.updateRegProgress(step + 1);
      this._pushState({ page: 'register', regStep: step + 1 });
      // Init zone map when reaching location step (step 4)
      if (step + 1 === 4) setTimeout(() => ZoneMap.init(), 50);
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
    document.getElementById('register-step-label').textContent =
      t('reg_step_label', { n: step, total: TOTAL_REG_STEPS });
    document.querySelectorAll('.progress-dots .dot').forEach((d, i) => {
      d.classList.remove('active', 'done');
      if (i + 1 === step) d.classList.add('active');
      if (i + 1 < step) d.classList.add('done');
    });
  },

  _showRegStepDirect(step) {
    for (let i = 1; i <= TOTAL_REG_STEPS; i++) {
      const el = document.getElementById(`reg-step-${i}`);
      if (el) el.classList.toggle('hidden', i !== step);
    }
    this.regStep = step;
    this.updateRegProgress(step);
  },

  validateRegStep(step) {
    if (step === 1) {
      const name = document.getElementById('reg-name').value.trim();
      const age = document.getElementById('reg-age').value;
      const pass = document.getElementById('reg-password').value;
      if (!name) return t('val_name_required');
      if (!age || age < 18) return t('val_age_min');
      if (this.regMethod === 'email') {
        const email = document.getElementById('reg-email').value.trim();
        if (!email || !/\S+@\S+\.\S+/.test(email)) return t('val_email_invalid');
      } else {
        const phone = document.getElementById('reg-phone').value.trim();
        if (!phone || !/^\+?\d{7,15}$/.test(phone.replace(/\s/g, ''))) return t('val_phone_invalid');
      }
      if (!pass || pass.length < 6) return t('val_pass_short');
    }
    if (step === 2) {
      const code = document.getElementById('reg-code').value.trim();
      if (!code || code.length !== 6) return t('reg2_invalid');
    }
    return null;
  },

  startResendTimer() {
    let seconds = 60;
    const btn = document.getElementById('resend-btn');
    btn.disabled = true;
    btn.textContent = t('reg2_resend_wait', { s: seconds });
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(this.resendTimer);
        btn.disabled = false;
        btn.textContent = t('reg2_resend_btn');
      } else {
        btn.textContent = t('reg2_resend_wait', { s: seconds });
      }
    }, 1000);
  },

  async resendCode() {
    const contact = this.regMethod === 'email'
      ? document.getElementById('reg-email').value.trim()
      : document.getElementById('reg-phone').value.trim();
    try {
      await API.sendVerificationCode(contact, this.regMethod);
      UI.showToast(t('reg2_sent'));
      this.startResendTimer();
    } catch (err) {
      UI.showToast(err.error || 'Error');
    }
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
    btn.textContent = t('reg5_submitting');

    const hobbies = Array.from(document.querySelectorAll('.hobby-btn.selected')).map(b => b.dataset.hobby);
    const genderPref = document.querySelector('#gender-pref .toggle-btn.active')?.dataset.val || 'any';
    const roomType = document.querySelector('#room-type .toggle-btn.active')?.dataset.val || 'private';

    const data = {
      name: document.getElementById('reg-name').value.trim(),
      age: parseInt(document.getElementById('reg-age').value),
      gender: document.getElementById('reg-gender').value || null,
      email: this.regMethod === 'email' ? document.getElementById('reg-email').value.trim() : null,
      phone: this.regMethod === 'phone' ? document.getElementById('reg-phone').value.trim() : null,
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
      verified: this.regVerified,
      reg_method: this.regMethod,
    };

    try {
      const result = await API.register(data);
      localStorage.setItem('pm_token', result.token);
      currentUser = result.user;
      await App.loadUser();
    } catch (err) {
      const errEl = document.getElementById('reg-error-5');
      errEl.textContent = err.error || t('reg5_error');
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = t('reg5_submit');
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
    if (group && group.id !== 'reg-method-toggle') {
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
  btn.textContent = t('login_loading');
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
    errEl.textContent = err.error || t('login_error');
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = t('login_btn');
  }
});

// Close lang dropdown on outside click
document.addEventListener('click', (e) => {
  const sel = document.getElementById('lang-selector');
  const dd = document.getElementById('lang-dropdown');
  if (sel && dd && !sel.contains(e.target)) {
    dd.classList.add('hidden');
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
    document.getElementById('match-sub-text').innerHTML =
      t('match_sub', { name: otherUser.name });

    const meAvatar = document.getElementById('match-avatar-me');
    const themAvatar = document.getElementById('match-avatar-them');

    if (currentUser?.avatar_url) {
      meAvatar.style.backgroundImage = `url(${currentUser.avatar_url})`;
      meAvatar.textContent = '';
    } else {
      meAvatar.textContent = (currentUser?.name || '?')[0].toUpperCase();
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
      text.textContent = t('swipe_premium');
      return;
    }

    pips.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip' + (i < swipesUsed ? ' used' : '');
      pips.appendChild(pip);
    }
    const remaining = Math.max(0, 5 - swipesUsed);
    const s = remaining !== 1 ? 'es' : '';
    text.textContent = remaining > 0
      ? t('swipe_remaining', { n: remaining, s })
      : t('swipe_limit');
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
