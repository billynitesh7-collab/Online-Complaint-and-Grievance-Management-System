/**
 * Administrator Analytics & Reports Visualizations (Chart.js)
 * Online Complaint and Grievance Management System
 */

document.addEventListener('DOMContentLoaded', async () => {
  const isAnalyticsView = document.getElementById('adminAnalyticsView');
  if (!isAnalyticsView) return;

  // Verify administrator access
  const currentUser = await api.requireAuth('admin');
  if (!currentUser) return;

  const categoryFilter = document.getElementById('analyticsCategoryFilter');
  const statusFilter = document.getElementById('analyticsStatusFilter');
  const yearFilter = document.getElementById('analyticsYearFilter');
  const resetBtn = document.getElementById('resetFiltersBtn');

  // Chart instances tracking
  let statusChartInstance = null;
  let categoryChartInstance = null;
  let priorityChartInstance = null;
  let trendsChartInstance = null;

  // Load available categories
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

  /**
   * Fetch aggregate data and redraw KPI cards and Chart.js visualizations
   */
  async function loadAnalytics() {
    api.clearAlert('analyticsAlert');

    const params = new URLSearchParams();
    if (yearFilter.value) params.append('year', yearFilter.value);
    if (categoryFilter.value) params.append('category_id', categoryFilter.value);
    if (statusFilter.value && statusFilter.value !== 'All') params.append('status', statusFilter.value);

    try {
      const res = await api.get(`/admin/stats?${params.toString()}`);
      const { overview, byStatus, byCategory, byPriority, monthlyTrends } = res.data;

      // 1. Update KPI Performance Cards
      document.getElementById('kpiTotal').textContent = overview.total;
      document.getElementById('kpiResolved').textContent = overview.resolved;
      document.getElementById('kpiUnresolved').textContent = overview.unresolved;
      document.getElementById('kpiResolutionRate').textContent = `${overview.resolutionRate}%`;

      // 2. Render Charts using Chart.js
      renderStatusChart(byStatus, overview.total);
      renderCategoryChart(byCategory);
      renderPriorityChart(byPriority, overview.total);
      renderTrendsChart(monthlyTrends);
    } catch (err) {
      api.showAlert('analyticsAlert', err.message || 'Failed to load analytics data.');
    }
  }

  /**
   * 1. Status Doughnut Chart
   */
  function renderStatusChart(statusData, total) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    if (statusChartInstance) statusChartInstance.destroy();

    const labels = statusData.map((d) => d.status);
    const data = statusData.map((d) => d.count);
    const colors = statusData.map((d) => d.color);

    const hasData = total > 0;

    statusChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: hasData ? labels : ['No Data'],
        datasets: [
          {
            data: hasData ? data : [1],
            backgroundColor: hasData ? colors : ['#e2e8f0'],
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 12,
              font: { size: 12 },
            },
          },
          tooltip: {
            enabled: hasData,
          },
        },
        cutout: '65%',
      },
    });
  }

  /**
   * 2. Category Distribution Bar Chart
   */
  function renderCategoryChart(categoryData) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (categoryChartInstance) categoryChartInstance.destroy();

    const labels = categoryData.map((c) => c.name);
    const data = categoryData.map((c) => c.count);

    categoryChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Complaints',
            data,
            backgroundColor: '#2563eb',
            borderRadius: 4,
            maxBarThickness: 32,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              font: { size: 11 },
            },
            grid: {
              color: '#f1f5f9',
            },
          },
          x: {
            ticks: {
              font: { size: 11 },
              maxRotation: 30,
              minRotation: 0,
            },
            grid: {
              display: false,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
        },
      },
    });
  }

  /**
   * 3. Priority Breakdown Pie/Doughnut Chart
   */
  function renderPriorityChart(priorityData, total) {
    const ctx = document.getElementById('priorityChart').getContext('2d');
    if (priorityChartInstance) priorityChartInstance.destroy();

    const labels = priorityData.map((p) => p.priority);
    const data = priorityData.map((p) => p.count);
    const colors = priorityData.map((p) => p.color);

    const hasData = total > 0;

    priorityChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: hasData ? labels : ['No Data'],
        datasets: [
          {
            data: hasData ? data : [1],
            backgroundColor: hasData ? colors : ['#e2e8f0'],
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 12,
              font: { size: 12 },
            },
          },
          tooltip: {
            enabled: hasData,
          },
        },
      },
    });
  }

  /**
   * 4. Monthly Complaint Trends Line Chart
   */
  function renderTrendsChart(trendsData) {
    const ctx = document.getElementById('trendsChart').getContext('2d');
    if (trendsChartInstance) trendsChartInstance.destroy();

    const hasTrends = trendsData && trendsData.length > 0;
    const labels = hasTrends ? trendsData.map((t) => t.monthLabel) : ['Current Period'];
    const totalData = hasTrends ? trendsData.map((t) => t.total) : [0];
    const resolvedData = hasTrends ? trendsData.map((t) => t.resolved) : [0];

    trendsChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Submissions',
            data: totalData,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 4,
          },
          {
            label: 'Resolved',
            data: resolvedData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              font: { size: 11 },
            },
            grid: {
              color: '#f1f5f9',
            },
          },
          x: {
            grid: {
              display: false,
            },
            ticks: {
              font: { size: 11 },
            },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              font: { size: 12 },
            },
          },
        },
      },
    });
  }

  // Filter change handlers
  categoryFilter.addEventListener('change', loadAnalytics);
  statusFilter.addEventListener('change', loadAnalytics);
  yearFilter.addEventListener('change', loadAnalytics);

  resetBtn.addEventListener('click', () => {
    categoryFilter.value = '';
    statusFilter.value = 'All';
    yearFilter.value = '';
    loadAnalytics();
  });

  // Initial load
  loadAnalytics();
});
