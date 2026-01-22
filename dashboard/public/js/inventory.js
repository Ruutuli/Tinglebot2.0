// ============================================================================
// Inventory Management System - Clean, Modular Version
// Simplified inventory view showing character cards with basic stats
// ============================================================================

// ------------------- State Management -------------------
let characterData = [];
let filteredData = [];
let currentPage = 1;
let itemsPerPage = 16;
let filters = {
  search: '',
  village: 'all',
  sortBy: 'character-asc'
};
let characterItemsCache = new Map(); // Cache for character inventory items
let charactersShowingAllItems = new Set(); // Track which characters are showing all items (not just first 50)

// ------------------- API Layer -------------------
/**
 * Fetches inventory list from API
 * @returns {Promise<Array>} Character data with inventory summaries
 */
async function fetchInventoryList() {
  try {
    const response = await fetch('/api/inventory/list');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching inventory list:', error);
    throw error;
  }
}

/**
 * Fetches items for a specific character
 * @param {string} characterName - Name of the character
 * @returns {Promise<Array>} Character's inventory items
 */
async function fetchCharacterItems(characterName) {
  // Check cache first
  if (characterItemsCache.has(characterName)) {
    return characterItemsCache.get(characterName);
  }

  try {
    const response = await fetch(`/api/inventory/character/${encodeURIComponent(characterName)}/items`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    const items = data || [];
    
    // Cache the items
    characterItemsCache.set(characterName, items);
    return items;
  } catch (error) {
    console.error(`❌ Error fetching items for ${characterName}:`, error);
    return [];
  }
}

// ------------------- Filter Utilities -------------------
/**
 * Applies filters to character data
 * @param {Array} data - Character data to filter
 * @returns {Array} Filtered character data
 */
function applyFilters(data) {
  let filtered = [...data];

  // Search filter
  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    filtered = filtered.filter(char => 
      char.characterName.toLowerCase().includes(searchTerm)
    );
  }

  // Village filter
  if (filters.village !== 'all') {
    filtered = filtered.filter(char => 
      char.currentVillage && 
      char.currentVillage.toLowerCase() === filters.village.toLowerCase()
    );
  }

  // Sort
  filtered = applySorting(filtered, filters.sortBy);

  return filtered;
}

/**
 * Applies sorting to character data
 * @param {Array} data - Data to sort
 * @param {string} sortBy - Sort field and direction (e.g., 'character-asc')
 * @returns {Array} Sorted data
 */
function applySorting(data, sortBy) {
  const [field, direction] = sortBy.split('-');
  const isAsc = direction === 'asc';

  return [...data].sort((a, b) => {
    let valA, valB;
    
    switch (field) {
      case 'character':
        valA = (a.characterName || '').toLowerCase();
        valB = (b.characterName || '').toLowerCase();
        break;
      case 'items':
        valA = a.uniqueItems || 0;
        valB = b.uniqueItems || 0;
        break;
      case 'total':
        valA = a.totalItems || 0;
        valB = b.totalItems || 0;
        break;
      default:
        valA = a[field] || '';
        valB = b[field] || '';
    }
    
    if (typeof valA === 'string') {
      return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return isAsc ? valA - valB : valB - valA;
    }
  });
}

/**
 * Gets unique villages from character data
 * @param {Array} data - Character data
 * @returns {Array} Sorted list of unique villages
 */
function getUniqueVillages(data) {
  const villages = new Set();
  data.forEach(char => {
    if (char.currentVillage && char.currentVillage.trim()) {
      villages.add(char.currentVillage.trim());
    }
  });
  return Array.from(villages).sort();
}

// ------------------- Render Layer -------------------
/**
 * Renders skeleton loading cards
 * @param {HTMLElement} container - Container element
 * @param {number} count - Number of skeleton cards to render
 */
