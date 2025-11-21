// ============================================================================
// ------------------- Database Editor -------------------
// File: databaseEditor.js
// Purpose: Admin interface for viewing, editing, creating, and deleting
//          database records across all models. Provides a full-featured
//          GUI for database management with validation and type safety.
// ============================================================================

// ------------------- Import Helpers -------------------
// Temporarily commented out until databaseEditorHelpers.js is created
// import {
//   MODEL_STRUCTURES,
//   FIELD_DESCRIPTIONS,
//   FIELD_DISPLAY_NAMES,
//   shouldUseAutocomplete,
//   shouldUseMultiSelect,
//   getContributesToInfo,
//   getFieldGuidance,
//   getFieldDisplayName,
//   getFieldDescription
// } from './databaseEditorHelpers.js';

// ============================================================================
// ------------------- State Management -------------------
// ============================================================================

let currentModel = null;
let currentPage = 1;
let currentLimit = 50;
let currentSearch = '';
let currentSchema = null;
let editingRecordId = null;
let allRecords = [];

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================

document.addEventListener('DOMContentLoaded', initDatabaseEditor);

// ------------------- initDatabaseEditor -------------------
// Set up event listeners and initialize the database editor UI
//
function initDatabaseEditor() {
  
  const databaseEditorBtn = document.getElementById('database-editor-btn');
  const backToAdminBtn = document.getElementById('back-to-admin-btn');
  const modelSelector = document.getElementById('model-selector');
  const searchBtn = document.getElementById('db-search-btn');
  const searchInput = document.getElementById('db-search-input');
  const createRecordBtn = document.getElementById('create-record-btn');
  const prevPageBtn = document.getElementById('prev-page-btn');
  const nextPageBtn = document.getElementById('next-page-btn');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalSaveBtn = document.getElementById('modal-save-btn');
  const modalDeleteBtn = document.getElementById('modal-delete-btn');
  
  if (databaseEditorBtn) {
    databaseEditorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openDatabaseEditor();
    });
  } else {
    console.error('[databaseEditor.js]: ❌ Database editor button not found!');
  }
  
  if (backToAdminBtn) backToAdminBtn.addEventListener('click', closeDatabaseEditor);
  if (modelSelector) modelSelector.addEventListener('change', handleModelChange);
  if (searchBtn) searchBtn.addEventListener('click', handleSearch);
  if (createRecordBtn) createRecordBtn.addEventListener('click', openCreateModal);
  if (prevPageBtn) prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
  if (nextPageBtn) nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', dbEditorCloseModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', dbEditorCloseModal);
  if (modalSaveBtn) modalSaveBtn.addEventListener('click', handleSaveRecord);
  if (modalDeleteBtn) modalDeleteBtn.addEventListener('click', handleDeleteRecord);
  
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSearch();
    });
  }
  
  const modal = document.getElementById('record-edit-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        dbEditorCloseModal();
      }
    });
  }
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('record-edit-modal');
      if (modal && modal.classList.contains('show')) {
        dbEditorCloseModal();
      }
    }
  });
  
  
  // Make openDatabaseEditor globally accessible for URL routing
  window.openDatabaseEditor = openDatabaseEditor;
}

// ============================================================================
// ------------------- Navigation -------------------
// ============================================================================

// ------------------- openDatabaseEditor -------------------
// Show database editor UI and load available models
//
async function openDatabaseEditor() {
  
  const adminToolsGrid = document.querySelector('.admin-tools-grid');
  if (adminToolsGrid) adminToolsGrid.style.display = 'none';
  
  const editorSection = document.getElementById('database-editor-section');
  if (editorSection) editorSection.style.display = 'block';
  
  // Update URL to reflect database editor state
  const newUrl = '#admin-area-section/database-editor';
  window.history.pushState({ 
    section: 'admin-area-section', 
    subSection: 'database-editor' 
  }, '', newUrl);
  
  await loadModels();
}

// ------------------- closeDatabaseEditor -------------------
// Hide database editor UI and return to admin tools
//
function closeDatabaseEditor() {
  
  const adminToolsGrid = document.querySelector('.admin-tools-grid');
  if (adminToolsGrid) adminToolsGrid.style.display = 'grid';
  
  const editorSection = document.getElementById('database-editor-section');
  if (editorSection) editorSection.style.display = 'none';
  
  // Update URL back to admin area section
  const newUrl = '#admin-area-section';
  window.history.pushState({ 
    section: 'admin-area-section' 
  }, '', newUrl);
  
  currentModel = null;
  currentPage = 1;
  currentSearch = '';
  currentSchema = null;
}

// ============================================================================
// ------------------- Fetch Helpers -------------------
// ============================================================================

// ------------------- fetchAPI -------------------
// Make authenticated API calls with consistent credentials and headers
//
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
// ------------------- Models Loading -------------------
// ============================================================================

// ------------------- loadModels -------------------
// Fetch and populate model selector dropdown
//
async function loadModels() {
  
  try {
    const response = await fetchAPI('/api/admin/db/models', { method: 'GET' });
    
    if (!response.ok) throw new Error('Failed to load models');
    
    const data = await response.json();
    const modelSelector = document.getElementById('model-selector');
    
    modelSelector.innerHTML = '<option value="">-- Choose a model --</option>';
    
    data.models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelector.appendChild(option);
    });
    
  } catch (error) {
    console.error('[databaseEditor.js]: ❌ Error loading models:', error);
    showNotification('Failed to load models', 'error');
  }
}

// ============================================================================
// ------------------- Model Selection & Data Loading -------------------
// ============================================================================

// ------------------- handleModelChange -------------------
// Load schema and records when model selection changes
//
async function handleModelChange(event) {
  const modelName = event.target.value;
  
  if (!modelName) {
    setElementDisplay('records-container', 'none');
    setElementDisplay('empty-state', 'block');
    setElementDisplay('create-record-btn', 'none');
    currentModel = null;
    return;
  }
  
  
  currentModel = modelName;
  currentPage = 1;
  currentSearch = '';
  document.getElementById('db-search-input').value = '';
  
  setElementDisplay('create-record-btn', 'inline-flex');
  
  await Promise.all([
    loadSchema(modelName),
    loadRecords(modelName)
  ]);
}

// ------------------- loadSchema -------------------
// Fetch schema definition for the selected model
//
async function loadSchema(modelName) {
  try {
    const response = await fetchAPI(`/api/admin/db/schema/${modelName}`, { method: 'GET' });
    
    if (!response.ok) throw new Error('Failed to load schema');
    
    const data = await response.json();
    currentSchema = data.fields;
    
  } catch (error) {
    console.error('[databaseEditor.js]: ❌ Error loading schema:', error);
    showNotification('Failed to load schema', 'error');
  }
}

// ------------------- loadRecords -------------------
// Fetch records for the selected model with pagination and search
//
async function loadRecords(modelName, page = 1, search = '') {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: currentLimit.toString(),
      search: search
    });
    
    const response = await fetchAPI(`/api/admin/db/${modelName}?${params}`, { method: 'GET' });
    
    if (!response.ok) throw new Error('Failed to load records');
    
    const data = await response.json();
    allRecords = data.records;
    
    renderRecordsTable(data.records);
    updatePagination(data.pagination);
    
    setElementDisplay('records-container', 'block');
    setElementDisplay('empty-state', 'none');
    
  } catch (error) {
    console.error('[databaseEditor.js]: ❌ Error loading records:', error);
    showNotification('Failed to load records', 'error');
  }
}

// ============================================================================
// ------------------- Table Rendering -------------------
// ============================================================================

// ------------------- renderRecordsTable -------------------
// Build and display the records data table
//
function renderRecordsTable(records) {
  const thead = document.getElementById('records-table-head');
  const tbody = document.getElementById('records-table-body');
  
  thead.innerHTML = '';
  tbody.innerHTML = '';
  
  if (records.length === 0) {
    tbody.innerHTML = createEmptyStateRow();
    return;
  }
  
  const displayFields = getDisplayFields(records[0]);
  thead.appendChild(createHeaderRow(displayFields));
  
  records.forEach((record, index) => {
    tbody.appendChild(createDataRow(record, displayFields, index));
  });
}

// ------------------- getDisplayFields -------------------
// Determine which fields to display in table (prioritized + up to 8 total)
//
function getDisplayFields(record) {
  const priorityFields = ['name', 'title', 'characterName', 'itemName', 'username', 'discordId'];
  const allFields = Object.keys(record).filter(field => field !== '_id');
  const displayFields = [];
  
  priorityFields.forEach(field => {
    if (allFields.includes(field)) displayFields.push(field);
  });
  
  allFields.forEach(field => {
    if (!displayFields.includes(field) && displayFields.length < 8) {
      displayFields.push(field);
    }
  });
  
  return displayFields;
}

// ------------------- createHeaderRow -------------------
// Build table header row with actions column and field columns
//
function createHeaderRow(displayFields) {
  const headerRow = document.createElement('tr');
  
  const actionsHeader = document.createElement('th');
  actionsHeader.textContent = 'Actions';
  actionsHeader.style.width = '80px';
  headerRow.appendChild(actionsHeader);
  
  displayFields.forEach(field => {
    const th = document.createElement('th');
    th.textContent = getFieldDisplayName(field);
    headerRow.appendChild(th);
  });
  
  return headerRow;
}

// ------------------- createDataRow -------------------
// Build table data row with edit button and field values
//
function createDataRow(record, displayFields, index) {
  const row = document.createElement('tr');
  row.setAttribute('data-record-id', record._id);
  
  if (index % 2 === 0) row.classList.add('even-row');
  
  row.appendChild(createActionsCell(record));
  
  displayFields.forEach(field => {
    row.appendChild(createDataCell(field, record[field]));
  });
  
  return row;
}

// ------------------- createActionsCell -------------------
// Build actions cell with edit button
//
function createActionsCell(record) {
  const td = document.createElement('td');
  td.style.whiteSpace = 'nowrap';
  
  const editBtn = document.createElement('button');
  editBtn.className = 'action-btn edit-btn';
  editBtn.innerHTML = '<i class="fas fa-edit"></i>';
  editBtn.title = `Edit ${record.name || record.title || record.itemName || 'record'}`;
  editBtn.onclick = () => openEditModal(record._id);
  
  td.appendChild(editBtn);
  return td;
}

// ------------------- createDataCell -------------------
// Build data cell with formatted value based on type
//
function createDataCell(field, value) {
  const td = document.createElement('td');
  td.setAttribute('data-field', field);
  
  if (typeof value === 'number') {
    td.setAttribute('data-type', 'number');
  } else if (typeof value === 'boolean') {
    td.setAttribute('data-type', 'boolean');
  }
  
  td.innerHTML = formatCellValue(value);
  return td;
}

// ------------------- formatCellValue -------------------
// Format value for display in table cell based on type
//
function formatCellValue(value) {
  if (value === null || value === undefined) {
    return '<span style="color: rgba(203, 182, 135, 0.4); font-style: italic;">—</span>';
  }
  
  if (typeof value === 'object') {
    const jsonStr = JSON.stringify(value);
    const displayStr = jsonStr.length > 40 ? jsonStr.substring(0, 40) + '...' : jsonStr;
    return `<span style="font-family: 'Courier New', monospace; font-size: 0.85rem; color: rgba(203, 182, 135, 0.8);">${displayStr}</span>`;
  }
  
  if (typeof value === 'boolean') {
    const color = value ? '#49D59C' : '#dc3545';
    const icon = value ? '✓' : '✗';
    return `<span style="color: ${color}; font-weight: bold; font-size: 1.1rem;">${icon}</span>`;
  }
  
  if (typeof value === 'number') {
    return `<span style="font-variant-numeric: tabular-nums; color: #cbb687; font-weight: 600;">${value.toLocaleString()}</span>`;
  }
  
  const stringValue = String(value);
  const displayStr = stringValue.length > 50 ? stringValue.substring(0, 50) + '...' : stringValue;
  const title = stringValue.length > 50 ? stringValue : '';
  return `<span title="${title}">${displayStr}</span>`;
}

// ------------------- createEmptyStateRow -------------------
// Create empty state message for table with no records
//
function createEmptyStateRow() {
  return `
    <tr>
      <td colspan="100%" style="text-align: center; padding: 3rem; color: var(--text-secondary); font-style: italic;">
        <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5; display: block;"></i>
        No records found
      </td>
    </tr>
  `;
}

// ============================================================================
// ------------------- Pagination -------------------
// ============================================================================

// ------------------- updatePagination -------------------
// Update pagination UI with current page info and button states
//
function updatePagination(pagination) {
  const paginationInfo = document.getElementById('pagination-info');
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');
  
  paginationInfo.textContent = `Page ${pagination.page} of ${pagination.pages} (${pagination.total} records)`;
  
  prevBtn.disabled = pagination.page <= 1;
  nextBtn.disabled = pagination.page >= pagination.pages;
  
  currentPage = pagination.page;
}

// ------------------- changePage -------------------
// Navigate to a different page
//
function changePage(newPage) {
  if (newPage < 1 || !currentModel) return;
  
  currentPage = newPage;
  loadRecords(currentModel, currentPage, currentSearch);
}

// ============================================================================
// ------------------- Search -------------------
// ============================================================================

// ------------------- handleSearch -------------------
// Execute search query and reload records
//
function handleSearch() {
  const searchInput = document.getElementById('db-search-input');
  currentSearch = searchInput.value.trim();
  currentPage = 1;
  
  if (currentModel) {
    loadRecords(currentModel, currentPage, currentSearch);
  }
}

// ============================================================================
// ------------------- Modal Management -------------------
// ============================================================================

// ------------------- showLoadingModal -------------------
// Show loading overlay while form is being generated
//
function showLoadingModal() {
  // Remove any existing loading modal first
  const existingLoader = document.getElementById('db-editor-loading-modal');
  if (existingLoader) {
    existingLoader.remove();
  }
  
  const loadingModal = document.createElement('div');
  loadingModal.id = 'db-editor-loading-modal';
  loadingModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    backdrop-filter: blur(4px);
  `;
  
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 60px;
    height: 60px;
    border: 6px solid rgba(203, 182, 135, 0.3);
    border-top-color: #49D59C;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;
  
  const loadingText = document.createElement('div');
  loadingText.textContent = 'Loading record...';
  loadingText.style.cssText = `
    margin-top: 20px;
    color: #cbb687;
    font-size: 1.2rem;
    font-weight: 600;
  `;
  
  const subText = document.createElement('div');
  subText.textContent = 'This may take a moment for large records';
  subText.style.cssText = `
    margin-top: 8px;
    color: rgba(203, 182, 135, 0.7);
    font-size: 0.9rem;
  `;
  
  loadingModal.appendChild(spinner);
  loadingModal.appendChild(loadingText);
  loadingModal.appendChild(subText);
  
  // Add CSS animation for spinner
  if (!document.getElementById('db-loader-styles')) {
    const style = document.createElement('style');
    style.id = 'db-loader-styles';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(loadingModal);
}

// ------------------- hideLoadingModal -------------------
// Hide loading overlay
//
function hideLoadingModal() {
  const loadingModal = document.getElementById('db-editor-loading-modal');
  if (loadingModal) {
    loadingModal.remove();
  }
}

// ------------------- openEditModal -------------------
// Open modal to edit an existing record
//
async function openEditModal(recordId) {
  
  // Show loading modal
  showLoadingModal();
  
  try {
    const response = await fetchAPI(`/api/admin/db/${currentModel}/${recordId}`, { method: 'GET' });
    
    if (!response.ok) throw new Error('Failed to fetch record');
    
    const data = await response.json();
    const record = data.record;
    
    editingRecordId = recordId;
    
    // For Inventory, show character name and inventory
    let recordName = record.name || record.title || record.itemName || record.species || 'Record';
    if (currentModel === 'Inventory' && record.characterName) {
      recordName = `${record.characterName}'s Inventory`;
      // Hide delete button for inventory (we delete individual items, not the whole inventory)
      document.getElementById('modal-delete-btn').style.display = 'none';
    } else {
      document.getElementById('modal-delete-btn').style.display = 'inline-flex';
    }
    
    document.getElementById('modal-title').textContent = `Edit ${currentModel}: ${recordName}`;
    
    await generateForm(record);
    
    // Hide loading modal before showing the form
    hideLoadingModal();
    
    const modal = document.getElementById('record-edit-modal');
    modal.removeAttribute('style');
    modal.classList.remove('hidden');
    modal.classList.add('show');
    
    // Scroll modal content to top
    const modalBody = document.getElementById('modal-body');
    if (modalBody) {
      modalBody.scrollTop = 0;
    }
    
  } catch (error) {
    console.error('[databaseEditor.js]: ❌ Error opening edit modal:', error);
    hideLoadingModal(); // Make sure to hide loading modal on error
    showNotification('Failed to load record', 'error');
  }
}

// ------------------- openCreateModal -------------------
// Open modal to create a new record
//
async function openCreateModal() {
  
  // Show loading modal
  showLoadingModal();
  
  try {
    editingRecordId = null;
    
    document.getElementById('modal-title').textContent = `Create ${currentModel}`;
    
    document.getElementById('modal-delete-btn').style.display = 'none';
    
    await generateForm({});
    
    // Hide loading modal before showing the form
    hideLoadingModal();
    
    const modal = document.getElementById('record-edit-modal');
    modal.removeAttribute('style');
    modal.classList.remove('hidden');
    modal.classList.add('show');
    
    // Scroll modal content to top
    const modalBody = document.getElementById('modal-body');
    if (modalBody) {
      modalBody.scrollTop = 0;
    }
    
  } catch (error) {
    console.error('[databaseEditor.js]: ❌ Error opening create modal:', error);
    hideLoadingModal(); // Make sure to hide loading modal on error
    showNotification('Failed to open create form', 'error');
  }
}

// ------------------- dbEditorCloseModal -------------------
// Hide database editor modal by managing CSS classes
//
function dbEditorCloseModal(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  
  // Make sure to hide loading modal if it's still showing
  hideLoadingModal();
  
  const modal = document.getElementById('record-edit-modal');
  
  if (modal) {
    modal.removeAttribute('style');
    modal.classList.remove('show');
    modal.classList.add('hidden');
    
  } else {
    console.error('[databaseEditor.js]: ❌ Modal element not found');
  }
  
  editingRecordId = null;
  
  // Cleanup any floating search panels
  const searchPanels = document.querySelectorAll('.item-search-panel');
  searchPanels.forEach(panel => {
    if (panel.parentNode) {
      panel.parentNode.removeChild(panel);
    }
  });
  
  const searchBackdrops = document.querySelectorAll('.item-search-backdrop');
  searchBackdrops.forEach(backdrop => {
    if (backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
  });
  
  const form = document.getElementById('record-form');
  if (form) form.reset();
}

// ============================================================================
// ------------------- Input Validation & Sanitization -------------------
// ============================================================================

// ------------------- validateAndSanitizeField -------------------
// Validate and sanitize field value based on type
//
function validateAndSanitizeField(fieldName, value, fieldType) {
  
  if (value === null || value === undefined || value === '') {
    if (fieldType === 'Boolean') return false;
    if (fieldType === 'Number') return 0;
    if (fieldType === 'Array') return [];
    if (fieldType === 'Object') return {};
    if (fieldType === 'Map') return {};
    if (fieldType === 'Mixed') return null;
    return null;
  }

  switch (fieldType) {
    case 'String':
      return sanitizeString(fieldName, value);

    case 'Number':
      return sanitizeNumber(fieldName, value);

    case 'Boolean':
      return sanitizeBoolean(fieldName, value);

    case 'Array':
      return sanitizeArray(fieldName, value);

    case 'Map':
      return sanitizeMap(fieldName, value);

    case 'Object':
    case 'Mixed':
      return sanitizeObject(fieldName, value);

    default:
      return value;
  }
}

// ------------------- sanitizeString -------------------
// Sanitize and validate string input
//
function sanitizeString(fieldName, value) {
  let sanitized = String(value).trim();
  
  sanitized = sanitized.replace(/[<>]/g, '');
  
  if (fieldName.toLowerCase().includes('name') && sanitized.length > 100) {
    showNotification(`Name field is too long (${sanitized.length}/100 characters). Please shorten it.`, 'warning');
    return sanitized.substring(0, 100);
  }
  
  return sanitized;
}

// ------------------- sanitizeNumber -------------------
// Sanitize and validate number input
//
function sanitizeNumber(fieldName, value) {
  const numValue = parseFloat(value);
  
  if (isNaN(numValue)) {
    showNotification(`"${value}" is not a valid number. Using 0 instead.`, 'warning');
    return 0;
  }
  
  const fieldNameLower = fieldName.toLowerCase();
  
  if (fieldNameLower.includes('tier') && (numValue < 0 || numValue > 20)) {
    showNotification(`Tier should be between 0-20. Current value: ${numValue}`, 'warning');
    return Math.max(0, Math.min(20, numValue));
  }
  
  if (fieldNameLower.includes('hearts') && (numValue < 0 || numValue > 100)) {
    showNotification(`Hearts should be between 0-100. Current value: ${numValue}`, 'warning');
    return Math.max(0, Math.min(100, numValue));
  }
  
  return numValue;
}

// ------------------- sanitizeBoolean -------------------
// Sanitize and validate boolean input
//
function sanitizeBoolean(fieldName, value) {
  if (typeof value === 'boolean') return value;
  
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase();
    if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') return true;
    if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') return false;
  }
  
  if (typeof value === 'number') return value !== 0;
  
  showNotification(`"${value}" is not a valid true/false value. Using false instead.`, 'warning');
  return false;
}

