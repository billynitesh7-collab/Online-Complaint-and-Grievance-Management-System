/**
 * Administrator Portal Logic (Dashboard, Complaint Management, Investigation Details)
 * Online Complaint and Grievance Management System
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Identify active admin view
  const isAdminDashboard = document.getElementById('adminDashboardView');
  const isAdminComplaints = document.getElementById('adminComplaintsView');
  const isAdminDetails = document.getElementById('adminDetailsView');

  // Verify administrator authentication
  const currentUser = await api.requireAuth('admin');
  if (!currentUser) return;

  // ----------------------------------------------------
  // 1. Admin Dashboard View
  // ----------------------------------------------------
  if (isAdminDashboard) {
    try {
      // 1. Fetch system-wide KPI metrics from PostgreSQL
      const statsRes = await api.get('/admin/stats');
      const overview = statsRes.data?.overview || {};

      document.getElementById('metricTotal').textContent = overview.total || 0;
      document.getElementById('metricSubmitted').textContent = overview.submitted || 0;
      document.getElementById('metricReview').textContent = overview.underReview || 0;
      document.getElementById('metricProgress').textContent = overview.inProgress || 0;
      document.getElementById('metricResolved').textContent = overview.resolved || 0;
      document.getElementById('metricRejected').textContent = overview.rejected || 0;

      // 2. Fetch latest 5 complaints
      const complaintsRes = await api.get('/admin/complaints?limit=5&sort=newest');
      const recent = complaintsRes.data?.complaints || [];
      const tbody = document.getElementById('recentComplaintsTable');

      if (recent.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="empty-state">
              <div class="empty-state-icon">📋</div>
              <p>No grievances have been lodged yet.</p>
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = recent
          .map(
            (c) => `
          <tr>
            <td><strong>${api.escapeHTML(c.trackingId)}</strong></td>
            <td>
              <div>${api.escapeHTML(c.student?.name || '—')}</div>
              <small style="color:var(--text-muted);">${api.escapeHTML(c.student?.rollNumber || '')}</small>
            </td>
            <td>${api.escapeHTML(c.title)}</td>
            <td>${api.escapeHTML(c.category?.name || '—')}</td>
            <td>${api.getPriorityBadge(c.priority)}</td>
            <td>${api.getStatusBadge(c.status)}</td>
            <td>${api.formatDate(c.createdAt)}</td>
            <td>
              <a href="complaint-details.html?id=${c.id}" class="btn btn-secondary btn-sm">Manage</a>
            </td>
          </tr>
        `
          )
          .join('');
      }
    } catch (err) {
      api.showAlert('adminDashboardAlert', err.message || 'Failed to load dashboard metrics.');
    }
  }

  // ----------------------------------------------------
  // 2. Admin Complaints Management List View
  // ----------------------------------------------------
  if (isAdminComplaints) {
    let currentPage = 1;
    const limit = 10;
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const priorityFilter = document.getElementById('priorityFilter');
    const sortSelect = document.getElementById('sortSelect');
    const tableBody = document.getElementById('complaintsTableBody');
    const paginationContainer = document.getElementById('paginationContainer');

    // Populate categories filter
    try {
      const catRes = await api.get('/categories');
      const categories = catRes.data?.categories || [];
      categoryFilter.innerHTML =
        '<option value="">All Categories</option>' +
        categories
          .map((cat) => `<option value="${cat.id}">${api.escapeHTML(cat.name)}</option>`)
          .join('');
    } catch (e) {
      console.error('Failed to load categories filter:', e);
    }

    async function loadComplaints() {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <div class="spinner"></div>
            <p>Loading complaints...</p>
          </td>
        </tr>
      `;

      const params = new URLSearchParams();
      params.append('page', String(currentPage));
      params.append('limit', String(limit));

      const searchVal = searchInput.value.trim();
      if (searchVal) params.append('search', searchVal);

      const statusVal = statusFilter.value;
      if (statusVal && statusVal !== 'All') params.append('status', statusVal);

      const catVal = categoryFilter.value;
      if (catVal) params.append('category_id', catVal);

      const priorityVal = priorityFilter.value;
      if (priorityVal && priorityVal !== 'All') params.append('priority', priorityVal);

      const sortVal = sortSelect.value;
      if (sortVal) params.append('sort', sortVal);

      try {
        const res = await api.get(`/admin/complaints?${params.toString()}`);
        const complaints = res.data?.complaints || [];
        const pagination = res.data?.pagination || { total: 0, totalPages: 1 };

        if (complaints.length === 0) {
          tableBody.innerHTML = `
            <tr>
              <td colspan="8" class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <p>No complaints matched your criteria.</p>
              </td>
            </tr>
          `;
          paginationContainer.innerHTML = '';
          return;
        }

        tableBody.innerHTML = complaints
          .map(
            (c) => `
          <tr>
            <td><strong>${api.escapeHTML(c.trackingId)}</strong></td>
            <td>
              <div><strong>${api.escapeHTML(c.student?.name || '—')}</strong></div>
              <small style="color:var(--text-muted);">${api.escapeHTML(c.student?.rollNumber || '')} • ${api.escapeHTML(c.student?.department || '')}</small>
            </td>
            <td>${api.escapeHTML(c.title)}</td>
            <td>${api.escapeHTML(c.category?.name || '—')}</td>
            <td>${api.getPriorityBadge(c.priority)}</td>
            <td>${api.getStatusBadge(c.status)}</td>
            <td>${api.formatDate(c.createdAt)}</td>
            <td>
              <a href="complaint-details.html?id=${c.id}" class="btn btn-secondary btn-sm">Manage</a>
            </td>
          </tr>
        `
          )
          .join('');

        // Render pagination controls
        renderPagination(pagination);
      } catch (err) {
        api.showAlert('adminListAlert', err.message || 'Failed to load complaints list.');
      }
    }

    function renderPagination(pagination) {
      const { page, totalPages, total } = pagination;
      if (totalPages <= 1) {
        paginationContainer.innerHTML = `<span style="color:var(--text-muted);font-size:13px;">Showing all ${total} record(s)</span>`;
        return;
      }

      paginationContainer.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;font-size:13px;">
          <span style="color:var(--text-muted);">Page ${page} of ${totalPages} (Total: ${total} records)</span>
          <div style="display:flex;gap:8px;">
            <button id="prevPageBtn" class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''}>← Previous</button>
            <button id="nextPageBtn" class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
          </div>
        </div>
      `;

      const prevBtn = document.getElementById('prevPageBtn');
      const nextBtn = document.getElementById('nextPageBtn');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            loadComplaints();
          }
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (currentPage < totalPages) {
            currentPage++;
            loadComplaints();
          }
        });
      }
    }

    // Debounced search & filter handlers
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 1;
        loadComplaints();
      }, 300);
    });

    statusFilter.addEventListener('change', () => { currentPage = 1; loadComplaints(); });
    categoryFilter.addEventListener('change', () => { currentPage = 1; loadComplaints(); });
    priorityFilter.addEventListener('change', () => { currentPage = 1; loadComplaints(); });
    sortSelect.addEventListener('change', () => { currentPage = 1; loadComplaints(); });

    loadComplaints();
  }

  // ----------------------------------------------------
  // 3. Admin Complaint Details View
  // ----------------------------------------------------
  if (isAdminDetails) {
    const urlParams = new URLSearchParams(window.location.search);
    const complaintId = urlParams.get('id');

    if (!complaintId) {
      window.location.href = 'complaints.html';
      return;
    }

    async function loadDetails() {
      try {
        const res = await api.get(`/complaints/${complaintId}`);
        const c = res.data?.complaint;

        if (!c) throw new Error('Complaint details not available.');

        // Header and badges
        document.getElementById('trackingIdHeader').textContent = c.trackingId;
        document.getElementById('statusBadgeContainer').innerHTML = api.getStatusBadge(c.status);
        document.getElementById('priorityBadgeContainer').innerHTML = api.getPriorityBadge(c.priority);

        // Core Statement
        document.getElementById('detailTitle').textContent = c.title;
        document.getElementById('detailDescription').textContent = c.description;
        document.getElementById('detailCategory').textContent = c.category.name;
        document.getElementById('detailSubmittedDate').textContent = api.formatDate(c.createdAt);
        document.getElementById('detailUpdatedDate').textContent = api.formatDate(c.updatedAt);

        // Student Info
        document.getElementById('studentName').textContent = c.student.name;
        document.getElementById('studentEmail').textContent = c.student.email;
        document.getElementById('studentRoll').textContent = c.student.rollNumber || '—';
        document.getElementById('studentDept').textContent = c.student.department || '—';

        // Pre-select current status in update dropdown
        const statusSelect = document.getElementById('newStatusSelect');
        if (statusSelect) {
          statusSelect.value = c.status;
        }

        // Attachments
        const attachContainer = document.getElementById('attachmentsContainer');
        if (c.attachments && c.attachments.length > 0) {
          attachContainer.innerHTML = c.attachments
            .map(
              (att) => `
            <a href="${att.downloadUrl}" target="_blank" class="attachment-chip">
              <span>📎 ${api.escapeHTML(att.originalName)}</span>
              <small style="color:var(--text-muted);">(${(att.fileSize / 1024).toFixed(1)} KB)</small>
            </a>
          `
            )
            .join('');
        } else {
          attachContainer.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">No supporting documents attached.</span>';
        }

        // Timeline
        const timelineContainer = document.getElementById('timelineContainer');
        if (c.history && c.history.length > 0) {
          timelineContainer.innerHTML = c.history
            .map(
              (h) => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <div class="timeline-date">${api.formatDate(h.createdAt)}</div>
                <div style="display:flex;align-items:center;gap:6px;">
                  ${api.getStatusBadge(h.newStatus)}
                  <small style="color:var(--text-muted);">by ${api.escapeHTML(h.changedBy)} (${api.escapeHTML(h.role)})</small>
                </div>
                <div class="timeline-remarks" style="margin-top:6px;">${api.escapeHTML(h.remarks || 'No remarks.')}</div>
              </div>
            </div>
          `
            )
            .join('');
        } else {
          timelineContainer.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No history recorded.</p>';
        }

        // Official Responses
        const responsesContainer = document.getElementById('responsesContainer');
        if (c.responses && c.responses.length > 0) {
          responsesContainer.innerHTML = c.responses
            .map(
              (r) => `
            <div class="response-card">
              <div class="response-header">
                <span class="response-admin">🏛️ ${api.escapeHTML(r.adminName || 'Administrator')}</span>
                <span class="response-date">${api.formatDate(r.createdAt)}</span>
              </div>
              <div class="response-body">${api.escapeHTML(r.message)}</div>
            </div>
          `
            )
            .join('');
        } else {
          responsesContainer.innerHTML = `
            <div style="background:#f8fafc;padding:16px;border-radius:var(--radius-sm);color:var(--text-muted);font-size:13px;text-align:center;">
              No official responses sent yet.
            </div>
          `;
        }
      } catch (err) {
        api.showAlert('adminDetailsAlert', err.message || 'Failed to load complaint details.');
      }
    }

    // Status Update Form Handler
    const statusForm = document.getElementById('updateStatusForm');
    if (statusForm) {
      statusForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        api.clearAlert('actionAlert');

        const newStatus = document.getElementById('newStatusSelect').value;
        const remarks = document.getElementById('statusRemarks').value.trim();
        const submitBtn = statusForm.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        try {
          await api.patch(`/admin/complaints/${complaintId}/status`, {
            status: newStatus,
            remarks: remarks || `Status transitioned to ${newStatus}`,
          });

          api.showAlert('actionAlert', `Complaint status successfully updated to "${newStatus}".`, 'success');
          document.getElementById('statusRemarks').value = '';
          await loadDetails();
        } catch (err) {
          api.showAlert('actionAlert', err.message || 'Failed to update status.');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Apply Status Update';
        }
      });
    }

    // Official Response Form Handler
    const responseForm = document.getElementById('sendResponseForm');
    if (responseForm) {
      responseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        api.clearAlert('actionAlert');

        const message = document.getElementById('responseMessage').value.trim();
        const submitBtn = responseForm.querySelector('button[type="submit"]');

        if (!message) {
          api.showAlert('actionAlert', 'Please enter a response message.');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
          await api.post(`/admin/complaints/${complaintId}/responses`, { message });
          api.showAlert('actionAlert', 'Official response published and recorded.', 'success');
          document.getElementById('responseMessage').value = '';
          await loadDetails();
        } catch (err) {
          api.showAlert('actionAlert', err.message || 'Failed to submit response.');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Official Response';
        }
      });
    }

    loadDetails();
  }
});
