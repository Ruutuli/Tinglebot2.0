// ============================================================================
// characterInventory.js — Character Inventory Component
// Purpose: Displays detailed per-character inventory with all items and acquisition history
// ============================================================================

import { createSearchFilterBar } from './ui.js';

// ------------------- Global State -------------------
let characterName = null;
let characterData = null;
let inventoryData = null;
let historyData = null;
let currentFilters = {
  inventory: {
    search: '',
    category: 'all',
    type: 'all',
    owned: 'all' // all, owned, not-owned
  },
  history: {
    search: '',
    obtain: 'all',
    location: 'all',
    startDate: '',
    endDate: ''
  }
};

// ------------------- Initialization -------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Get character name from URL params
  const urlParams = new URLSearchParams(window.location.search);
  characterName = urlParams.get('character') || decodeURIComponent(window.location.pathname.split('/').pop() || '');
  
  if (!characterName) {
    showError('Character name is required');
    return;
  }

  // Update breadcrumb
  const breadcrumb = document.getElementById('character-breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = characterName;
  }

  // Setup tabs
  setupTabs();

  // Load data
  await Promise.all([
    loadCharacterData(),
    loadInventoryData(),
    loadHistoryData()
  ]);

  // Render initial views
  renderInventoryView();
  renderHistoryView();
});

