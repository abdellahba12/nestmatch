// NestMatch Main App Controller
let currentUser = null;
let currentMatch = null;
let socket = null;

const TOTAL_REG_STEPS = 2;

const App = {
  init() {
    console.log('[App] init()');
    this.fixViewportHeight();
    window.addEventListener('resize', () => this.fixViewportHeight());

    // i18n
    try {
      const lang = I18n.getLang();
      const btn = document.getElementById('lang-current');
      if (btn) btn.innerHTML = I18n.getFlag(lang);
      // Set in-app lang label
      const appLabel = document.getElementById('app-lang-label');
      if (appLabel) {
        const names = { es: 'Español', en: 'English', fr: 'Français', pt: 'Português', de: 'Deutsch', it: 'Italiano' };
        appLabel.textContent = names[lang] || names.es;
      }
      I18n.translatePage();
    } catch (err) {
      console.error('[App] i18n error:', err);
    }

    this.initHistory();

    setTimeout(() => {
      document.getElementById('loading-screen').style.display = 'none';

      // Check for Google OAuth token in URL
      const urlParams = new URLSearchParams(window.location.search);
      const googleToken = urlParams.get('token');
      const googleError = urlParams.get('error');

      if (googleToken) {
        localStorage.setItem('pm_token', googleToken);
        history.replaceState({}, '', '/');
        this.loadUser();
        return;
      }
      if (googleError) {
        history.replaceState({}, '', '/');
        this.showAuthContainer();
        this.showPage('landing');
        UI.showToast('Error con Google: ' + googleError);
        return;
      }

      const token = localStorage.getItem('pm_token');
      if (token) {
        this.loadUser();
      } else {
        this.showAuthContainer();
        this.showPage('landing');
      }
    }, 1200);
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
        this._showPageDirect(state.page);
        if (state.page === 'register' && state.regStep) {
          this._showRegStepDirect(state.regStep);
        }
      } else if (state.tab) {
        this._switchTabDirect(state.tab);
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
      this.updateVerifyBanner();
    });
  },

  updateVerifyBanner() {
    const banner = document.getElementById('verify-banner');
    if (!banner) return;
    if (currentUser && currentUser.is_verified) {
      banner.classList.add('hidden');
      return;
    }
    if (currentUser && currentUser.verification_status === 'pending') {
      banner.classList.remove('hidden');
      banner.classList.remove('verify-banner--red');
      banner.classList.add('verify-banner--yellow');
      banner.querySelector('.verify-banner-bold').textContent = t('banner_pending_title') || 'Verificación en curso';
      banner.querySelector('.verify-banner-text').textContent = t('banner_pending_desc') || 'Tu documentación está siendo revisada. Te notificaremos cuando esté lista.';
      banner.querySelector('.verify-banner-link').textContent = t('banner_pending_action') || 'Ver estado';
    } else if (currentUser && !currentUser.is_verified) {
      banner.classList.remove('hidden');
      banner.classList.remove('verify-banner--yellow');
      banner.classList.add('verify-banner--red');
      banner.querySelector('.verify-banner-bold').textContent = t('banner_title') || 'Perfil no verificado';
      banner.querySelector('.verify-banner-text').textContent = t('banner_desc') || 'Verifica tu identidad para desbloquear todas las funcionalidades de tu cuenta.';
      banner.querySelector('.verify-banner-link').textContent = t('banner_action') || 'Verificar perfil';
    }
  },

  goToVerify() {
    this.switchTab('profile');
    setTimeout(() => {
      const section = document.getElementById('verify-section');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
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
      // Check if profile is incomplete (no name = just registered)
      if (!currentUser.name || !currentUser.age || !currentUser.city) {
        this.showCompleteProfile();
      } else {
        this.showMainApp();
        this.updateVerifyBanner();
      }
    } catch (e) {
      localStorage.removeItem('pm_token');
      this.showAuthContainer();
      this.showPage('landing');
    }
  },

  showCompleteProfile() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('complete-profile').classList.remove('hidden');
    this.updateCpProgress();
  },

  updateCpProgress() {
    const fields = ['cp-name', 'cp-age', 'cp-city', 'cp-budget-max'];
    let filled = 0;
    fields.forEach(id => {
      if (document.getElementById(id)?.value?.trim()) filled++;
    });
    if (document.querySelector('#cp-gender .cp-toggle.active')) filled++;
    if (document.querySelector('#cp-room-type .cp-toggle.active')) filled++;
    if (document.querySelector('#cp-duration .cp-toggle.active')) filled++;
    if (document.querySelector('#cp-schedule .cp-toggle.active')) filled++;
    if (document.querySelector('#cp-personality .cp-toggle.active')) filled++;
    if (document.querySelector('#cp-smoker .cp-toggle.active')) filled++;
    if (document.querySelector('#cp-pets .cp-toggle.active')) filled++;
    const total = 11;
    const pct = Math.round((filled / total) * 100);
    const bar = document.getElementById('cp-progress-bar');
    if (bar) bar.style.width = pct + '%';
  },

  cpToggle(btn) {
    const group = btn.parentElement;
    group.querySelectorAll('.cp-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.updateCpProgress();
  },

  previewPhoto(input) {
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = document.getElementById('cp-photo-preview');
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
      };
      reader.readAsDataURL(input.files[0]);
    }
  },

  async submitCompleteProfile() {
    const name = document.getElementById('cp-name').value.trim();
    const age = parseInt(document.getElementById('cp-age').value);
    const city = document.getElementById('cp-city').value.trim();
    const neighborhood = document.getElementById('cp-neighborhood').value.trim();
    const bio = document.getElementById('cp-bio').value.trim();
    const budgetMin = document.getElementById('cp-budget-min').value ? parseInt(document.getElementById('cp-budget-min').value) : null;
    const budgetMax = document.getElementById('cp-budget-max').value ? parseInt(document.getElementById('cp-budget-max').value) : null;
    const cleanliness = parseInt(document.getElementById('cp-clean').value);
    const cooking = parseInt(document.getElementById('cp-cooking').value);
    const genderEl = document.querySelector('#cp-gender .cp-toggle.active');
    const scheduleEl = document.querySelector('#cp-schedule .cp-toggle.active');
    const personalityEl = document.querySelector('#cp-personality .cp-toggle.active');
    const smokerEl = document.querySelector('#cp-smoker .cp-toggle.active');
    const petsEl = document.querySelector('#cp-pets .cp-toggle.active');
    const roomTypeEl = document.querySelector('#cp-room-type .cp-toggle.active');
    const durationEl = document.querySelector('#cp-duration .cp-toggle.active');

    const errEl = document.getElementById('cp-error');

    // Validation
    if (!name) { errEl.textContent = 'Introduce tu nombre'; errEl.classList.remove('hidden'); return; }
    if (!age || age < 18) { errEl.textContent = 'Introduce una edad valida (18+)'; errEl.classList.remove('hidden'); return; }
    if (!genderEl) { errEl.textContent = 'Selecciona tu genero'; errEl.classList.remove('hidden'); return; }
    if (!city) { errEl.textContent = 'Introduce tu ciudad'; errEl.classList.remove('hidden'); return; }
    if (!budgetMax) { errEl.textContent = 'Introduce tu presupuesto maximo'; errEl.classList.remove('hidden'); return; }
    if (!roomTypeEl) { errEl.textContent = 'Selecciona tipo de habitacion'; errEl.classList.remove('hidden'); return; }
    if (!durationEl) { errEl.textContent = 'Selecciona duracion de estancia'; errEl.classList.remove('hidden'); return; }
    if (!scheduleEl) { errEl.textContent = 'Selecciona tu horario'; errEl.classList.remove('hidden'); return; }
    if (!personalityEl) { errEl.textContent = 'Selecciona tu personalidad'; errEl.classList.remove('hidden'); return; }
    if (!smokerEl) { errEl.textContent = 'Indica si fumas'; errEl.classList.remove('hidden'); return; }
    if (!petsEl) { errEl.textContent = 'Indica si tienes mascota'; errEl.classList.remove('hidden'); return; }

    errEl.classList.add('hidden');

    const btn = document.getElementById('cp-submit');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      await API.updateMe({
        name,
        age,
        gender: genderEl.dataset.val,
        city,
        neighborhood: neighborhood || null,
        bio: bio || null,
        budget_min: budgetMin,
        budget_max: budgetMax,
        room_type: roomTypeEl.dataset.val,
        stay_duration: durationEl.dataset.val,
        cleanliness,
        cooking,
        schedule: scheduleEl.dataset.val,
        personality: personalityEl.dataset.val,
        is_smoker: smokerEl.dataset.val === 'si',
        has_pets: petsEl.dataset.val === 'si',
      });

      // Upload photo if selected
      const photoInput = document.getElementById('cp-photo-input');
      if (photoInput.files && photoInput.files[0]) {
        const formData = new FormData();
        formData.append('photo', photoInput.files[0]);
        formData.append('is_main', 'true');
        try { await API.uploadPhoto(formData); } catch (e) { console.warn('[CP] Photo upload failed:', e); }
      }

      // Reload user and show app
      currentUser = await API.getMe();
      document.getElementById('complete-profile').classList.add('hidden');
      this.showMainApp();
      this.updateVerifyBanner();
    } catch (err) {
      errEl.textContent = err.error || 'Error al guardar. Inténtalo de nuevo.';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Guardar y continuar';
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

  async deleteAccount() {
    const confirmed = confirm('¿Estás seguro de que quieres borrar tu cuenta? Esta acción no se puede deshacer.');
    if (!confirmed) return;
    try {
      await API.delete('/users/me');
      this.logout();
    } catch (err) {
      console.error('[App] Delete account error:', err);
      alert('Error al borrar la cuenta. Inténtalo de nuevo.');
    }
  },

  goToChat(conversationId) {
    UI.closeMatchPopup();
    this.switchTab('chat');
    setTimeout(() => Chat.openConversation(conversationId), 100);
  },

  initSocket() {
    const token = localStorage.getItem('pm_token');
    if (!token) { console.warn('[Socket] No token, skipping connection'); return; }

    console.log('[Socket] Connecting...');
    socket = io({ auth: { token } });

    socket.on('connect', () => {
      console.log('[Socket] Connected — id:', socket.id, 'transport:', socket.io.engine?.transport?.name);
    });
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected — reason:', reason);
    });
    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message, err.data || '');
    });
    socket.on('reconnect', (attempt) => {
      console.log('[Socket] Reconnected after', attempt, 'attempts');
    });
    socket.on('reconnect_error', (err) => {
      console.error('[Socket] Reconnect error:', err.message);
    });
    socket.on('reconnect_attempt', (attempt) => {
      console.log('[Socket] Reconnect attempt #', attempt);
    });

    socket.on('new_message', (msg) => {
      console.log('[Socket] new_message received:', { conversation_id: msg.conversation_id, sender_id: msg.sender_id, content_length: msg.content?.length });
      if (Chat.currentConvId === msg.conversation_id || Chat.currentConvId === undefined) {
        Chat.appendMessage(msg);
      }
    });

    socket.on('message_notification', (data) => {
      console.log('[Socket] message_notification:', { conversation_id: data.conversation_id, sender: data.sender_name });
      UI.showNotificationBadge('chat');
      if (data.conversation_id !== Chat.currentConvId) {
        UI.showToast(`${data.sender_name}: ${data.preview}`);
      }
    });

    socket.on('user_typing', (data) => {
      if (data.conversation_id === Chat.currentConvId) {
        Chat.showTyping();
      }
    });
  },

  // ── Register flow (simplified: 2 steps) ──
  regStep: 1,
  regMethod: 'email',
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

    // Step 1 → send verification code
    if (step === 1) {
      const btn = document.querySelector('#reg-step-1 .btn-submit');
      btn.disabled = true;
      btn.textContent = t('reg2_sending');
      try {
        const contact = this.regMethod === 'email'
          ? document.getElementById('reg-email').value.trim()
          : (document.getElementById('reg-phone-country').value + document.getElementById('reg-phone').value.trim().replace(/\s/g, ''));
        await API.sendVerificationCode(contact, this.regMethod);
        document.getElementById('verification-target').textContent = contact;
        document.getElementById('reg2-sub').textContent =
          t(this.regMethod === 'email' ? 'reg2_sub_email' : 'reg2_sub_phone');
        this.startResendTimer();
      } catch (err) {
        if (errEl) { errEl.textContent = err.error || 'Error sending code'; errEl.classList.remove('hidden'); }
        btn.disabled = false;
        btn.textContent = t('reg1_continue');
        return;
      }
      btn.disabled = false;
      btn.textContent = t('reg1_continue');
    }

    // Step 2 → verify code then auto-register
    if (step === 2) {
      const code = document.getElementById('reg-code').value.trim();
      const btn = document.getElementById('verify-btn');
      btn.disabled = true;
      btn.textContent = t('reg2_verifying');
      try {
        const contact = this.regMethod === 'email'
          ? document.getElementById('reg-email').value.trim()
          : (document.getElementById('reg-phone-country').value + document.getElementById('reg-phone').value.trim().replace(/\s/g, ''));
        await API.verifyCode(contact, code, this.regMethod);
        this.regVerified = true;
        // Auto register after verification
        await this.submitRegister();
        return; // submitRegister handles navigation
      } catch (err) {
        const errEl2 = document.getElementById('reg-error-2');
        errEl2.textContent = err.error || t('reg2_invalid');
        errEl2.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = t('reg2_verify');
        return;
      }
    }

    // Move to next step
    if (step < TOTAL_REG_STEPS) {
      document.getElementById(`reg-step-${step}`).classList.add('hidden');
      document.getElementById(`reg-step-${step + 1}`).classList.remove('hidden');
      this.regStep = step + 1;
      this.updateRegProgress(step + 1);
      this._pushState({ page: 'register', regStep: step + 1 });
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
      const pass = document.getElementById('reg-password').value;
      if (this.regMethod === 'email') {
        const email = document.getElementById('reg-email').value.trim();
        if (!email || !/\S+@\S+\.\S+/.test(email)) return t('val_email_invalid');
      } else {
        const phone = document.getElementById('reg-phone').value.trim().replace(/\s/g, '');
        if (!phone || !/^\d{6,15}$/.test(phone)) return t('val_phone_invalid');
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
      : (document.getElementById('reg-phone-country').value + document.getElementById('reg-phone').value.trim().replace(/\s/g, ''));
    try {
      await API.sendVerificationCode(contact, this.regMethod);
      UI.showToast(t('reg2_sent'));
      this.startResendTimer();
    } catch (err) {
      UI.showToast(err.error || 'Error');
    }
  },

  async submitRegister() {
    const btn = document.getElementById('verify-btn');
    if (btn) { btn.disabled = true; btn.textContent = t('reg5_submitting'); }

    const email = this.regMethod === 'email' ? document.getElementById('reg-email').value.trim() : null;
    const phone = this.regMethod === 'phone' ? (document.getElementById('reg-phone-country').value + document.getElementById('reg-phone').value.trim().replace(/\s/g, '')) : null;
    const password = document.getElementById('reg-password').value;

    const data = {
      email,
      phone,
      password,
      verified: this.regVerified,
      reg_method: this.regMethod,
    };

    try {
      const result = await API.register(data);
      localStorage.setItem('pm_token', result.token);
      currentUser = result.user;
      await this.loadUser();
    } catch (err) {
      const errEl = document.getElementById('reg-error-2');
      if (errEl) {
        errEl.textContent = err.error || t('reg5_error');
        errEl.classList.remove('hidden');
      }
      if (btn) { btn.disabled = false; btn.textContent = t('reg2_verify'); }
    }
  },

  // Google sign-in callback
  async handleGoogleCredential(response) {
    console.log('[Google] Credential received, calling API...');
    try {
      const result = await API.googleAuth(response.credential);
      console.log('[Google] API success, user:', result.user?.email);
      localStorage.setItem('pm_token', result.token);
      currentUser = result.user;
      await this.loadUser();
    } catch (err) {
      console.error('[Google] Auth error:', err);
      // Make sure we're not stuck on a blank screen
      this.showAuthContainer();
      this.showPage('landing');
      UI.showToast(err.error || 'Error con Google. Intenta de nuevo.');
    }
  }
};

