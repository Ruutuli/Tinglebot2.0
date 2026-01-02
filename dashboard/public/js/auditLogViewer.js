// ============================================================================
// ------------------- Audit Log Viewer -------------------
// File: auditLogViewer.js
// Purpose: Display audit logs showing all database changes and admin actions
// ============================================================================

// ============================================================================
// ------------------- State Management -------------------
// ============================================================================

let auditLogCurrentPage = 1;
let auditLogCurrentLimit = 50;
let auditLogFilters = {
  modelName: '',
  action: '',
  adminUsername: '',
  startDate: '',
  endDate: ''
};

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================

document.addEventListener('DOMContentLoaded', initAuditLogViewer);

function initAuditLogViewer() {
  const auditLogBtn = document.getElementById('audit-log-btn');
  const backBtn = document.getElementById('back-to-admin-from-audit-btn');
  const applyFiltersBtn = document.getElementById('audit-apply-filters-btn');
  const clearFiltersBtn = document.getElementById('audit-clear-filters-btn');
  const prevPageBtn = document.getElementById('audit-prev-page-btn');
  const nextPageBtn = document.getElementById('audit-next-page-btn');

  if (auditLogBtn) {
    auditLogBtn.addEventListener('click', openAuditLogViewer);
  }

  if (backBtn) {
    backBtn.addEventListener('click', closeAuditLogViewer);
  }

  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', applyAuditFilters);
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', clearAuditFilters);
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => changeAuditPage(auditLogCurrentPage - 1));
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => changeAuditPage(auditLogCurrentPage + 1));
  }

  // Load available models for filter
  loadAuditLogModels();
}

// ============================================================================
// ------------------- Navigation -------------------
// ============================================================================

async function openAuditLogViewer() {
  const adminToolsGrid = document.querySelector('.admin-tools-grid');
  if (adminToolsGrid) adminToolsGrid.style.display = 'none';

  const auditLogSection = document.getElementById('audit-log-section');
  if (auditLogSection) auditLogSection.style.display = 'block';

  await loadAuditLogs();
}

function closeAuditLogViewer() {
  const adminToolsGrid = document.querySelector('.admin-tools-grid');
  if (adminToolsGrid) adminToolsGrid.style.display = 'grid';

  const auditLogSection = document.getElementById('audit-log-section');
  if (auditLogSection) auditLogSection.style.display = 'none';
}

// ============================================================================
// ------------------- Fetch Helpers -------------------
// ============================================================================

async function fetchAPI(url, options = {}) {
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  return fetch(url, { ...defaultOptions, ...options });
}

// ============================================================================
// ------------------- Load Models for Filter -------------------
// ============================================================================