function renderSkeletonCards(container, count = 8) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="inventory-character-card skeleton">
      <div class="inventory-character-avatar skeleton-shimmer"></div>
      <div class="inventory-character-content">
        <div class="skeleton-shimmer skeleton-title"></div>
        <div class="skeleton-shimmer skeleton-text"></div>
        <div class="skeleton-shimmer skeleton-text"></div>
      </div>
    </div>
  `).join('');
}

/**
 * Renders character cards grid
 * @param {Array} characters - Character data to render
 * @param {HTMLElement} container - Container element
 */
function renderCharacterGrid(characters, container) {
  if (characters.length === 0) {
  container.innerHTML = `
      <div class="blank-empty-state">
        <i class="fas fa-search"></i>
        <h3>No characters found</h3>
        <p>Try adjusting your search or filters</p>
    </div>
  `;
    return;
  }

  container.innerHTML = characters.map(char => renderCharacterCard(char)).join('');
  
  // Add click handlers to navigate to OC pages
  const characterCards = container.querySelectorAll('.inventory-character-card');
  characterCards.forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't navigate if clicking on a link or button inside the card
      if (e.target.closest('a') || e.target.closest('button')) {
        return;
      }
      
      const characterName = card.getAttribute('data-character');
      if (!characterName) return;
      
      // Generate URL slug from character name (same logic as backend)
      const nameSlug = characterName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      
      // Navigate to OC page
      window.location.href = `/ocs/${nameSlug}`;
    });
    
    // Add cursor pointer style to indicate clickability
    card.style.cursor = 'pointer';
  });
}

/**
 * Renders items list for a character
 * @param {Array} items - Character's items
 * @param {string} characterName - Character name for tracking expanded state
 * @returns {string} HTML for items list
 */
function renderCharacterItems(items, characterName) {
  if (!items || items.length === 0) {
    return '<div class="inventory-items-empty">No items</div>';
  }

  const showAll = charactersShowingAllItems.has(characterName);
  const itemsToShow = showAll ? items : items.slice(0, 50);
  const hasMore = items.length > 50 && !showAll;

  return `
    <div class="inventory-items-list">
      ${itemsToShow.map(item => {
        const itemNameEscaped = escapeHtml(item.itemName || 'Unknown');
        return `
          <div class="inventory-item-row">
            <span class="inventory-item-name">${itemNameEscaped}</span>
            <span class="inventory-item-quantity">×${item.quantity || 0}</span>
          </div>
        `;
      }).join('')}
      ${hasMore ? `<div class="inventory-items-more clickable" data-character-name="${escapeHtml(characterName)}">+${items.length - 50} more items</div>` : ''}
    </div>
  `;
}

/**
 * Renders a single character card
 * @param {Object} char - Character data
 * @returns {string} HTML for character card
 */
function renderCharacterCard(char) {
  const iconUrl = char.icon && char.icon.startsWith('http')
    ? char.icon
    : '/images/ankleicon.png';
  
  const characterNameEscaped = escapeHtml(char.characterName || 'Unknown');
  const fullInventoryUrl = `/character-inventory.html?character=${encodeURIComponent(char.characterName)}`;
  const hasCachedItems = characterItemsCache.has(char.characterName);
  const cachedItems = hasCachedItems ? characterItemsCache.get(char.characterName) : [];

  return `
    <div class="inventory-character-card" data-character="${characterNameEscaped}">
      <div class="inventory-character-avatar">
        <img src="${iconUrl}" alt="${characterNameEscaped} avatar" onerror="this.src='/images/ankleicon.png'" />
      </div>
      <div class="inventory-character-content">
        <h3 class="inventory-character-name">${characterNameEscaped}</h3>
        <div class="inventory-character-stats">
          <div class="inventory-stat">
            <i class="fas fa-box"></i>
            <span>${char.uniqueItems || 0} items</span>
          </div>
          <div class="inventory-stat">
            <i class="fas fa-layer-group"></i>
            <span>${char.totalItems || 0} total</span>
          </div>
        </div>
        <div class="inventory-character-meta">
          ${char.job ? `<span class="inventory-meta-item"><i class="fas fa-briefcase"></i> ${char.job}</span>` : ''}
          ${char.currentVillage ? `<span class="inventory-meta-item"><i class="fas fa-map-marker-alt"></i> ${char.currentVillage}</span>` : ''}
        </div>
        <div class="inventory-character-actions">
          <a href="${fullInventoryUrl}" class="inventory-view-full-button">
            <i class="fas fa-external-link-alt"></i>
            View Full Inventory
          </a>
        </div>
        <div class="inventory-items-section">
          ${hasCachedItems ? renderCharacterItems(cachedItems, char.characterName) : '<div class="inventory-items-loading"><i class="fas fa-spinner fa-spin"></i> Loading items...</div>'}
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders pagination controls
 * @param {HTMLElement} container - Container element
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 */
function renderPagination(container, currentPage, totalPages) {
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const createButton = (label, pageNum, isActive = false, icon = null) => {
    const button = document.createElement('button');
    button.className = `pagination-button ${isActive ? 'active' : ''}`;
    button.textContent = icon ? '' : label;
    if (icon) {
      button.innerHTML = `<i class="fas fa-chevron-${icon}"></i>`;
    }
    button.title = `Page ${pageNum}`;
    button.onclick = () => handlePageChange(pageNum);
    return button;
  };

  const createEllipsis = (minPage, maxPage) => {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'pagination-ellipsis';
    ellipsis.textContent = '...';
    ellipsis.title = `Click to jump to a page (${minPage}-${maxPage})`;
    ellipsis.style.cursor = 'pointer';
    ellipsis.onclick = () => {
      showPageJumpModal(minPage, maxPage, totalPages);
    };
    return ellipsis;
  };

  const paginationDiv = document.createElement('div');
  paginationDiv.className = 'pagination';

  // Previous button
  if (currentPage > 1) {
    paginationDiv.appendChild(createButton('Previous', currentPage - 1, false, 'left'));
  }

  // Page numbers
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    paginationDiv.appendChild(createButton('1', 1));
    if (startPage > 2) {
      paginationDiv.appendChild(createEllipsis(2, startPage - 1));
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    paginationDiv.appendChild(createButton(i.toString(), i, i === currentPage));
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationDiv.appendChild(createEllipsis(endPage + 1, totalPages - 1));
    }
    paginationDiv.appendChild(createButton(totalPages.toString(), totalPages));
  }

  // Next button
  if (currentPage < totalPages) {
    paginationDiv.appendChild(createButton('Next', currentPage + 1, false, 'right'));
  }

  container.innerHTML = '';
  container.appendChild(paginationDiv);
}

