// Exprsn Payments Dashboard JavaScript

// API Base URL
const API_BASE = window.location.origin + '/api';

// Dashboard State
let dashboardData = {
  subscriptions: {},
  invoices: {},
  chargebacks: {}
};

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();

  // Auto-refresh every 30 seconds
  setInterval(loadDashboard, 30000);
});

// Load Dashboard Data
async function loadDashboard() {
  try {
    await Promise.all([
      loadSubscriptionStats(),
      loadInvoiceStats(),
      loadChargebackStats(),
      loadRecentSubscriptions(),
      loadRecentInvoices(),
      loadChargebacksNeedingAttention()
    ]);
  } catch (error) {
    console.error('Dashboard load error:', error);
    showError('Failed to load dashboard data');
  }
}

// Load Subscription Statistics
async function loadSubscriptionStats() {
  try {
    const response = await fetch(`${API_BASE}/subscriptions?status=active&limit=1000`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch subscriptions');

    const data = await response.json();
    const activeCount = data.pagination.total;

    // Calculate MRR from active subscriptions
    let mrr = 0;
    if (data.data && data.data.length > 0) {
      mrr = data.data.reduce((sum, sub) => {
        if (sub.status === 'active') {
          // Normalize to monthly
          let monthlyAmount = sub.amount;
          if (sub.billingCycle === 'yearly') monthlyAmount = sub.amount / 12;
          if (sub.billingCycle === 'quarterly') monthlyAmount = sub.amount / 3;
          if (sub.billingCycle === 'biannual') monthlyAmount = sub.amount / 6;
          return sum + monthlyAmount;
        }
        return sum;
      }, 0);
    }

    document.getElementById('activeSubscriptions').textContent = activeCount.toLocaleString();
    document.getElementById('monthlyRevenue').textContent = formatCurrency(mrr);

    dashboardData.subscriptions = { activeCount, mrr };
  } catch (error) {
    console.error('Error loading subscription stats:', error);
    document.getElementById('activeSubscriptions').textContent = 'Error';
    document.getElementById('monthlyRevenue').textContent = 'Error';
  }
}

// Load Invoice Statistics
async function loadInvoiceStats() {
  try {
    const response = await fetch(`${API_BASE}/invoices/stats/all`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch invoice stats');

    const data = await response.json();
    const stats = data.data;

    // Count open invoices
    const openInvoices = stats.find(s => s.status === 'open');
    const openCount = openInvoices ? parseInt(openInvoices.count) : 0;

    document.getElementById('pendingInvoices').textContent = openCount.toLocaleString();

    dashboardData.invoices = { openCount, stats };
  } catch (error) {
    console.error('Error loading invoice stats:', error);
    document.getElementById('pendingInvoices').textContent = 'Error';
  }
}

// Load Chargeback Statistics
async function loadChargebackStats() {
  try {
    const response = await fetch(`${API_BASE}/chargebacks/stats/summary`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch chargeback stats');

    const data = await response.json();
    const summary = data.data.summary;

    const activeCount = summary.pending || 0;

    document.getElementById('activeChargebacks').textContent = activeCount.toLocaleString();

    dashboardData.chargebacks = summary;
  } catch (error) {
    console.error('Error loading chargeback stats:', error);
    document.getElementById('activeChargebacks').textContent = 'Error';
  }
}

// Load Recent Subscriptions
async function loadRecentSubscriptions() {
  try {
    const response = await fetch(`${API_BASE}/subscriptions?limit=5`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch recent subscriptions');

    const data = await response.json();
    const subscriptions = data.data;

    const container = document.getElementById('recentSubscriptions');

    if (!subscriptions || subscriptions.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>No subscriptions yet</p></div>';
      return;
    }

    let html = '<div class="list-group list-group-flush">';

    subscriptions.forEach(sub => {
      const statusBadge = getStatusBadge(sub.status);
      const customerName = sub.customer ? (sub.customer.name || `${sub.customer.firstName} ${sub.customer.lastName}`) : 'Unknown';

      html += `
        <a href="/admin/subscriptions/${sub.id}" class="list-group-item list-group-item-action">
          <div class="d-flex w-100 justify-content-between">
            <h6 class="mb-1">${customerName}</h6>
            ${statusBadge}
          </div>
          <p class="mb-1 text-muted small">
            ${formatCurrency(sub.amount)} / ${sub.billingCycle}
          </p>
          <small class="text-muted">${formatDate(sub.createdAt)}</small>
        </a>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  } catch (error) {
    console.error('Error loading recent subscriptions:', error);
    document.getElementById('recentSubscriptions').innerHTML = '<div class="alert alert-danger">Failed to load subscriptions</div>';
  }
}

// Load Recent Invoices
async function loadRecentInvoices() {
  try {
    const response = await fetch(`${API_BASE}/invoices?limit=5`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch recent invoices');

    const data = await response.json();
    const invoices = data.data;

    const container = document.getElementById('recentInvoices');

    if (!invoices || invoices.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>No invoices yet</p></div>';
      return;
    }

    let html = '<div class="list-group list-group-flush">';

    invoices.forEach(invoice => {
      const statusBadge = getStatusBadge(invoice.status);
      const customerName = invoice.customer ? (invoice.customer.name || `${invoice.customer.firstName} ${invoice.customer.lastName}`) : 'Unknown';

      html += `
        <a href="/admin/invoices/${invoice.id}" class="list-group-item list-group-item-action">
          <div class="d-flex w-100 justify-content-between">
            <h6 class="mb-1">${invoice.invoiceNumber}</h6>
            ${statusBadge}
          </div>
          <p class="mb-1 text-muted small">
            ${customerName} - ${formatCurrency(invoice.total, invoice.currency)}
          </p>
          <small class="text-muted">Due: ${formatDate(invoice.dueDate)}</small>
        </a>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  } catch (error) {
    console.error('Error loading recent invoices:', error);
    document.getElementById('recentInvoices').innerHTML = '<div class="alert alert-danger">Failed to load invoices</div>';
  }
}

// Load Chargebacks Needing Attention
async function loadChargebacksNeedingAttention() {
  try {
    const response = await fetch(`${API_BASE}/chargebacks/attention/needed`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch chargebacks');

    const data = await response.json();
    const chargebacks = data.data;

    const container = document.getElementById('chargebacksNeedingAttention');
    const alertsContainer = document.getElementById('alertsContainer');

    if (!chargebacks || chargebacks.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="bi bi-check-circle"></i><p class="text-success">No chargebacks needing attention</p></div>';
      alertsContainer.innerHTML = '';
      return;
    }

    // Show alert banner
    const urgentCount = chargebacks.filter(cb => {
      const daysLeft = Math.ceil((new Date(cb.respondByDate) - new Date()) / (1000 * 60 * 60 * 24));
      return daysLeft <= 2;
    }).length;

    if (urgentCount > 0) {
      alertsContainer.innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          <strong>Urgent!</strong> ${urgentCount} chargeback${urgentCount > 1 ? 's' : ''} require${urgentCount === 1 ? 's' : ''} immediate attention.
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
      `;
    }

    // Show table
    let html = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Respond By</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
    `;

    chargebacks.forEach(cb => {
      const customerName = cb.customer ? (cb.customer.name || `${cb.customer.firstName} ${cb.customer.lastName}`) : 'Unknown';
      const deadlineBadge = getDeadlineBadge(cb.respondByDate);
      const statusBadge = getStatusBadge(cb.status);

      html += `
        <tr onclick="window.location.href='/admin/chargebacks/${cb.id}'">
          <td><code>${cb.id.substring(0, 8)}</code></td>
          <td>${customerName}</td>
          <td>${formatCurrency(cb.amount, cb.currency)}</td>
          <td><span class="badge bg-secondary">${cb.reason.replace(/_/g, ' ')}</span></td>
          <td>${statusBadge}</td>
          <td>${deadlineBadge}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); submitEvidence('${cb.id}')">
              Submit Evidence
            </button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  } catch (error) {
    console.error('Error loading chargebacks:', error);
    document.getElementById('chargebacksNeedingAttention').innerHTML = '<div class="alert alert-danger">Failed to load chargebacks</div>';
  }
}

// Helper Functions

function getAuthHeaders() {
  // TODO: Implement actual CA token authentication
  return {
    'Content-Type': 'application/json',
    // 'Authorization': `Bearer ${getCAToken()}`
  };
}

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getStatusBadge(status) {
  const badges = {
    active: '<span class="badge badge-status badge-active">Active</span>',
    trialing: '<span class="badge badge-status badge-trialing">Trialing</span>',
    past_due: '<span class="badge badge-status badge-past_due">Past Due</span>',
    canceled: '<span class="badge badge-status badge-canceled">Canceled</span>',
    open: '<span class="badge badge-status badge-open">Open</span>',
    paid: '<span class="badge badge-status badge-paid">Paid</span>',
    void: '<span class="badge badge-status badge-void">Void</span>',
    draft: '<span class="badge badge-status bg-secondary">Draft</span>',
    won: '<span class="badge badge-status badge-won">Won</span>',
    lost: '<span class="badge badge-status badge-lost">Lost</span>',
    needs_response: '<span class="badge badge-status badge-needs_response">Needs Response</span>',
    warning_needs_response: '<span class="badge badge-status badge-needs_response">Warning - Respond</span>',
    under_review: '<span class="badge badge-status bg-info">Under Review</span>'
  };

  return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
}

function getDeadlineBadge(respondByDate) {
  if (!respondByDate) return '<span class="badge bg-secondary">N/A</span>';

  const now = new Date();
  const deadline = new Date(respondByDate);
  const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

  let badgeClass = 'deadline-normal';
  let text = `${daysLeft} days`;

  if (daysLeft <= 0) {
    badgeClass = 'deadline-urgent';
    text = 'OVERDUE';
  } else if (daysLeft <= 2) {
    badgeClass = 'deadline-urgent';
    text = `${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  } else if (daysLeft <= 7) {
    badgeClass = 'deadline-soon';
  }

  return `<span class="badge deadline-badge ${badgeClass}">${text}</span>`;
}

function showError(message) {
  const alertsContainer = document.getElementById('alertsContainer');
  alertsContainer.innerHTML = `
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
      <i class="bi bi-exclamation-circle me-2"></i>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
}

function refreshDashboard() {
  loadDashboard();

  // Show temporary success message
  const alertsContainer = document.getElementById('alertsContainer');
  const existingAlerts = alertsContainer.innerHTML;

  alertsContainer.innerHTML = `
    <div class="alert alert-success alert-dismissible fade show" role="alert">
      <i class="bi bi-check-circle me-2"></i>
      Dashboard refreshed
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  ` + existingAlerts;

  // Auto-dismiss after 2 seconds
  setTimeout(() => {
    const alert = alertsContainer.querySelector('.alert-success');
    if (alert) {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }
  }, 2000);
}

function submitEvidence(chargebackId) {
  // TODO: Implement evidence submission modal/form
  alert(`Submit evidence for chargeback ${chargebackId}\nThis feature is coming soon.`);
}