// ── Event delegation (language selector + toggle buttons + hobbies) ──
document.addEventListener('click', (e) => {
  // Language: toggle landing dropdown
  if (e.target.closest('#lang-current')) {
    e.stopPropagation();
    const dd = document.getElementById('lang-dropdown');
    if (dd) dd.classList.toggle('hidden');
    return;
  }

  // Language: toggle in-app dropdown
  if (e.target.closest('#app-lang-current')) {
    e.stopPropagation();
    const dd = document.getElementById('app-lang-dropdown');
    if (dd) dd.classList.toggle('hidden');
    return;
  }

  // Language: select a language (works for both dropdowns)
  const langBtn = e.target.closest('[data-lang]');
  if (langBtn) {
    e.stopPropagation();
    const lang = langBtn.getAttribute('data-lang');
    console.log('[Lang] Selected:', lang);
    try {
      I18n.setLang(lang);
    } catch (err) {
      console.error('[Lang] setLang error:', err);
    }
    // Close both dropdowns
    const dd = document.getElementById('lang-dropdown');
    if (dd) dd.classList.add('hidden');
    const appDd = document.getElementById('app-lang-dropdown');
    if (appDd) appDd.classList.add('hidden');
    return;
  }

  // Close lang dropdowns on outside click
  const dd = document.getElementById('lang-dropdown');
  if (dd && !dd.classList.contains('hidden')) {
    dd.classList.add('hidden');
  }
  const appDd = document.getElementById('app-lang-dropdown');
  if (appDd && !appDd.classList.contains('hidden')) {
    appDd.classList.add('hidden');
  }

  // Phone country: toggle dropdown
  if (e.target.closest('#phone-country-btn')) {
    e.stopPropagation();
    const pdd = document.getElementById('phone-country-dropdown');
    if (pdd) pdd.classList.toggle('hidden');
    return;
  }

  // Phone country: select a country
  const countryBtn = e.target.closest('[data-prefix]');
  if (countryBtn) {
    e.stopPropagation();
    const prefix = countryBtn.dataset.prefix;
    const flagSvg = countryBtn.querySelector('.phone-flag');
    document.getElementById('reg-phone-country').value = prefix;
    document.getElementById('phone-prefix').textContent = prefix;
    const btnFlag = document.querySelector('#phone-country-btn .phone-flag');
    if (btnFlag && flagSvg) btnFlag.outerHTML = flagSvg.outerHTML;
    document.getElementById('phone-country-dropdown').classList.add('hidden');
    return;
  }

  // Close phone dropdown on outside click
  const pdd = document.getElementById('phone-country-dropdown');
  if (pdd && !pdd.classList.contains('hidden')) {
    pdd.classList.add('hidden');
  }

  // Hobby buttons
  if (e.target.classList.contains('hobby-btn')) {
    e.target.classList.toggle('selected');
  }

  // Toggle buttons
  if (e.target.classList.contains('toggle-btn')) {
    const group = e.target.closest('.toggle-group');
    if (group && group.id !== 'reg-method-toggle') {
      group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    }
  }

  // Filter pill toggles
  const pill = e.target.closest('.filter-pill');
  if (pill) {
    const group = pill.closest('.filter-toggle-group');
    if (group) {
      if (group.classList.contains('filter-binary')) {
        group.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      } else {
        group.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      }
    }
  }
});