/**
 * Renders results info
 * @param {HTMLElement} container - Container element
 * @param {number} currentCount - Current items shown
 * @param {number} totalCount - Total items available
 */
function renderResultsInfo(container, currentCount, totalCount) {
  if (!container) return;
  
  let message = '';
  if (currentCount === totalCount) {
    message = `Showing ${currentCount} character${currentCount !== 1 ? 's' : ''}`;
  } else {
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(start + itemsPerPage - 1, totalCount);
    message = `Showing ${start}-${end} of ${totalCount} character${totalCount !== 1 ? 's' : ''}`;
  }
  
  container.textContent = message;
}

// ------------------- Event Handlers -------------------
/**
 * Handles page change
 * @param {number} page - Page number to navigate to
 */
function handlePageChange(page) {
  currentPage = page;
  render();
  // Load items for newly visible characters
  loadItemsForVisibleCharacters();
}

/**
 * Handles filter changes and re-renders
 */
function handleFilterChange() {
  currentPage = 1;
  render();
  // Load items for newly visible characters
  loadItemsForVisibleCharacters();
}

/**
 * Sets up filter event listeners
 */
function setupFilters() {
  const searchInput = document.getElementById('inventory-search');
  const villageFilter = document.getElementById('inventory-village-filter');
  const sortSelect = document.getElementById('inventory-sort');
  const itemsPerPageSelect = document.getElementById('inventory-items-per-page');
  const clearBtn = document.getElementById('inventory-clear-filters');

  // Search with debouncing
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filters.search = e.target.value;
        handleFilterChange();
      }, 300);
    });
  }

  // Village filter
  if (villageFilter) {
    villageFilter.addEventListener('change', (e) => {
      filters.village = e.target.value;
      handleFilterChange();
    });
  }

  // Sort
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      filters.sortBy = e.target.value;
      handleFilterChange();
    });
  }

  // Items per page
  if (itemsPerPageSelect) {
    itemsPerPageSelect.addEventListener('change', (e) => {
      itemsPerPage = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
      currentPage = 1;
      render();
    });
  }

  // Clear filters
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filters = { search: '', village: 'all', sortBy: 'character-asc' };
      if (searchInput) searchInput.value = '';
      if (villageFilter) villageFilter.value = 'all';
      if (sortSelect) sortSelect.value = 'character-asc';
      if (itemsPerPageSelect) itemsPerPageSelect.value = '16';
      itemsPerPage = 16;
      currentPage = 1;
      render();
    });
  }
}

// ------------------- Main Render Function -------------------
/**
 * Main render function - updates all UI elements
 */
