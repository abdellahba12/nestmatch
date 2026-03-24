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
    const ageMin = document.getElementById('filter-age-min')?.value;
    const ageMax = document.getElementById('filter-age-max')?.value;
    const budget = document.getElementById('filter-budget')?.value;
    const gender = document.getElementById('filter-gender')?.value;

    if (city) filters.city = city;
    if (ageMin) filters.age_min = ageMin;
    if (ageMax) filters.age_max = ageMax;
    if (budget) filters.budget_max = budget;
    if (gender) filters.gender = gender;

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

    // Render up to 3 cards (stack effect)
    const toRender = Math.min(3, this.profiles.length);
    for (let i = toRender - 1; i >= 0; i--) {
      const card = this.createCard(this.profiles[i], i);
      stack.appendChild(card);
    }

    // Init drag on top card
    if (this.profiles.length > 0) {
      this.initDrag(stack.lastElementChild);
    }
  },

  createCard(profile, stackPos) {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.dataset.profileId = profile.id;

    // Stack transform for depth effect
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

    const budget = profile.budget_min && profile.budget_max
      ? `€${profile.budget_min}–€${profile.budget_max}/mes`
      : profile.budget_max
      ? `Hasta €${profile.budget_max}/mes`
      : '';

    const hobbyTags = (profile.hobbies || []).slice(0, 4).map(h =>
      `<span class="card-tag">${h}</span>`
    ).join('');

    const zones = (profile.preferred_zones || []).slice(0, 2).join(', ');

    const photoDots = photos.length > 1
      ? `<div class="card-photo-dots">${photos.slice(0, 5).map((_, i) =>
          `<div class="photo-dot${i === 0 ? ' active' : ''}"></div>`
        ).join('')}</div>`
      : '';

    card.innerHTML = `
      <div class="card-photo" style="${photoStyle}">
        ${photoDots}
        <div class="card-like-badge">❤ ME GUSTA</div>
        <div class="card-pass-badge">✕ PASAR</div>
        ${!mainPhoto ? `<span style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2))">${this.avatarEmoji(profile)}</span>` : ''}
      </div>
      <div class="card-info">
        <div class="card-name-row">
          <span class="card-name">${profile.name}</span>
          <span class="card-age">${profile.age}</span>
        </div>
        <div class="card-location">📍 ${profile.city}${profile.neighborhood ? ', ' + profile.neighborhood : ''}${profile.profession ? ' · ' + profile.profession : ''}</div>
        ${profile.bio ? `<p class="card-bio">${profile.bio}</p>` : ''}
        ${hobbyTags ? `<div class="card-tags">${hobbyTags}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center">
          ${budget ? `<span class="card-budget">💰 ${budget}</span>` : ''}
          ${zones ? `<span style="font-size:12px;color:var(--text-light)">📍 ${zones}</span>` : ''}
        </div>
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

    const onStart = (clientX, clientY) => {
      this.isDragging = true;
      this.startX = clientX;
      this.startY = clientY;
      this.currentX = 0;
      card.style.transition = 'none';
    };

    const onMove = (clientX) => {
      if (!this.isDragging) return;
      this.currentX = clientX - this.startX;
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
      } else {
        card.style.transform = 'scale(1) translateY(0)';
        card.querySelector('.card-like-badge').style.opacity = 0;
        card.querySelector('.card-pass-badge').style.opacity = 0;
      }
    };

    // Mouse
    card.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    document.addEventListener('mousemove', (e) => onMove(e.clientX));
    document.addEventListener('mouseup', onEnd);

    // Touch
    card.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    card.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX), { passive: true });
    card.addEventListener('touchend', onEnd);
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

    // Remove top card after animation
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

    // Remove from local array
    this.profiles.shift();

    // Update stack visuals
    setTimeout(() => {
      if (cardEl) cardEl.remove();
      this.renderStack();
    }, 400);

    // API call
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