async function loadAuditLogModels() {
  try {
    const response = await fetchAPI('/api/admin/db/models', { method: 'GET' });
    if (!response.ok) throw new Error('Failed to load models');

    const data = await response.json();
    const modelSelect = document.getElementById('audit-filter-model');

    if (modelSelect) {
      data.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('[auditLogViewer.js]: ❌ Error loading models:', error);
  }
}

// ============================================================================
// ------------------- Load Audit Logs -------------------
// ============================================================================

async function loadAuditLogs() {
  try {
    const params = new URLSearchParams({
      page: auditLogCurrentPage.toString(),
      limit: auditLogCurrentLimit.toString()
    });

    // Add filters
    if (auditLogFilters.modelName) params.append('modelName', auditLogFilters.modelName);
    if (auditLogFilters.action) params.append('action', auditLogFilters.action);
    if (auditLogFilters.adminUsername) params.append('adminUsername', auditLogFilters.adminUsername);
    if (auditLogFilters.startDate) params.append('startDate', auditLogFilters.startDate);
    if (auditLogFilters.endDate) params.append('endDate', auditLogFilters.endDate);

    const response = await fetchAPI(`/api/admin/db/audit-logs?${params}`, { method: 'GET' });

    if (!response.ok) throw new Error('Failed to load audit logs');

    const data = await response.json();
    renderAuditLogTable(data.logs);
    updateAuditPagination(data.pagination);
  } catch (error) {
    console.error('[auditLogViewer.js]: ❌ Error loading audit logs:', error);
    showNotification('Failed to load audit logs', 'error');
  }
}

// ============================================================================
// ------------------- Render Table -------------------
// ============================================================================

function renderAuditLogTable(logs) {
  const tbody = document.getElementById('audit-log-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: rgba(203, 182, 135, 0.6);">
          No audit logs found
        </td>
      </tr>
    `;
    return;
  }

  logs.forEach(log => {
    const row = createAuditLogRow(log);
    tbody.appendChild(row);
  });
}

function createAuditLogRow(log) {
  const row = document.createElement('tr');

  // Timestamp
  const timestampCell = document.createElement('td');
  const date = new Date(log.timestamp);
  timestampCell.textContent = date.toLocaleString();
  timestampCell.style.fontFamily = 'monospace';
  timestampCell.style.fontSize = '0.9rem';
  row.appendChild(timestampCell);

  // Admin
  const adminCell = document.createElement('td');
  adminCell.innerHTML = `
    <div style="font-weight: 600; color: var(--db-modal-primary-light);">${log.adminUsername}</div>
    <div style="font-size: 0.8rem; color: rgba(203, 182, 135, 0.6);">${log.adminDiscordId}</div>
  `;
  row.appendChild(adminCell);

  // Action
  const actionCell = document.createElement('td');
  const actionColors = {
    'CREATE': '#49d59c',
    'UPDATE': '#ff9800',
    'DELETE': '#dc3545'
  };
  const actionColor = actionColors[log.action] || '#cbb687';
  actionCell.innerHTML = `<span style="padding: 0.25rem 0.75rem; background: ${actionColor}20; color: ${actionColor}; border-radius: 4px; font-weight: 600; font-size: 0.85rem;">${log.action}</span>`;
  row.appendChild(actionCell);

  // Model
  const modelCell = document.createElement('td');
  modelCell.textContent = log.modelName;
  modelCell.style.fontWeight = '600';
  row.appendChild(modelCell);

  // Record
  const recordCell = document.createElement('td');
  recordCell.innerHTML = `
    <div style="font-family: monospace; font-size: 0.85rem; color: rgba(203, 182, 135, 0.8);">${log.recordId}</div>
    ${log.recordName ? `<div style="font-size: 0.9rem; color: var(--db-modal-primary-light); margin-top: 0.25rem;">${log.recordName}</div>` : ''}
  `;
  row.appendChild(recordCell);

  // Changes
  const changesCell = document.createElement('td');
  changesCell.style.maxWidth = '400px';
  changesCell.appendChild(createChangesView(log));
  row.appendChild(changesCell);

  return row;
}

function createChangesView(log) {
  const container = document.createElement('div');
  container.style.fontSize = '0.85rem';

  if (log.action === 'CREATE') {
    container.innerHTML = `
      <div style="color: #49d59c; margin-bottom: 0.5rem;">
        <i class="fas fa-plus-circle"></i> <strong>Created</strong>
      </div>
      <button class="view-changes-btn" data-log-id="${log._id}" data-action="CREATE" style="
        padding: 0.25rem 0.75rem;
        background: rgba(73, 213, 156, 0.1);
        border: 1px solid rgba(73, 213, 156, 0.3);
        border-radius: 4px;
        color: #49d59c;
        cursor: pointer;
        font-size: 0.8rem;
      ">
        View Data
      </button>
    `;
  } else if (log.action === 'UPDATE') {
    container.innerHTML = `
      <div style="color: #ff9800; margin-bottom: 0.5rem;">
        <i class="fas fa-edit"></i> <strong>Updated</strong>
      </div>
      <button class="view-changes-btn" data-log-id="${log._id}" data-action="UPDATE" style="
        padding: 0.25rem 0.75rem;
        background: rgba(255, 152, 0, 0.1);
        border: 1px solid rgba(255, 152, 0, 0.3);
        border-radius: 4px;
        color: #ff9800;
        cursor: pointer;
        font-size: 0.8rem;
      ">
        View Changes
      </button>
    `;
  } else if (log.action === 'DELETE') {
    container.innerHTML = `
      <div style="color: #dc3545; margin-bottom: 0.5rem;">
        <i class="fas fa-trash"></i> <strong>Deleted</strong>
      </div>
      <button class="view-changes-btn" data-log-id="${log._id}" data-action="DELETE" style="
        padding: 0.25rem 0.75rem;
        background: rgba(220, 53, 69, 0.1);
        border: 1px solid rgba(220, 53, 69, 0.3);
        border-radius: 4px;
        color: #dc3545;
        cursor: pointer;
        font-size: 0.8rem;
      ">
        View Data
      </button>
    `;
  }

  // Add click handler
  const viewBtn = container.querySelector('.view-changes-btn');
  if (viewBtn) {
    viewBtn.addEventListener('click', () => showChangesModal(log));
  }

  return container;
}

// ============================================================================
// ------------------- Changes Modal -------------------
// ============================================================================

function showChangesModal(log) {
  const overlay = document.createElement('div');
  overlay.className = 'changes-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20000;
    animation: fadeIn 0.2s ease-in-out;
  `;

  const modal = document.createElement('div');
  modal.className = 'changes-modal';
  modal.style.cssText = `
    background: linear-gradient(135deg, #2a1810 0%, #1a1410 100%);
    border: 2px solid var(--db-modal-primary);
    border-radius: 12px;
    padding: 30px;
    max-width: 900px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: var(--db-modal-shadow);
    position: relative;
  `;

  // Function to close the modal
  const closeModal = () => {
    overlay.style.animation = 'fadeOut 0.2s ease-in-out';
    setTimeout(() => overlay.remove(), 200);
  };

  // Close on overlay click (outside modal)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  let content = '';

  if (log.action === 'CREATE') {
    content = `
      <h2 style="color: var(--db-modal-primary); margin-bottom: 1rem;">Created Record</h2>
      <pre style="background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; overflow-x: auto; color: #cbb687; font-size: 0.85rem; line-height: 1.5;">${JSON.stringify(log.changes, null, 2)}</pre>
    `;
  } else if (log.action === 'UPDATE') {
    const before = log.changes?.before || {};
    const after = log.changes?.after || {};
    const changedFields = getChangedFields(before, after);

    content = `
      <h2 style="color: var(--db-modal-primary); margin-bottom: 1rem;">Record Changes</h2>
      <div style="margin-bottom: 1.5rem;">
        <h3 style="color: #ff9800; margin-bottom: 0.5rem; font-size: 1rem;">Changed Fields (${changedFields.length}):</h3>
        ${changedFields.map(field => `
          <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(255, 152, 0, 0.1); border-radius: 8px; border-left: 3px solid #ff9800;">
            <strong style="color: #ff9800;">${field.name}:</strong>
            <div style="margin-top: 0.5rem;">
              <div style="color: #ff6b6b;"><strong>Before:</strong> <span style="font-family: monospace; font-size: 0.85rem;">${formatValue(field.before)}</span></div>
              <div style="color: #4ecdc4; margin-top: 0.25rem;"><strong>After:</strong> <span style="font-family: monospace; font-size: 0.85rem;">${formatValue(field.after)}</span></div>
            </div>
          </div>
        `).join('')}
      </div>
      <details style="margin-top: 1rem;">
        <summary style="color: var(--db-modal-primary-light); cursor: pointer; margin-bottom: 0.5rem;">View Full Before/After</summary>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
          <div>
            <h4 style="color: #ff6b6b; margin-bottom: 0.5rem;">Before</h4>
            <pre style="background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; overflow-x: auto; color: #cbb687; font-size: 0.8rem; max-height: 400px; overflow-y: auto;">${JSON.stringify(before, null, 2)}</pre>
          </div>
          <div>
            <h4 style="color: #4ecdc4; margin-bottom: 0.5rem;">After</h4>
            <pre style="background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; overflow-x: auto; color: #cbb687; font-size: 0.8rem; max-height: 400px; overflow-y: auto;">${JSON.stringify(after, null, 2)}</pre>
          </div>
        </div>
      </details>
    `;
  } else if (log.action === 'DELETE') {
    content = `
      <h2 style="color: var(--db-modal-primary); margin-bottom: 1rem;">Deleted Record</h2>
      <pre style="background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; overflow-x: auto; color: #cbb687; font-size: 0.85rem; line-height: 1.5;">${JSON.stringify(log.changes, null, 2)}</pre>
    `;
  }

  modal.innerHTML = `
    <button class="close-changes-modal-x" style="
      position: absolute;
      top: 15px;
      right: 15px;
      background: transparent;
      border: 2px solid rgba(203, 182, 135, 0.3);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      color: var(--db-modal-primary);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      padding: 0;
    " title="Close (Esc)" aria-label="Close">×</button>
    ${content}
    <div style="margin-top: 1.5rem; text-align: right;">
      <button class="close-changes-modal-btn" style="
        padding: 0.75rem 1.5rem;
        background: linear-gradient(135deg, rgba(203, 182, 135, 0.12) 0%, rgba(203, 182, 135, 0.06) 100%);
        border: 2px solid rgba(203, 182, 135, 0.4);
        border-radius: 8px;
        color: var(--db-modal-primary);
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s ease;
      ">Close</button>
    </div>
  `;

  // Add hover effects and click handlers
  const closeBtn = modal.querySelector('.close-changes-modal-btn');
  const closeXBtn = modal.querySelector('.close-changes-modal-x');
  
  closeBtn.addEventListener('click', closeModal);
  closeXBtn.addEventListener('click', closeModal);
  
  // Hover effects for close button
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'linear-gradient(135deg, rgba(203, 182, 135, 0.2) 0%, rgba(203, 182, 135, 0.1) 100%)';
    closeBtn.style.borderColor = 'rgba(203, 182, 135, 0.6)';
    closeBtn.style.transform = 'translateY(-1px)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'linear-gradient(135deg, rgba(203, 182, 135, 0.12) 0%, rgba(203, 182, 135, 0.06) 100%)';
    closeBtn.style.borderColor = 'rgba(203, 182, 135, 0.4)';
    closeBtn.style.transform = 'translateY(0)';
  });
  
  // Hover effects for X button
  closeXBtn.addEventListener('mouseenter', () => {
    closeXBtn.style.background = 'rgba(203, 182, 135, 0.1)';
    closeXBtn.style.borderColor = 'rgba(203, 182, 135, 0.5)';
    closeXBtn.style.transform = 'scale(1.1)';
  });
  closeXBtn.addEventListener('mouseleave', () => {
    closeXBtn.style.background = 'transparent';
    closeXBtn.style.borderColor = 'rgba(203, 182, 135, 0.3)';
    closeXBtn.style.transform = 'scale(1)';
  });

  // Prevent modal clicks from closing the overlay
  modal.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function getChangedFields(before, after) {
  const changed = [];
  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const ignoreFields = ['__v', '_id'];

  for (const key of allKeys) {
    if (ignoreFields.includes(key)) continue;

    const beforeVal = before[key];
    const afterVal = after[key];

    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changed.push({
        name: key,
        before: beforeVal,
        after: afterVal
      });
    }
  }

  return changed;
}