function render() {
  const contentDiv = document.getElementById('model-details-data');
  if (!contentDiv) return;

  const gridContainer = document.getElementById('inventory-grid');
    const paginationContainer = document.getElementById('inventory-pagination');
    const resultsInfo = document.querySelector('.model-results-info');

  // Apply filters
  filteredData = applyFilters(characterData);

  // Paginate
  const effectiveItemsPerPage = itemsPerPage === 'all' 
    ? filteredData.length 
    : itemsPerPage;
  const totalPages = effectiveItemsPerPage === 0 
    ? 1 
    : Math.ceil(filteredData.length / effectiveItemsPerPage);
  const startIndex = (currentPage - 1) * effectiveItemsPerPage;
  const endIndex = startIndex + effectiveItemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  // Render
  if (gridContainer) {
    renderCharacterGrid(paginatedData, gridContainer);
  }
  
  if (paginationContainer) {
    renderPagination(paginationContainer, currentPage, totalPages);
  }

  if (resultsInfo) {
    renderResultsInfo(resultsInfo, paginatedData.length, filteredData.length);
  }
}

// ------------------- Initialization -------------------
/**
 * Shows the page jump modal when ellipsis is clicked
 * @param {number} minPage - Minimum page number
 * @param {number} maxPage - Maximum page number
 * @param {number} totalPages - Total number of pages
 */
