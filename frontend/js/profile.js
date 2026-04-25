// Profile Module
const Profile = {
  isEditing: false,

  async load() {
    try {
      currentUser = await API.getMe();
      this.render(currentUser);
      const premBtn = document.getElementById('premium-profile-btn');
      if (premBtn) {
        premBtn.style.display = currentUser.is_premium ? 'none' : '';
      }
    } catch (e) {
      console.error('Profile load error:', e);
    }
  },

  render(user) {
    const container = document.getElementById('profile-view');

    const avatar = user.avatar_url
      ? `background-image:url(${user.avatar_url}); background-size:cover; background-position:center;`
      : `background:linear-gradient(135deg,#f8a4b8,#c084fc)`;

    const avatarContent = user.avatar_url ? '' : (user.name || '?')[0].toUpperCase();

    const hobbiesHtml = (user.hobbies || []).length > 0
      ? (user.hobbies || []).map(h => `<span class="card-tag">${h}</span>`).join('')
      : `<span style="color:var(--text-muted);font-size:14px">${t('prof_no_hobbies')}</span>`;

    const personalityArr = Array.isArray(user.personality) ? user.personality
      : (user.personality ? [user.personality] : []);
    const personalityLabel = personalityArr.length > 0
      ? personalityArr.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')
      : t('prof_not_specified');

    const premiumBadge = user.is_premium
      ? `<span style="background:var(--grad-premium);color:#333;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700">⭐ PREMIUM</span>`
      : '';

    const verifiedBadge = user.is_verified
      ? `<span style="background:#22c55e;color:#fff;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700">${t('verify_badge')}</span>`
      : '';

    const flags = [];
    if (user.is_smoker) flags.push(t('prof_smoker'));
    if (user.has_pets) flags.push(t('prof_has_pets'));

    const memberDate = new Date(user.created_at).toLocaleDateString(I18n.getLang());

    container.innerHTML = `
      <div class="profile-hero">
        <div class="profile-cover">
          <div class="profile-avatar-wrap">
            <div class="profile-avatar" style="${avatar}">${avatarContent}</div>
          </div>
        </div>
        <div class="profile-body">
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap">
            <h2 class="profile-name">${user.name || ''}, ${user.age || ''}</h2>
            ${premiumBadge}
            ${verifiedBadge}
          </div>
          <p class="profile-tagline">${user.profession || ''}${user.profession && user.city ? ' · ' : ''}${user.city || ''}</p>
          <div class="profile-stats">
            <div class="pstat">
              <strong>${user.swipes_today || 0}</strong>
              <span>${t('prof_swipes_today')}</span>
            </div>
            <div class="pstat">
              <strong>${user.is_premium ? '∞' : user.swipes_remaining}</strong>
              <span>${t('prof_remaining')}</span>
            </div>
          </div>
        </div>
      </div>

      ${user.bio ? `
      <div class="profile-section">
        <h4>${t('prof_about')}</h4>
        <p>${user.bio}</p>
      </div>` : ''}

      <div class="profile-section">
        <h4>${t('prof_interests')}</h4>
        <div class="card-tags" style="margin-top:4px">${hobbiesHtml}</div>
      </div>

      <div class="profile-section">
        <h4>${t('pdp_personality')}</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          ${personalityArr.map(p => `<span class="card-tag">${p.charAt(0).toUpperCase() + p.slice(1)}</span>`).join('')}
        </div>
      </div>

      ${flags.length > 0 ? `
      <div class="profile-section">
        <h4>${t('prof_lifestyle')}</h4>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
          ${flags.map(f => `<span class="card-tag">${f}</span>`).join('')}
        </div>
      </div>` : ''}

      <!-- Identity Verification Section -->
      <div class="profile-section verify-section" id="verify-section">
        <h4>${t('verify_title')}</h4>
        ${this.renderVerification(user)}
      </div>

      <div class="profile-section" style="border:2px solid var(--border);background:var(--bg)">
        <h4>${t('prof_account')}</h4>
        <p style="font-size:14px;color:var(--text-light)">${user.email || user.phone || ''}</p>
        <p style="font-size:14px;color:var(--text-muted);margin-top:4px">${t('prof_member_since')} ${memberDate}</p>
      </div>
    `;

    // Bind verification form events
    this.bindVerificationEvents();
  },

  renderVerification(user) {
    if (user.is_verified) {
      return `<div class="verify-status verify-done">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>${t('verify_badge')}</span>
      </div>`;
    }

    if (user.verification_status === 'pending') {
      return `<div class="verify-status verify-pending-status">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a16207" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>${t('verify_pending')}</span>
      </div>`;
    }

    return `
      <p style="font-size:14px;color:var(--text-light);margin-bottom:16px">${t('verify_info')}</p>
      <div class="verify-form" id="verify-form">
        <!-- DNI Upload -->
        <div class="verify-upload-box" id="dni-upload-box">
          <div class="verify-upload-label">${t('verify_dni_title')}</div>
          <p class="verify-upload-desc">${t('verify_dni_desc')}</p>
          <div class="verify-preview hidden" id="dni-preview"></div>
          <label class="verify-upload-btn" id="dni-upload-label">
            <input type="file" accept="image/*" id="dni-input" style="display:none" onchange="Profile.handleFileSelect('dni', this)">
            <span id="dni-btn-text">${t('verify_dni_btn')}</span>
          </label>
        </div>
        <!-- Selfie -->
        <div class="verify-upload-box" id="selfie-upload-box">
          <div class="verify-upload-label">${t('verify_selfie_title')}</div>
          <p class="verify-upload-desc">${t('verify_selfie_desc')}</p>
          <div class="verify-preview hidden" id="selfie-preview"></div>
          <label class="verify-upload-btn" id="selfie-upload-label">
            <input type="file" accept="image/*" capture="user" id="selfie-input" style="display:none" onchange="Profile.handleFileSelect('selfie', this)">
            <span id="selfie-btn-text">${t('verify_selfie_btn')}</span>
          </label>
        </div>
        <button class="btn-submit verify-submit-btn" id="verify-submit-btn" onclick="Profile.submitVerification()" disabled>
          ${t('verify_submit')}
        </button>
      </div>
    `;
  },

  dniFile: null,
  selfieFile: null,

  handleFileSelect(type, input) {
    const file = input.files[0];
    if (!file) return;

    if (type === 'dni') this.dniFile = file;
    else this.selfieFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById(`${type}-preview`);
      preview.innerHTML = `<img src="${e.target.result}" alt="${type}">`;
      preview.classList.remove('hidden');
      document.getElementById(`${type}-btn-text`).textContent = t('verify_change');
    };
    reader.readAsDataURL(file);

    // Enable submit if both files selected
    const btn = document.getElementById('verify-submit-btn');
    if (btn && this.dniFile && this.selfieFile) {
      btn.disabled = false;
    }
  },

  bindVerificationEvents() {
    // Reset file refs
    this.dniFile = null;
    this.selfieFile = null;
  },

  async submitVerification() {
    if (!this.dniFile || !this.selfieFile) return;

    const btn = document.getElementById('verify-submit-btn');
    btn.disabled = true;
    btn.textContent = t('verify_submitting');

    const formData = new FormData();
    formData.append('dni', this.dniFile);
    formData.append('selfie', this.selfieFile);

    try {
      await API.submitVerification(formData);
      UI.showToast(t('verify_success'));
      // Reload profile to show pending status
      this.load();
    } catch (err) {
      UI.showToast(err.error || 'Error');
      btn.disabled = false;
      btn.textContent = t('verify_submit');
    }
  },

  formatDuration(d) {
    if (d === 'short') return t('prof_duration_short');
    if (d === 'long') return t('prof_duration_long');
    return t('prof_duration_medium');
  },

  toggleEdit() {
    const bio = prompt(t('prof_edit_bio'), currentUser?.bio || '');
    if (bio !== null) {
      API.updateMe({ bio }).then(() => this.load()).catch(console.error);
    }
  }
};