// ------------------- sanitizeArray -------------------
// Sanitize and validate array input
//
function sanitizeArray(fieldName, value) {
  if (Array.isArray(value)) return value;
  
  if (typeof value === 'string') {
    // First try JSON parsing
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // JSON parsing failed, try other formats
    }
    
    // Handle empty values
    if (value.trim() === '' || value.trim() === '[]') return [];
    
    // Special handling for validItems - check if it has newlines (line-separated format)
    const fieldNameLower = fieldName.toLowerCase();
    if (fieldNameLower === 'validitems' && value.includes('\n')) {
      // Split by newlines and clean up
      const items = value
        .split('\n')
        .map(item => item.trim())
        .filter(item => item.length > 0);
      
      if (items.length > 0) {
        return items;
      }
    }
    
    // Fall back to comma-separated
    const items = value.split(',').map(item => item.trim()).filter(item => item.length > 0);
    if (items.length > 0) {
      showNotification(`Converted comma-separated values to array: [${items.join(', ')}]`, 'info');
      return items;
    }
  }
  
  showNotification(`"${value}" is not a valid array format. Using empty array instead.`, 'warning');
  return [];
}

// ------------------- sanitizeObject -------------------
// Sanitize and validate object/mixed input
//
function sanitizeObject(fieldName, value) {
  if (typeof value === 'object' && value !== null) return value;
  
  if (typeof value === 'string') {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch (e) {
      // If JSON parsing fails, check if field type is Mixed - then allow raw string
      const fieldInfo = currentSchema?.[fieldName];
      if (fieldInfo?.type === 'Mixed') {
        // For Mixed type, return the raw string value
        return value;
      }
      // For Object type, show warning
      showNotification(`"${fieldName}" is not valid JSON. Using empty object instead.`, 'warning');
    }
  }
  
  return {};
}

// ------------------- sanitizeMap -------------------
// Sanitize and validate Map input (converts from JSON object)
//
function sanitizeMap(fieldName, value) {
  // If already an object (from JSON), return it
  // MongoDB will handle converting it to a Map on the server side
  if (typeof value === 'object' && value !== null) return value;
  
  // If it's a string, try to parse it as JSON
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch (e) {
      showNotification(`"${fieldName}" is not valid JSON. Using empty object instead. Error: ${e.message}`, 'warning');
      console.error(`[databaseEditor.js]: ❌ Failed to parse Map field "${fieldName}":`, e);
    }
  }
  
  return {};
}

// ------------------- validateRequiredFields -------------------
// Check that all required fields have values
//
function validateRequiredFields(formData, schema) {
  const errors = [];
  
  for (const [fieldName, fieldInfo] of Object.entries(schema)) {
    if (fieldInfo.required && (!formData[fieldName] || formData[fieldName] === '')) {
      errors.push(`${getFieldDisplayName(fieldName)} is required`);
    }
  }
  
  return errors;
}

// ------------------- sanitizeFormData -------------------
// Sanitize all fields in form data
//
function sanitizeFormData(formData, schema) {
  const sanitized = {};
  
  for (const [fieldName, fieldInfo] of Object.entries(schema)) {
    const value = formData[fieldName];
    sanitized[fieldName] = validateAndSanitizeField(fieldName, value, fieldInfo.type);
  }
  
  return sanitized;
}

// ------------------- buildLocationArray -------------------
// Build locations array from boolean location flags
//
function buildLocationArray(formData, fieldName) {
  const locationMap = {
    'eldin': 'Eldin',
    'lanayru': 'Lanayru', 
    'faron': 'Faron',
    'centralHyrule': 'Central Hyrule',
    'gerudo': 'Gerudo',
    'hebra': 'Hebra',
    'pathOfScarletLeaves': 'Path of Scarlet Leaves',
    'leafDewWay': 'Leaf Dew Way'
  };
  
  const locations = [];
  for (const [key, displayName] of Object.entries(locationMap)) {
    if (formData[key] === true || formData[key] === 'true') {
      locations.push(displayName);
    }
  }
  
  return locations;
}

// ------------------- buildJobArray -------------------
// Build jobs array from boolean job flags
//
function buildJobArray(formData, fieldName) {
  const jobMap = {
    'adventurer': 'Adventurer',
    'guard': 'Guard',
    'graveskeeper': 'Graveskeeper',
    'hunter': 'Hunter',
    'mercenary': 'Mercenary',
    'scout': 'Scout',
    'rancher': 'Rancher',
    'beekeeper': 'Beekeeper',
    'farmer': 'Farmer',
    'fisherman': 'Fisherman',
    'forager': 'Forager',
    'herbalist': 'Herbalist',
    'miner': 'Miner'
  };
  
  const jobs = [];
  for (const [key, displayName] of Object.entries(jobMap)) {
    if (formData[key] === true || formData[key] === 'true') {
      jobs.push(displayName);
    }
  }
  
  return jobs;
}

// ============================================================================
// ------------------- Model Structure & Field Ordering -------------------
// ============================================================================

// ------------------- getOrderedFieldsFromModel -------------------
// Get field order and section structure for specific model
//
function getOrderedFieldsFromModel(modelName) {
  const structure = MODEL_STRUCTURES[modelName];
  if (!structure) {
    const fields = Object.keys(currentSchema || {}).sort().map(fieldName => {
      const fieldInfo = currentSchema[fieldName];
      if (fieldInfo) {
        return { ...fieldInfo, name: fieldName };
      }
      return null;
    }).filter(Boolean);
    return [{ title: null, fields }];
  }
  
  return structure.map(section => ({
    title: section.title,
    fields: section.fields.map(fieldName => {
      const fieldInfo = currentSchema[fieldName];
      if (fieldInfo) {
        return { ...fieldInfo, name: fieldName };
      }
      return null;
    }).filter(Boolean)
  }));
}

