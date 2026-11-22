/**
 * Reusable API Client & Authentication Session Helper
 * Online Complaint and Grievance Management System
 */

const API_BASE = '/api';

const api = {
  /**
   * Generic Fetch wrapper with credentials and JSON parsing
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const defaultHeaders = {};

    if (!(options.body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const config = {
      credentials: 'include', // Guarantees session cookie transmission
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(data.message || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      // Propagate error for UI handling
      throw err;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  patch(endpoint, body) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  postForm(endpoint, formData) {
    return this.request(endpoint, {
      method: 'POST',
      body: formData,
    });
  },

  /**
   * Get current authenticated user profile
   */
  async getCurrentUser() {
    try {
      const res = await this.get('/auth/me');
      return res.data?.user || null;
    } catch (err) {
      return null;
    }
  },

  /**
   * Perform logout and redirect to login page
   */
  async logout() {
    try {
      await this.post('/auth/logout', {});
    } catch (e) {
      // Continue redirect even if network drops
    }
    window.location.href = '/login.html';
  },

  /**
   * Guard protected pages: verify active session & role
   * @param {string} [expectedRole] - 'student' or 'admin'
   * @returns {Promise<Object|null>}
   */
  async requireAuth(expectedRole = null) {
    const user = await this.getCurrentUser();
    if (!user) {
      const currentPath = encodeURIComponent(window.location.pathname);
      window.location.href = `/login.html?redirect=${currentPath}`;
      return null;
    }

    if (expectedRole && user.role !== expectedRole) {
      if (user.role === 'admin') {
        window.location.href = '/admin/dashboard.html';
      } else {
        window.location.href = '/student/dashboard.html';
      }
      return null;
    }

    // Populate user profile elements if present on page
    document.querySelectorAll('.user-name').forEach((el) => {
      el.textContent = user.name;
    });
    document.querySelectorAll('.user-meta').forEach((el) => {
      el.textContent = `${user.rollNumber || user.role} • ${user.department || ''}`;
    });
    document.querySelectorAll('.user-avatar').forEach((el) => {
      el.textContent = (user.name || 'U').charAt(0).toUpperCase();
    });

    // Attach global logout handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        api.logout();
      });
    }

    return user;
  },

  /**
   * UI Escape Helper (XSS prevention)
   */
  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Date formatting helper
   */
  formatDate(dateString) {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  /**
   * Generate status badge HTML
   */
  getStatusBadge(status) {
    const s = String(status || '').toLowerCase().replace(/\s+/g, '-');
    return `<span class="badge badge-${s}">${this.escapeHTML(status)}</span>`;
  },

  /**
   * Generate priority badge HTML
   */
  getPriorityBadge(priority) {
    const p = String(priority || '').toLowerCase();
    return `<span class="badge priority-${p}">${this.escapeHTML(priority)}</span>`;
  },

  /**
   * Display alert banner in specified container
   */
  showAlert(containerId, message, type = 'error') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="alert alert-${type}">
        <span>${this.escapeHTML(message)}</span>
      </div>
    `;
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  clearAlert(containerId) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  },
};
