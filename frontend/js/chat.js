// Chat Module
const Chat = {
  currentConvId: null,
  currentPartner: null,
  typingTimeout: null,

  async loadList() {
    UI.clearBadge('chat');
    const container = document.getElementById('conversations-list');
    try {
      const matches = await API.getMatches();

      if (matches.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <h3>${t('chat_empty_title')}</h3>
            <p style="color:var(--text-light);font-size:14px">${t('chat_empty_sub')}</p>
          </div>`;
        return;
      }

      container.innerHTML = matches.map(m => `
        <div class="match-card" onclick="Chat.openConversation('${m.conversation_id}', ${JSON.stringify({
          id: m.other_user_id, name: m.other_user_name, city: m.other_user_city, avatar_url: m.other_user_avatar
        }).replace(/"/g, '&quot;')})">
          <div class="match-card-avatar" style="${m.other_user_avatar ? `background-image:url(${m.other_user_avatar});` : `background:linear-gradient(135deg,#f8a4b8,#c084fc)`}">
            ${!m.other_user_avatar ? m.other_user_name[0].toUpperCase() : ''}
          </div>
          <div class="match-card-info">
            <div class="match-card-name">${m.other_user_name}</div>
            <div class="match-card-preview">${m.last_message || t('chat_start')}</div>
          </div>
          <div class="match-card-meta">
            ${m.unread_count > 0 ? `<span class="match-unread">${m.unread_count}</span>` : ''}
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<p style="padding:20px;color:var(--text-light);text-align:center">${t('chat_error_load')}</p>`;
    }
  },

  async openConversation(convId, partner = null) {
    this.currentConvId = convId;
    this.currentPartner = partner;

    const isDesktop = window.innerWidth >= 1100;

    if (!isDesktop) {
      document.getElementById('chat-list-view').classList.add('hidden-mobile');
    }
    const roomView = document.getElementById('chat-room-view');
    roomView.classList.remove('hidden');
    roomView.classList.add('visible');

    const nameEl = document.getElementById('chat-partner-name');
    const cityEl = document.getElementById('chat-partner-city');
    const avatarEl = document.getElementById('chat-partner-avatar');

    if (partner) {
      nameEl.textContent = partner.name || '';
      cityEl.textContent = partner.city || '';
      if (partner.avatar_url) {
        avatarEl.style.backgroundImage = `url(${partner.avatar_url})`;
        avatarEl.textContent = '';
      } else {
        avatarEl.textContent = (partner.name || '?')[0].toUpperCase();
        avatarEl.style.backgroundImage = '';
      }
    }

    if (socket) socket.emit('join_conversation', convId);

    await this.loadMessages(convId);

    document.getElementById('message-input').focus();
  },

  async loadMessages(convId) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div></div>';

    try {
      const messages = await API.getMessages(convId);
      container.innerHTML = '';

      if (messages.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:40px 20px;color:var(--text-light);font-size:14px">
            <div style="font-size:40px;margin-bottom:12px">👋</div>
            <p>${t('chat_hello')}</p>
          </div>`;
        return;
      }

      messages.forEach(msg => this.appendMessage(msg, false));
      this.scrollToBottom();
    } catch (e) {
      container.innerHTML = `<p style="padding:20px;text-align:center;color:var(--text-light)">${t('chat_error_load')}</p>`;
    }
  },

  appendMessage(msg, scroll = true) {
    const container = document.getElementById('messages-container');
    if (!container) return;

    const emptyState = container.querySelector('[style*="text-align:center"]');
    if (emptyState) emptyState.remove();

    const isMine = msg.sender_id === currentUser?.id;
    const time = new Date(msg.created_at).toLocaleTimeString(I18n.getLang(), { hour: '2-digit', minute: '2-digit' });

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display:flex;flex-direction:column;${isMine ? 'align-items:flex-end' : 'align-items:flex-start'}`;
    wrapper.innerHTML = `
      <div class="message ${isMine ? 'sent' : 'received'}">
        ${msg.content}
        <div class="message-time">${time}</div>
      </div>
    `;
    container.appendChild(wrapper);

    if (scroll) this.scrollToBottom();
  },

  scrollToBottom() {
    const container = document.getElementById('messages-container');
    if (container) container.scrollTop = container.scrollHeight;
  },

  async sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content || !this.currentConvId) return;

    input.value = '';

    const optimistic = {
      id: Date.now().toString(),
      content,
      sender_id: currentUser?.id,
      created_at: new Date().toISOString(),
      is_read: false
    };
    this.appendMessage(optimistic);

    try {
      if (socket?.connected) {
        socket.emit('send_message', { conversation_id: this.currentConvId, content });
      } else {
        await API.sendMessage(this.currentConvId, content);
      }
    } catch (e) {
      console.error('Send message error:', e);
      UI.showToast(t('chat_error_send'));
    }
  },

  handleTyping() {
    if (socket && this.currentConvId) {
      socket.emit('typing', { conversation_id: this.currentConvId });
    }
  },

  showTyping() {
    const indicator = document.getElementById('typing-indicator');
    const textEl = document.getElementById('typing-text');
    if (textEl) textEl.textContent = t('chat_typing', { name: this.currentPartner?.name || '' });
    if (indicator) indicator.classList.remove('hidden');

    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      if (indicator) indicator.classList.add('hidden');
    }, 3000);
  },

  backToList() {
    this.currentConvId = null;
    this.currentPartner = null;
    const roomView = document.getElementById('chat-room-view');
    roomView.classList.add('hidden');
    roomView.classList.remove('visible');
    document.getElementById('chat-list-view').classList.remove('hidden-mobile');
    this.loadList();
  }
};