// ------------------- Tab Management -------------------
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-button');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      // Update active states
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const targetContent = document.getElementById(`content-${targetTab}`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// ------------------- Data Loading -------------------
async function loadCharacterData() {
  try {
    const response = await fetch(`/api/inventory/character/${encodeURIComponent(characterName)}/detailed`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    characterData = data;

    // Update header
    updateCharacterHeader(data);
  } catch (error) {
    console.error('Error loading character data:', error);
    showError('Failed to load character data');
  }
}

async function loadInventoryData() {
  try {
    const response = await fetch(`/api/inventory/character/${encodeURIComponent(characterName)}/detailed`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    inventoryData = data.inventory || [];
    
    // Hide loading state
    const loading = document.getElementById('inventory-loading');
    if (loading) loading.style.display = 'none';
  } catch (error) {
    console.error('Error loading inventory data:', error);
    showError('Failed to load inventory data');
  }
}

async function loadHistoryData() {
  try {
    const response = await fetch(`/api/inventory/character/${encodeURIComponent(characterName)}/logs`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    historyData = data.logs || [];
    
    // Hide loading state
    const loading = document.getElementById('history-loading');
    if (loading) loading.style.display = 'none';
  } catch (error) {
    console.error('Error loading history data:', error);
    showError('Failed to load acquisition history');
  }
}

// ------------------- Header Update -------------------
function updateCharacterHeader(data) {
  const iconEl = document.getElementById('character-icon');
  const nameEl = document.getElementById('character-name');
  const uniqueItemsEl = document.getElementById('stat-unique-items');
  const totalItemsEl = document.getElementById('stat-total-items');

  if (iconEl && data.icon) {
    iconEl.src = data.icon.startsWith('http') ? data.icon : `/api/images/${data.icon.replace('https://storage.googleapis.com/tinglebot/', '')}`;
  }
  if (nameEl) nameEl.textContent = data.characterName || characterName;
  if (uniqueItemsEl) uniqueItemsEl.textContent = data.uniqueItems || 0;
  if (totalItemsEl) totalItemsEl.textContent = data.totalItems || 0;
}

// ------------------- Inventory View -------------------
function renderInventoryView() {
  if (!inventoryData) return;

  const container = document.getElementById('inventory-grid-container');
  if (!container) return;

  // Get unique categories and types for filters
  const categories = [...new Set(inventoryData.flatMap(item => {
    if (Array.isArray(item.category)) return item.category;
    if (typeof item.category === 'string' && item.category.includes(',')) {
      return item.category.split(',').map(s => s.trim());
    }
    return [item.category || 'Unknown'];
  }))].filter(Boolean).sort();

  const types = [...new Set(inventoryData.flatMap(item => {
    if (Array.isArray(item.type)) return item.type;
    if (typeof item.type === 'string' && item.type.includes(',')) {
      return item.type.split(',').map(s => s.trim());
    }
    return [item.type || 'Unknown'];
  }))].filter(Boolean).sort();

  // Setup filters
  setupInventoryFilters(categories, types);

  // Filter and render items
  const filteredItems = filterInventoryItems(inventoryData);

  // Group by category
  const itemsByCategory = groupItemsByCategory(filteredItems);

  // Render grid
  container.innerHTML = renderInventoryGrid(itemsByCategory);
}

function setupInventoryFilters(categories, types) {
  const filtersContainer = document.getElementById('inventory-filters');
  if (!filtersContainer) return;

  const { bar: filterBar } = createSearchFilterBar({
    layout: 'compact',
    filters: [
      {
        type: 'input',
        id: 'inventory-search',
        placeholder: 'Search items...',
        attributes: { autocomplete: 'off' },
        width: 'double'
      },
      {
        type: 'select',
        id: 'inventory-category',
        options: [
          { value: 'all', label: 'All Categories', selected: true },
          ...categories.map(cat => ({ value: cat, label: cat }))
        ]
      },
      {
        type: 'select',
        id: 'inventory-type',
        options: [
          { value: 'all', label: 'All Types', selected: true },
          ...types.map(type => ({ value: type, label: type }))
        ]
      },
      {
        type: 'select',
        id: 'inventory-owned',
        options: [
          { value: 'all', label: 'All Items', selected: true },
          { value: 'owned', label: 'Owned Only' },
          { value: 'not-owned', label: 'Not Owned Only' }
        ]
      }
    ],
    buttons: [
      {
        id: 'inventory-clear-filters',
        label: 'Clear Filters',
        className: 'clear-filters-btn'
      }
    ]
  });

  filtersContainer.innerHTML = '';
  filtersContainer.appendChild(filterBar);

  // Attach event listeners
  const searchInput = document.getElementById('inventory-search');
  const categorySelect = document.getElementById('inventory-category');
  const typeSelect = document.getElementById('inventory-type');
  const ownedSelect = document.getElementById('inventory-owned');
  const clearBtn = document.getElementById('inventory-clear-filters');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilters.inventory.search = e.target.value;
      renderInventoryView();
    });
  }
  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      currentFilters.inventory.category = e.target.value;
      renderInventoryView();
    });
  }
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      currentFilters.inventory.type = e.target.value;
      renderInventoryView();
    });
  }
  if (ownedSelect) {
    ownedSelect.addEventListener('change', (e) => {
      currentFilters.inventory.owned = e.target.value;
      renderInventoryView();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      currentFilters.inventory = { search: '', category: 'all', type: 'all', owned: 'all' };
      if (searchInput) searchInput.value = '';
      if (categorySelect) categorySelect.value = 'all';
      if (typeSelect) typeSelect.value = 'all';
      if (ownedSelect) ownedSelect.value = 'all';
      renderInventoryView();
    });
  }
}

function filterInventoryItems(items) {
  const filters = currentFilters.inventory;

  return items.filter(item => {
    // Search filter
    if (filters.search && !item.itemName.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }

    // Category filter
    if (filters.category !== 'all') {
      const itemCategories = Array.isArray(item.category) 
        ? item.category 
        : (typeof item.category === 'string' && item.category.includes(','))
          ? item.category.split(',').map(s => s.trim())
          : [item.category || 'Unknown'];
      if (!itemCategories.includes(filters.category)) {
        return false;
      }
    }

    // Type filter
    if (filters.type !== 'all') {
      const itemTypes = Array.isArray(item.type)
        ? item.type
        : (typeof item.type === 'string' && item.type.includes(','))
          ? item.type.split(',').map(s => s.trim())
          : [item.type || 'Unknown'];
      if (!itemTypes.includes(filters.type)) {
        return false;
      }
    }

    // Owned filter
    if (filters.owned === 'owned' && !item.owned) {
      return false;
    }
    if (filters.owned === 'not-owned' && item.owned) {
      return false;
    }

    return true;
  });
}

