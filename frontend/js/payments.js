// Payments Module
const Payments = {
  async openCheckout() {
    try {
      const result = await API.createCheckout();
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (e) {
      console.error('Checkout error:', e);
      UI.showToast('Error al abrir el checkout. Inténtalo de nuevo.');
    }
  },

  async openPortal() {
    try {
      const result = await API.openPortal();
      if (result.url) window.location.href = result.url;
    } catch (e) {
      UI.showToast('Error al abrir el portal de facturación.');
    }
  }
};

// Matches Module
const Matches = {
  async load() {
    UI.clearBadge('matches');
    const container = document.getElementById('matches-list');
    try {
      const matches = await API.getMatches();

      if (matches.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">💫</div>
            <h3>Aún no tienes matches</h3>
            <p style="color:var(--text-light);font-size:14px;max-width:240px;margin:0 auto">
              Sigue explorando perfiles y pronto encontrarás a alguien compatible
            </p>
            <button class="btn-primary" style="margin-top:20px" onclick="App.switchTab('discover')">
              Explorar perfiles
            </button>
          </div>`;
        return;
      }

      container.innerHTML = matches.map(m => `
        <div class="match-card" onclick="App.switchTab('chat');setTimeout(()=>Chat.openConversation('${m.conversation_id}',${JSON.stringify({
          id: m.other_user_id,
          name: m.other_user_name,
          city: m.other_user_city,
          avatar_url: m.other_user_avatar
        }).replace(/"/g,'&quot;')}),150)">
          <div class="match-card-avatar" style="${m.other_user_avatar ? `background-image:url(${m.other_user_avatar});background-size:cover;background-position:center` : `background:linear-gradient(135deg,#f8a4b8,#c084fc)`}">
            ${!m.other_user_avatar ? (m.other_user_name || '?')[0].toUpperCase() : ''}
          </div>
          <div class="match-card-info">
            <div class="match-card-name">${m.other_user_name}</div>
            <div class="match-card-preview" style="color:var(--text-muted);font-size:12px">
              📍 ${m.other_user_city || 'Sin ciudad'}
            </div>
            <div class="match-card-preview">
              ${m.last_message || '¡Nuevo match! Envía un mensaje 👋'}
            </div>
          </div>
          <div class="match-card-meta">
            ${m.unread_count > 0 ? `<span class="match-unread">${m.unread_count}</span>` : ''}
            <span style="font-size:11px;color:var(--text-muted)">${this.formatDate(m.matched_at)}</span>
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = '<p style="padding:20px;color:var(--text-light);text-align:center">Error cargando matches</p>';
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `hace ${days}d`;
    }
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }
};

// Handle premium success redirect
if (window.location.pathname === '/premium-success') {
  history.replaceState({}, '', '/');
  UI?.showToast('🎉 ¡Bienvenido/a a Premium!');
  Profile?.load();
}