function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > 100 ? str.substring(0, 100) + '...' : str;
  }
  return String(value);
}

// ============================================================================
// ------------------- Filters -------------------
// ============================================================================

function applyAuditFilters() {
  auditLogFilters.modelName = document.getElementById('audit-filter-model')?.value || '';
  auditLogFilters.action = document.getElementById('audit-filter-action')?.value || '';
  auditLogFilters.adminUsername = document.getElementById('audit-filter-admin')?.value || '';
  auditLogFilters.startDate = document.getElementById('audit-filter-start-date')?.value || '';
  auditLogFilters.endDate = document.getElementById('audit-filter-end-date')?.value || '';

  auditLogCurrentPage = 1;
  loadAuditLogs();
}

function clearAuditFilters() {
  auditLogFilters = {
    modelName: '',
    action: '',
    adminUsername: '',
    startDate: '',
    endDate: ''
  };

  document.getElementById('audit-filter-model').value = '';
  document.getElementById('audit-filter-action').value = '';
  document.getElementById('audit-filter-admin').value = '';
  document.getElementById('audit-filter-start-date').value = '';
  document.getElementById('audit-filter-end-date').value = '';

  auditLogCurrentPage = 1;
  loadAuditLogs();
}

// ============================================================================
// ------------------- Pagination -------------------
// ============================================================================

