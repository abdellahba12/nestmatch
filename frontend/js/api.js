// API Client
const API = (() => {
  const BASE = '/api';

  const getToken = () => localStorage.getItem('pm_token');

  const headers = (extra = {}) => {
    const h = { 'Content-Type': 'application/json', ...extra };
    const t = getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  };

  const request = async (method, path, body = null) => {
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  };

  const upload = async (path, formData) => {
    const opts = {
      method: 'POST',
      headers: {},
      body: formData
    };
    const t = getToken();
    if (t) opts.headers['Authorization'] = `Bearer ${t}`;
    const res = await fetch(`${BASE}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  };

  return {
    // Auth
    login: (email, password) => request('POST', '/auth/login', { email, password }),
    register: (data) => request('POST', '/auth/register', data),
    googleAuth: (credential) => request('POST', '/auth/google', { credential }),
    getMe: () => request('GET', '/auth/me'),
    updateMe: (data) => request('PUT', '/auth/me', data),

    // Verification
    sendVerificationCode: (contact, method) =>
      request('POST', '/auth/send-code', { contact, method }),
    verifyCode: (contact, code, method) =>
      request('POST', '/auth/verify-code', { contact, code, method }),

    // Identity verification
    submitVerification: (formData) => upload('/auth/verify-identity', formData),
    getVerificationStatus: () => request('GET', '/auth/verification-status'),

    // Users
    discover: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return request('GET', `/users/discover${params ? '?' + params : ''}`);
    },
    swipe: (target_id, direction) => request('POST', '/users/swipe', { target_id, direction }),
    getMatches: () => request('GET', '/users/matches'),
    getUser: (id) => request('GET', `/users/${id}`),

    // Chat
    getMessages: (convId, before = null) => {
      const params = before ? `?before=${before}` : '';
      return request('GET', `/conversations/${convId}/messages${params}`);
    },
    sendMessage: (convId, content) => request('POST', `/conversations/${convId}/messages`, { content }),

    // Photos
    uploadPhoto: (formData) => upload('/auth/upload-photo', formData),

    // Account
    delete: (path) => request('DELETE', path),

    // Payments
    createCheckout: () => request('POST', '/payments/create-checkout'),
    openPortal: () => request('POST', '/payments/portal'),
    getPaymentStatus: () => request('GET', '/payments/status'),
  };
})();
