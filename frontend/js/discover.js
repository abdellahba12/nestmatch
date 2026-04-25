// Discover & Swipe Module
const Discover = {
  profiles: [],
  currentIndex: 0,
  loaded: false,
  loading: false,
  isDragging: false,
  startX: 0,
  startY: 0,
  currentX: 0,

  async load() {
    if (this.loading) return;
    this.loading = true;
    this.loaded = false;

    const filters = {};
    const city = document.getElementById('filter-city')?.value?.trim();

    if (city) filters.city = city;

    // Schedule filter
    const scheduleActive = document.querySelector('#filter-schedule .filter-pill.active');
    if (scheduleActive) {
      const map = { early: 'diurno', normal: 'diurno', late: 'nocturno' };
      filters.schedule = map[scheduleActive.dataset.val] || '';
    }

    // Smoking filter
    const smokeActive = document.querySelector('#filter-smoke .filter-pill.active');
    if (smokeActive) filters.is_smoker = smokeActive.dataset.val === 'yes' ? 'true' : 'false';

    // Pets filter
    const petsActive = document.querySelector('#filter-pets .filter-pill.active');
    if (petsActive) filters.has_pets = petsActive.dataset.val === 'yes' ? 'true' : 'false';

    // Personality filter (multi-select)
    const personalityActive = document.querySelectorAll('#filter-personality .filter-pill.active');
    if (personalityActive.length > 0) {
      filters.personality = Array.from(personalityActive).map(el => el.dataset.val).join(',');
    }

    try {
      const data = await API.discover(filters);
      this.profiles = data.profiles || [];
      this.currentIndex = 0;
      this.loaded = true;

      UI.updateSwipeCounter(data.meta.swipes_today, data.meta.is_premium);

      if (data.meta.swipes_remaining === 0 && !data.meta.is_premium) {
        document.getElementById('paywall').classList.remove('hidden');
      }

      this.renderStack();
    } catch (e) {
      console.error('Discover load error:', e);
    } finally {
      this.loading = false;
    }
  },

  reload() {
    this.loaded = false;
    this.load();
  },

  renderStack() {
    const stack = document.getElementById('card-stack');
    const emptyEl = document.getElementById('empty-stack');
    const actionBtns = document.getElementById('action-buttons');

    stack.querySelectorAll('.profile-card').forEach(c => c.remove());

    if (this.profiles.length === 0) {
      emptyEl.classList.remove('hidden');
      actionBtns.style.opacity = '0.4';
      actionBtns.style.pointerEvents = 'none';
      return;
    }

    emptyEl.classList.add('hidden');
    actionBtns.style.opacity = '1';
    actionBtns.style.pointerEvents = '';

    const toRender = Math.min(3, this.profiles.length);
    for (let i = toRender - 1; i >= 0; i--) {
      const card = this.createCard(this.profiles[i], i);
      stack.appendChild(card);
    }

    if (this.profiles.length > 0) {
      this.initDrag(stack.lastElementChild);
    }
  },

  createCard(profile, stackPos) {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.dataset.profileId = profile.id;

    const scale = 1 - stackPos * 0.04;
    const translateY = stackPos * 10;
    card.style.cssText = `
      transform: scale(${scale}) translateY(${translateY}px);
      z-index: ${10 - stackPos};
      transition: transform 0.3s ease;
    `;

    const photos = profile.photos || [];
    const mainPhoto = profile.main_photo || (photos.length > 0 ? photos[0] : null);

    const photoStyle = mainPhoto
      ? `background-image: url(${mainPhoto}); background-size: cover; background-position: center;`
      : `background: linear-gradient(135deg, ${this.randomGradient()});`;

    const hobbyTags = (profile.hobbies || []).slice(0, 4).map(h =>
      `<span class="card-tag">${h}</span>`
    ).join('');

    const photoDots = photos.length > 1
      ? `<div class="card-photo-dots">${photos.slice(0, 5).map((_, i) =>
          `<div class="photo-dot${i === 0 ? ' active' : ''}"></div>`
        ).join('')}</div>`
      : '';

    const verifiedBadge = profile.is_verified
      ? '<span class="verified-badge" title="Verified">✓</span>'
      : '';

    const displayName = profile.name || 'Usuario';
    const ageText = profile.age ? `, ${profile.age}` : '';
    const cityName = profile.city || '';
    const neighborhoodText = profile.neighborhood ? profile.neighborhood : '';
    const locationText = [neighborhoodText, cityName].filter(Boolean).join(', ');

    const scheduleIcon = profile.schedule === 'nocturno' ? '🌙' : '☀️';

    card.innerHTML = `
      <div class="card-photo" style="${photoStyle}">
        ${photoDots}
        <div class="card-like-badge">${t('disc_like_badge')}</div>
        <div class="card-pass-badge">${t('disc_pass_badge')}</div>
        ${!mainPhoto ? `<span style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2))">${this.avatarEmoji(profile)}</span>` : ''}
      </div>
      <div class="card-info">
        <div class="card-room-title">${displayName}${ageText} ${verifiedBadge}</div>
        <div class="card-room-city">${locationText}</div>
      </div>
    `;

    return card;
  },

  randomGradient() {
    const gradients = [
      '#f8a4b8, #c084fc', '#6ee7b7, #3b82f6', '#fcd34d, #f87171',
      '#a78bfa, #06b6d4', '#86efac, #f9a8d4', '#fbbf24, #f472b6'
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
  },

  avatarEmoji(profile) {
    const emojis = ['👤', '🙂', '😊', '🌟', '✨'];
    return emojis[Math.floor(Math.random() * emojis.length)];
  },

  initDrag(card) {
    if (!card) return;
    let hasMoved = false;

    const onStart = (clientX, clientY) => {
      this.isDragging = true;
      this.startX = clientX;
      this.startY = clientY;
      this.currentX = 0;
      hasMoved = false;
      card.style.transition = 'none';
    };

    const onMove = (clientX) => {
      if (!this.isDragging) return;
      this.currentX = clientX - this.startX;
      if (Math.abs(this.currentX) > 5) hasMoved = true;
      const rotate = this.currentX * 0.08;
      card.style.transform = `translateX(${this.currentX}px) rotate(${rotate}deg)`;

      const like = card.querySelector('.card-like-badge');
      const pass = card.querySelector('.card-pass-badge');
      const threshold = 60;

      if (this.currentX > threshold) {
        like.style.opacity = Math.min(1, (this.currentX - threshold) / 60);
        pass.style.opacity = 0;
      } else if (this.currentX < -threshold) {
        pass.style.opacity = Math.min(1, (-this.currentX - threshold) / 60);
        like.style.opacity = 0;
      } else {
        like.style.opacity = 0;
        pass.style.opacity = 0;
      }
    };

    const onEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      card.style.transition = 'transform 0.3s ease';

      if (Math.abs(this.currentX) > 100) {
        const dir = this.currentX > 0 ? 'like' : 'pass';
        this.animateSwipe(card, dir);
      } else if (!hasMoved) {
        // It was a click, not a drag — show profile detail
        card.style.transform = 'scale(1) translateY(0)';
        const profile = this.profiles[0];
        if (profile) this.showProfileDetail(profile);
      } else {
        card.style.transform = 'scale(1) translateY(0)';
        card.querySelector('.card-like-badge').style.opacity = 0;
        card.querySelector('.card-pass-badge').style.opacity = 0;
      }
    };

    card.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    document.addEventListener('mousemove', (e) => onMove(e.clientX));
    document.addEventListener('mouseup', onEnd);

    card.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    card.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX), { passive: true });
    card.addEventListener('touchend', onEnd);
  },

  showProfileDetail(profile) {
    const page = document.getElementById('profile-detail-page');
    if (!page) return;

    // --- Gallery ---
    const mainPhotoEl = document.getElementById('pdp-main-photo');
    const thumbsEl = document.getElementById('pdp-thumbs');
    const photos = profile.photos || [];
    const mainPhoto = profile.main_photo || (photos.length > 0 ? photos[0] : null);

    if (mainPhoto) {
      mainPhotoEl.style.backgroundImage = `url(${mainPhoto})`;
      mainPhotoEl.textContent = '';
    } else {
      mainPhotoEl.style.backgroundImage = '';
      mainPhotoEl.style.background = `linear-gradient(135deg, ${this.randomGradient()})`;
      mainPhotoEl.textContent = (profile.name || '?')[0].toUpperCase();
    }

    // Thumbnails
    if (photos.length > 1) {
      thumbsEl.innerHTML = photos.slice(0, 6).map((url, i) =>
        `<div class="pdp-thumb${i === 0 ? ' active' : ''}" style="background-image:url(${url})" onclick="Discover.switchPhoto('${url}', this)"></div>`
      ).join('');
      thumbsEl.style.display = '';
    } else {
      thumbsEl.innerHTML = '';
      thumbsEl.style.display = 'none';
    }

    // --- Name + age ---
    document.getElementById('pdp-name').textContent =
      `${profile.name || ''}${profile.age ? ', ' + profile.age : ''}`;

    // --- Verified ---
    const verifiedEl = document.getElementById('pdp-verified');
    if (profile.is_verified) verifiedEl.classList.remove('hidden');
    else verifiedEl.classList.add('hidden');

    // --- Location ---
    const locParts = [profile.neighborhood, profile.city].filter(Boolean);
    document.getElementById('pdp-location').textContent = locParts.join(', ') || '';

    // --- Price / Budget (removed) ---
    const priceEl = document.getElementById('pdp-price');
    if (priceEl) priceEl.innerHTML = '';

    // --- Bio ---
    const bioSection = document.getElementById('pdp-bio-section');
    const bioEl = document.getElementById('pdp-bio');
    if (profile.bio) {
      bioEl.textContent = profile.bio;
      bioSection.classList.remove('hidden');
    } else {
      bioSection.classList.add('hidden');
    }

    // --- Traits grid ---
    const traitsEl = document.getElementById('pdp-traits');
    const ratingBar = (val, max = 10) => {
      let html = '<div class="pdp-bar">';
      for (let i = 1; i <= max; i++) html += `<span class="${i <= val ? 'filled' : ''}"></span>`;
      return html + '</div>';
    };

    const scheduleLabel = profile.schedule === 'nocturno' ? t('pdp_schedule_night') : t('pdp_schedule_day');
    const personalityArr = Array.isArray(profile.personality) ? profile.personality
      : (profile.personality ? [profile.personality] : []);
    const personalityLabel = personalityArr.length > 0
      ? personalityArr.map(p => { const k = `pdp_personality_${p}`; const v = t(k); return v !== k ? v : p; }).join(', ')
      : '—';
    const petsLabel = profile.has_pets ? t('pdp_pets_yes') : t('pdp_pets_no');
    const smokerLabel = profile.is_smoker ? t('pdp_smoker_yes') : t('pdp_smoker_no');

    traitsEl.innerHTML = `
      <div class="pdp-trait">
        <div class="pdp-trait-icon blue">🧹</div>
        <div>
          <div class="pdp-trait-label">${t('pdp_cleanliness')}</div>
          <div class="pdp-trait-value">${profile.cleanliness || 5}/10</div>
          ${ratingBar(profile.cleanliness || 5)}
        </div>
      </div>
      <div class="pdp-trait">
        <div class="pdp-trait-icon amber">🍳</div>
        <div>
          <div class="pdp-trait-label">${t('pdp_cooking')}</div>
          <div class="pdp-trait-value">${profile.cooking || 5}/10</div>
          ${ratingBar(profile.cooking || 5)}
        </div>
      </div>
      <div class="pdp-trait">
        <div class="pdp-trait-icon violet">${profile.schedule === 'nocturno' ? '🌙' : '☀️'}</div>
        <div>
          <div class="pdp-trait-label">${t('pdp_schedule')}</div>
          <div class="pdp-trait-value">${scheduleLabel}</div>
        </div>
      </div>
      <div class="pdp-trait">
        <div class="pdp-trait-icon rose">✨</div>
        <div>
          <div class="pdp-trait-label">${t('pdp_personality')}</div>
          <div class="pdp-trait-value">${personalityLabel}</div>
        </div>
      </div>
      <div class="pdp-trait">
        <div class="pdp-trait-icon green">🐾</div>
        <div>
          <div class="pdp-trait-label">${t('pdp_pets')}</div>
          <div class="pdp-trait-value">${petsLabel}</div>
        </div>
      </div>
      <div class="pdp-trait">
        <div class="pdp-trait-icon sky">🚬</div>
        <div>
          <div class="pdp-trait-label">${t('pdp_smoke')}</div>
          <div class="pdp-trait-value">${smokerLabel}</div>
        </div>
      </div>
    `;

    // --- Hobbies ---
    const hobbiesSection = document.getElementById('pdp-hobbies-section');
    const hobbiesEl = document.getElementById('pdp-hobbies');
    if (profile.hobbies && profile.hobbies.length > 0) {
      hobbiesEl.innerHTML = profile.hobbies.map(h => `<span class="pdp-tag">${h}</span>`).join('');
      hobbiesSection.classList.remove('hidden');
    } else {
      hobbiesSection.classList.add('hidden');
    }

    // --- Room search specs (removed budget/duration/room) ---
    const specsEl = document.getElementById('pdp-specs');
    if (specsEl) specsEl.innerHTML = '';

    // Show page
    page.classList.remove('hidden');
    page.scrollTop = 0;
  },

  switchPhoto(url, thumbEl) {
    document.getElementById('pdp-main-photo').style.backgroundImage = `url(${url})`;
    document.querySelectorAll('.pdp-thumb').forEach(t => t.classList.remove('active'));
    if (thumbEl) thumbEl.classList.add('active');
  },

  closeProfileDetail() {
    const page = document.getElementById('profile-detail-page');
    if (page) page.classList.add('hidden');
  },

  animateSwipe(card, direction) {
    const xOut = direction === 'like' ? window.innerWidth + 200 : -(window.innerWidth + 200);
    card.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
    card.style.transform = `translateX(${xOut}px) rotate(${direction === 'like' ? 20 : -20}deg)`;
    card.style.opacity = '0';
    this.swipe(direction, card);
  },

  async swipe(direction, cardEl = null) {
    if (this.profiles.length === 0) return;

    const profile = this.profiles[0];

    if (!cardEl) {
      const stack = document.getElementById('card-stack');
      cardEl = stack.lastElementChild;
      if (cardEl && cardEl.classList.contains('profile-card')) {
        const xOut = direction === 'like' ? window.innerWidth + 200 : -(window.innerWidth + 200);
        cardEl.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
        cardEl.style.transform = `translateX(${xOut}px) rotate(${direction === 'like' ? 20 : -20}deg)`;
        cardEl.style.opacity = '0';
      }
    }

    this.profiles.shift();

    setTimeout(() => {
      if (cardEl) cardEl.remove();
      this.renderStack();
    }, 400);

    try {
      const result = await API.swipe(profile.id, direction);

      UI.updateSwipeCounter(result.swipes_today, result.swipes_remaining === 'unlimited');

      if (result.matched) {
        setTimeout(() => {
          UI.showMatchPopup({ conversation_id: result.conversation_id, match_id: result.match_id }, profile);
          UI.showNotificationBadge('matches');
        }, 500);
      }
    } catch (err) {
      if (err.code === 'LIMIT_REACHED') {
        document.getElementById('paywall').classList.remove('hidden');
      }
      console.error('Swipe API error:', err);
    }
  }
};