// Model Structures - defines field organization and display order for each model
const MODEL_STRUCTURES = {
    'ApprovedSubmission': [
      {
        title: '📋 Basic Submission Info',
        fields: ['submissionId', 'title', 'fileName', 'category']
      },
      {
        title: '👤 User Information',
        fields: ['userId', 'username', 'userAvatar']
      },
      {
        title: '📁 File Information',
        fields: ['fileUrl', 'messageUrl']
      },
      {
        title: '💰 Token Information',
        fields: ['finalTokenAmount', 'tokenCalculation']
      },
      {
        title: '🎨 Art-Specific Fields',
        fields: ['baseSelections', 'baseCounts', 'typeMultiplierSelections', 'typeMultiplierCounts', 'productMultiplierValue', 'addOnsApplied', 'specialWorksApplied']
      },
      {
        title: '📝 Writing-Specific Fields',
        fields: ['wordCount', 'link', 'description']
      },
      {
        title: '🤝 Collaboration & Quest Info',
        fields: ['collab', 'blightId', 'tokenTracker', 'questEvent', 'questBonus']
      },
      {
        title: '✅ Approval Information',
        fields: ['approvedBy', 'approvedAt', 'approvalMessageId', 'pendingNotificationMessageId']
      },
      {
        title: '📅 Timestamps',
        fields: ['submittedAt', 'updatedAt', 'createdAt']
      }
    ],
    'Monster': [
      {
        title: '🐉 Basic Monster Info',
        fields: [
          'name', 'nameMapping', 'image', 'species', 'type', 'tier', 'hearts', 'dmg', 'bloodmoon'
        ]
      },
      {
        title: '📍 Location Flags',
        fields: [
          'locations', 'eldin', 'lanayru', 'faron', 'centralHyrule', 'gerudo', 'hebra', 
          'pathOfScarletLeaves', 'leafDewWay', 'exploreLocations', 'exploreEldin', 
          'exploreLanayru', 'exploreFaron'
        ]
      },
      {
        title: '💼 Jobs Associated with the Monster',
        fields: [
          'job', 'adventurer', 'guard', 'graveskeeper', 'hunter', 'mercenary', 'scout', 
          'rancher', 'beekeeper', 'farmer', 'fisherman', 'forager', 'herbalist', 'miner'
        ]
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'Character': [
      {
        title: '👤 Basic Character Information',
        fields: ['userId', 'name', 'age', 'height', 'pronouns', 'race', 'homeVillage', 'currentVillage', 'job', 'jobDateChanged', 'icon', 'birthday']
      },
      {
        title: '❤️ Health and Stamina',
        fields: ['maxHearts', 'currentHearts', 'maxStamina', 'currentStamina', 'lastStaminaUsage', 'lastSpecialWeatherGather']
      },
      {
        title: '⚔️ Gear and Stats',
        fields: ['gearWeapon', 'gearShield', 'gearArmor.head', 'gearArmor.chest', 'gearArmor.legs', 'attack', 'defense']
      },
      {
        title: '🎒 Inventory and Links',
        fields: ['inventory', 'appLink', 'inventorySynced']
      },
      {
        title: '🏪 Vendor and Shop Details',
        fields: ['vendingPoints', 'vendorType', 'shopPouch', 'pouchSize', 'shopLink', 'lastCollectedMonth', 'vendingSetup', 'vendingSync']
      },
      {
        title: '🩸 Blight Status',
        fields: ['blighted', 'blightedAt', 'blightStage', 'blightPaused', 'blightPauseInfo', 'lastRollDate', 'deathDeadline', 'blightEffects', 'specialWeatherUsage']
      },
      {
        title: '⚡ Special Status',
        fields: ['ko', 'debuff', 'buff', 'failedStealAttempts', 'failedFleeAttempts', 'inJail', 'jailReleaseTime', 'canBeStolenFrom', 'stealProtection']
      },
      {
        title: '🗺️ Travel & Daily Activities',
        fields: ['dailyRoll', 'travelLog']
      },
      {
        title: '✨ Additional Features',
        fields: ['jobVoucher', 'jobVoucherJob', 'spiritOrbs']
      },
      {
        title: '🐾 Companions',
        fields: ['currentActivePet', 'currentActiveMount']
      },
      {
        title: '📜 Quest Tracking',
        fields: ['helpWanted']
      },
      {
        title: '🚀 Boosting System',
        fields: ['boostedBy']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'Item': [
      {
        title: '📦 Identity & Display',
        fields: ['itemName', 'image', 'imageType', 'emoji']
      },
      {
        title: '🏷️ Classification',
        fields: ['itemRarity', 'category', 'categoryGear', 'type', 'subtype', 'recipeTag']
      },
      {
        title: '💵 Economics',
        fields: ['buyPrice', 'sellPrice']
      },
      {
        title: '✨ Effects / Stats',
        fields: ['modifierHearts', 'staminaRecovered']
      },
      {
        title: '📚 Stack Rules',
        fields: ['stackable', 'maxStackSize']
      },
      {
        title: '🔨 Crafting',
        fields: ['craftingMaterial', 'staminaToCraft', 'crafting', 'craftingJobs', 'craftingTags']
      },
      {
        title: '🌍 Activities & Obtain',
        fields: ['gathering', 'looting', 'vending', 'traveling', 'exploring', 'obtain', 'obtainTags', 'gatheringJobs', 'gatheringTags', 'lootingJobs', 'lootingTags']
      },
      {
        title: '🌦️ Special Weather',
        fields: ['specialWeather']
      },
      {
        title: '🐶 Pet Perks',
        fields: ['petPerk', 'petperkobtain', 'petprey', 'petforage', 'lgpetprey', 'petmon', 'petchu', 'petfirechu', 'peticechu', 'petelectricchu']
      },
      {
        title: '🗺️ Location Flags',
        fields: ['locations', 'locationsTags', 'centralHyrule', 'eldin', 'faron', 'gerudo', 'hebra', 'lanayru', 'pathOfScarletLeaves', 'leafDewWay']
      },
      {
        title: '💼 Job Flags',
        fields: ['adventurer', 'artist', 'beekeeper', 'blacksmith', 'cook', 'craftsman', 'farmer', 'fisherman', 'forager', 'gravekeeper', 'guard', 'maskMaker', 'rancher', 'herbalist', 'hunter', 'hunterLooting', 'mercenary', 'miner', 'researcher', 'scout', 'weaver', 'witch', 'allJobs', 'allJobsTags', 'entertainerItems', 'divineItems']
      },
      {
        title: '🐉 Monster Flags - Bokoblin',
        fields: ['monsterList', 'blackBokoblin', 'blueBokoblin', 'cursedBokoblin', 'goldenBokoblin', 'silverBokoblin', 'bokoblin', 'normalBokoblin', 'bossBokoblin']
      },
      {
        title: '🐉 Monster Flags - Chuchu',
        fields: ['electricChuchuLarge', 'fireChuchuLarge', 'iceChuchuLarge', 'chuchuLarge', 'electricChuchuMedium', 'fireChuchuMedium', 'iceChuchuMedium', 'chuchuMedium', 'electricChuchuSmall', 'fireChuchuSmall', 'iceChuchuSmall', 'chuchuSmall']
      },
      {
        title: '🐉 Monster Flags - Hinox',
        fields: ['blackHinox', 'blueHinox', 'hinox', 'normalHinox']
      },
      {
        title: '🐉 Monster Flags - Keese',
        fields: ['electricKeese', 'fireKeese', 'iceKeese', 'keese', 'normalKeese']
      },
      {
        title: '🐉 Monster Flags - Lizalfos',
        fields: ['blackLizalfos', 'blueLizalfos', 'cursedLizalfos', 'electricLizalfos', 'fireBreathLizalfos', 'goldenLizalfos', 'iceBreathLizalfos', 'silverLizalfos', 'lizalfos', 'normalLizalfos', 'stalizalfos']
      },
      {
        title: '🐉 Monster Flags - Lynel',
        fields: ['blueManedLynel', 'goldenLynel', 'silverLynel', 'whiteManedLynel', 'lynel', 'normalLynel']
      },
      {
        title: '🐉 Monster Flags - Moblin',
        fields: ['blackMoblin', 'blueMoblin', 'cursedMoblin', 'goldenMoblin', 'silverMoblin', 'moblin', 'normalMoblin', 'stalmoblin']
      },
      {
        title: '🐉 Monster Flags - Molduga',
        fields: ['molduga', 'molduking']
      },
      {
        title: '🐉 Monster Flags - Octorok',
        fields: ['forestOctorok', 'rockOctorok', 'skyOctorok', 'snowOctorok', 'treasureOctorok', 'waterOctorok']
      },
      {
        title: '🐉 Monster Flags - Pebblit & Talus',
        fields: ['frostPebblit', 'igneoPebblit', 'stonePebblit', 'frostTalus', 'igneoTalus', 'luminousTalus', 'rareTalus', 'stoneTalus']
      },
      {
        title: '🐉 Monster Flags - Stal',
        fields: ['stalkoblin', 'stalnox']
      },
      {
        title: '🐉 Monster Flags - Wizzrobe',
        fields: ['blizzardWizzrobe', 'electricWizzrobe', 'fireWizzrobe', 'iceWizzrobe', 'meteoWizzrobe', 'thunderWizzrobe']
      },
      {
        title: '🐉 Monster Flags - Other',
        fields: ['likeLike', 'evermean', 'gibdo', 'normalGibdo', 'mothGibdo', 'horriblin', 'normalHorriblin', 'gloomHands', 'littleFrox']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'Quest': [
      {
        title: '📜 Basic Quest Info',
        fields: ['title', 'description', 'questType', 'location', 'timeLimit', 'minRequirements', 'tableroll']
      },
      {
        title: '🎁 Rewards',
        fields: ['tokenReward', 'itemReward', 'itemRewardQty', 'itemRewards']
      },
      {
        title: '📋 Quest Requirements',
        fields: ['signupDeadline', 'participantCap', 'postRequirement', 'specialNote']
      },
      {
        title: '🤝 Collaboration Rules',
        fields: ['collabAllowed', 'collabRule', 'rules']
      },
      {
        title: '🔗 Integration & Discord',
        fields: ['targetChannel', 'date', 'questID', 'posted', 'postedAt', 'botNotes', 'messageID', 'roleID', 'guildId', 'rpThreadParentChannel']
      },
      {
        title: '✅ Quest Status',
        fields: ['status', 'completionReason', 'completedAt', 'completionProcessed', 'lastCompletionCheck']
      },
      {
        title: '👥 Participants',
        fields: ['participants', 'leftParticipants']
      },
      {
        title: '🎲 Interactive Quest Table Roll',
        fields: ['tableRollName', 'tableRollConfig', 'requiredRolls', 'rollSuccessCriteria']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'User': [
      {
        title: '👤 Basic User Info',
        fields: ['discordId', 'googleSheetsUrl', 'timezone']
      },
      {
        title: '💰 Tokens',
        fields: ['tokens', 'tokenTracker', 'tokensSynced']
      },
      {
        title: '👥 Character Management',
        fields: ['blightedcharacter', 'characterSlot']
      },
      {
        title: '📊 Activity Status',
        fields: ['status', 'statusChangedAt']
      },
      {
        title: '💬 Message Tracking',
        fields: ['lastMessageContent', 'lastMessageTimestamp']
      },
      {
        title: '📜 Help Wanted Quest Tracking',
        fields: ['helpWanted']
      },
      {
        title: '⭐ Leveling System',
        fields: ['leveling']
      },
      {
        title: '🎂 Birthday System',
        fields: ['birthday']
      },
      {
        title: '🚀 Nitro Boost Rewards',
        fields: ['boostRewards']
      }
    ],
    'NPC': [
      {
        title: '👤 Basic NPC Info',
        fields: ['name', 'description', 'isActive']
      },
      {
        title: '🎒 Item Categories',
        fields: ['itemCategories']
      },
      {
        title: '🔒 Steal Protection',
        fields: ['stealProtection', 'stealDifficulty']
      },
      {
        title: '⏱️ Personal Lockouts',
        fields: ['personalLockouts']
      },
      {
        title: '📅 Tracking',
        fields: ['lastInteraction', 'createdAt', 'updatedAt']
      }
    ],
    'Pet': [
      {
        title: '🐾 Basic Pet Info',
        fields: ['name', 'species', 'petType', 'level', 'imageUrl']
      },
      {
        title: '👤 Owner Information',
        fields: ['ownerName', 'owner', 'discordId']
      },
      {
        title: '📦 Status & Storage',
        fields: ['status', 'storageLocation', 'storedAt', 'removedFromStorageAt']
      },
      {
        title: '🎲 Pet Abilities',
        fields: ['rollsRemaining', 'rollCombination', 'tableDescription', 'lastRollDate']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'Village': [
      {
        title: '🏘️ Basic Village Info',
        fields: ['name', 'region', 'color', 'emoji']
      },
      {
        title: '💪 Village Stats',
        fields: ['health', 'level', 'levelHealth', 'status']
      },
      {
        title: '💰 Token & Materials',
        fields: ['currentTokens', 'tokenRequirements', 'materials']
      },
      {
        title: '🛡️ Protections',
        fields: ['raidProtection', 'bloodMoonProtection']
      },
      {
        title: '🔧 Repair & Damage',
        fields: ['lostResources', 'repairProgress', 'lastDamageTime']
      },
      {
        title: '👥 Contributors',
        fields: ['contributors']
      },
      {
        title: '🏪 Vending',
        fields: ['vendingTier', 'vendingDiscount']
      },
      {
        title: '⏱️ Cooldowns',
        fields: ['cooldowns']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'ModCharacter': [
      {
        title: '👤 Basic Character Information',
        fields: ['userId', 'name', 'age', 'height', 'pronouns', 'race', 'homeVillage', 'currentVillage', 'job', 'jobDateChanged', 'icon', 'birthday']
      },
      {
        title: '🎭 Mod Character Special Properties',
        fields: ['isModCharacter', 'modTitle', 'modType', 'modOwner', 'unlimitedHearts', 'unlimitedStamina']
      },
      {
        title: '❤️ Health and Stamina',
        fields: ['maxHearts', 'currentHearts', 'maxStamina', 'currentStamina', 'lastStaminaUsage', 'lastSpecialWeatherGather']
      },
      {
        title: '⚔️ Gear and Stats',
        fields: ['gearWeapon', 'gearShield', 'gearArmor.head', 'gearArmor.chest', 'gearArmor.legs', 'attack', 'defense']
      },
      {
        title: '🎒 Inventory and Links',
        fields: ['inventory', 'appLink', 'inventorySynced']
      },
      {
        title: '🏪 Vendor and Shop Details',
        fields: ['vendingPoints', 'vendorType', 'shopPouch', 'pouchSize', 'shopLink', 'lastCollectedMonth', 'vendingSetup', 'vendingSync']
      },
      {
        title: '🩸 Special Status (Mod Characters Are Immune)',
        fields: ['blighted', 'blightedAt', 'blightStage', 'blightPaused', 'lastRollDate', 'deathDeadline', 'blightEffects', 'specialWeatherUsage']
      },
      {
        title: '⚡ Status Effects',
        fields: ['ko', 'debuff', 'failedStealAttempts', 'failedFleeAttempts', 'inJail', 'jailReleaseTime', 'canBeStolenFrom', 'dailyRoll']
      },
      {
        title: '✨ Additional Features',
        fields: ['jobVoucher', 'jobVoucherJob', 'spiritOrbs']
      },
      {
        title: '🐾 Companions',
        fields: ['currentActivePet', 'currentActiveMount']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'Mount': [
      {
        title: '🐴 Basic Mount Info',
        fields: ['name', 'species', 'level', 'fee', 'stamina']
      },
      {
        title: '👤 Owner Information',
        fields: ['discordId', 'characterId', 'owner']
      },
      {
        title: '🌍 Location & Traits',
        fields: ['region', 'traits']
      },
      {
        title: '📦 Status & Storage',
        fields: ['status', 'storageLocation', 'storedAt', 'removedFromStorageAt']
      },
      {
        title: '⚡ Stamina Tracking',
        fields: ['currentStamina', 'lastMountTravel']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'Relationship': [
      {
        title: '👥 Character Information',
        fields: ['userId', 'characterId', 'characterName', 'targetCharacterId', 'targetCharacterName']
      },
      {
        title: '❤️ Relationship Details',
        fields: ['relationshipTypes', 'notes']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'Weather': [
      {
        title: '🌍 Location & Time',
        fields: ['village', 'date', 'season']
      },
      {
        title: '🌡️ Temperature',
        fields: ['temperature']
      },
      {
        title: '💨 Wind',
        fields: ['wind']
      },
      {
        title: '🌧️ Precipitation',
        fields: ['precipitation']
      },
      {
        title: '✨ Special Weather',
        fields: ['special']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'GeneralItem': [
      {
        title: '📦 Basic Item Info',
        fields: ['itemName', 'category', 'description']
      },
      {
        title: '✅ Valid Items',
        fields: ['validItems']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'HelpWantedQuest': [
      {
        title: '🆔 Quest Identification',
        fields: ['questId', 'village', 'date']
      },
      {
        title: '📋 Quest Details',
        fields: ['type', 'npcName', 'requirements']
      },
      {
        title: '✅ Completion Status',
        fields: ['completed', 'completedBy']
      },
      {
        title: '📅 Scheduling & Discord',
        fields: ['scheduledPostTime', 'messageId', 'channelId']
      }
    ],
    'MemberLore': [
      {
        title: '👤 Member Information',
        fields: ['memberName', 'userId']
      },
      {
        title: '📖 Lore Content',
        fields: ['topic', 'description']
      },
      {
        title: '📅 Submission Metadata',
        fields: ['timestamp', 'status']
      },
      {
        title: '👮 Moderation',
        fields: ['moderatorNotes', 'moderatedBy', 'moderatedAt']
      }
    ],
    'Party': [
      {
        title: '👑 Party Leadership',
        fields: ['leaderId', 'partyId']
      },
      {
        title: '🗺️ Location',
        fields: ['region', 'square', 'quadrant', 'quadrantState']
      },
      {
        title: '👥 Characters',
        fields: ['characters']
      },
      {
        title: '📦 Gathered Items',
        fields: ['gatheredItems']
      },
      {
        title: '📊 Party Stats',
        fields: ['totalHearts', 'totalStamina', 'currentTurn']
      },
      {
        title: '💬 Discord Integration',
        fields: ['messageId', 'status']
      }
    ],
    'TableRoll': [
      {
        title: '📋 Table Information',
        fields: ['name', 'createdBy', 'isActive']
      },
      {
        title: '🎲 Entries',
        fields: ['entries']
      },
      {
        title: '📊 Auto-Calculated Stats',
        fields: ['totalWeight']
      },
      {
        title: '📅 Daily Roll Limits',
        fields: ['maxRollsPerDay', 'dailyRollCount', 'dailyRollReset']
      },
      {
        title: '📅 Timestamps',
        fields: ['createdAt', 'updatedAt']
      }
    ],
    'Inventory': [
      {
        title: '🎒 Item Information',
        fields: ['characterId', 'itemName', 'itemId', 'quantity']
      },
      {
        title: '🏷️ Item Classification',
        fields: ['category', 'type', 'subtype', 'job', 'perk']
      },
      {
        title: '📍 Location & Origin',
        fields: ['location', 'obtain']
      },
      {
        title: '📅 Timestamps',
        fields: ['date', 'craftedAt', 'gatheredAt']
      },
      {
        title: '🔗 Sync',
        fields: ['synced']
      }
    ]
  };

// ============================================================================
// ------------------- Form Generation -------------------
// ============================================================================

// ------------------- generateForm -------------------
// Generate form fields based on schema and record data
//
async function generateForm(record) {
  const form = document.getElementById('record-form');
  form.innerHTML = '';
  
  if (!currentSchema) {
    form.innerHTML = '<p>Schema not loaded</p>';
    return;
  }
  
  // Special handling for Inventory - show all items in a table
  if (currentModel === 'Inventory' && record.items) {
    generateInventoryItemsTable(record);
    return;
  }
  
  // Reset any inline styles that might have been applied by Inventory view
  const modalBody = document.getElementById('modal-body');
  if (modalBody) {
    modalBody.style.padding = '';
    modalBody.style.height = '';
    modalBody.style.display = '';
    modalBody.style.flexDirection = '';
  }
  
  form.style.height = '';
  form.style.display = '';
  form.style.flexDirection = '';
  
  // Show the save button (Inventory hides it)
  const saveBtn = document.getElementById('modal-save-btn');
  if (saveBtn) {
    saveBtn.style.display = '';
  }
  
  const orderedFields = getOrderedFieldsFromModel(currentModel);
  
  for (const section of orderedFields) {
    if (section.title) {
      form.appendChild(createSectionHeader(section.title));
    }
    
    for (const fieldInfo of section.fields) {
      const fieldGroup = await createFieldGroup(fieldInfo, record);
      form.appendChild(fieldGroup);
    }
  }
}

// ------------------- generateInventoryItemsTable -------------------
// Generate table of inventory items for a character
//
function generateInventoryItemsTable(record) {
  const form = document.getElementById('record-form');
  form.innerHTML = '';
  
  // Store characterId for use in save/delete functions
  form.dataset.characterId = record.characterId;
  
  const container = document.createElement('div');
  container.className = 'inventory-items-container';
  container.style.width = '100%';
  container.style.overflowX = 'auto';
  container.style.overflowY = 'auto';
  container.style.height = 'calc(100vh - 200px)'; // Use most of the modal height
  container.style.border = '1px solid #4a5568';
  container.style.borderRadius = '8px';
  container.style.backgroundColor = '#2d3748';
  container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  
  if (!record.items || record.items.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 20px; color: #a0aec0;">No items in inventory</p>';
    form.appendChild(container);
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'inventory-items-table';
  table.style.width = '100%';
  table.style.minWidth = '1400px'; // Make it wider
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '14px';
  
  // Create table header
  const thead = document.createElement('thead');
  thead.style.position = 'sticky';
  thead.style.top = '0';
  thead.style.zIndex = '10';
  thead.innerHTML = `
    <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
      <th style="padding: 15px 20px; border-bottom: 2px solid #5a6fd8; text-align: left; font-weight: 700; min-width: 220px; position: sticky; top: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 15px;">Item Name</th>
      <th style="padding: 15px 20px; border-bottom: 2px solid #5a6fd8; text-align: center; font-weight: 700; width: 90px; position: sticky; top: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 15px;">Qty</th>
      <th style="padding: 15px 20px; border-bottom: 2px solid #5a6fd8; text-align: left; font-weight: 700; min-width: 140px; position: sticky; top: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 15px;">Category</th>
      <th style="padding: 15px 20px; border-bottom: 2px solid #5a6fd8; text-align: left; font-weight: 700; min-width: 120px; position: sticky; top: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 15px;">Type</th>
      <th style="padding: 15px 20px; border-bottom: 2px solid #5a6fd8; text-align: left; font-weight: 700; min-width: 120px; position: sticky; top: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 15px;">Subtype</th>
      <th style="padding: 15px 20px; border-bottom: 2px solid #5a6fd8; text-align: left; font-weight: 700; min-width: 120px; position: sticky; top: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 15px;">Job</th>
      <th style="padding: 15px 20px; border-bottom: 2px solid #5a6fd8; text-align: left; font-weight: 700; min-width: 140px; position: sticky; top: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 15px;">Location</th>
      <th style="padding: 15px 20px; border-bottom: 2px solid #5a6fd8; text-align: left; font-weight: 700; min-width: 140px; position: sticky; top: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 15px;">Obtain</th>
      <th style="padding: 15px 20px; border-bottom: 2px solid #5a6fd8; text-align: center; font-weight: 700; width: 160px; position: sticky; top: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 15px;">Actions</th>
    </tr>
  `;
  table.appendChild(thead);
  
  // Create table body
  const tbody = document.createElement('tbody');
  tbody.id = 'inventory-items-tbody';
  
  record.items.forEach(item => {
    const row = createInventoryItemRow(item, record.characterId);
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
  form.appendChild(container);
  
  // Hide the save button since we save items individually
  const saveBtn = document.getElementById('modal-save-btn');
  if (saveBtn) {
    saveBtn.style.display = 'none';
  }
  
  // Ensure the modal body and form take up full space for inventory
  const modalBody = document.getElementById('modal-body');
  if (modalBody) {
    modalBody.style.padding = '20px';
    modalBody.style.height = 'calc(100% - 120px)';
    modalBody.style.display = 'flex';
    modalBody.style.flexDirection = 'column';
  }
  
  const recordForm = document.getElementById('record-form');
  if (recordForm) {
    recordForm.style.height = '100%';
    recordForm.style.display = 'flex';
    recordForm.style.flexDirection = 'column';
  }
}

// ------------------- createInventoryItemRow -------------------
// Create a row for an inventory item
//
function createInventoryItemRow(item, characterId) {
  const row = document.createElement('tr');
  row.dataset.itemId = item._id;
  row.dataset.characterId = characterId;
  row.style.borderBottom = '1px solid #4a5568';
  row.style.transition = 'all 0.2s ease';
  row.style.backgroundColor = '#2d3748';
  
  // Add hover effect
  row.onmouseenter = () => {
    row.style.backgroundColor = '#4a5568';
    row.style.transform = 'translateY(-1px)';
    row.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  };
  row.onmouseleave = () => {
    row.style.backgroundColor = '#2d3748';
    row.style.transform = 'translateY(0)';
    row.style.boxShadow = 'none';
  };
  
  // Helper function to create input
  const createInput = (field, value, width = '100%', type = 'text') => {
    const input = document.createElement('input');
    input.type = type;
    input.value = value || '';
    input.dataset.field = field;
    input.style.width = width;
    input.style.padding = '10px 12px';
    input.style.border = '2px solid #4a5568';
    input.style.borderRadius = '6px';
    input.style.fontSize = '14px';
    input.style.boxSizing = 'border-box';
    input.style.transition = 'all 0.2s ease';
    input.style.backgroundColor = '#1a202c';
    input.style.color = '#e2e8f0';
    
    // Add focus effect
    input.onfocus = function() {
      this.style.borderColor = '#667eea';
      this.style.outline = '0';
      this.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.2)';
      this.style.transform = 'scale(1.02)';
      this.style.backgroundColor = '#2d3748';
    };
    input.onblur = function() {
      this.style.borderColor = '#4a5568';
      this.style.boxShadow = 'none';
      this.style.transform = 'scale(1)';
      this.style.backgroundColor = '#1a202c';
    };
    
    return input;
  };
  
  // Item Name (with emoji if available, non-editable)
  const nameCell = document.createElement('td');
  nameCell.style.padding = '12px 15px';
  nameCell.style.verticalAlign = 'middle';
  const itemDisplay = item.itemId && item.itemId.emoji 
    ? `${item.itemId.emoji} ${item.itemName}`
    : item.itemName;
  nameCell.innerHTML = `<strong style="font-size: 15px; color: #e2e8f0;">${itemDisplay}</strong>`;
  row.appendChild(nameCell);
  
  // Quantity (editable)
  const quantityCell = document.createElement('td');
  quantityCell.style.padding = '12px 15px';
  quantityCell.style.textAlign = 'center';
  quantityCell.style.verticalAlign = 'middle';
  const quantityInput = createInput('quantity', item.quantity || 1, '60px', 'number');
  quantityInput.min = '0';
  quantityInput.style.textAlign = 'center';
  quantityCell.appendChild(quantityInput);
  row.appendChild(quantityCell);
  
  // Category (editable)
  const categoryCell = document.createElement('td');
  categoryCell.style.padding = '12px 15px';
  categoryCell.style.verticalAlign = 'middle';
  categoryCell.appendChild(createInput('category', item.category));
  row.appendChild(categoryCell);
  
  // Type (editable)
  const typeCell = document.createElement('td');
  typeCell.style.padding = '12px 15px';
  typeCell.style.verticalAlign = 'middle';
  typeCell.appendChild(createInput('type', item.type));
  row.appendChild(typeCell);
  
  // Subtype (editable)
  const subtypeCell = document.createElement('td');
  subtypeCell.style.padding = '12px 15px';
  subtypeCell.style.verticalAlign = 'middle';
  subtypeCell.appendChild(createInput('subtype', item.subtype));
  row.appendChild(subtypeCell);
  
  // Job (editable)
  const jobCell = document.createElement('td');
  jobCell.style.padding = '12px 15px';
  jobCell.style.verticalAlign = 'middle';
  jobCell.appendChild(createInput('job', item.job));
  row.appendChild(jobCell);
  
  // Location (editable)
  const locationCell = document.createElement('td');
  locationCell.style.padding = '12px 15px';
  locationCell.style.verticalAlign = 'middle';
  locationCell.appendChild(createInput('location', item.location));
  row.appendChild(locationCell);
  
  // Obtain (editable)
  const obtainCell = document.createElement('td');
  obtainCell.style.padding = '12px 15px';
  obtainCell.style.verticalAlign = 'middle';
  obtainCell.appendChild(createInput('obtain', item.obtain));
  row.appendChild(obtainCell);
  
  // Actions
  const actionsCell = document.createElement('td');
  actionsCell.style.padding = '12px 15px';
  actionsCell.style.textAlign = 'center';
  actionsCell.style.verticalAlign = 'middle';
  actionsCell.style.whiteSpace = 'nowrap';
  
  const saveBtn = document.createElement('button');
  saveBtn.innerHTML = '<i class="fas fa-save"></i>';
  saveBtn.className = 'btn btn-sm btn-primary';
  saveBtn.style.marginRight = '8px';
  saveBtn.style.padding = '8px 14px';
  saveBtn.style.borderRadius = '6px';
  saveBtn.style.border = 'none';
  saveBtn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
  saveBtn.style.color = 'white';
  saveBtn.style.fontWeight = '600';
  saveBtn.style.transition = 'all 0.2s ease';
  saveBtn.title = 'Save changes';
  saveBtn.onclick = () => saveInventoryItem(characterId, item._id, row);
  
  saveBtn.onmouseenter = function() {
    this.style.transform = 'translateY(-2px)';
    this.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
  };
  saveBtn.onmouseleave = function() {
    this.style.transform = 'translateY(0)';
    this.style.boxShadow = 'none';
  };
  
  const deleteBtn = document.createElement('button');
  deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
  deleteBtn.className = 'btn btn-sm btn-danger';
  deleteBtn.style.padding = '8px 14px';
  deleteBtn.style.borderRadius = '6px';
  deleteBtn.style.border = 'none';
  deleteBtn.style.background = 'linear-gradient(135deg, #dc3545 0%, #e74c3c 100%)';
  deleteBtn.style.color = 'white';
  deleteBtn.style.fontWeight = '600';
  deleteBtn.style.transition = 'all 0.2s ease';
  deleteBtn.title = 'Delete item';
  deleteBtn.onclick = () => deleteInventoryItem(characterId, item._id, row);
  
  deleteBtn.onmouseenter = function() {
    this.style.transform = 'translateY(-2px)';
    this.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.3)';
  };
  deleteBtn.onmouseleave = function() {
    this.style.transform = 'translateY(0)';
    this.style.boxShadow = 'none';
  };
  
  actionsCell.appendChild(saveBtn);
  actionsCell.appendChild(deleteBtn);
  row.appendChild(actionsCell);
  
  return row;
}

// ------------------- saveInventoryItem -------------------
// Save changes to an inventory item
//
async function saveInventoryItem(characterId, itemId, row) {
  try {
    const inputs = row.querySelectorAll('input[data-field]');
    const updates = {};
    
    inputs.forEach(input => {
      const field = input.dataset.field;
      updates[field] = input.type === 'number' ? parseInt(input.value) : input.value;
    });
    
    const response = await fetchAPI(`/api/admin/db/Inventory/item/${characterId}/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) throw new Error('Failed to update item');
    
    showNotification('Item updated successfully', 'success');
    row.style.backgroundColor = '#d4edda';
    setTimeout(() => {
      row.style.backgroundColor = '';
    }, 1000);
  } catch (error) {
    console.error('[databaseEditor.js]: ❌ Error saving inventory item:', error);
    showNotification('Failed to save item', 'error');
  }
}

// ------------------- deleteInventoryItem -------------------
// Delete an inventory item
//
async function deleteInventoryItem(characterId, itemId, row) {
  if (!confirm('Are you sure you want to delete this item from the inventory?')) {
    return;
  }
  
  try {
    const response = await fetchAPI(`/api/admin/db/Inventory/item/${characterId}/${itemId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Failed to delete item');
    
    showNotification('Item deleted successfully', 'success');
    row.style.transition = 'opacity 0.3s';
    row.style.opacity = '0';
    setTimeout(() => {
      row.remove();
      
      // Check if table is now empty
      const tbody = document.getElementById('inventory-items-tbody');
      if (tbody && tbody.children.length === 0) {
        const form = document.getElementById('record-form');
        form.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">No items in inventory</p>';
      }
    }, 300);
  } catch (error) {
    console.error('[databaseEditor.js]: ❌ Error deleting inventory item:', error);
    showNotification('Failed to delete item', 'error');
  }
}

// ------------------- createSectionHeader -------------------
// Create section header for form
//
function createSectionHeader(title) {
  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'form-section-header';
  sectionHeader.innerHTML = `
    <h4>${title}</h4>
    <div class="section-divider"></div>
  `;
  return sectionHeader;
}

// ------------------- createFieldGroup -------------------
// Create field group with label, input, and metadata
//
async function createFieldGroup(fieldInfo, record) {
  const fieldName = fieldInfo.name;
  const fieldNameLower = fieldName.toLowerCase();
  
  // Handle nested field access (e.g., gearArmor.head)
  let fieldValue;
  if (fieldName.includes('.')) {
    const parts = fieldName.split('.');
    fieldValue = record;
    for (const part of parts) {
      fieldValue = fieldValue?.[part];
    }
  } else {
    fieldValue = record[fieldName];
  }
  
  const fieldGroup = document.createElement('div');
  fieldGroup.className = 'form-field-group';
  
  // Make entries field full-width for TableRoll model
  if (fieldNameLower === 'entries' && currentModel === 'TableRoll') {
    fieldGroup.classList.add('full-width');
  }
  
  const fieldDescription = getFieldDescription(fieldName, currentModel);
  const displayName = getFieldDisplayName(fieldName);
  
  const label = document.createElement('label');
  label.htmlFor = `field-${fieldName}`;
  label.innerHTML = `
    <span>${displayName}</span>
    ${fieldInfo.required ? '<span class="required">*</span>' : ''}
    ${fieldDescription ? '<i class="fas fa-question-circle field-help-icon" title="Click for help"></i>' : ''}
  `;
  
  const helpIcon = label.querySelector('.field-help-icon');
  if (helpIcon) {
    helpIcon.addEventListener('click', (e) => {
      e.preventDefault();
      showTooltip(e.target, fieldDescription);
    });
  }
  
  const input = await createInputForField(fieldName, fieldInfo, fieldValue);
  
  // Handle setting id and name for non-container elements
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA' || input.tagName === 'SELECT') {
    input.id = `field-${fieldName}`;
    input.name = fieldName;
  }
  // For containers (like item picker), the id/name are already set internally
  
  if (fieldDescription) {
    const description = document.createElement('div');
    description.className = 'field-description';
    description.textContent = fieldDescription;
    fieldGroup.appendChild(description);
  }
  
  if (fieldInfo.type === 'Boolean') {
    const contributesTo = getContributesToInfo(fieldNameLower);
    if (contributesTo.length > 0) {
      const indicator = document.createElement('div');
      indicator.className = 'array-contributor-indicator';
      indicator.innerHTML = `<i class="fas fa-link"></i> Contributes to: ${contributesTo.join(', ')}`;
      fieldGroup.appendChild(indicator);
    }
  }
  
  const typeHint = document.createElement('small');
  typeHint.className = 'field-type-hint';
  typeHint.innerHTML = `<strong>Type: ${fieldInfo.type}${fieldInfo.isArray ? '[]' : ''}</strong>${getFieldGuidance(fieldInfo.type, fieldNameLower)}`;
  
  fieldGroup.appendChild(label);
  fieldGroup.appendChild(input);
  fieldGroup.appendChild(typeHint);
  
  return fieldGroup;
}

// ------------------- getContributesToInfo -------------------
// Determine which arrays this boolean field contributes to
//
function getContributesToInfo(fieldNameLower) {
  const contributesTo = [];
  
  const locationKeywords = ['eldin', 'lanayru', 'faron', 'central', 'gerudo', 'hebra', 'path', 'leaf'];
  if (locationKeywords.some(kw => fieldNameLower.includes(kw))) {
    contributesTo.push('locations');
  }
  
  // Complete list of all jobs (matching Item model job flags)
  const jobKeywords = [
    'adventurer', 'artist', 'beekeeper', 'blacksmith', 'cook', 'craftsman',
    'farmer', 'fisherman', 'forager', 'gravekeeper', 'graveskeeper', 'guard', 
    'maskmaker', 'rancher', 'herbalist', 'hunter', 'hunterlooting', 'mercenary', 
    'miner', 'researcher', 'scout', 'weaver', 'witch'
  ];
  if (jobKeywords.some(kw => fieldNameLower.includes(kw))) {
    contributesTo.push('jobs');
  }
  
  // Monster keywords for monsterList array
  const monsterKeywords = [
    'bokoblin', 'chuchu', 'hinox', 'keese', 'lizalfos', 'lynel', 'moblin',
    'molduga', 'octorok', 'pebblit', 'talus', 'stal', 'wizzrobe', 'likelike',
    'evermean', 'gibdo', 'horriblin', 'gloomhands', 'frox'
  ];
  if (monsterKeywords.some(kw => fieldNameLower.includes(kw))) {
    contributesTo.push('monsterList');
  }
  
  return contributesTo;
}

// ------------------- getFieldGuidance -------------------
// Get user-friendly guidance text for field type
//
function getFieldGuidance(fieldType, fieldNameLower) {
  switch (fieldType) {
    case 'String':
      if (fieldNameLower === 'category') return ' • Select from existing categories or type a new one';
      if (fieldNameLower === 'type') return ' • Select from existing types or type a new one';
      if (fieldNameLower === 'npcname') return ' • Select from NPCs used in previous Help Wanted Quests or type a new one';
      if (fieldNameLower === 'pronouns') return ' • Select from existing pronouns (e.g., he/him, she/her, they/them) or type custom';
      if (fieldNameLower === 'modtitle') return ' • Select from existing mod titles (Oracle, Dragon, Sage, etc.) or type a new one';
      if (fieldNameLower === 'modtype') return ' • Select from existing mod types (Power, Courage, Wisdom, etc.) or type a new one';
      if (fieldNameLower === 'modowner') return ' • Select from existing mod owners or type a new one';
      if (fieldNameLower === 'jobvoucherjob') return ' • Select from all available jobs';
      if (fieldNameLower.includes('crafting')) return ' • Select from previous values or type a new one';
      if (fieldNameLower.includes('name')) return ' • Enter a name (max 100 characters)';
      if (fieldNameLower.includes('description')) return ' • Describe this item (any length)';
      return ' • Enter text';
    
    case 'Number':
      if (fieldNameLower === 'totalweight') return ' • Auto-calculated from entry weights (read-only)';
      if (fieldNameLower.includes('tier')) return ' • Enter 0-20 (recommended: 1-10)';
      if (fieldNameLower.includes('hearts')) return ' • Enter 0-100 (health points)';
      if (fieldNameLower.includes('dmg') || fieldNameLower.includes('damage')) {
        return ' • Enter damage amount (positive number)';
      }
      return ' • Enter a number';
    
    case 'Boolean':
      return ' • Choose True or False';
    
    case 'Array':
      if (fieldNameLower.includes('location')) return ' • Auto-generated from location checkboxes above';
      if (fieldNameLower.includes('job')) return ' • Auto-generated from job checkboxes above';
      if (fieldNameLower === 'validitems') return ' • Search and select items from database (idiot-proof!)';
      if (fieldNameLower === 'craftingmaterial') return ' • Add materials with item names and quantities - perfect for crafting recipes!';
      if (fieldNameLower === 'entries') return ' • Add entries with weight, item, quantity, flavor text, and thumbnail - total weight auto-calculated!';
      if (shouldUseMultiSelect(fieldNameLower)) return ' • Select from existing values or add custom (no coding needed!)';
      return ' • Click "Add Item" to add entries - no JSON syntax needed!';
    
    case 'Map':
      return ' • Click "Add Entry" to add key-value pairs - no JSON syntax needed!';
    
    case 'Object':
      if (fieldNameLower.includes('gear')) return ' • Enter gear name and add stats - no JSON syntax needed!';
      return ' • Click "Add Entry" to add key-value pairs - no JSON syntax needed!';
    
    case 'Mixed':
      return ' • Enter any value - text, number, or use key-value pairs for objects';
    
    default:
      return '';
  }
}

// ------------------- createInputForField -------------------
// Create appropriate input element for field type
//
async function createInputForField(fieldName, fieldInfo, value) {
  const type = fieldInfo.type;
  
  if (fieldName === '_id' && !editingRecordId) {
    return createDisabledInput('Auto-generated');
  }
  
  // Make totalWeight field read-only (auto-calculated from entries)
  if (fieldName === 'totalWeight') {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value !== undefined && value !== null ? value : '0';
    input.readOnly = true;
    input.style.cssText = `
      background: rgba(73, 213, 156, 0.15);
      border: 1px solid rgba(73, 213, 156, 0.4);
      color: #49D59C;
      font-weight: 700;
      cursor: not-allowed;
      text-align: center;
      font-size: 1.1rem;
    `;
    return input;
  }
  
  if (type === 'Boolean') {
    return createBooleanSelect(value);
  }
  
  if (type === 'Number') {
    return createNumberInput(fieldName, value);
  }
  
  if (type === 'Date') {
    return createDateInput(value);
  }
  
  if (fieldInfo.enum && fieldInfo.enum.length > 0) {
    return createEnumSelect(fieldInfo.enum, value);
  }
  
  if (type === 'Map') {
    return createMapTextarea(fieldName, value);
  }
  
  if (type === 'Object' || type === 'Mixed') {
    return createObjectTextarea(fieldName, value, type);
  }
  
  if (type === 'Array' || fieldInfo.isArray) {
    return await createArrayTextarea(fieldName, value);
  }
  
  if (fieldName.toLowerCase().includes('image')) {
    return createImageInput(value);
  }
  
  // Check if field should use autocomplete
  if (shouldUseAutocomplete(fieldName, type)) {
    return await createAutocompleteInput(fieldName, value, currentModel);
  }
  
  return createTextInput(fieldName, value);
}

// ------------------- createDisabledInput -------------------
// Create disabled input for auto-generated fields
//
function createDisabledInput(placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.disabled = true;
  return input;
}

// ------------------- createBooleanSelect -------------------
// Create select dropdown for boolean values
//
function createBooleanSelect(value) {
  const select = document.createElement('select');
  select.innerHTML = `
    <option value="">-- Select --</option>
    <option value="true" ${value === true ? 'selected' : ''}>True</option>
    <option value="false" ${value === false ? 'selected' : ''}>False</option>
  `;
  return select;
}

// ------------------- createNumberInput -------------------
// Create number input with appropriate constraints
//
function createNumberInput(fieldName, value) {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value !== undefined && value !== null ? value : '';
  
  const fieldNameLower = fieldName.toLowerCase();
  
  if (fieldNameLower.includes('tier')) {
    input.min = 0;
    input.max = 20;
    input.step = 1;
    input.placeholder = '0-20 (recommended: 1-10)';
  } else if (fieldNameLower.includes('hearts')) {
    input.min = 0;
    input.max = 100;
    input.step = 1;
    input.placeholder = '0-100 (health points)';
  } else if (fieldNameLower.includes('dmg') || fieldNameLower.includes('damage')) {
    input.min = 0;
    input.step = 0.1;
    input.placeholder = 'Damage amount (positive number)';
  } else {
    input.placeholder = 'Enter a number...';
  }
  
  return input;
}

// ------------------- createDateInput -------------------
// Create datetime input
//
function createDateInput(value) {
  const input = document.createElement('input');
  input.type = 'datetime-local';
  if (value) {
    const date = new Date(value);
    input.value = date.toISOString().slice(0, 16);
  }
  return input;
}

// ------------------- createEnumSelect -------------------
// Create select dropdown for enum values
//
function createEnumSelect(enumValues, value) {
  const select = document.createElement('select');
  select.innerHTML = '<option value="">-- Select --</option>';
  enumValues.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    if (value === option) opt.selected = true;
    select.appendChild(opt);
  });
  return select;
}

// ------------------- createArrayTextarea -------------------
// Create textarea for array/object input
//
async function createArrayTextarea(fieldName, value) {
  const fieldNameLower = fieldName.toLowerCase();
  const isAutoGenerated = fieldNameLower.includes('location') || fieldNameLower.includes('job');
  
  // Special handling for validItems array - create item picker from Items database
  if (fieldNameLower === 'validitems') {
    return await createItemPickerForValidItems(fieldName, value);
  }
  
  // Special handling for craftingMaterial array - create crafting material editor
  if (fieldNameLower === 'craftingmaterial') {
    return await createCraftingMaterialEditor(fieldName, value);
  }
  
  // Special handling for TableRoll entries array
  if (fieldNameLower === 'entries' && currentModel === 'TableRoll') {
    return await createTableRollEntriesEditor(fieldName, value);
  }
  
  // Use multi-select dropdown for common array fields
  if (shouldUseMultiSelect(fieldName) && !isAutoGenerated) {
    return await createMultiSelectDropdown(fieldName, value);
  }
  
  // Auto-generated fields (read-only)
  if (isAutoGenerated) {
    const textarea = document.createElement('textarea');
    textarea.rows = 4;
    textarea.placeholder = 'Auto-generated from boolean fields above';
    textarea.readOnly = true;
    textarea.style.backgroundColor = 'rgba(203, 182, 135, 0.1)';
    textarea.style.color = 'rgba(203, 182, 135, 0.8)';
    textarea.style.cursor = 'not-allowed';
    textarea.value = value ? JSON.stringify(value, null, 2) : '[]';
    return textarea;
  }
  
  // User-friendly array interface for all other arrays
  return createSimpleArrayInput(fieldName, value);
}

// ------------------- createSimpleArrayInput -------------------
// Create user-friendly array input (no JSON required!)
//
function createSimpleArrayInput(fieldName, value) {
  const container = document.createElement('div');
  container.className = 'simple-array-container';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;
  
  // Hidden textarea to store the actual JSON array
  const hiddenInput = document.createElement('textarea');
  hiddenInput.style.display = 'none';
  hiddenInput.name = fieldName;
  hiddenInput.id = `field-${fieldName}`;
  
  // Initialize array items
  let items = [];
  if (value !== undefined && value !== null && Array.isArray(value)) {
    items = [...value];
  }
  
  // Update hidden input
  const updateHiddenInput = () => {
    hiddenInput.value = JSON.stringify(items);
  };
  updateHiddenInput();
  
  // Items list container
  const itemsList = document.createElement('div');
  itemsList.className = 'array-items-list';
  itemsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;
  
  // Render all items
  const renderItems = () => {
    itemsList.innerHTML = '';
    
    if (items.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No items yet. Click "Add Item" below.';
      emptyMsg.style.cssText = 'padding: 12px; color: rgba(203, 182, 135, 0.5); font-style: italic; text-align: center; background: rgba(203, 182, 135, 0.05); border-radius: 6px;';
      itemsList.appendChild(emptyMsg);
      return;
    }
    
    items.forEach((item, index) => {
      const itemRow = document.createElement('div');
      itemRow.style.cssText = `
        display: flex;
        gap: 8px;
        align-items: center;
      `;
      
      // Item input
      const itemInput = document.createElement('input');
      itemInput.type = 'text';
      itemInput.value = typeof item === 'object' ? JSON.stringify(item) : String(item);
      itemInput.placeholder = `Item ${index + 1}`;
      itemInput.style.cssText = `
        flex: 1;
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
      `;
      
      itemInput.addEventListener('input', (e) => {
        items[index] = e.target.value;
        updateHiddenInput();
      });
      
      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove item';
      removeBtn.style.cssText = `
        width: 32px;
        height: 32px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      `;
      
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.background = '#c82333';
      });
      
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.background = '#dc3545';
      });
      
      removeBtn.addEventListener('click', () => {
        items.splice(index, 1);
        updateHiddenInput();
        renderItems();
      });
      
      itemRow.appendChild(itemInput);
      itemRow.appendChild(removeBtn);
      itemsList.appendChild(itemRow);
    });
  };
  
  // Add item button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.innerHTML = '➕ Add Item';
  addBtn.style.cssText = `
    padding: 10px 16px;
    background: linear-gradient(135deg, #49D59C 0%, #3bae7e 100%);
    color: #1a1410;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  
  addBtn.addEventListener('mouseenter', () => {
    addBtn.style.transform = 'translateY(-2px)';
    addBtn.style.boxShadow = '0 4px 8px rgba(73, 213, 156, 0.3)';
  });
  
  addBtn.addEventListener('mouseleave', () => {
    addBtn.style.transform = 'translateY(0)';
    addBtn.style.boxShadow = 'none';
  });
  
  addBtn.addEventListener('click', () => {
    items.push('');
    updateHiddenInput();
    renderItems();
    // Focus on the new input
    setTimeout(() => {
      const inputs = itemsList.querySelectorAll('input');
      if (inputs.length > 0) {
        inputs[inputs.length - 1].focus();
      }
    }, 50);
  });
  
  // Helper text
  const helperDiv = document.createElement('div');
  helperDiv.style.cssText = `
    padding: 8px 12px;
    background: rgba(73, 213, 156, 0.1);
    border-left: 3px solid #49D59C;
    border-radius: 4px;
    font-size: 0.85rem;
    color: rgba(203, 182, 135, 0.9);
  `;
  helperDiv.innerHTML = `<strong>💡 Tip:</strong> Add, edit, or remove items easily. No coding required!`;
  
  // Initial render
  renderItems();
  
  // Assemble
  container.appendChild(hiddenInput);
  container.appendChild(itemsList);
  container.appendChild(addBtn);
  container.appendChild(helperDiv);
  
  return container;
}

// ------------------- createSimpleMapInput -------------------
// Create user-friendly key-value pair input (no JSON required!)
//
function createSimpleMapInput(fieldName, value) {
  const container = document.createElement('div');
  container.className = 'simple-map-container';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;
  
  // Hidden textarea to store the actual JSON object
  const hiddenInput = document.createElement('textarea');
  hiddenInput.style.display = 'none';
  hiddenInput.name = fieldName;
  hiddenInput.id = `field-${fieldName}`;
  
  // Initialize key-value pairs
  let pairs = {};
  if (value !== undefined && value !== null) {
    if (value instanceof Map) {
      pairs = Object.fromEntries(value);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      pairs = { ...value };
    }
  }
  
  // Update hidden input
  const updateHiddenInput = () => {
    hiddenInput.value = JSON.stringify(pairs);
  };
  updateHiddenInput();
  
  // Pairs list container
  const pairsList = document.createElement('div');
  pairsList.className = 'map-pairs-list';
  pairsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;
  
  // Render all pairs
  const renderPairs = () => {
    pairsList.innerHTML = '';
    
    const keys = Object.keys(pairs);
    if (keys.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No entries yet. Click "Add Entry" below.';
      emptyMsg.style.cssText = 'padding: 12px; color: rgba(203, 182, 135, 0.5); font-style: italic; text-align: center; background: rgba(203, 182, 135, 0.05); border-radius: 6px;';
      pairsList.appendChild(emptyMsg);
      return;
    }
    
    keys.forEach((key) => {
      const pairRow = document.createElement('div');
      pairRow.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr 40px;
        gap: 8px;
        align-items: center;
      `;
      
      // Key input
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.value = key;
      keyInput.placeholder = 'Key';
      keyInput.style.cssText = `
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
        font-weight: 600;
      `;
      
      const oldKey = key;
      keyInput.addEventListener('blur', (e) => {
        const newKey = e.target.value.trim();
        if (newKey && newKey !== oldKey) {
          // Rename key
          const value = pairs[oldKey];
          delete pairs[oldKey];
          pairs[newKey] = value;
          updateHiddenInput();
          renderPairs();
        } else if (!newKey) {
          // If empty, revert
          e.target.value = oldKey;
        }
      });
      
      // Value input
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      const pairValue = pairs[key];
      valueInput.value = typeof pairValue === 'object' ? JSON.stringify(pairValue) : String(pairValue);
      valueInput.placeholder = 'Value';
      valueInput.style.cssText = `
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
      `;
      
      valueInput.addEventListener('input', (e) => {
        // Try to parse as number if it looks like one
        let val = e.target.value;
        if (val && !isNaN(val) && val.trim() !== '') {
          pairs[key] = Number(val);
        } else {
          pairs[key] = val;
        }
        updateHiddenInput();
      });
      
      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove entry';
      removeBtn.style.cssText = `
        width: 32px;
        height: 32px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      `;
      
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.background = '#c82333';
      });
      
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.background = '#dc3545';
      });
      
      removeBtn.addEventListener('click', () => {
        delete pairs[key];
        updateHiddenInput();
        renderPairs();
      });
      
      pairRow.appendChild(keyInput);
      pairRow.appendChild(valueInput);
      pairRow.appendChild(removeBtn);
      pairsList.appendChild(pairRow);
    });
  };
  
  // Add entry button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.innerHTML = '➕ Add Entry';
  addBtn.style.cssText = `
    padding: 10px 16px;
    background: linear-gradient(135deg, #49D59C 0%, #3bae7e 100%);
    color: #1a1410;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  
  addBtn.addEventListener('mouseenter', () => {
    addBtn.style.transform = 'translateY(-2px)';
    addBtn.style.boxShadow = '0 4px 8px rgba(73, 213, 156, 0.3)';
  });
  
  addBtn.addEventListener('mouseleave', () => {
    addBtn.style.transform = 'translateY(0)';
    addBtn.style.boxShadow = 'none';
  });
  
  addBtn.addEventListener('click', () => {
    // Generate unique key
    let newKey = 'newKey';
    let counter = 1;
    while (pairs[newKey]) {
      newKey = `newKey${counter}`;
      counter++;
    }
    pairs[newKey] = '';
    updateHiddenInput();
    renderPairs();
    // Focus on the new key input
    setTimeout(() => {
      const inputs = pairsList.querySelectorAll('input[type="text"]');
      if (inputs.length > 0) {
        inputs[inputs.length - 2].select(); // Select the key input (second to last)
      }
    }, 50);
  });
  
  // Helper text
  const helperDiv = document.createElement('div');
  helperDiv.style.cssText = `
    padding: 8px 12px;
    background: rgba(73, 213, 156, 0.1);
    border-left: 3px solid #49D59C;
    border-radius: 4px;
    font-size: 0.85rem;
    color: rgba(203, 182, 135, 0.9);
  `;
  helperDiv.innerHTML = `<strong>💡 Tip:</strong> Add key-value pairs easily. Numbers are auto-detected. No coding required!`;
  
  // Initial render
  renderPairs();
  
  // Assemble
  container.appendChild(hiddenInput);
  container.appendChild(pairsList);
  container.appendChild(addBtn);
  container.appendChild(helperDiv);
  
  return container;
}

// ------------------- createMapTextarea -------------------
// Create user-friendly Map input (no JSON required!)
//
function createMapTextarea(fieldName, value) {
  return createSimpleMapInput(fieldName, value);
}

// ------------------- createObjectTextarea -------------------
// Create user-friendly Object input (no JSON required!)
//
function createObjectTextarea(fieldName, value, type) {
  const fieldNameLower = fieldName.toLowerCase();
  
  // Special handling for gear fields (gearWeapon, gearShield, gearArmor.head, etc.)
  if (fieldNameLower.includes('gear')) {
    return createGearEditor(fieldName, value);
  }
  
  // Special handling for debuff object (active boolean + endDate)
  if (fieldNameLower === 'debuff') {
    return createDebuffEditor(fieldName, value);
  }
  
  // Special handling for buff object (active, type, effects)
  if (fieldNameLower === 'buff') {
    return createBuffEditor(fieldName, value);
  }
  
  // For Mixed type, use simple textarea since it can be anything
  if (type === 'Mixed' && typeof value !== 'object') {
    const textarea = document.createElement('textarea');
    textarea.rows = 6;
    textarea.placeholder = 'Enter any value - text, number, etc.';
    textarea.value = value !== undefined && value !== null ? String(value) : '';
    return textarea;
  }
  
  // For objects, use key-value pair interface
  return createSimpleMapInput(fieldName, value);
}

// ------------------- createGearEditor -------------------
// Create user-friendly editor for gear items (name + stats map)
//
function createGearEditor(fieldName, value) {
  const container = document.createElement('div');
  container.className = 'gear-editor';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: rgba(203, 182, 135, 0.05);
    border: 1px solid rgba(203, 182, 135, 0.2);
    border-radius: 8px;
  `;
  
  // Hidden textarea to store the actual JSON object
  const hiddenInput = document.createElement('textarea');
  hiddenInput.style.display = 'none';
  hiddenInput.name = fieldName;
  hiddenInput.id = `field-${fieldName}`;
  
  // Initialize gear object
  let gearData = {
    name: '',
    stats: {}
  };
  
  if (value !== undefined && value !== null && typeof value === 'object') {
    gearData.name = value.name || '';
    // Handle stats - could be a Map or plain object
    if (value.stats instanceof Map) {
      gearData.stats = Object.fromEntries(value.stats);
    } else if (typeof value.stats === 'object' && value.stats !== null) {
      gearData.stats = { ...value.stats };
    } else {
      gearData.stats = {};
    }
  }
  
  // Update hidden input
  const updateHiddenInput = () => {
    hiddenInput.value = JSON.stringify(gearData);
  };
  updateHiddenInput();
  
  // Gear name input section
  const nameSection = document.createElement('div');
  nameSection.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;
  
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Gear Name';
  nameLabel.style.cssText = `
    font-weight: 600;
    color: #49D59C;
    font-size: 0.9rem;
  `;
  
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = gearData.name;
  nameInput.placeholder = 'Enter gear name (e.g., Master Sword, Hylian Shield)';
  nameInput.style.cssText = `
    padding: 10px 12px;
    background: rgba(203, 182, 135, 0.05);
    border: 1px solid rgba(203, 182, 135, 0.3);
    border-radius: 6px;
    color: #cbb687;
    font-weight: 600;
  `;
  
  nameInput.addEventListener('input', (e) => {
    gearData.name = e.target.value;
    updateHiddenInput();
  });
  
  nameSection.appendChild(nameLabel);
  nameSection.appendChild(nameInput);
  
  // Stats section
  const statsSection = document.createElement('div');
  statsSection.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;
  
  const statsLabel = document.createElement('label');
  statsLabel.textContent = 'Stats';
  statsLabel.style.cssText = `
    font-weight: 600;
    color: #49D59C;
    font-size: 0.9rem;
  `;
  
  const statsList = document.createElement('div');
  statsList.className = 'gear-stats-list';
  statsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;
  
  // Render stats
  const renderStats = () => {
    statsList.innerHTML = '';
    
    const statKeys = Object.keys(gearData.stats);
    if (statKeys.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No stats. Click "Add Stat" below.';
      emptyMsg.style.cssText = 'padding: 8px; color: rgba(203, 182, 135, 0.5); font-style: italic; text-align: center;';
      statsList.appendChild(emptyMsg);
      return;
    }
    
    statKeys.forEach((statName) => {
      const statRow = document.createElement('div');
      statRow.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 100px 40px;
        gap: 8px;
        align-items: center;
      `;
      
      // Stat name input
      const statNameInput = document.createElement('input');
      statNameInput.type = 'text';
      statNameInput.value = statName;
      statNameInput.placeholder = 'Stat name (e.g., attack, defense)';
      statNameInput.style.cssText = `
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
      `;
      
      const oldStatName = statName;
      statNameInput.addEventListener('blur', (e) => {
        const newStatName = e.target.value.trim();
        if (newStatName && newStatName !== oldStatName) {
          // Rename stat
          const statValue = gearData.stats[oldStatName];
          delete gearData.stats[oldStatName];
          gearData.stats[newStatName] = statValue;
          updateHiddenInput();
          renderStats();
        } else if (!newStatName) {
          // If empty, revert
          e.target.value = oldStatName;
        }
      });
      
      // Stat value input
      const statValueInput = document.createElement('input');
      statValueInput.type = 'number';
      statValueInput.value = gearData.stats[statName];
      statValueInput.placeholder = 'Value';
      statValueInput.style.cssText = `
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
        text-align: center;
        font-weight: 600;
      `;
      
      statValueInput.addEventListener('input', (e) => {
        gearData.stats[statName] = parseInt(e.target.value) || 0;
        updateHiddenInput();
      });
      
      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove stat';
      removeBtn.style.cssText = `
        width: 32px;
        height: 32px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      `;
      
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.background = '#c82333';
      });
      
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.background = '#dc3545';
      });
      
      removeBtn.addEventListener('click', () => {
        delete gearData.stats[statName];
        updateHiddenInput();
        renderStats();
      });
      
      statRow.appendChild(statNameInput);
      statRow.appendChild(statValueInput);
      statRow.appendChild(removeBtn);
      statsList.appendChild(statRow);
    });
  };
  
  // Add stat button
  const addStatBtn = document.createElement('button');
  addStatBtn.type = 'button';
  addStatBtn.innerHTML = '➕ Add Stat';
  addStatBtn.style.cssText = `
    padding: 8px 12px;
    background: linear-gradient(135deg, #49D59C 0%, #3bae7e 100%);
    color: #1a1410;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  
  addStatBtn.addEventListener('mouseenter', () => {
    addStatBtn.style.transform = 'translateY(-2px)';
    addStatBtn.style.boxShadow = '0 4px 8px rgba(73, 213, 156, 0.3)';
  });
  
  addStatBtn.addEventListener('mouseleave', () => {
    addStatBtn.style.transform = 'translateY(0)';
    addStatBtn.style.boxShadow = 'none';
  });
  
  addStatBtn.addEventListener('click', () => {
    // Generate unique stat name
    let newStatName = 'newStat';
    let counter = 1;
    while (gearData.stats[newStatName]) {
      newStatName = `newStat${counter}`;
      counter++;
    }
    gearData.stats[newStatName] = 0;
    updateHiddenInput();
    renderStats();
    // Focus on the new stat name input
    setTimeout(() => {
      const inputs = statsList.querySelectorAll('input[type="text"]');
      if (inputs.length > 0) {
        inputs[inputs.length - 1].select();
      }
    }, 50);
  });
  
  statsSection.appendChild(statsLabel);
  statsSection.appendChild(statsList);
  statsSection.appendChild(addStatBtn);
  
  // Helper text
  const helperDiv = document.createElement('div');
  helperDiv.style.cssText = `
    padding: 8px 12px;
    background: rgba(73, 213, 156, 0.1);
    border-left: 3px solid #49D59C;
    border-radius: 4px;
    font-size: 0.85rem;
    color: rgba(203, 182, 135, 0.9);
  `;
  helperDiv.innerHTML = `<strong>💡 Tip:</strong> Enter gear name and add stats (e.g., attack: 10, defense: 5). No coding required!`;
  
  // Initial render
  renderStats();
  
  // Assemble
  container.appendChild(hiddenInput);
  container.appendChild(nameSection);
  container.appendChild(statsSection);
  container.appendChild(helperDiv);
  
  return container;
}

// ------------------- createDebuffEditor -------------------
// Create user-friendly editor for debuff object (active + endDate)
//
function createDebuffEditor(fieldName, value) {
  const container = document.createElement('div');
  container.className = 'debuff-editor';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: rgba(220, 53, 69, 0.05);
    border: 1px solid rgba(220, 53, 69, 0.3);
    border-radius: 8px;
  `;
  
  // Hidden textarea to store the actual JSON object
  const hiddenInput = document.createElement('textarea');
  hiddenInput.style.display = 'none';
  hiddenInput.name = fieldName;
  hiddenInput.id = `field-${fieldName}`;
  
  // Initialize debuff object
  let debuffData = {
    active: false,
    endDate: null
  };
  
  if (value !== undefined && value !== null && typeof value === 'object') {
    debuffData.active = value.active || false;
    debuffData.endDate = value.endDate || null;
  }
  
  // Update hidden input
  const updateHiddenInput = () => {
    hiddenInput.value = JSON.stringify(debuffData);
  };
  updateHiddenInput();
  
  // Active checkbox section
  const activeSection = document.createElement('div');
  activeSection.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  
  const activeCheckbox = document.createElement('input');
  activeCheckbox.type = 'checkbox';
  activeCheckbox.checked = debuffData.active;
  activeCheckbox.style.cssText = `
    width: 20px;
    height: 20px;
    cursor: pointer;
  `;
  
  activeCheckbox.addEventListener('change', (e) => {
    debuffData.active = e.target.checked;
    updateHiddenInput();
  });
  
  const activeLabel = document.createElement('label');
  activeLabel.textContent = 'Debuff Active';
  activeLabel.style.cssText = `
    font-weight: 600;
    color: #dc3545;
    font-size: 1rem;
  `;
  
  activeSection.appendChild(activeCheckbox);
  activeSection.appendChild(activeLabel);
  
  // End date section
  const endDateSection = document.createElement('div');
  endDateSection.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;
  
  const endDateLabel = document.createElement('label');
  endDateLabel.textContent = 'End Date';
  endDateLabel.style.cssText = `
    font-weight: 600;
    color: #dc3545;
    font-size: 0.9rem;
  `;
  
  const endDateInput = document.createElement('input');
  endDateInput.type = 'datetime-local';
  if (debuffData.endDate) {
    const date = new Date(debuffData.endDate);
    endDateInput.value = date.toISOString().slice(0, 16);
  }
  endDateInput.style.cssText = `
    padding: 10px 12px;
    background: rgba(203, 182, 135, 0.05);
    border: 1px solid rgba(220, 53, 69, 0.3);
    border-radius: 6px;
    color: #cbb687;
    font-weight: 600;
  `;
  
  endDateInput.addEventListener('change', (e) => {
    debuffData.endDate = e.target.value ? new Date(e.target.value).toISOString() : null;
    updateHiddenInput();
  });
  
  endDateSection.appendChild(endDateLabel);
  endDateSection.appendChild(endDateInput);
  
  // Assemble
  container.appendChild(hiddenInput);
  container.appendChild(activeSection);
  container.appendChild(endDateSection);
  
  return container;
}

// ------------------- createBuffEditor -------------------
// Create user-friendly editor for buff object (active, type, effects)
//
function createBuffEditor(fieldName, value) {
  const container = document.createElement('div');
  container.className = 'buff-editor';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: rgba(73, 213, 156, 0.05);
    border: 1px solid rgba(73, 213, 156, 0.3);
    border-radius: 8px;
  `;
  
  // Hidden textarea to store the actual JSON object
  const hiddenInput = document.createElement('textarea');
  hiddenInput.style.display = 'none';
  hiddenInput.name = fieldName;
  hiddenInput.id = `field-${fieldName}`;
  
  // Initialize buff object
  let buffData = {
    active: false,
    type: null,
    effects: {
      blightResistance: 0,
      electricResistance: 0,
      staminaBoost: 0,
      staminaRecovery: 0,
      fireResistance: 0,
      speedBoost: 0,
      extraHearts: 0,
      attackBoost: 0,
      stealthBoost: 0,
      coldResistance: 0,
      defenseBoost: 0
    }
  };
  
  if (value !== undefined && value !== null && typeof value === 'object') {
    buffData.active = value.active || false;
    buffData.type = value.type || null;
    if (value.effects && typeof value.effects === 'object') {
      buffData.effects = { ...buffData.effects, ...value.effects };
    }
  }
  
  // Update hidden input
  const updateHiddenInput = () => {
    hiddenInput.value = JSON.stringify(buffData);
  };
  updateHiddenInput();
  
  // Active checkbox section
  const activeSection = document.createElement('div');
  activeSection.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  
  const activeCheckbox = document.createElement('input');
  activeCheckbox.type = 'checkbox';
  activeCheckbox.checked = buffData.active;
  activeCheckbox.style.cssText = `
    width: 20px;
    height: 20px;
    cursor: pointer;
  `;
  
  activeCheckbox.addEventListener('change', (e) => {
    buffData.active = e.target.checked;
    updateHiddenInput();
  });
  
  const activeLabel = document.createElement('label');
  activeLabel.textContent = 'Buff Active';
  activeLabel.style.cssText = `
    font-weight: 600;
    color: #49D59C;
    font-size: 1rem;
  `;
  
  activeSection.appendChild(activeCheckbox);
  activeSection.appendChild(activeLabel);
  
  // Buff type dropdown
  const typeSection = document.createElement('div');
  typeSection.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;
  
  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'Buff Type';
  typeLabel.style.cssText = `
    font-weight: 600;
    color: #49D59C;
    font-size: 0.9rem;
  `;
  
  const typeSelect = document.createElement('select');
  typeSelect.innerHTML = `
    <option value="">-- Select Buff Type --</option>
    <option value="chilly" ${buffData.type === 'chilly' ? 'selected' : ''}>Chilly (Blight Resistance)</option>
    <option value="electro" ${buffData.type === 'electro' ? 'selected' : ''}>Electro (Electric Resistance)</option>
    <option value="enduring" ${buffData.type === 'enduring' ? 'selected' : ''}>Enduring (Stamina Boost)</option>
    <option value="energizing" ${buffData.type === 'energizing' ? 'selected' : ''}>Energizing (Stamina Recovery)</option>
    <option value="fireproof" ${buffData.type === 'fireproof' ? 'selected' : ''}>Fireproof (Fire Resistance)</option>
    <option value="hasty" ${buffData.type === 'hasty' ? 'selected' : ''}>Hasty (Speed Boost)</option>
    <option value="hearty" ${buffData.type === 'hearty' ? 'selected' : ''}>Hearty (Extra Hearts)</option>
    <option value="mighty" ${buffData.type === 'mighty' ? 'selected' : ''}>Mighty (Attack Boost)</option>
    <option value="sneaky" ${buffData.type === 'sneaky' ? 'selected' : ''}>Sneaky (Stealth Boost)</option>
    <option value="spicy" ${buffData.type === 'spicy' ? 'selected' : ''}>Spicy (Cold Resistance)</option>
    <option value="tough" ${buffData.type === 'tough' ? 'selected' : ''}>Tough (Defense Boost)</option>
  `;
  typeSelect.style.cssText = `
    padding: 10px 12px;
    background: rgba(203, 182, 135, 0.05);
    border: 1px solid rgba(73, 213, 156, 0.3);
    border-radius: 6px;
    color: #cbb687;
    font-weight: 600;
  `;
  
  typeSelect.addEventListener('change', (e) => {
    buffData.type = e.target.value || null;
    updateHiddenInput();
  });
  
  typeSection.appendChild(typeLabel);
  typeSection.appendChild(typeSelect);
  
  // Effects note
  const effectsNote = document.createElement('div');
  effectsNote.style.cssText = `
    padding: 8px 12px;
    background: rgba(73, 213, 156, 0.1);
    border-left: 3px solid #49D59C;
    border-radius: 4px;
    font-size: 0.85rem;
    color: rgba(203, 182, 135, 0.9);
  `;
  effectsNote.innerHTML = `<strong>💡 Note:</strong> Buff effects are stored in the effects object. Use the simple map input below if you need to modify individual effect values.`;
  
  // Assemble
  container.appendChild(hiddenInput);
  container.appendChild(activeSection);
  container.appendChild(typeSection);
  container.appendChild(effectsNote);
  
  return container;
}

// ------------------- createImageInput -------------------
// Create URL input with image preview for image fields
//
function createImageInput(value) {
  const container = document.createElement('div');
  
  const input = document.createElement('input');
  input.type = 'url';
  input.value = value !== undefined && value !== null ? value : '';
  input.placeholder = 'Enter image URL...';
  input.style.marginBottom = '0.5rem';
  
  if (value && value !== '' && value !== 'No Image') {
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    
    const img = document.createElement('img');
    img.src = value;
    img.alt = 'Image preview';
    img.onerror = () => {
      preview.innerHTML = `<a href="${value}" target="_blank" class="image-link">${value}</a>`;
    };
    
    const link = document.createElement('a');
    link.href = value;
    link.target = '_blank';
    link.className = 'image-link';
    link.textContent = value;
    
    preview.appendChild(img);
    preview.appendChild(link);
    container.appendChild(preview);
  }
  
  container.appendChild(input);
  return container;
}

// ------------------- getDistinctValuesFromDatabase -------------------
// Fetch distinct values for a field from the database
//
async function getDistinctValuesFromDatabase(modelName, fieldName) {
  try {
    const response = await fetchAPI(`/api/admin/db/${modelName}?limit=5000`);
    if (response.ok) {
      const data = await response.json();
      const values = new Set();
      
      data.records.forEach(record => {
        const value = record[fieldName];
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            // If it's an array, add each item
            value.forEach(v => values.add(v));
          } else if (typeof value === 'string') {
            values.add(value);
          }
        }
      });
      
      return Array.from(values).sort();
    }
  } catch (error) {
    console.error(`[databaseEditor.js]: Failed to fetch distinct values for ${fieldName}:`, error);
  }
  return [];
}

// ------------------- getAutocompleteSourceModel -------------------
// Determine which model to fetch autocomplete data from
//
function getAutocompleteSourceModel(currentModel, fieldName) {
  const fieldLower = fieldName.toLowerCase();
  
  // Special cases: fetch from specific models regardless of current model
  const specialSources = {
    'npcname': 'HelpWantedQuest',  // Always fetch NPCs from Help Wanted Quests
    'crafting': 'HelpWantedQuest',  // Always fetch crafting from Help Wanted Quests
    'modowner': 'ModCharacter',     // Always fetch mod owners from ModCharacter
    'modtitle': 'ModCharacter',     // Always fetch mod titles from ModCharacter
    'modtype': 'ModCharacter'       // Always fetch mod types from ModCharacter
  };
  
  // Check if this field has a special source
  for (const [field, sourceModel] of Object.entries(specialSources)) {
    if (fieldLower.includes(field)) {
      return sourceModel;
    }
  }
  
  // Job fields should fetch from Character (most complete job list)
  if (fieldLower === 'job' || fieldLower === 'jobvoucherjob') {
    return 'Character';
  }
  
  // For ModCharacter fields, always fetch from ModCharacter
  if (currentModel === 'ModCharacter') {
    const modCharacterFields = ['pronouns', 'race', 'homevillage', 'currentvillage', 'vendortype'];
    if (modCharacterFields.some(f => fieldLower.includes(f))) {
      return 'ModCharacter';
    }
  }
  
  // Default: use current model
  return currentModel;
}

// ------------------- shouldUseAutocomplete -------------------
// Determine if a field should use autocomplete dropdown
//
function shouldUseAutocomplete(fieldName, fieldType) {
  const fieldLower = fieldName.toLowerCase();
  
  // String fields that commonly need autocomplete
  const autocompleteFields = [
    'job', 'village', 'species', 'race',
    'homevillage', 'currentvillage', 'vendortype', 'region',
    'npcname', 'category', 'type', 'crafting',
    'pronouns', 'modtitle', 'modtype', 'modowner',
    'jobvoucherjob'
  ];
  
  return fieldType === 'String' && autocompleteFields.some(f => fieldLower.includes(f));
}

// ------------------- shouldUseMultiSelect -------------------
// Determine if an array field should use multi-select dropdown
//
function shouldUseMultiSelect(fieldName) {
  const fieldLower = fieldName.toLowerCase();
  
  // Array fields that should use multi-select dropdowns
  const multiSelectFields = [
    'category', 'type', 'subtype', 'recipetag', 'obtain', 'obtaintags',
    'gatheringtags', 'lootingtags', 'craftingtags', 'locations',
    'locationstags', 'alljobs', 'allJobstags'
  ];
  
  return multiSelectFields.some(f => fieldLower.includes(f));
}

// ------------------- createAutocompleteInput -------------------
// Create autocomplete input for common fields
//
async function createAutocompleteInput(fieldName, value, modelName) {
  const container = document.createElement('div');
  container.style.position = 'relative';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value !== undefined && value !== null ? value : '';
  input.placeholder = `Enter or select ${getFieldDisplayName(fieldName)}...`;
  input.autocomplete = 'off';
  input.style.cssText = `
    padding-right: 30px;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="%23cbb687"><path d="M7 7l3-3 3 3m0 6l-3 3-3-3"/></svg>');
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 16px;
  `;
  
  const dropdown = document.createElement('div');
  dropdown.className = 'autocomplete-dropdown';
  dropdown.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 200px;
    overflow-y: auto;
    background: #1a1410;
    border: 1px solid #cbb687;
    border-radius: 6px;
    margin-top: 4px;
    z-index: 1000;
    display: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  
  // Fetch suggestions based on field
  let suggestions = [];
  const loadingIndicator = document.createElement('div');
  loadingIndicator.textContent = 'Loading suggestions...';
  loadingIndicator.style.cssText = 'padding: 8px; color: rgba(203, 182, 135, 0.6); font-size: 0.85rem;';
  
  // Show loading while fetching
  dropdown.appendChild(loadingIndicator);
  dropdown.style.display = 'block';
  container.appendChild(input);
  container.appendChild(dropdown);
  
  // Fetch suggestions in background - determine which model to fetch from
  const sourceModel = getAutocompleteSourceModel(modelName, fieldName);
  suggestions = await getDistinctValuesFromDatabase(sourceModel, fieldName);
  dropdown.innerHTML = '';
  dropdown.style.display = 'none';
  
  const filterSuggestions = (searchTerm) => {
    if (!searchTerm) return suggestions.slice(0, 50);
    const term = searchTerm.toLowerCase();
    return suggestions
      .filter(s => s.toLowerCase().includes(term))
      .slice(0, 50);
  };
  
  const renderDropdown = (items) => {
    dropdown.innerHTML = '';
    
    if (items.length === 0) {
      dropdown.innerHTML = '<div style="padding: 8px; color: rgba(203, 182, 135, 0.6); font-style: italic;">No suggestions (you can type freely)</div>';
      dropdown.style.display = 'block';
      return;
    }
    
    items.forEach(item => {
      const option = document.createElement('div');
      option.textContent = item;
      option.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        transition: background 0.2s;
        color: #cbb687;
        font-size: 0.9rem;
      `;
      
      option.addEventListener('mouseenter', () => {
        option.style.background = 'rgba(203, 182, 135, 0.2)';
      });
      
      option.addEventListener('mouseleave', () => {
        option.style.background = 'transparent';
      });
      
      option.addEventListener('click', () => {
        input.value = item;
        dropdown.style.display = 'none';
      });
      
      dropdown.appendChild(option);
    });
    
    dropdown.style.display = 'block';
  };
  
  input.addEventListener('input', (e) => {
    const results = filterSuggestions(e.target.value);
    if (e.target.value.trim()) {
      renderDropdown(results);
    } else {
      dropdown.style.display = 'none';
    }
  });
  
  input.addEventListener('focus', () => {
    if (suggestions.length > 0) {
      // Show all suggestions on focus, regardless of current value
      renderDropdown(suggestions.slice(0, 50));
    }
  });
  
  // Also show dropdown on click
  input.addEventListener('click', () => {
    if (suggestions.length > 0) {
      renderDropdown(suggestions.slice(0, 50));
    }
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  
  return container;
}

// ------------------- createMultiSelectDropdown -------------------
// Create multi-select dropdown for array fields (idiot-proof!)
//
async function createMultiSelectDropdown(fieldName, value) {
  const container = document.createElement('div');
  container.className = 'multi-select-container';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
  
  // Hidden input to store the actual array value
  const hiddenInput = document.createElement('textarea');
  hiddenInput.style.display = 'none';
  hiddenInput.name = fieldName;
  hiddenInput.id = `field-${fieldName}`;
  
  // Initialize selected items
  let selectedItems = [];
  if (value !== undefined && value !== null && Array.isArray(value)) {
    selectedItems = [...value];
  }
  
  // Update hidden input value
  const updateHiddenInput = () => {
    hiddenInput.value = JSON.stringify(selectedItems);
  };
  updateHiddenInput();
  
  // Container for selected items (chips)
  const selectedContainer = document.createElement('div');
  selectedContainer.className = 'selected-items-chips';
  selectedContainer.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
    background: rgba(203, 182, 135, 0.05);
    border: 1px solid rgba(203, 182, 135, 0.2);
    border-radius: 6px;
    min-height: 50px;
  `;
  
  // Function to render selected items as chips
  const renderSelectedChips = () => {
    selectedContainer.innerHTML = '';
    if (selectedItems.length === 0) {
      selectedContainer.innerHTML = '<span style="color: rgba(203, 182, 135, 0.5); font-style: italic;">No items selected</span>';
      return;
    }
    
    selectedItems.forEach(item => {
      const chip = document.createElement('div');
      chip.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: linear-gradient(135deg, #cbb687 0%, #a89968 100%);
        color: #1a1410;
        border-radius: 16px;
        font-size: 0.85rem;
        font-weight: 600;
      `;
      
      chip.innerHTML = `
        <span>${item}</span>
        <button type="button" style="
          background: none;
          border: none;
          color: #1a1410;
          cursor: pointer;
          padding: 0;
          font-size: 1rem;
          opacity: 0.7;
        " title="Remove ${item}">×</button>
      `;
      
      const removeBtn = chip.querySelector('button');
      removeBtn.addEventListener('click', () => {
        selectedItems = selectedItems.filter(i => i !== item);
        updateHiddenInput();
        renderSelectedChips();
        renderCheckboxes();
      });
      
      selectedContainer.appendChild(chip);
    });
  };
  
  // Dropdown container
  const dropdownContainer = document.createElement('div');
  dropdownContainer.style.position = 'relative';
  
  // Button to toggle dropdown
  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.textContent = `Select ${getFieldDisplayName(fieldName)}...`;
  toggleButton.style.cssText = `
    width: 100%;
    padding: 10px 12px;
    background: rgba(203, 182, 135, 0.1);
    border: 1px solid rgba(203, 182, 135, 0.3);
    border-radius: 6px;
    color: #cbb687;
    cursor: pointer;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: all 0.2s;
  `;
  toggleButton.innerHTML = `
    <span>Select ${getFieldDisplayName(fieldName)}...</span>
    <span style="font-size: 0.8rem;">▼</span>
  `;
  
  toggleButton.addEventListener('mouseenter', () => {
    toggleButton.style.background = 'rgba(203, 182, 135, 0.15)';
  });
  
  toggleButton.addEventListener('mouseleave', () => {
    toggleButton.style.background = 'rgba(203, 182, 135, 0.1)';
  });
  
  // Dropdown panel
  const dropdown = document.createElement('div');
  dropdown.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 300px;
    overflow-y: auto;
    background: #1a1410;
    border: 1px solid #cbb687;
    border-radius: 6px;
    margin-top: 4px;
    z-index: 1000;
    display: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  
  let isOpen = false;
  toggleButton.addEventListener('click', () => {
    isOpen = !isOpen;
    dropdown.style.display = isOpen ? 'block' : 'none';
    toggleButton.querySelector('span:last-child').textContent = isOpen ? '▲' : '▼';
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdownContainer.contains(e.target)) {
      isOpen = false;
      dropdown.style.display = 'none';
      toggleButton.querySelector('span:last-child').textContent = '▼';
    }
  });
  
  // Fetch available options
  let availableOptions = [];
  const loadingMsg = document.createElement('div');
  loadingMsg.textContent = 'Loading options...';
  loadingMsg.style.cssText = 'padding: 10px; color: rgba(203, 182, 135, 0.6); font-style: italic;';
  dropdown.appendChild(loadingMsg);
  
  try {
    availableOptions = await getDistinctValuesFromDatabase(currentModel, fieldName);
    dropdown.innerHTML = '';
  } catch (error) {
    console.error('[databaseEditor.js]: Failed to fetch options:', error);
    dropdown.innerHTML = '<div style="padding: 10px; color: #ff6b6b;">Failed to load options</div>';
  }
  
  // Search box in dropdown
  const searchBox = document.createElement('input');
  searchBox.type = 'text';
  searchBox.placeholder = 'Search options...';
  searchBox.style.cssText = `
    width: calc(100% - 24px);
    margin: 8px 8px 4px 8px;
    padding: 8px;
    background: rgba(203, 182, 135, 0.1);
    border: 1px solid rgba(203, 182, 135, 0.3);
    border-radius: 4px;
    color: #cbb687;
    font-size: 0.9rem;
    position: sticky;
    top: 0;
  `;
  
  // Checkbox list container
  const checkboxList = document.createElement('div');
  checkboxList.style.cssText = `
    padding: 4px 8px 8px 8px;
  `;
  
  const renderCheckboxes = (filter = '') => {
    checkboxList.innerHTML = '';
    const filteredOptions = availableOptions.filter(opt => 
      opt.toLowerCase().includes(filter.toLowerCase())
    );
    
    if (filteredOptions.length === 0) {
      checkboxList.innerHTML = '<div style="padding: 8px; color: rgba(203, 182, 135, 0.6); font-style: italic;">No options found</div>';
      return;
    }
    
    filteredOptions.forEach(option => {
      const label = document.createElement('label');
      label.style.cssText = `
        display: flex;
        align-items: center;
        padding: 8px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.2s;
        color: #cbb687;
      `;
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedItems.includes(option);
      checkbox.style.cssText = `
        margin-right: 8px;
        cursor: pointer;
        width: 16px;
        height: 16px;
      `;
      
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (!selectedItems.includes(option)) {
            selectedItems.push(option);
          }
        } else {
          selectedItems = selectedItems.filter(i => i !== option);
        }
        updateHiddenInput();
        renderSelectedChips();
      });
      
      label.addEventListener('mouseenter', () => {
        label.style.background = 'rgba(203, 182, 135, 0.1)';
      });
      
      label.addEventListener('mouseleave', () => {
        label.style.background = 'transparent';
      });
      
      const text = document.createElement('span');
      text.textContent = option;
      
      label.appendChild(checkbox);
      label.appendChild(text);
      checkboxList.appendChild(label);
    });
  };
  
  searchBox.addEventListener('input', (e) => {
    renderCheckboxes(e.target.value);
  });
  
  dropdown.appendChild(searchBox);
  dropdown.appendChild(checkboxList);
  renderCheckboxes();
  
  // Add "Add Custom" button
  const customInputContainer = document.createElement('div');
  customInputContainer.style.cssText = `
    padding: 8px;
    border-top: 1px solid rgba(203, 182, 135, 0.2);
    display: none;
  `;
  
  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.placeholder = 'Enter custom value...';
  customInput.style.cssText = `
    width: calc(100% - 70px);
    padding: 6px;
    background: rgba(203, 182, 135, 0.1);
    border: 1px solid rgba(203, 182, 135, 0.3);
    border-radius: 4px;
    color: #cbb687;
    font-size: 0.9rem;
  `;
  
  const addCustomBtn = document.createElement('button');
  addCustomBtn.type = 'button';
  addCustomBtn.textContent = 'Add';
  addCustomBtn.style.cssText = `
    padding: 6px 12px;
    margin-left: 6px;
    background: #cbb687;
    color: #1a1410;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
  `;
  
  addCustomBtn.addEventListener('click', () => {
    const value = customInput.value.trim();
    if (value && !selectedItems.includes(value)) {
      selectedItems.push(value);
      if (!availableOptions.includes(value)) {
        availableOptions.push(value);
        availableOptions.sort();
      }
      updateHiddenInput();
      renderSelectedChips();
      renderCheckboxes();
      customInput.value = '';
      customInputContainer.style.display = 'none';
    }
  });
  
  customInputContainer.appendChild(customInput);
  customInputContainer.appendChild(addCustomBtn);
  
  const toggleCustomBtn = document.createElement('button');
  toggleCustomBtn.type = 'button';
  toggleCustomBtn.textContent = '+ Add Custom Value';
  toggleCustomBtn.style.cssText = `
    width: calc(100% - 16px);
    margin: 4px 8px 8px 8px;
    padding: 8px;
    background: rgba(73, 213, 156, 0.1);
    border: 1px solid rgba(73, 213, 156, 0.3);
    border-radius: 4px;
    color: #49D59C;
    cursor: pointer;
    font-size: 0.85rem;
    text-align: center;
  `;
  
  toggleCustomBtn.addEventListener('click', () => {
    customInputContainer.style.display = customInputContainer.style.display === 'none' ? 'flex' : 'none';
    if (customInputContainer.style.display !== 'none') {
      customInput.focus();
    }
  });
  
  dropdown.appendChild(toggleCustomBtn);
  dropdown.appendChild(customInputContainer);
  
  // Helper text
  const helperDiv = document.createElement('div');
  helperDiv.style.cssText = `
    padding: 10px;
    background: rgba(73, 213, 156, 0.1);
    border-left: 3px solid #49D59C;
    border-radius: 4px;
    font-size: 0.85rem;
    color: #cbb687;
  `;
  helperDiv.innerHTML = `
    <strong>💡 Easy Selection:</strong> Click the button above to select from existing values. Check the boxes for items you want. Click × on any chip to remove it.
  `;
  
  // Initial render
  renderSelectedChips();
  
  // Assemble everything
  dropdownContainer.appendChild(toggleButton);
  dropdownContainer.appendChild(dropdown);
  
  container.appendChild(hiddenInput);
  container.appendChild(selectedContainer);
  container.appendChild(dropdownContainer);
  container.appendChild(helperDiv);
  
  return container;
}

// ------------------- createCraftingMaterialEditor -------------------
// Create user-friendly editor for crafting materials (itemName + quantity)
//
async function createCraftingMaterialEditor(fieldName, value) {
  const container = document.createElement('div');
  container.className = 'crafting-material-editor';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
  
  // Hidden textarea to store the actual JSON array
  const hiddenInput = document.createElement('textarea');
  hiddenInput.style.display = 'none';
  hiddenInput.name = fieldName;
  hiddenInput.id = `field-${fieldName}`;
  
  // Initialize materials array
  let materials = [];
  if (value !== undefined && value !== null && Array.isArray(value)) {
    materials = value.map(m => ({
      _id: m._id || null,
      itemName: m.itemName || '',
      quantity: m.quantity || 1
    }));
  }
  
  // Update hidden input
  const updateHiddenInput = () => {
    hiddenInput.value = JSON.stringify(materials);
  };
  updateHiddenInput();
  
  // Materials list container
  const materialsList = document.createElement('div');
  materialsList.className = 'materials-list';
  materialsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;
  
  // Fetch all items from database for autocomplete
  let allItems = [];
  let allItemsMap = new Map(); // Map itemName -> _id
  
  const loadingMsg = document.createElement('div');
  loadingMsg.textContent = 'Loading items from database...';
  loadingMsg.style.cssText = 'padding: 10px; color: rgba(203, 182, 135, 0.6); font-style: italic;';
  container.appendChild(loadingMsg);
  
  try {
    const response = await fetchAPI('/api/admin/db/Item?limit=5000');
    if (response.ok) {
      const data = await response.json();
      allItems = data.records.map(r => r.itemName).filter(Boolean).sort();
      data.records.forEach(r => {
        if (r.itemName) {
          allItemsMap.set(r.itemName, r._id);
        }
      });
      loadingMsg.remove();
    } else {
      loadingMsg.textContent = 'Failed to load items. You can still enter manually.';
      loadingMsg.style.color = '#ff6b6b';
    }
  } catch (error) {
    console.error('[databaseEditor.js]: Failed to fetch items:', error);
    loadingMsg.textContent = 'Error loading items. You can still enter manually.';
    loadingMsg.style.color = '#ff6b6b';
  }
  
  // Render all materials
  const renderMaterials = () => {
    materialsList.innerHTML = '';
    
    if (materials.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No crafting materials. Click "Add Material" below.';
      emptyMsg.style.cssText = 'padding: 12px; color: rgba(203, 182, 135, 0.5); font-style: italic; text-align: center; background: rgba(203, 182, 135, 0.05); border-radius: 6px;';
      materialsList.appendChild(emptyMsg);
      return;
    }
    
    materials.forEach((material, index) => {
      const materialRow = document.createElement('div');
      materialRow.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 120px 40px;
        gap: 8px;
        align-items: center;
        padding: 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.2);
        border-radius: 6px;
      `;
      
      // Item name input with autocomplete
      const itemNameContainer = document.createElement('div');
      itemNameContainer.style.position = 'relative';
      
      const itemNameInput = document.createElement('input');
      itemNameInput.type = 'text';
      itemNameInput.value = material.itemName;
      itemNameInput.placeholder = 'Item Name';
      itemNameInput.autocomplete = 'off';
      itemNameInput.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
        font-weight: 600;
      `;
      
      // Dropdown for autocomplete
      const dropdown = document.createElement('div');
      dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 200px;
        overflow-y: auto;
        background: #1a1410;
        border: 1px solid #cbb687;
        border-radius: 6px;
        margin-top: 4px;
        z-index: 1000;
        display: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `;
      
      const filterItems = (searchTerm) => {
        if (!searchTerm) return allItems.slice(0, 50);
        const term = searchTerm.toLowerCase();
        return allItems.filter(item => item.toLowerCase().includes(term)).slice(0, 50);
      };
      
      const renderDropdown = (items) => {
        dropdown.innerHTML = '';
        if (items.length === 0) {
          dropdown.innerHTML = '<div style="padding: 8px; color: rgba(203, 182, 135, 0.6); font-style: italic;">No items found</div>';
          dropdown.style.display = 'block';
          return;
        }
        
        items.forEach(item => {
          const option = document.createElement('div');
          option.textContent = item;
          option.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            transition: background 0.2s;
            color: #cbb687;
          `;
          
          option.addEventListener('mouseenter', () => {
            option.style.background = 'rgba(203, 182, 135, 0.2)';
          });
          
          option.addEventListener('mouseleave', () => {
            option.style.background = 'transparent';
          });
          
          option.addEventListener('click', () => {
            materials[index].itemName = item;
            materials[index]._id = allItemsMap.get(item) || null;
            itemNameInput.value = item;
            dropdown.style.display = 'none';
            updateHiddenInput();
          });
          
          dropdown.appendChild(option);
        });
        
        dropdown.style.display = 'block';
      };
      
      // Track if click listener is attached
      let clickListenerAttached = false;
      
      // Close dropdown when clicking outside
      const closeDropdownHandler = (e) => {
        if (!itemNameContainer.contains(e.target)) {
          dropdown.style.display = 'none';
          document.removeEventListener('click', closeDropdownHandler);
          clickListenerAttached = false;
        }
      };
      
      // Show dropdown and attach click listener after a delay
      const showDropdown = (items) => {
        renderDropdown(items);
        // Wait 100ms before attaching the global click listener
        // This ensures the current click event has fully completed
        if (!clickListenerAttached) {
          setTimeout(() => {
            document.addEventListener('click', closeDropdownHandler);
            clickListenerAttached = true;
          }, 100);
        }
      };
      
      itemNameInput.addEventListener('input', (e) => {
        materials[index].itemName = e.target.value;
        updateHiddenInput();
        const results = filterItems(e.target.value);
        if (e.target.value.trim()) {
          showDropdown(results);
        } else {
          dropdown.style.display = 'none';
          if (clickListenerAttached) {
            document.removeEventListener('click', closeDropdownHandler);
            clickListenerAttached = false;
          }
        }
      });
      
      // Only show on click, not on focus (to avoid conflicts)
      itemNameInput.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (dropdown.style.display === 'block') {
          dropdown.style.display = 'none';
          if (clickListenerAttached) {
            document.removeEventListener('click', closeDropdownHandler);
            clickListenerAttached = false;
          }
        } else if (allItems.length > 0) {
          showDropdown(allItems.slice(0, 50));
        }
      });
      
      itemNameContainer.appendChild(itemNameInput);
      itemNameContainer.appendChild(dropdown);
      
      // Quantity input
      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.value = material.quantity;
      quantityInput.min = '1';
      quantityInput.placeholder = 'Qty';
      quantityInput.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
        text-align: center;
        font-weight: 600;
      `;
      
      quantityInput.addEventListener('input', (e) => {
        materials[index].quantity = parseInt(e.target.value) || 1;
        updateHiddenInput();
      });
      
      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove material';
      removeBtn.style.cssText = `
        width: 32px;
        height: 32px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      `;
      
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.background = '#c82333';
      });
      
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.background = '#dc3545';
      });
      
      removeBtn.addEventListener('click', () => {
        materials.splice(index, 1);
        updateHiddenInput();
        renderMaterials();
      });
      
      materialRow.appendChild(itemNameContainer);
      materialRow.appendChild(quantityInput);
      materialRow.appendChild(removeBtn);
      materialsList.appendChild(materialRow);
    });
  };
  
  // Add material button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.innerHTML = '➕ Add Material';
  addBtn.style.cssText = `
    padding: 10px 16px;
    background: linear-gradient(135deg, #49D59C 0%, #3bae7e 100%);
    color: #1a1410;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  
  addBtn.addEventListener('mouseenter', () => {
    addBtn.style.transform = 'translateY(-2px)';
    addBtn.style.boxShadow = '0 4px 8px rgba(73, 213, 156, 0.3)';
  });
  
  addBtn.addEventListener('mouseleave', () => {
    addBtn.style.transform = 'translateY(0)';
    addBtn.style.boxShadow = 'none';
  });
  
  addBtn.addEventListener('click', () => {
    materials.push({ _id: null, itemName: '', quantity: 1 });
    updateHiddenInput();
    renderMaterials();
    // Focus on the new item name input
    setTimeout(() => {
      const inputs = materialsList.querySelectorAll('input[type="text"]');
      if (inputs.length > 0) {
        inputs[inputs.length - 1].focus();
      }
    }, 50);
  });
  
  // Helper text
  const helperDiv = document.createElement('div');
  helperDiv.style.cssText = `
    padding: 8px 12px;
    background: rgba(73, 213, 156, 0.1);
    border-left: 3px solid #49D59C;
    border-radius: 4px;
    font-size: 0.85rem;
    color: rgba(203, 182, 135, 0.9);
  `;
  helperDiv.innerHTML = `<strong>💡 Tip:</strong> Search for items and set quantities. Perfect for crafting recipes!`;
  
  // Initial render
  renderMaterials();
  
  // Assemble
  container.appendChild(hiddenInput);
  container.appendChild(materialsList);
  container.appendChild(addBtn);
  container.appendChild(helperDiv);
  
  return container;
}

// ------------------- createTableRollEntriesEditor -------------------
// Create user-friendly editor for table roll entries (weight + item + qty + flavor + image)
//
async function createTableRollEntriesEditor(fieldName, value) {
  const container = document.createElement('div');
  container.className = 'table-roll-entries-editor';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
  
  // Hidden textarea to store the actual JSON array
  const hiddenInput = document.createElement('textarea');
  hiddenInput.style.display = 'none';
  hiddenInput.name = fieldName;
  hiddenInput.id = `field-${fieldName}`;
  
  // Initialize entries array
  let entries = [];
  if (value !== undefined && value !== null && Array.isArray(value)) {
    entries = value.map(e => ({
      weight: e.weight || 1,
      flavor: e.flavor || '',
      item: e.item || '',
      quantity: e.quantity || 1,
      thumbnailImage: e.thumbnailImage || ''
    }));
  }
  
  // Fetch all items from database for autocomplete
  let allItems = [];
  const loadingMsg = document.createElement('div');
  loadingMsg.textContent = 'Loading items from database...';
  loadingMsg.style.cssText = 'padding: 10px; color: rgba(203, 182, 135, 0.6); font-style: italic;';
  container.appendChild(loadingMsg);
  
  try {
    const response = await fetchAPI('/api/admin/db/Item?limit=5000');
    if (response.ok) {
      const data = await response.json();
      allItems = data.records.map(r => r.itemName).filter(Boolean).sort();
      loadingMsg.remove();
    } else {
      loadingMsg.textContent = 'Failed to load items. You can still enter manually.';
      loadingMsg.style.color = '#ff6b6b';
    }
  } catch (error) {
    console.error('[databaseEditor.js]: Failed to fetch items:', error);
    loadingMsg.textContent = 'Error loading items. You can still enter manually.';
    loadingMsg.style.color = '#ff6b6b';
  }
  
  // Total weight display (read-only, auto-calculated)
  const totalWeightDisplay = document.createElement('div');
  totalWeightDisplay.style.cssText = `
    padding: 12px 16px;
    background: linear-gradient(135deg, #49D59C 0%, #3bae7e 100%);
    color: #1a1410;
    border-radius: 8px;
    font-weight: 700;
    font-size: 1.1rem;
    text-align: center;
    box-shadow: 0 2px 8px rgba(73, 213, 156, 0.3);
  `;
  
  // Update hidden input and total weight
  const updateHiddenInput = () => {
    hiddenInput.value = JSON.stringify(entries);
    
    // Calculate total weight
    const totalWeight = entries.reduce((sum, entry) => sum + (parseFloat(entry.weight) || 0), 0);
    totalWeightDisplay.innerHTML = `
      <span style="font-size: 0.9rem; opacity: 0.9;">Total Weight:</span> 
      <span style="font-size: 1.3rem;">${totalWeight.toFixed(2)}</span>
      <span style="font-size: 0.85rem; opacity: 0.9; margin-left: 8px;">(${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})</span>
    `;
    
    // Also update the totalWeight field if it exists in the form
    const totalWeightField = document.getElementById('field-totalWeight');
    if (totalWeightField) {
      totalWeightField.value = totalWeight.toFixed(2);
    }
  };
  updateHiddenInput();
  
  // Entries list container
  const entriesList = document.createElement('div');
  entriesList.className = 'table-entries-list';
  entriesList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
  
  // Render all entries
  const renderEntries = () => {
    entriesList.innerHTML = '';
    
    if (entries.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No table entries. Click "Add Entry" below.';
      emptyMsg.style.cssText = 'padding: 20px; color: rgba(203, 182, 135, 0.5); font-style: italic; text-align: center; background: rgba(203, 182, 135, 0.05); border-radius: 8px; border: 2px dashed rgba(203, 182, 135, 0.3);';
      entriesList.appendChild(emptyMsg);
      return;
    }
    
    entries.forEach((entry, index) => {
      const entryCard = document.createElement('div');
      entryCard.style.cssText = `
        padding: 16px;
        background: linear-gradient(135deg, rgba(203, 182, 135, 0.08) 0%, rgba(203, 182, 135, 0.04) 100%);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 8px;
        position: relative;
      `;
      
      // Entry header (weight + remove button)
      const entryHeader = document.createElement('div');
      entryHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(203, 182, 135, 0.2);
      `;
      
      const entryNumber = document.createElement('span');
      entryNumber.textContent = `Entry #${index + 1}`;
      entryNumber.style.cssText = `
        font-weight: 700;
        color: #49D59C;
        font-size: 0.95rem;
      `;
      
      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.innerHTML = '🗑️ Remove';
      removeBtn.title = 'Remove entry';
      removeBtn.style.cssText = `
        padding: 6px 12px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
        transition: background 0.2s;
      `;
      
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.background = '#c82333';
      });
      
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.background = '#dc3545';
      });
      
      removeBtn.addEventListener('click', () => {
        entries.splice(index, 1);
        updateHiddenInput();
        renderEntries();
      });
      
      entryHeader.appendChild(entryNumber);
      entryHeader.appendChild(removeBtn);
      
      // Entry fields grid
      const fieldsGrid = document.createElement('div');
      fieldsGrid.style.cssText = `
        display: grid;
        grid-template-columns: 100px 1fr 80px;
        gap: 12px;
        align-items: start;
      `;
      
      // Weight field
      const weightLabel = document.createElement('label');
      weightLabel.textContent = 'Weight';
      weightLabel.style.cssText = `
        font-weight: 600;
        color: #cbb687;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
      `;
      
      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.value = entry.weight;
      weightInput.min = '0.1';
      weightInput.step = '0.1';
      weightInput.placeholder = '1';
      weightInput.style.cssText = `
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
        font-weight: 600;
        text-align: center;
      `;
      
      weightInput.addEventListener('input', (e) => {
        entries[index].weight = parseFloat(e.target.value) || 1;
        updateHiddenInput();
      });
      
      // Item field with autocomplete
      const itemLabel = document.createElement('label');
      itemLabel.textContent = 'Item';
      itemLabel.style.cssText = `
        font-weight: 600;
        color: #cbb687;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
      `;
      
      const itemContainer = document.createElement('div');
      itemContainer.style.position = 'relative';
      
      const itemInput = document.createElement('input');
      itemInput.type = 'text';
      itemInput.value = entry.item;
      itemInput.placeholder = 'Search items...';
      itemInput.autocomplete = 'off';
      itemInput.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
      `;
      
      // Dropdown for item autocomplete
      const itemDropdown = document.createElement('div');
      itemDropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 200px;
        overflow-y: auto;
        background: #1a1410;
        border: 1px solid #cbb687;
        border-radius: 6px;
        margin-top: 4px;
        z-index: 1000;
        display: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `;
      
      let itemClickListenerAttached = false;
      
      const closeItemDropdownHandler = (e) => {
        if (!itemContainer.contains(e.target)) {
          itemDropdown.style.display = 'none';
          document.removeEventListener('click', closeItemDropdownHandler);
          itemClickListenerAttached = false;
        }
      };
      
      const filterItemOptions = (searchTerm) => {
        if (!searchTerm) return allItems.slice(0, 50);
        const term = searchTerm.toLowerCase();
        return allItems.filter(item => item.toLowerCase().includes(term)).slice(0, 50);
      };
      
      const renderItemDropdown = (items) => {
        itemDropdown.innerHTML = '';
        if (items.length === 0) {
          itemDropdown.innerHTML = '<div style="padding: 8px; color: rgba(203, 182, 135, 0.6); font-style: italic;">No items found</div>';
          itemDropdown.style.display = 'block';
          return;
        }
        
        items.forEach(item => {
          const option = document.createElement('div');
          option.textContent = item;
          option.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            transition: background 0.2s;
            color: #cbb687;
          `;
          
          option.addEventListener('mouseenter', () => {
            option.style.background = 'rgba(203, 182, 135, 0.2)';
          });
          
          option.addEventListener('mouseleave', () => {
            option.style.background = 'transparent';
          });
          
          option.addEventListener('click', () => {
            entries[index].item = item;
            itemInput.value = item;
            itemDropdown.style.display = 'none';
            updateHiddenInput();
          });
          
          itemDropdown.appendChild(option);
        });
        
        itemDropdown.style.display = 'block';
      };
      
      const showItemDropdown = (items) => {
        renderItemDropdown(items);
        if (!itemClickListenerAttached) {
          setTimeout(() => {
            document.addEventListener('click', closeItemDropdownHandler);
            itemClickListenerAttached = true;
          }, 100);
        }
      };
      
      itemInput.addEventListener('input', (e) => {
        entries[index].item = e.target.value;
        updateHiddenInput();
        const results = filterItemOptions(e.target.value);
        if (e.target.value.trim()) {
          showItemDropdown(results);
        } else {
          itemDropdown.style.display = 'none';
          if (itemClickListenerAttached) {
            document.removeEventListener('click', closeItemDropdownHandler);
            itemClickListenerAttached = false;
          }
        }
      });
      
      itemInput.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (itemDropdown.style.display === 'block') {
          itemDropdown.style.display = 'none';
          if (itemClickListenerAttached) {
            document.removeEventListener('click', closeItemDropdownHandler);
            itemClickListenerAttached = false;
          }
        } else if (allItems.length > 0) {
          showItemDropdown(allItems.slice(0, 50));
        }
      });
      
      itemContainer.appendChild(itemInput);
      itemContainer.appendChild(itemDropdown);
      
      // Quantity field
      const qtyLabel = document.createElement('label');
      qtyLabel.textContent = 'Qty';
      qtyLabel.style.cssText = `
        font-weight: 600;
        color: #cbb687;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
      `;
      
      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.value = entry.quantity || 1;
      qtyInput.min = '1';
      qtyInput.placeholder = '1';
      qtyInput.style.cssText = `
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
        font-weight: 600;
        text-align: center;
      `;
      
      qtyInput.addEventListener('input', (e) => {
        entries[index].quantity = parseInt(e.target.value) || 1;
        updateHiddenInput();
      });
      
      // Flavor field
      const flavorLabel = document.createElement('label');
      flavorLabel.textContent = 'Flavor Text';
      flavorLabel.style.cssText = `
        font-weight: 600;
        color: #cbb687;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
      `;
      
      const flavorTextarea = document.createElement('textarea');
      flavorTextarea.value = entry.flavor;
      flavorTextarea.rows = 2;
      flavorTextarea.placeholder = 'Flavor text or description';
      flavorTextarea.style.cssText = `
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
        resize: vertical;
      `;
      
      flavorTextarea.addEventListener('input', (e) => {
        entries[index].flavor = e.target.value;
        updateHiddenInput();
      });
      
      // Thumbnail Image field
      const imageLabel = document.createElement('label');
      imageLabel.textContent = 'Thumbnail';
      imageLabel.style.cssText = `
        font-weight: 600;
        color: #cbb687;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
      `;
      
      const imageInput = document.createElement('input');
      imageInput.type = 'text';
      imageInput.value = entry.thumbnailImage;
      imageInput.placeholder = 'Image URL (optional)';
      imageInput.style.cssText = `
        padding: 8px 12px;
        background: rgba(203, 182, 135, 0.05);
        border: 1px solid rgba(203, 182, 135, 0.3);
        border-radius: 6px;
        color: #cbb687;
      `;
      
      imageInput.addEventListener('input', (e) => {
        entries[index].thumbnailImage = e.target.value;
        updateHiddenInput();
      });
      
      // Add all fields to grid
      fieldsGrid.appendChild(weightLabel);
      fieldsGrid.appendChild(itemLabel);
      fieldsGrid.appendChild(qtyLabel);
      fieldsGrid.appendChild(weightInput);
      fieldsGrid.appendChild(itemContainer);
      fieldsGrid.appendChild(qtyInput);
      
      // Flavor and thumbnail span full width
      const fullWidthSection = document.createElement('div');
      fullWidthSection.style.cssText = `
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 12px;
        margin-top: 8px;
      `;
      
      fullWidthSection.appendChild(flavorLabel);
      fullWidthSection.appendChild(flavorTextarea);
      fullWidthSection.appendChild(imageLabel);
      fullWidthSection.appendChild(imageInput);
      
      entryCard.appendChild(entryHeader);
      entryCard.appendChild(fieldsGrid);
      entryCard.appendChild(fullWidthSection);
      entriesList.appendChild(entryCard);
    });
  };
  
  // Add entry button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.innerHTML = '➕ Add Entry';
  addBtn.style.cssText = `
    padding: 12px 20px;
    background: linear-gradient(135deg, #49D59C 0%, #3bae7e 100%);
    color: #1a1410;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 1rem;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  
  addBtn.addEventListener('mouseenter', () => {
    addBtn.style.transform = 'translateY(-2px)';
    addBtn.style.boxShadow = '0 4px 8px rgba(73, 213, 156, 0.3)';
  });
  
  addBtn.addEventListener('mouseleave', () => {
    addBtn.style.transform = 'translateY(0)';
    addBtn.style.boxShadow = 'none';
  });
  
  addBtn.addEventListener('click', () => {
    entries.push({ weight: 1, flavor: '', item: '', quantity: 1, thumbnailImage: '' });
    updateHiddenInput();
    renderEntries();
    // Scroll to bottom to see new entry
    setTimeout(() => {
      const newEntry = entriesList.lastChild;
      if (newEntry) {
        newEntry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const firstInput = newEntry.querySelector('input[type="text"]');
        if (firstInput) firstInput.focus();
      }
    }, 50);
  });
  
  // Helper text
  const helperDiv = document.createElement('div');
  helperDiv.style.cssText = `
    padding: 10px 14px;
    background: rgba(73, 213, 156, 0.1);
    border-left: 3px solid #49D59C;
    border-radius: 4px;
    font-size: 0.85rem;
    color: rgba(203, 182, 135, 0.9);
  `;
  helperDiv.innerHTML = `<strong>💡 Tip:</strong> Add weighted entries with items and quantities. Higher weight = higher chance. Total weight is auto-calculated!`;
  
  // Initial render
  renderEntries();
  
  // Assemble
  container.appendChild(hiddenInput);
  container.appendChild(totalWeightDisplay);
  container.appendChild(entriesList);
  container.appendChild(addBtn);
  container.appendChild(helperDiv);
  
  return container;
}

// ------------------- createItemPickerForValidItems -------------------
// Create special item picker with autocomplete from Items database
//
async function createItemPickerForValidItems(fieldName, value) {
  const container = document.createElement('div');
  container.className = 'item-picker-container';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
  
  // Hidden input to store the actual array value
  const hiddenInput = document.createElement('textarea');
  hiddenInput.style.display = 'none';
  hiddenInput.name = fieldName;
  hiddenInput.id = `field-${fieldName}`;
  
  // Initialize selected items
  let selectedItems = [];
  if (value !== undefined && value !== null && Array.isArray(value)) {
    selectedItems = [...value];
  }
  
  // Update hidden input value
  const updateHiddenInput = () => {
    hiddenInput.value = JSON.stringify(selectedItems);
  };
  updateHiddenInput();
  
  // Create unique ID for this picker instance
  const pickerIdent = `item-picker-${Date.now()}`;
  
  // Container for selected items (chips) - FULL WIDTH
  const selectedContainer = document.createElement('div');
  selectedContainer.className = 'selected-items-container';
  selectedContainer.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
    background: rgba(203, 182, 135, 0.05);
    border: 1px solid rgba(203, 182, 135, 0.2);
    border-radius: 6px;
    min-height: 100px;
    max-height: 400px;
    overflow-y: auto;
    width: 100%;
  `;
  
  // Function to render selected items
  const renderSelectedItems = () => {
    selectedContainer.innerHTML = '';
    if (selectedItems.length === 0) {
      selectedContainer.innerHTML = '<span style="color: rgba(203, 182, 135, 0.5); font-style: italic;">No items selected</span>';
      return;
    }
    
    selectedItems.forEach(item => {
      const chip = document.createElement('div');
      chip.className = 'item-chip';
      chip.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: linear-gradient(135deg, #cbb687 0%, #a89968 100%);
        color: #1a1410;
        border-radius: 16px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: default;
        transition: all 0.2s;
      `;
      
      chip.innerHTML = `
        <span>${item}</span>
        <button type="button" style="
          background: none;
          border: none;
          color: #1a1410;
          cursor: pointer;
          padding: 0;
          margin: 0;
          font-size: 1rem;
          line-height: 1;
          display: flex;
          align-items: center;
          opacity: 0.7;
          transition: opacity 0.2s;
        " title="Remove ${item}">×</button>
      `;
      
      const removeBtn = chip.querySelector('button');
      removeBtn.addEventListener('click', () => {
        selectedItems = selectedItems.filter(i => i !== item);
        updateHiddenInput();
        renderSelectedItems();
      });
      
      removeBtn.addEventListener('mouseenter', () => removeBtn.style.opacity = '1');
      removeBtn.addEventListener('mouseleave', () => removeBtn.style.opacity = '0.7');
      
      selectedContainer.appendChild(chip);
    });
  };
  
  // Autocomplete container (will be used in floating panel)
  const autocompleteContainer = document.createElement('div');
  autocompleteContainer.style.cssText = `
    position: relative;
  `;
  
  // Search input
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search and select items...';
  searchInput.style.cssText = `
    width: 100%;
    padding: 10px 12px;
    background: rgba(203, 182, 135, 0.05);
    border: 1px solid rgba(203, 182, 135, 0.3);
    border-radius: 6px;
    color: #cbb687;
    font-size: 0.95rem;
  `;
  
  // Dropdown for search results
  const dropdown = document.createElement('div');
  dropdown.className = 'item-picker-dropdown';
  dropdown.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 300px;
    overflow-y: auto;
    background: #1a1410;
    border: 1px solid #cbb687;
    border-radius: 6px;
    margin-top: 4px;
    z-index: 1000;
    display: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  
  // Fetch all items from database
  let allItems = [];
  const loadingMsg = document.createElement('div');
  loadingMsg.textContent = 'Loading items from database...';
  loadingMsg.style.cssText = 'padding: 10px; color: rgba(203, 182, 135, 0.6); font-style: italic;';
  container.appendChild(loadingMsg);
  
  try {
    const response = await fetchAPI('/api/admin/db/Item?limit=5000');
    if (response.ok) {
      const data = await response.json();
      allItems = data.records.map(r => r.itemName).filter(Boolean).sort();
      loadingMsg.remove();
    } else {
      loadingMsg.textContent = 'Failed to load items. You can still enter manually.';
      loadingMsg.style.color = '#ff6b6b';
    }
  } catch (error) {
    console.error('[databaseEditor.js]: Failed to fetch items:', error);
    loadingMsg.textContent = 'Error loading items. You can still enter manually.';
    loadingMsg.style.color = '#ff6b6b';
  }
  
  // Search and filter items
  const filterItems = (searchTerm) => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    return allItems
      .filter(item => item.toLowerCase().includes(term) && !selectedItems.includes(item))
      .slice(0, 50); // Limit to 50 results
  };
  
  // Render dropdown
  const renderDropdown = (items) => {
    dropdown.innerHTML = '';
    
    if (items.length === 0) {
      dropdown.innerHTML = '<div style="padding: 10px; color: rgba(203, 182, 135, 0.6); font-style: italic;">No items found</div>';
      dropdown.style.display = 'block';
      return;
    }
    
    items.forEach(item => {
      const option = document.createElement('div');
      option.className = 'item-picker-option';
      option.textContent = item;
      option.style.cssText = `
        padding: 10px 12px;
        cursor: pointer;
        transition: background 0.2s;
        color: #cbb687;
      `;
      
      option.addEventListener('mouseenter', () => {
        option.style.background = 'rgba(203, 182, 135, 0.2)';
      });
      
      option.addEventListener('mouseleave', () => {
        option.style.background = 'transparent';
      });
      
      option.addEventListener('click', () => {
        if (!selectedItems.includes(item)) {
          selectedItems.push(item);
          updateHiddenInput();
          renderSelectedItems();
        }
        searchInput.value = '';
        dropdown.style.display = 'none';
      });
      
      dropdown.appendChild(option);
    });
    
    dropdown.style.display = 'block';
  };
  
  // Event listeners
  searchInput.addEventListener('input', (e) => {
    const results = filterItems(e.target.value);
    if (e.target.value.trim()) {
      renderDropdown(results);
    } else {
      dropdown.style.display = 'none';
    }
  });
  
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) {
      const results = filterItems(searchInput.value);
      renderDropdown(results);
    }
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!autocompleteContainer.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  
  // Assemble the autocomplete UI
  autocompleteContainer.appendChild(searchInput);
  autocompleteContainer.appendChild(dropdown);
  
  // Helper text
  const helperDiv = document.createElement('div');
  helperDiv.style.cssText = `
    padding: 10px;
    background: rgba(73, 213, 156, 0.15);
    border-left: 3px solid #49D59C;
    border-radius: 4px;
    font-size: 0.85rem;
    color: #cbb687;
  `;
  helperDiv.innerHTML = `
    <strong>💡 Tip:</strong> Search for items from the database and click to add them. Click the × on any chip to remove it.
  `;
  
  // Create button to open search panel
  const openSearchBtn = document.createElement('button');
  openSearchBtn.type = 'button';
  openSearchBtn.innerHTML = '🔍 Search & Add Items';
  openSearchBtn.style.cssText = `
    padding: 12px 20px;
    background: linear-gradient(135deg, #49D59C 0%, #3bae7e 100%);
    color: #1a1410;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 1rem;
    transition: transform 0.2s, box-shadow 0.2s;
    width: 100%;
    margin-top: 8px;
  `;
  
  // Create floating search panel (initially hidden)
  const searchPanel = document.createElement('div');
  searchPanel.id = pickerIdent;
  searchPanel.className = 'item-search-panel';
  searchPanel.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    background: #1a1410;
    border: 2px solid #49D59C;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    z-index: 10000;
    display: none;
    flex-direction: column;
    gap: 16px;
  `;
  
  // Panel header
  const panelHeader = document.createElement('div');
  panelHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  `;
  
  const panelTitle = document.createElement('h3');
  panelTitle.textContent = 'Search & Add Items';
  panelTitle.style.cssText = `
    color: #49D59C;
    margin: 0;
    font-size: 1.5rem;
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close';
  closeBtn.style.cssText = `
    background: #dc3545;
    color: white;
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;
  
  panelHeader.appendChild(panelTitle);
  panelHeader.appendChild(closeBtn);
  
  // Assemble search panel
  searchPanel.appendChild(panelHeader);
  searchPanel.appendChild(autocompleteContainer);
  searchPanel.appendChild(helperDiv);
  
  // Backdrop overlay
  const backdrop = document.createElement('div');
  backdrop.className = 'item-search-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 9999;
    display: none;
  `;
  
  // Event listeners for open/close
  openSearchBtn.addEventListener('click', () => {
    searchPanel.style.display = 'flex';
    backdrop.style.display = 'block';
    searchInput.focus();
  });
  
  const closePanel = () => {
    searchPanel.style.display = 'none';
    backdrop.style.display = 'none';
    searchInput.value = '';
    dropdown.style.display = 'none';
  };
  
  closeBtn.addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);
  
  // Add to document body
  document.body.appendChild(backdrop);
  document.body.appendChild(searchPanel);
  
  // Cleanup function to remove panel and backdrop when form is closed
  const cleanup = () => {
    if (backdrop && backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
    if (searchPanel && searchPanel.parentNode) {
      searchPanel.parentNode.removeChild(searchPanel);
    }
  };
  
  // Listen for modal close events
  const modal = document.getElementById('record-edit-modal');
  if (modal) {
    const closeModal = () => {
      cleanup();
    };
    // Store cleanup function so it can be called when modal closes
    container.dataset.cleanup = 'true';
    container._cleanup = cleanup;
  }
  
  // Hover effects
  openSearchBtn.addEventListener('mouseenter', () => {
    openSearchBtn.style.transform = 'translateY(-2px)';
    openSearchBtn.style.boxShadow = '0 4px 12px rgba(73, 213, 156, 0.4)';
  });
  
  openSearchBtn.addEventListener('mouseleave', () => {
    openSearchBtn.style.transform = 'translateY(0)';
    openSearchBtn.style.boxShadow = 'none';
  });
  
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = '#c82333';
  });
  
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = '#dc3545';
  });
  
  // Initial render
  renderSelectedItems();
  
  // Add everything to container (selected items + open button only)
  container.appendChild(hiddenInput);
  container.appendChild(selectedContainer);
  container.appendChild(openSearchBtn);
  
  return container;
}

// ------------------- createTextInput -------------------
// Create text input with appropriate constraints
//
function createTextInput(fieldName, value) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value !== undefined && value !== null ? value : '';
  
  const fieldNameLower = fieldName.toLowerCase();
  
  if (fieldNameLower.includes('name')) {
    input.maxLength = 100;
    input.placeholder = 'Enter name (max 100 characters)';
  } else if (fieldNameLower.includes('description')) {
    input.placeholder = 'Enter description...';
  } else {
    input.placeholder = 'Enter text...';
  }
  
  return input;
}

// ============================================================================
// ------------------- Save & Delete Operations -------------------
// ============================================================================

// ------------------- handleSaveRecord -------------------
// Validate and save record (create or update)
//
async function handleSaveRecord() {
  
  const form = document.getElementById('record-form');
  const formData = new FormData(form);
  const recordData = {};
  
  for (const [key, value] of formData.entries()) {
    const fieldInfo = currentSchema[key];
    if (!fieldInfo) continue;
    
    const sanitizedValue = validateAndSanitizeField(key, value, fieldInfo.type);
    
    // Handle nested fields (e.g., gearArmor.head)
    if (key.includes('.')) {
      const parts = key.split('.');
      let current = recordData;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = sanitizedValue;
    } else {
      recordData[key] = sanitizedValue;
    }
  }
  
  if (recordData.hasOwnProperty('locations')) {
    recordData.locations = buildLocationArray(recordData, 'locations');
  }
  
  if (recordData.hasOwnProperty('job')) {
    recordData.job = buildJobArray(recordData, 'job');
  }
  
  const requiredErrors = validateRequiredFields(recordData, currentSchema);
  if (requiredErrors.length > 0) {
    showNotification(`❌ Missing required fields: ${requiredErrors.join(', ')}`, 'error');
    return;
  }
  
  
  try {
    const url = editingRecordId 
      ? `/api/admin/db/${currentModel}/${editingRecordId}`
      : `/api/admin/db/${currentModel}`;
    
    const method = editingRecordId ? 'PUT' : 'POST';
    
    const response = await fetchAPI(url, {
      method: method,
      body: JSON.stringify(recordData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to save record');
    }
    
    showNotification('Record saved successfully', 'success');
    dbEditorCloseModal();
    
    loadRecords(currentModel, currentPage, currentSearch);
  } catch (error) {
    console.error('[databaseEditor.js]: ❌ Error saving record:', error);
    showNotification(`Failed to save: ${error.message}`, 'error');
  }
}

// ------------------- handleDeleteRecord -------------------
// Delete record with confirmation
//
async function handleDeleteRecord() {
  if (!editingRecordId) return;
  
  const recordName = document.getElementById('field-name')?.value || 'this record';
  
  // Show custom delete confirmation modal
  showDeleteConfirmation(recordName, async () => {
    
    try {
      const response = await fetchAPI(`/api/admin/db/${currentModel}/${editingRecordId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete record');
      
      showNotification('Record deleted successfully', 'success');
      dbEditorCloseModal();
      
      loadRecords(currentModel, currentPage, currentSearch);
    } catch (error) {
      console.error('[databaseEditor.js]: ❌ Error deleting record:', error);
      showNotification('Failed to delete record', 'error');
    }
  });
}

// ------------------- showDeleteConfirmation -------------------
// Show styled delete confirmation modal
//
function showDeleteConfirmation(recordName, onConfirm) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'delete-confirmation-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease-in-out;
  `;
  
  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'delete-confirmation-modal';
  modal.style.cssText = `
    background: linear-gradient(135deg, #2a1810 0%, #1a1410 100%);
    border: 2px solid #8B0000;
    border-radius: 12px;
    padding: 30px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 10px 40px rgba(139, 0, 0, 0.5);
    animation: slideDown 0.3s ease-out;
  `;
  
  // Create modal content
  modal.innerHTML = `
    <div style="text-align: center; margin-bottom: 25px;">
      <div style="font-size: 60px; margin-bottom: 15px;">⚠️</div>
      <h2 style="color: #ff4444; margin: 0 0 10px 0; font-size: 24px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
        DELETE CONFIRMATION
      </h2>
      <div style="height: 2px; background: linear-gradient(90deg, transparent, #8B0000, transparent); margin: 15px 0;"></div>
    </div>
    
    <div style="color: #cbb687; margin-bottom: 25px; line-height: 1.6;">
      <p style="margin: 0 0 15px 0; font-size: 16px;">
        Are you sure you want to <strong style="color: #ff4444;">DELETE</strong>:
      </p>
      <p style="background: rgba(203, 182, 135, 0.1); padding: 15px; border-radius: 6px; border-left: 3px solid #cbb687; margin: 15px 0; font-size: 18px; font-weight: bold; word-break: break-word;">
        "${recordName}"
      </p>
      <p style="margin: 15px 0 0 0; color: #ff6b6b; font-size: 14px;">
        <strong>🚨 This action CANNOT be undone!</strong>
      </p>
    </div>
    
    <div style="display: flex; gap: 15px; margin-top: 25px;">
      <button class="delete-cancel-btn" style="
        flex: 1;
        padding: 12px 24px;
        background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%);
        border: 1px solid #718096;
        color: #cbb687;
        border-radius: 6px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
      ">
        ✓ Keep Safe
      </button>
      <button class="delete-confirm-btn" style="
        flex: 1;
        padding: 12px 24px;
        background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
        border: 1px solid #b91c1c;
        color: white;
        border-radius: 6px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
      ">
        🗑️ Delete Forever
      </button>
    </div>
  `;
  
  // Add hover effects and animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes slideDown {
      from { transform: translateY(-50px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .delete-cancel-btn:hover {
      background: linear-gradient(135deg, #5a6678 0%, #3d4758 100%) !important;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .delete-confirm-btn:hover {
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%) !important;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
    }
    .delete-cancel-btn:active, .delete-confirm-btn:active {
      transform: translateY(0) !important;
    }
  `;
  document.head.appendChild(style);
  
  // Get buttons
  const cancelBtn = modal.querySelector('.delete-cancel-btn');
  const confirmBtn = modal.querySelector('.delete-confirm-btn');
  
  // Close modal function
  const closeModal = () => {
    overlay.style.animation = 'fadeOut 0.2s ease-in-out';
    setTimeout(() => {
      overlay.remove();
      style.remove();
    }, 200);
  };
  
  // Add event listeners
  cancelBtn.addEventListener('click', () => {
    closeModal();
    showNotification('✅ Delete cancelled - record is safe', 'info');
  });
  
  confirmBtn.addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
      showNotification('✅ Delete cancelled - record is safe', 'info');
    }
  });
  
  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      showNotification('✅ Delete cancelled - record is safe', 'info');
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
  
  // Add to DOM
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Focus the cancel button by default
  setTimeout(() => cancelBtn.focus(), 100);
}

// ============================================================================
// ------------------- Field Descriptions and Tooltips -------------------
// ============================================================================

// ------------------- getFieldDescription -------------------
// Get human-readable description for field
//
function getFieldDescription(fieldName, modelName) {
  const descriptions = {
    'name': 'The character\'s display name in the game',
    'discordId': 'Discord user ID of the character owner',
    'username': 'Discord username of the character owner',
    'level': 'Character\'s current level (affects stats and abilities)',
    'experience': 'Current experience points towards next level',
    'health': 'Current health points (0 = unconscious)',
    'maxHealth': 'Maximum health points based on level and stats',
    'mana': 'Current mana points for casting spells',
    'maxMana': 'Maximum mana points based on level and stats',
    'strength': 'Physical power stat (affects melee damage)',
    'intelligence': 'Mental power stat (affects spell damage and mana)',
    'dexterity': 'Agility stat (affects accuracy and evasion)',
    'constitution': 'Endurance stat (affects health and resistance)',
    'wisdom': 'Perception stat (affects mana regeneration and detection)',
    'charisma': 'Social stat (affects interactions and leadership)',
    'blightPauseInfo.pausedAt': 'Timestamp when the character\'s blight was paused',
    'blightPauseInfo.pausedBy': 'User ID of who paused the blight',
    'blightPauseInfo.pausedByUsername': 'Username of who paused the blight',
    'blightPauseInfo.reason': 'Reason for pausing the blight effect',
    'itemName': 'Name of the item',
    'description': 'Detailed description of the item\'s properties',
    'quantity': 'Number of items in this stack',
    'rarity': 'Item rarity level (common, uncommon, rare, epic, legendary)',
    'value': 'Base monetary value of the item',
    'type': 'Category/type of item (weapon, armor, consumable, etc.)',
    'title': 'Quest title displayed to players',
    'reward': 'Rewards given upon quest completion',
    'difficulty': 'Quest difficulty level',
    'status': 'Current quest status (active, completed, failed, etc.)',
    'tokens': 'Premium currency balance',
    'totalPlaytime': 'Total time spent in the game',
    'lastActive': 'Last time the user was active',
    'isAdmin': 'Whether the user has admin privileges',
    'isModerator': 'Whether the user has moderator privileges',
    'weatherType': 'Current weather condition',
    'intensity': 'Weather intensity level (1-10)',
    'duration': 'How long the weather effect lasts',
    'effects': 'Special effects caused by this weather',
    'villageName': 'Name of the village',
    'population': 'Number of NPCs in the village',
    'prosperity': 'Economic prosperity level of the village',
    'defense': 'Defense rating against threats',
    'monsterName': 'Name of the monster',
    'hp': 'Monster\'s hit points',
    'attack': 'Monster\'s attack power',
    'loot': 'Items dropped when defeated',
    '_id': 'Unique database identifier (auto-generated)',
    'createdAt': 'When this record was first created',
    'updatedAt': 'When this record was last modified',
    'validItems': 'List of specific items that can fulfill this general category (e.g., for "Any Seafood", list: Crab, Lobster, Snail, etc.)',
    'category': 'The general category this item belongs to (e.g., Seafood, Fish, Meat)',
    'questId': 'Unique identifier for this Help Wanted quest (format: village-YYYY-MM-DD)',
    'village': 'Which village this quest is for (Rudania, Inariko, or Vhintl)',
    'date': 'The date this quest is active (format: YYYY-MM-DD)',
    'type': 'Type of quest: item, monster, escort, crafting, art, or writing',
    'npcName': 'Name of the NPC who requested this quest (select from previously used NPCs or enter a new one)',
    'requirements': 'Quest requirements as JSON object (e.g., {"item": "Blight Petal", "amount": 3})',
    'completed': 'Whether this quest has been completed by a player',
    'completedBy': 'Information about who completed this quest (userId, characterId, timestamp)',
    'scheduledPostTime': 'What time the quest should be posted (format: HH:MM or time string)',
    'messageId': 'Discord message ID of the quest embed (for future edits)',
    'channelId': 'Discord channel ID where the quest embed was posted',
    'active': 'Whether this record is currently active/enabled',
    'enabled': 'Whether this feature is enabled',
    'visible': 'Whether this content is visible to players',
    'pronouns': 'Character pronouns (e.g., he/him, she/her, they/them)',
    'race': 'Character race/species (e.g., Hylian, Gerudo, Goron, Rito, Zora)',
    'homeVillage': 'The village where this character originally came from',
    'currentVillage': 'The village where this character currently resides',
    'job': 'Character\'s current job/profession',
    'modTitle': 'Mod character title (e.g., Oracle, Dragon, Sage, Champion)',
    'modType': 'Type of mod character (e.g., Power, Courage, Wisdom, Light, Water, Forest, Shadow)',
    'modOwner': 'The moderator who owns/controls this mod character',
    'vendorType': 'Type of vendor/shop this character runs (if applicable)',
    'icon': 'URL or path to character icon/avatar image',
    'inventory': 'Link to character\'s inventory spreadsheet',
    'appLink': 'Link to character application or profile',
    'craftingMaterial': 'List of materials required to craft this item (item name + quantity)',
    'gearWeapon': 'Equipped weapon with name and stats (e.g., attack, durability)',
    'gearShield': 'Equipped shield with name and stats (e.g., defense, durability)',
    'gearArmor': 'Equipped armor pieces (head, chest, legs) with stats for each',
    'gearArmor.head': 'Head armor piece with name and stats (e.g., defense, special effects)',
    'gearArmor.chest': 'Chest armor piece with name and stats (e.g., defense, special effects)',
    'gearArmor.legs': 'Leg armor piece with name and stats (e.g., defense, special effects)',
    'head': 'Head armor piece with name and stats',
    'chest': 'Chest armor piece with name and stats',
    'legs': 'Leg armor piece with name and stats',
    'debuff': 'Character debuff status - includes active flag and end date for when the debuff expires',
    'buff': 'Character buff status - includes active flag, buff type, and effect values',
    'jobVoucher': 'Whether this character has a job change voucher',
    'jobVoucherJob': 'The job this voucher can be used to change to (select from all available jobs)',
    'entries': 'Table roll entries with weight, item, quantity, flavor text, and optional thumbnail image',
    'totalWeight': 'Sum of all entry weights (auto-calculated, used for probability)',
    'maxRollsPerDay': 'Maximum number of times this table can be rolled per day (0 = unlimited)',
    'dailyRollCount': 'Number of times this table has been rolled today',
    'dailyRollReset': 'When the daily roll count was last reset',
    'weight': 'Probability weight for this entry (higher = more likely)',
    'flavor': 'Descriptive flavor text for this table entry',
    'quantity': 'How many of this item should be rewarded when rolled',
    'thumbnailImage': 'Optional image URL to display with this entry'
  };
  
  return descriptions[fieldName] || null;
}

// ------------------- getFieldDisplayName -------------------
// Convert field name to human-readable display name
//
function getFieldDisplayName(fieldName) {
  const displayNames = {
    'discordId': 'Discord ID',
    'userId': 'User ID',
    'maxHealth': 'Max Health',
    'maxMana': 'Max Mana',
    'maxHearts': 'Max Hearts',
    'currentHearts': 'Current Hearts',
    'maxStamina': 'Max Stamina',
    'currentStamina': 'Current Stamina',
    'itemName': 'Item Name',
    'monsterName': 'Monster Name',
    'villageName': 'Village Name',
    'weatherType': 'Weather Type',
    'totalPlaytime': 'Total Playtime',
    'lastActive': 'Last Active',
    'isAdmin': 'Admin Status',
    'isModerator': 'Moderator Status',
    'createdAt': 'Created Date',
    'updatedAt': 'Updated Date',
    'blightPauseInfo.pausedAt': 'Blight Paused At',
    'blightPauseInfo.pausedBy': 'Blight Paused By',
    'blightPauseInfo.pausedByUsername': 'Paused By Username',
    'blightPauseInfo.reason': 'Pause Reason',
    'homeVillage': 'Home Village',
    'currentVillage': 'Current Village',
    'modTitle': 'Mod Title',
    'modType': 'Mod Type',
    'modOwner': 'Mod Owner',
    'vendorType': 'Vendor Type',
    'npcName': 'NPC Name',
    'craftingMaterial': 'Crafting Materials',
    'gearWeapon': 'Weapon',
    'gearShield': 'Shield',
    'gearArmor': 'Armor Set',
    'gearArmor.head': 'Head Armor',
    'gearArmor.chest': 'Chest Armor',
    'gearArmor.legs': 'Leg Armor',
    'head': 'Head Armor',
    'chest': 'Chest Armor',
    'legs': 'Leg Armor',
    'debuff': 'Debuff Status',
    'buff': 'Buff Status',
    'jobVoucher': 'Job Voucher',
    'jobVoucherJob': 'Job Voucher Job',
    'totalWeight': 'Total Weight',
    'maxRollsPerDay': 'Max Rolls Per Day',
    'dailyRollCount': 'Daily Roll Count',
    'dailyRollReset': 'Daily Roll Reset',
    'isActive': 'Is Active',
    'createdBy': 'Created By'
  };
  
  if (!displayNames[fieldName]) {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
  
  return displayNames[fieldName];
}

// ------------------- showTooltip -------------------
// Display tooltip with field description
//
function showTooltip(element, text) {
  const existingTooltips = document.querySelectorAll('.tooltip');
  existingTooltips.forEach(tooltip => tooltip.remove());
  
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.textContent = text;
  
  document.body.appendChild(tooltip);
  
  const rect = element.getBoundingClientRect();
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 10}px`;
  tooltip.style.transform = 'translateX(-50%) translateY(-100%)';
  
  setTimeout(() => {
    tooltip.classList.add('show');
  }, 10);
  
  const hideTooltip = () => {
    tooltip.classList.remove('show');
    setTimeout(() => tooltip.remove(), 300);
  };
  
  setTimeout(hideTooltip, 5000);
  
  tooltip.addEventListener('click', hideTooltip);
  
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      hideTooltip();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

// ============================================================================
// ------------------- Notifications -------------------
// ============================================================================

// ------------------- showNotification -------------------
// Display temporary notification toast in top-right corner
//
function showNotification(message, type = 'info') {
  const iconMap = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };
  
  const notification = document.createElement('div');
  notification.className = `db-notification db-notification-${type}`;
  
  const icon = document.createElement('i');
  icon.className = iconMap[type] || iconMap.info;
  
  const text = document.createElement('span');
  text.textContent = message;
  
  notification.appendChild(icon);
  notification.appendChild(text);
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// ============================================================================
// ------------------- Utility Helpers -------------------
// ============================================================================

// ------------------- setElementDisplay -------------------
// Set display style on element by ID
//
function setElementDisplay(elementId, displayValue) {
  const element = document.getElementById(elementId);
  if (element) element.style.display = displayValue;
}