// Zone input enter
document.getElementById('zone-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); ZoneMap?.addFromInput?.(); }
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
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const result = await API.login(email, password);
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

// UI utilities
const UI = {
  toggleFilters() {
    document.getElementById('filters-modal').classList.toggle('hidden');
  },

  resetFilters() {
    document.querySelectorAll('#filters-modal input').forEach(el => {
      if (el.type === 'range') return;
      el.value = '';
    });
    document.getElementById('filter-budget-min').value = 200;
    document.getElementById('filter-budget-max').value = 1200;
    this.updatePriceRange();
    document.querySelectorAll('#filters-modal .filter-pill').forEach(p => p.classList.remove('active'));
  },

  updatePriceRange() {
    const min = document.getElementById('filter-budget-min').value;
    const max = document.getElementById('filter-budget-max').value;
    document.getElementById('price-min-val').textContent = '€ ' + min;
    document.getElementById('price-max-val').textContent = '€ ' + max;
  },

  applyFilters() {
    this.toggleFilters();
    Discover.reload();
  },

  updateSwipeCounter(today, isPremium) {
    const counter = document.getElementById('swipe-counter');
    if (counter) {
      counter.textContent = isPremium ? `${today} ${t('disc_swipes')} (∞)` : `${today}/5 ${t('disc_swipes')}`;
    }
  },

  showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  showMatchPopup(matchData, profile) {
    const popup = document.getElementById('match-popup');
    if (!popup) return;

    currentMatch = matchData;
    popup.querySelector('.match-user-name').textContent = profile.name;

    const avatar = popup.querySelector('.match-user-avatar');
    if (profile.main_photo || profile.avatar_url) {
      avatar.style.backgroundImage = `url(${profile.main_photo || profile.avatar_url})`;
      avatar.style.backgroundSize = 'cover';
      avatar.textContent = '';
    } else {
      avatar.style.backgroundImage = '';
      avatar.textContent = (profile.name || '?')[0].toUpperCase();
    }

    popup.classList.remove('hidden');
  },

  closeMatchPopup() {
    document.getElementById('match-popup')?.classList.add('hidden');
  },

  showNotificationBadge(tab) {
    const badge = document.getElementById(`${tab}-badge`);
    if (badge) {
      const current = parseInt(badge.textContent) || 0;
      badge.textContent = current + 1;
      badge.classList.remove('hidden');
    }
  },

  clearBadge(tab) {
    const badge = document.getElementById(`${tab}-badge`);
    if (badge) {
      badge.textContent = '0';
      badge.classList.add('hidden');
    }
  }
};

// Google Sign-In callback (called by Google library)
function handleGoogleCredentialResponse(response) {
  App.handleGoogleCredential(response);
}

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  // Update complete profile progress bar on input
  ['cp-name', 'cp-age', 'cp-city', 'cp-budget-min', 'cp-budget-max', 'cp-neighborhood'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => App.updateCpProgress());
  });
});
