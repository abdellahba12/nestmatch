// Profile Module
const Profile = {
  isEditing: false,

  async load() {
    try {
      currentUser = await API.getMe();
      this.render(currentUser);
      // Update premium button visibility
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
      : '<span style="color:var(--text-muted);font-size:14px">Sin hobbies añadidos</span>';

    const zones = (user.preferred_zones || []).join(', ') || 'Sin preferencia de zona';
    const budget = user.budget_min || user.budget_max
      ? `€${user.budget_min || '?'} – €${user.budget_max || '?'}/mes`
      : 'No especificado';

    const premiumBadge = user.is_premium
      ? `<span style="background:var(--grad-premium);color:#333;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700">⭐ PREMIUM</span>`
      : '';

    const flags = [];
    if (user.is_smoker) flags.push('🚬 Fumador/a');
    if (user.has_pets) flags.push('🐾 Tiene mascota');

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
          </div>
          <p class="profile-tagline">${user.profession || ''}${user.profession && user.city ? ' · ' : ''}${user.city || ''}</p>
          <div class="profile-stats">
            <div class="pstat">
              <strong>${user.swipes_today || 0}</strong>
              <span>Swipes hoy</span>
            </div>
            <div class="pstat">
              <strong>${user.is_premium ? '∞' : user.swipes_remaining}</strong>
              <span>Restantes</span>
            </div>
          </div>
        </div>
      </div>

      ${user.bio ? `
      <div class="profile-section">
        <h4>Sobre mí</h4>
        <p>${user.bio}</p>
      </div>` : ''}

      <div class="profile-section">
        <h4>Intereses</h4>
        <div class="card-tags" style="margin-top:4px">${hobbiesHtml}</div>
      </div>

      <div class="profile-section">
        <h4>Búsqueda de piso</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">Presupuesto</div>
            <div style="font-weight:600;color:var(--text)">${budget}</div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">Duración</div>
            <div style="font-weight:600;color:var(--text)">${this.formatDuration(user.stay_duration)}</div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">Zonas preferidas</div>
            <div style="font-weight:600;color:var(--text);font-size:13px">${zones}</div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">Tipo habitación</div>
            <div style="font-weight:600;color:var(--text)">${user.room_type === 'private' ? 'Privada' : 'Compartida'}</div>
          </div>
        </div>
      </div>

      ${flags.length > 0 ? `
      <div class="profile-section">
        <h4>Estilo de vida</h4>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
          ${flags.map(f => `<span class="card-tag">${f}</span>`).join('')}
        </div>
      </div>` : ''}

      <div class="profile-section" style="border:2px solid var(--border);background:var(--bg)">
        <h4>Cuenta</h4>
        <p style="font-size:14px;color:var(--text-light)">${user.email}</p>
        <p style="font-size:14px;color:var(--text-muted);margin-top:4px">Miembro desde ${new Date(user.created_at).toLocaleDateString('es')}</p>
      </div>
    `;
  },

  formatDuration(d) {
    if (d === 'short') return 'Corta (<6 meses)';
    if (d === 'long') return 'Larga (>1 año)';
    return 'Media (6–12 meses)';
  },

  toggleEdit() {
    // Simple edit: open prompt flow (can be expanded)
    const bio = prompt('Actualiza tu bio:', currentUser?.bio || '');
    if (bio !== null) {
      API.updateMe({ bio }).then(() => this.load()).catch(console.error);
    }
  }
};
