// Matches Module
const Matches = {
  async load() {
    const container = document.getElementById('matches-list');
    if (!container) return;

    try {
      const matches = await API.getMatches();
      UI.clearBadge('matches');

      if (matches.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </div>
            <h3>${t('matches_empty_title')}</h3>
            <p style="color:var(--text-light);font-size:14px">${t('matches_empty_sub')}</p>
          </div>`;
        return;
      }

      container.innerHTML = matches.map(m => {
        const avatar = m.other_user_avatar
          ? `background-image:url(${m.other_user_avatar}); background-size:cover; background-position:center;`
          : `background:linear-gradient(135deg,#f8a4b8,#c084fc)`;
        const avatarContent = m.other_user_avatar ? '' : (m.other_user_name || '?')[0].toUpperCase();
        const date = new Date(m.matched_at).toLocaleDateString(I18n.getLang());
        const preview = m.last_message || t('matches_new');

        return `
          <div class="match-card" onclick="App.goToChat('${m.conversation_id}')">
            <div class="match-card-avatar" style="${avatar}">${avatarContent}</div>
            <div class="match-card-info">
              <div class="match-card-name">${m.other_user_name || 'Usuario'}</div>
              <div class="match-card-preview">${m.other_user_city || ''} · ${date}</div>
              <div class="match-card-preview">${preview}</div>
            </div>
            <div class="match-card-meta">
              ${m.unread_count > 0 ? `<span class="match-unread">${m.unread_count}</span>` : ''}
            </div>
          </div>`;
      }).join('');
    } catch (e) {
      console.error('Matches load error:', e);
      container.innerHTML = `<p style="padding:20px;color:var(--text-light);text-align:center">${t('matches_error')}</p>`;
    }
  }
};