function showPageJumpModal(minPage, maxPage, totalPages) {
  // Remove existing modal if any
  const existingModal = document.getElementById('inventory-page-jump-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const pageRange = minPage === maxPage ? `Page ${minPage}` : `Pages ${minPage}-${maxPage}`;
  
  const overlay = document.createElement('div');
  overlay.className = 'blank-page-jump-modal-overlay';
  overlay.id = 'inventory-page-jump-modal';
  
  const modal = document.createElement('div');
  modal.className = 'blank-page-jump-modal';
  
  modal.innerHTML = `
    <div class="blank-page-jump-modal-header">
      <h3 class="blank-page-jump-modal-title">
        <i class="fas fa-arrow-right"></i>
        Jump to Page
      </h3>
      <button class="blank-page-jump-modal-close" aria-label="Close modal">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="blank-page-jump-modal-body">
      <label class="blank-page-jump-modal-label" for="inventory-page-jump-input">
        Enter a page number (${pageRange}):
      </label>
      <input 
        type="number" 
        id="inventory-page-jump-input" 
        class="blank-page-jump-modal-input" 
        min="1" 
        max="${totalPages}" 
        value="${minPage}"
        placeholder="Enter page number"
        autofocus
      />
      <div class="blank-page-jump-modal-info">
        Valid range: 1 - ${totalPages}
      </div>
      <div class="blank-page-jump-modal-error" id="inventory-page-jump-error"></div>
    </div>
    <div class="blank-page-jump-modal-actions">
      <button class="blank-page-jump-modal-btn blank-page-jump-modal-btn-cancel">
        Cancel
      </button>
      <button class="blank-page-jump-modal-btn blank-page-jump-modal-btn-submit">
        <i class="fas fa-check"></i>
        Go to Page
      </button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Show modal with animation
  setTimeout(() => {
    overlay.classList.add('active');
  }, 10);
  
  const input = modal.querySelector('#inventory-page-jump-input');
  const errorMsg = modal.querySelector('#inventory-page-jump-error');
  const submitBtn = modal.querySelector('.blank-page-jump-modal-btn-submit');
  const cancelBtn = modal.querySelector('.blank-page-jump-modal-btn-cancel');
  const closeBtn = modal.querySelector('.blank-page-jump-modal-close');
  
  const validateAndSubmit = () => {
    const pageNum = parseInt(input.value, 10);
    errorMsg.classList.remove('active');
    
    if (!pageNum || isNaN(pageNum)) {
      errorMsg.textContent = 'Please enter a valid page number.';
      errorMsg.classList.add('active');
      input.focus();
      return;
    }
    
    if (pageNum < 1 || pageNum > totalPages) {
      errorMsg.textContent = `Please enter a page number between 1 and ${totalPages}.`;
      errorMsg.classList.add('active');
      input.focus();
      return;
    }
    
    hidePageJumpModal();
    handlePageChange(pageNum);
  };
  
  const hidePageJumpModal = () => {
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.remove();
    }, 300);
  };
  
  // Event listeners
  submitBtn.onclick = validateAndSubmit;
  cancelBtn.onclick = hidePageJumpModal;
  closeBtn.onclick = hidePageJumpModal;
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      hidePageJumpModal();
    }
  };
  
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validateAndSubmit();
    } else if (e.key === 'Escape') {
      hidePageJumpModal();
    }
  };
  
  // Focus input
  input.select();
}

/**
 * Initializes the inventory page
 * @param {Array} data - Legacy data parameter (not used)
 * @param {number} page - Starting page number
 * @param {HTMLElement} contentDiv - Content container element
 */
async function initializeInventoryPage(data, page = 1, contentDiv) {
  console.log(`[Inventory Load] 📦 initializeInventoryPage started at ${new Date().toISOString()}`, {
    hasContentDiv: !!contentDiv,
    page: page
  });
  
  const targetContent = contentDiv || document.getElementById('model-details-data');
  if (!targetContent) {
    console.error('❌ Content div not found');
    return;
  }

  // Show loading state
  console.log(`[Inventory Load] 📍 Setting loading state in initializeInventoryPage at ${new Date().toISOString()}`);
  targetContent.innerHTML = `
    <div class="model-loading-overlay">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading inventory data...</p>
    </div>
    `;
  
  const loadingOverlay = targetContent.querySelector('.model-loading-overlay');
  console.log(`[Inventory Load] ✅ Loading overlay set in initializeInventoryPage. DOM check:`, loadingOverlay ? '✅ Found in DOM' : '❌ Not found in DOM');

  try {
    // Fetch data
    console.log(`[Inventory Load] 🌐 Starting fetchInventoryList at ${new Date().toISOString()}`);
    const fetchStartTime = performance.now();
    characterData = await fetchInventoryList();
    const fetchDuration = performance.now() - fetchStartTime;
    console.log(`[Inventory Load] ✅ fetchInventoryList completed in ${fetchDuration.toFixed(2)}ms at ${new Date().toISOString()}, got ${characterData?.length || 0} characters`);
    currentPage = page || 1;

    // Build structure
    targetContent.innerHTML = `
      <div class="blank-filters-wrapper"></div>
      <div class="model-results-info"></div>
      <div class="inventory-grid-container">
        <div id="inventory-grid" class="inventory-grid"></div>
      </div>
      <div id="inventory-pagination" class="model-pagination blank-pagination"></div>
    `;

    // Create filters wrapper
    const filtersWrapper = targetContent.querySelector('.blank-filters-wrapper');
    
    // Create separate search bar
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'model-search-wrapper blank-search-wrapper';
    
    const searchBar = document.createElement('div');
    searchBar.className = 'model-search-bar blank-search-bar';
    
    const searchIcon = document.createElement('i');
    searchIcon.className = 'fas fa-search model-search-icon blank-search-icon';
    searchIcon.setAttribute('aria-hidden', 'true');
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'inventory-search';
    searchInput.className = 'model-search-input blank-search-input';
    searchInput.placeholder = 'Search characters...';
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('aria-label', 'Search characters');
    
    searchBar.appendChild(searchIcon);
    searchBar.appendChild(searchInput);
    searchWrapper.appendChild(searchBar);
    filtersWrapper.appendChild(searchWrapper);

    // Create separate filter bar
    const villages = getUniqueVillages(characterData);
    const filterWrapper = document.createElement('div');
    filterWrapper.className = 'model-filter-wrapper blank-filter-wrapper';
    
    const filterBar = document.createElement('div');
    filterBar.className = 'model-filter-bar blank-filter-bar';

    // Village Filter
    const villageControl = document.createElement('div');
    villageControl.className = 'model-filter-control blank-filter-control';
    const villageLabel = document.createElement('label');
    villageLabel.className = 'model-filter-label blank-filter-label';
    villageLabel.innerHTML = '<i class="fas fa-home"></i> Village';
    villageLabel.setAttribute('for', 'inventory-village-filter');
    const villageSelect = document.createElement('select');
    villageSelect.id = 'inventory-village-filter';
    villageSelect.className = 'model-filter-select blank-filter-select';
    villageSelect.innerHTML = `
      <option value="all" selected>All Villages</option>
      ${villages.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
    `;
    villageControl.appendChild(villageLabel);
    villageControl.appendChild(villageSelect);
    filterBar.appendChild(villageControl);

    // Sort Filter
    const sortControl = document.createElement('div');
    sortControl.className = 'model-filter-control blank-filter-control';
    const sortLabel = document.createElement('label');
    sortLabel.className = 'model-filter-label blank-filter-label';
    sortLabel.innerHTML = '<i class="fas fa-sort"></i> Sort By';
    sortLabel.setAttribute('for', 'inventory-sort');
    const sortSelect = document.createElement('select');
    sortSelect.id = 'inventory-sort';
    sortSelect.className = 'model-filter-select blank-filter-select';
    sortSelect.innerHTML = `
      <option value="character-asc" selected>Character (A-Z)</option>
      <option value="character-desc">Character (Z-A)</option>
      <option value="items-desc">Most Items</option>
      <option value="items-asc">Least Items</option>
      <option value="total-desc">Most Total</option>
      <option value="total-asc">Least Total</option>
    `;
    sortControl.appendChild(sortLabel);
    sortControl.appendChild(sortSelect);
    filterBar.appendChild(sortControl);

    // Items Per Page
    const itemsPerPageControl = document.createElement('div');
    itemsPerPageControl.className = 'model-filter-control blank-filter-control';
    const itemsPerPageLabel = document.createElement('label');
    itemsPerPageLabel.className = 'model-filter-label blank-filter-label';
    itemsPerPageLabel.innerHTML = '<i class="fas fa-list"></i> Per Page';
    itemsPerPageLabel.setAttribute('for', 'inventory-items-per-page');
    const itemsPerPageSelect = document.createElement('select');
    itemsPerPageSelect.id = 'inventory-items-per-page';
    itemsPerPageSelect.className = 'model-filter-select blank-filter-select';
    itemsPerPageSelect.innerHTML = `
      <option value="16" selected>16 per page</option>
      <option value="24">24 per page</option>
      <option value="36">36 per page</option>
      <option value="48">48 per page</option>
      <option value="all">All characters</option>
    `;
    itemsPerPageControl.appendChild(itemsPerPageLabel);
    itemsPerPageControl.appendChild(itemsPerPageSelect);
    filterBar.appendChild(itemsPerPageControl);

    // Clear Filters Button
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.id = 'inventory-clear-filters';
    clearButton.className = 'model-clear-filters-btn blank-clear-filters-btn';
    clearButton.innerHTML = '<i class="fas fa-times"></i> Clear Filters';
    filterBar.appendChild(clearButton);

    filterWrapper.appendChild(filterBar);
    filtersWrapper.appendChild(filterWrapper);

    // Show skeleton cards while data loads
    const gridContainer = document.getElementById('inventory-grid');
    if (gridContainer) {
      renderSkeletonCards(gridContainer);
    }

    // Setup filters and render
    setupFilters();
    
    // Setup event delegation for "more items" click
    targetContent.addEventListener('click', (e) => {
      const moreItemsLink = e.target.closest('.inventory-items-more.clickable');
      if (moreItemsLink) {
        const characterName = moreItemsLink.getAttribute('data-character-name');
        if (characterName) {
          charactersShowingAllItems.add(characterName);
          render();
        }
      }
    });
    
    // Small delay to show skeleton briefly, then render
    console.log(`[Inventory Load] ⏱️  Waiting 100ms before render at ${new Date().toISOString()}`);
    setTimeout(() => {
      console.log(`[Inventory Load] 🎨 Calling render() at ${new Date().toISOString()}`);
      render();
      // Load items for all visible characters
      console.log(`[Inventory Load] 📋 Loading items for visible characters at ${new Date().toISOString()}`);
      loadItemsForVisibleCharacters();
      console.log(`[Inventory Load] ✅ Page initialization complete at ${new Date().toISOString()}`);
    }, 100);

  } catch (error) {
    console.error(`[Inventory Load] ❌ Error in initializeInventoryPage at ${new Date().toISOString()}:`, error);
    console.error('❌ Error initializing inventory page:', error);
    targetContent.innerHTML = `
      <div class="blank-error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error loading inventory data</h3>
        <p>${error.message}</p>
        <button class="retry-button" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

// ------------------- Utility Functions -------------------
/**
 * Escapes HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ------------------- Load Items for Visible Characters -------------------
/**
 * Loads items for all currently visible character cards
 */
async function loadItemsForVisibleCharacters() {
  // Apply filters first
  const filtered = applyFilters(characterData);
  
  // Calculate pagination
  const effectiveItemsPerPage = itemsPerPage === 'all' 
    ? filtered.length 
    : itemsPerPage;
  const startIndex = (currentPage - 1) * effectiveItemsPerPage;
  const endIndex = startIndex + effectiveItemsPerPage;
  const visibleCharacters = filtered.slice(startIndex, endIndex);

  // Load items for characters that aren't cached yet
  const loadPromises = visibleCharacters
    .filter(char => !characterItemsCache.has(char.characterName))
    .map(async (char) => {
      try {
        const items = await fetchCharacterItems(char.characterName);
        // Re-render after each load to show progress
        render();
      } catch (error) {
        console.error(`Error loading items for ${char.characterName}:`, error);
      }
    });

  await Promise.all(loadPromises);
}

// ------------------- Exports -------------------
export {
  initializeInventoryPage
};