function groupItemsByCategory(items) {
  const grouped = {};

  items.forEach(item => {
    const categories = Array.isArray(item.category)
      ? item.category
      : (typeof item.category === 'string' && item.category.includes(','))
        ? item.category.split(',').map(s => s.trim())
        : [item.category || 'Unknown'];

    categories.forEach(cat => {
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(item);
    });
  });

  // Sort items within each category by name
  Object.keys(grouped).forEach(cat => {
    grouped[cat].sort((a, b) => a.itemName.localeCompare(b.itemName));
  });

  return grouped;
}

function renderInventoryGrid(itemsByCategory) {
  const categories = Object.keys(itemsByCategory).sort();
  
  if (categories.length === 0) {
    return '<div class="empty-state"><p>No items match the current filters.</p></div>';
  }

  return categories.map(category => `
    <div class="category-section" data-category="${category}">
      <h3 class="category-title">${category}</h3>
      <div class="items-grid">
        ${itemsByCategory[category].map(item => renderInventoryItem(item)).join('')}
      </div>
    </div>
  `).join('');
}

function renderInventoryItem(item) {
  const imageUrl = formatItemImageUrl(item.image || item.emoji);
  const quantityDisplay = item.owned ? item.quantity : 'Not Owned';
  const itemClass = item.owned ? 'owned' : 'not-owned';

  return `
    <div class="inventory-item-card ${itemClass}" data-item="${item.itemName}">
      <div class="item-icon">
        <img src="${imageUrl}" alt="${item.itemName}" onerror="this.src='/images/ankleicon.png'" />
      </div>
      <div class="item-details">
        <h4 class="item-name">${item.itemName}</h4>
        <div class="item-meta">
          <span class="item-quantity ${item.owned ? 'has-quantity' : 'no-quantity'}">
            ${quantityDisplay}
          </span>
          ${item.type ? `<span class="item-type">${Array.isArray(item.type) ? item.type.join(', ') : item.type}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function formatItemImageUrl(image) {
  if (!image || image === 'No Image') return '/images/ankleicon.png';
  
  if (image.startsWith('https://storage.googleapis.com/tinglebot/')) {
    const path = image.replace('https://storage.googleapis.com/tinglebot/', '');
    return `/api/images/${path}`;
  }
  
  return image;
}

// ------------------- History View -------------------
function renderHistoryView() {
  if (!historyData) return;

  const container = document.getElementById('history-table-container');
  if (!container) return;

  // Setup filters
  setupHistoryFilters();

  // Filter and render logs
  const filteredLogs = filterHistoryLogs(historyData);
  
  // Render table
  container.innerHTML = renderHistoryTable(filteredLogs);
}

function setupHistoryFilters() {
  const filtersContainer = document.getElementById('history-filters');
  if (!filtersContainer) return;

  // Get unique values for filters
  const obtainMethods = [...new Set(historyData.map(log => log.obtain).filter(Boolean))].sort();
  const locations = [...new Set(historyData.map(log => log.location).filter(Boolean))].sort();

  const { bar: filterBar } = createSearchFilterBar({
    layout: 'compact',
    filters: [
      {
        type: 'input',
        id: 'history-search',
        placeholder: 'Search items...',
        attributes: { autocomplete: 'off' },
        width: 'double'
      },
      {
        type: 'select',
        id: 'history-obtain',
        options: [
          { value: 'all', label: 'All Methods', selected: true },
          ...obtainMethods.map(method => ({ value: method, label: method }))
        ]
      },
      {
        type: 'select',
        id: 'history-location',
        options: [
          { value: 'all', label: 'All Locations', selected: true },
          ...locations.map(loc => ({ value: loc, label: loc }))
        ]
      },
      {
        type: 'input',
        id: 'history-start-date',
        placeholder: 'Start Date (YYYY-MM-DD)',
        attributes: { type: 'date' }
      },
      {
        type: 'input',
        id: 'history-end-date',
        placeholder: 'End Date (YYYY-MM-DD)',
        attributes: { type: 'date' }
      }
    ],
    buttons: [
      {
        id: 'history-clear-filters',
        label: 'Clear Filters',
        className: 'clear-filters-btn'
      }
    ]
  });

  filtersContainer.innerHTML = '';
  filtersContainer.appendChild(filterBar);

  // Attach event listeners
  const searchInput = document.getElementById('history-search');
  const obtainSelect = document.getElementById('history-obtain');
  const locationSelect = document.getElementById('history-location');
  const startDateInput = document.getElementById('history-start-date');
  const endDateInput = document.getElementById('history-end-date');
  const clearBtn = document.getElementById('history-clear-filters');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilters.history.search = e.target.value;
      renderHistoryView();
    });
  }
  if (obtainSelect) {
    obtainSelect.addEventListener('change', (e) => {
      currentFilters.history.obtain = e.target.value;
      renderHistoryView();
    });
  }
  if (locationSelect) {
    locationSelect.addEventListener('change', (e) => {
      currentFilters.history.location = e.target.value;
      renderHistoryView();
    });
  }
  if (startDateInput) {
    startDateInput.addEventListener('change', (e) => {
      currentFilters.history.startDate = e.target.value;
      renderHistoryView();
    });
  }
  if (endDateInput) {
    endDateInput.addEventListener('change', (e) => {
      currentFilters.history.endDate = e.target.value;
      renderHistoryView();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      currentFilters.history = { search: '', obtain: 'all', location: 'all', startDate: '', endDate: '' };
      if (searchInput) searchInput.value = '';
      if (obtainSelect) obtainSelect.value = 'all';
      if (locationSelect) locationSelect.value = 'all';
      if (startDateInput) startDateInput.value = '';
      if (endDateInput) endDateInput.value = '';
      renderHistoryView();
    });
  }
}

