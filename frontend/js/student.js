/**
 * Student Portal Logic (Dashboard, Complaint Submission, List, Details)
 * Online Complaint and Grievance Management System
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Determine active view by checking DOM elements
  const isDashboardView = document.getElementById('studentDashboardView');
  const isSubmitView = document.getElementById('studentSubmitView');
  const isListView = document.getElementById('studentListView');
  const isDetailsView = document.getElementById('studentDetailsView');

  // Verify student authentication
  const currentUser = await api.requireAuth('student');
  if (!currentUser) return;

  // ----------------------------------------------------
  // 1. Student Dashboard View
  // ----------------------------------------------------
  if (isDashboardView) {
    try {
      const res = await api.get('/complaints/my');
      const { complaints, summary } = res.data;

      // Update KPI counter cards with real database metrics
      document.getElementById('metricTotal').textContent = summary.total;
      document.getElementById('metricSubmitted').textContent = summary.submitted;
      document.getElementById('metricReview').textContent = summary.underReview;
      document.getElementById('metricProgress').textContent = summary.inProgress;
      document.getElementById('metricResolved').textContent = summary.resolved;

      // Render recent complaints (first 5)
      const tbody = document.getElementById('recentComplaintsTable');
      if (complaints.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="empty-state">
              <div class="empty-state-icon">📋</div>
              <p>You have not submitted any grievances yet.</p>
              <a href="submit-complaint.html" class="btn btn-primary btn-sm">+ Submit Your First Complaint</a>
            </td>
          </tr>
        `;
      } else {
        const recent = complaints.slice(0, 5);
        tbody.innerHTML = recent
          .map(
            (c) => `
          <tr>
            <td><strong>${api.escapeHTML(c.trackingId)}</strong></td>
            <td>${api.escapeHTML(c.title)}</td>
            <td>${api.escapeHTML(c.category.name)}</td>
            <td>${api.getPriorityBadge(c.priority)}</td>
            <td>${api.getStatusBadge(c.status)}</td>
            <td>${api.formatDate(c.createdAt)}</td>
            <td>
              <a href="complaint-details.html?id=${c.id}" class="btn btn-secondary btn-sm">View</a>
            </td>
          </tr>
        `
          )
          .join('');
      }
    } catch (err) {
      api.showAlert('dashboardAlert', err.message || 'Failed to load dashboard metrics.');
    }
  }

  // ----------------------------------------------------
  // 2. Submit Complaint View
  // ----------------------------------------------------
  if (isSubmitView) {
    const categorySelect = document.getElementById('categorySelect');
    const submitForm = document.getElementById('submitComplaintForm');
    const successCard = document.getElementById('submissionSuccessCard');

    // Load available categories from PostgreSQL
    try {
      const catRes = await api.get('/categories');
      const categories = catRes.data?.categories || [];
      categorySelect.innerHTML =
        '<option value="">-- Select Category --</option>' +
        categories
          .map((cat) => `<option value="${cat.id}">${api.escapeHTML(cat.name)}</option>`)
          .join('');
    } catch (err) {
      api.showAlert('submitAlert', 'Failed to load categories. Please refresh the page.');
    }

    submitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      api.clearAlert('submitAlert');

      const title = document.getElementById('title').value.trim();
      const description = document.getElementById('description').value.trim();
      const categoryId = categorySelect.value;
      const priority = document.getElementById('prioritySelect').value;
      const fileInput = document.getElementById('attachments');
      const submitBtn = submitForm.querySelector('button[type="submit"]');

      if (!title || !description || !categoryId || !priority) {
        api.showAlert('submitAlert', 'Please fill in all required fields.');
        return;
      }

      // Validate files
      const files = fileInput.files;
      if (files.length > 3) {
        api.showAlert('submitAlert', 'You can upload a maximum of 3 attachments.');
        return;
      }

      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) {
          api.showAlert('submitAlert', `File "${file.name}" exceeds the 5 MB size limit.`);
          return;
        }
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('category_id', categoryId);
      formData.append('priority', priority);

      for (let i = 0; i < files.length; i++) {
        formData.append('attachments', files[i]);
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting grievance...';

      try {
        const response = await api.postForm('/complaints', formData);
        const complaint = response.data?.complaint;

        // Display success banner and tracking ID
        submitForm.style.display = 'none';
        successCard.style.display = 'block';

        document.getElementById('createdTrackingId').textContent = complaint.trackingId;
        document.getElementById('viewDetailsBtn').href = `complaint-details.html?id=${complaint.id}`;
      } catch (err) {
        api.showAlert('submitAlert', err.message || 'Failed to submit complaint.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Grievance';
      }
    });
  }

  // ----------------------------------------------------
  // 3. My Complaints List View
  // ----------------------------------------------------
  if (isListView) {
    let allComplaints = [];
    const tableBody = document.getElementById('complaintsTableBody');
    const statusFilter = document.getElementById('statusFilter');
    const searchInput = document.getElementById('searchInput');

    async function loadComplaints() {
      try {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="empty-state">
              <div class="spinner"></div>
              <p>Loading your grievances...</p>
            </td>
          </tr>
        `;
        const res = await api.get('/complaints/my');
        allComplaints = res.data?.complaints || [];
        renderTable();
      } catch (err) {
        api.showAlert('listAlert', err.message || 'Failed to load complaints.');
      }
    }

    function renderTable() {
      const selectedStatus = statusFilter.value;
      const searchKeyword = searchInput.value.trim().toLowerCase();

      const filtered = allComplaints.filter((c) => {
        const matchesStatus = selectedStatus === 'All' || c.status === selectedStatus;
        const matchesSearch =
          !searchKeyword ||
          c.trackingId.toLowerCase().includes(searchKeyword) ||
          c.title.toLowerCase().includes(searchKeyword);
        return matchesStatus && matchesSearch;
      });

      if (filtered.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="empty-state">
              <div class="empty-state-icon">🔍</div>
              <p>No complaints match your criteria.</p>
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = filtered
        .map(
          (c) => `
        <tr>
          <td><strong>${api.escapeHTML(c.trackingId)}</strong></td>
          <td>${api.escapeHTML(c.title)}</td>
          <td>${api.escapeHTML(c.category.name)}</td>
          <td>${api.getPriorityBadge(c.priority)}</td>
          <td>${api.getStatusBadge(c.status)}</td>
          <td>${api.formatDate(c.createdAt)}</td>
          <td>
            <a href="complaint-details.html?id=${c.id}" class="btn btn-secondary btn-sm">Details</a>
          </td>
        </tr>
      `
        )
        .join('');
    }

    statusFilter.addEventListener('change', renderTable);
    searchInput.addEventListener('input', renderTable);

    loadComplaints();
  }

  // ----------------------------------------------------
  // 4. Complaint Details View
  // ----------------------------------------------------
  if (isDetailsView) {
    const urlParams = new URLSearchParams(window.location.search);
    const complaintId = urlParams.get('id');

    if (!complaintId) {
      window.location.href = 'my-complaints.html';
      return;
    }

    try {
      const res = await api.get(`/complaints/${complaintId}`);
      const c = res.data?.complaint;

      if (!c) {
        throw new Error('Complaint details unavailable.');
      }

      // Populate header & metadata
      document.getElementById('trackingIdHeader').textContent = c.trackingId;
      document.getElementById('statusBadgeContainer').innerHTML = api.getStatusBadge(c.status);
      document.getElementById('priorityBadgeContainer').innerHTML = api.getPriorityBadge(c.priority);

      document.getElementById('detailTitle').textContent = c.title;
      document.getElementById('detailDescription').textContent = c.description;
      document.getElementById('detailCategory').textContent = c.category.name;
      document.getElementById('detailSubmittedDate').textContent = api.formatDate(c.createdAt);
      document.getElementById('detailUpdatedDate').textContent = api.formatDate(c.updatedAt);

      // Populate attachments
      const attachContainer = document.getElementById('attachmentsContainer');
      if (c.attachments && c.attachments.length > 0) {
        attachContainer.innerHTML = c.attachments
          .map(
            (att) => `
          <a href="${att.downloadUrl}" target="_blank" class="attachment-chip">
            <span>📎 ${api.escapeHTML(att.originalName)}</span>
            <small style="color:var(--text-muted)">(${(att.fileSize / 1024).toFixed(1)} KB)</small>
          </a>
        `
          )
          .join('');
      } else {
        attachContainer.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">No supporting documents attached.</span>';
      }

      // Populate status history timeline
      const timelineContainer = document.getElementById('timelineContainer');
      if (c.history && c.history.length > 0) {
        timelineContainer.innerHTML = c.history
          .map(
            (h) => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-date">${api.formatDate(h.createdAt)}</div>
              <div>${api.getStatusBadge(h.newStatus)}</div>
              <div class="timeline-remarks" style="margin-top:6px;">${api.escapeHTML(h.remarks || 'No remarks provided.')}</div>
            </div>
          </div>
        `
          )
          .join('');
      } else {
        timelineContainer.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No history recorded.</p>';
      }

      // Populate official administrator responses
      const responsesContainer = document.getElementById('responsesContainer');
      if (c.responses && c.responses.length > 0) {
        responsesContainer.innerHTML = c.responses
          .map(
            (r) => `
          <div class="response-card">
            <div class="response-header">
              <span class="response-admin">🏛️ ${api.escapeHTML(r.adminName || 'Administration')}</span>
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
            No official responses have been posted for this complaint yet.
          </div>
        `;
      }
    } catch (err) {
      api.showAlert('detailsAlert', err.message || 'Failed to load complaint details.');
    }
  }
});