function changeAuditPage(page) {
  if (page < 1) return;
  auditLogCurrentPage = page;
  loadAuditLogs();
}

function updateAuditPagination(pagination) {
  const info = document.getElementById('audit-pagination-info');
  const prevBtn = document.getElementById('audit-prev-page-btn');
  const nextBtn = document.getElementById('audit-next-page-btn');

  if (info) {
    info.textContent = `Page ${pagination.page} of ${pagination.pages} (${pagination.total} total)`;
  }

  if (prevBtn) {
    prevBtn.disabled = pagination.page <= 1;
    prevBtn.style.opacity = pagination.page <= 1 ? '0.5' : '1';
    prevBtn.style.cursor = pagination.page <= 1 ? 'not-allowed' : 'pointer';
  }

  if (nextBtn) {
    nextBtn.disabled = pagination.page >= pagination.pages;
    nextBtn.style.opacity = pagination.page >= pagination.pages ? '0.5' : '1';
    nextBtn.style.cursor = pagination.page >= pagination.pages ? 'not-allowed' : 'pointer';
  }
}

// ============================================================================
// ------------------- Notification Helper -------------------
// ============================================================================

function showNotification(message, type = 'info') {
  // Use the same notification system as databaseEditor if available
  // Check if window.showNotification exists and is a different function (avoid infinite loop)
  if (window.showNotification && window.showNotification !== showNotification) {
    window.showNotification(message, type);
  } else {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