function filterHistoryLogs(logs) {
  const filters = currentFilters.history;

  return logs.filter(log => {
    // Search filter
    if (filters.search && !log.itemName.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }

    // Obtain method filter
    if (filters.obtain !== 'all' && log.obtain !== filters.obtain) {
      return false;
    }

    // Location filter
    if (filters.location !== 'all' && log.location !== filters.location) {
      return false;
    }

    // Date range filter
    if (filters.startDate || filters.endDate) {
      const logDate = new Date(log.dateTime);
      if (filters.startDate && logDate < new Date(filters.startDate)) {
        return false;
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999); // Include full end date
        if (logDate > endDate) {
          return false;
        }
      }
    }

    return true;
  });
}

function renderHistoryTable(logs) {
  if (logs.length === 0) {
    return '<div class="empty-state"><p>No acquisition history matches the current filters.</p></div>';
  }

  return `
    <div class="history-table-wrapper">
      <table class="history-table">
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Quantity</th>
            <th>Category</th>
            <th>Type</th>
            <th>Obtained</th>
            <th>Location</th>
            <th>Date/Time</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(log => renderHistoryRow(log)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderHistoryRow(log) {
  const dateTime = new Date(log.dateTime);
  const formattedDate = dateTime.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const linkHtml = log.link 
    ? `<a href="${log.link}" target="_blank" rel="noopener noreferrer" class="history-link"><i class="fas fa-external-link-alt"></i></a>`
    : '-';

  return `
    <tr>
      <td>${log.itemName}</td>
      <td>${log.quantity}</td>
      <td>${log.category || '-'}</td>
      <td>${log.type || '-'}</td>
      <td>${log.obtain || '-'}</td>
      <td>${log.location || '-'}</td>
      <td>${formattedDate}</td>
      <td class="link-cell">${linkHtml}</td>
    </tr>
  `;
}

// ------------------- Error Handling -------------------
function showError(message) {
  const container = document.querySelector('.main-content');
  if (container) {
    container.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h2>Error</h2>
        <p>${message}</p>
      </div>
    `;
  }
}
