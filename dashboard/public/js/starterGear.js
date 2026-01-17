/* ====================================================================== */
/* Starter Gear Rendering and Filtering Module                            */
/* Only shows a specific set of starter gear items for new characters.    */
/* ====================================================================== */

import { scrollToTop } from './ui.js';
import { renderItemCards } from './items.js';

// List of allowed starter gear item names
const STARTER_GEAR_NAMES = [
  'Soup Ladle',
  'Pot Lid',
  'Wooden Shield',
  'Wooden Bow',
  'Boomerang',
  'Emblazoned Shield',
  "Fisherman's Shield",
  "Hunter's Shield",
  "Traveler's Shield",
  'Rusty Broadsword',
  "Traveler's Sword",
  "Woodcutter's Axe",
  "Traveler's Bow",
  'Wooden Mop',
  'Rusty Claymore',
  "Traveler's Claymore",
  'Tree Branch',
  'Rusty Shield',
  'Korok Leaf',
  'Farming Hoe',
  "Farmer's Pitchfork",
  'Rusty Halberd',
  "Traveler's Spear",
  'Old Shirt',
  'Well-Worn Trousers'
];

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "'") // replace curly apostrophes with straight
    .replace(/[^a-z0-9' ]/gi, '') // remove non-alphanumerics except apostrophe and space
    .trim();
}

function filterStarterGear(items) {
  const normalizedSet = new Set(STARTER_GEAR_NAMES.map(normalizeName));
  return items.filter(item => normalizedSet.has(normalizeName(item.itemName)));
}

// Helper function to split comma-separated values and handle arrays
const splitValues = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap(v => splitValues(v));
  }
  if (typeof value === 'string') {
    return value.split(',').map(v => v.trim()).filter(v => v);
  }
  return [];
};

// Helper to populate a <select> element with new options
function populateSelect(id, values) {
  const select = document.getElementById(id);
  if (!select) return;

  select.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());

  const formatted = values
    .map(v => capitalize(v.toString().toLowerCase()))
    .sort();

  formatted.forEach(val => {
    const option = document.createElement('option');
    option.value = val.toLowerCase();
    option.textContent = val;
    select.appendChild(option);
  });
}

// Capitalizes the first letter of a string safely
function capitalize(str) {
  return typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// Load filter options for starter gear
async function loadFilterOptionsFromJSON() {
  try {
    const response = await fetch('/js/itemFilterOptions.json');
    if (!response.ok) {
      return;
    }
    
    const filterOptions = await response.json();
    
    // Use all categories from JSON
    populateSelect('starter-gear-filter-category', filterOptions.categories || []);
    
    // Use only specific types for starter gear
    const starterGearTypes = ['1H', '2H', 'Chest', 'Legs'];
    populateSelect('starter-gear-filter-type', starterGearTypes);
    
    // Use only specific subtypes for starter gear
    const starterGearSubtypes = ['Club', 'Shield', 'Bow', 'Boomerang', 'Sword', 'Axe', 'Spear', 'Leaf', 'Polearm', 'Shirt', 'Trousers'];
    populateSelect('starter-gear-filter-subtype', starterGearSubtypes);
    
  } catch (error) {
  }
}

// Populate filter options
async function populateFilterOptions(items) {
  await loadFilterOptionsFromJSON();
  
  if (items?.length) {
  }
}

// Setup filters for starter gear
async function setupStarterGearFilters(items) {

  window.allStarterGearItems = items;

  if (window.starterGearFiltersInitialized) {
    window.filterStarterGearItems();
    return;
  }

  // Show the filters wrapper (already shown, no need to set display)
  const filtersWrapper = document.querySelector('.starter-gear-filters-wrapper');
  if (filtersWrapper) {
    filtersWrapper.style.display = 'block';
  }

  const searchInput = document.getElementById('starter-gear-search-input');
  const categorySelect = document.getElementById('starter-gear-filter-category');
  const typeSelect = document.getElementById('starter-gear-filter-type');
  const subtypeSelect = document.getElementById('starter-gear-filter-subtype');
  const sortSelect = document.getElementById('starter-gear-sort-by');
  const itemsPerPageSelect = document.getElementById('starter-gear-items-per-page');
  const clearFiltersBtn = document.getElementById('starter-gear-clear-filters');

  const missing = [searchInput, categorySelect, typeSelect, subtypeSelect, sortSelect, itemsPerPageSelect, clearFiltersBtn].some(el => !el);
  if (missing) {
    if (!window.starterGearFilterSetupRetried) {
      window.starterGearFilterSetupRetried = true;
      requestAnimationFrame(() => setupStarterGearFilters(items));
    } else {
    }
    return;
  }

  window.starterGearFilterSetupRetried = false;

  // Populate filter options
  await populateFilterOptions(items);

  // Restore filter state if it exists
  const savedFilterState = window.savedStarterGearFilterState || {};
  if (savedFilterState.searchTerm) searchInput.value = savedFilterState.searchTerm;
  if (savedFilterState.categoryFilter) categorySelect.value = savedFilterState.categoryFilter;
  if (savedFilterState.typeFilter) typeSelect.value = savedFilterState.typeFilter;
  if (savedFilterState.subtypeFilter) subtypeSelect.value = savedFilterState.subtypeFilter;
  if (savedFilterState.sortBy) sortSelect.value = savedFilterState.sortBy;

  // Main filtering function
  window.filterStarterGearItems = function (page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value.toLowerCase();
    const typeFilter = typeSelect.value.toLowerCase();
    const subtypeFilter = subtypeSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const itemsPerPage = itemsPerPageSelect.value === 'all' ? window.allStarterGearItems.length : parseInt(itemsPerPageSelect.value);

    // Save current filter state
    window.savedStarterGearFilterState = {
      searchTerm: searchInput.value,
      categoryFilter,
      typeFilter,
      subtypeFilter,
      sortBy,
      itemsPerPage
    };

    // Apply filters
    const filtered = window.allStarterGearItems.filter(item => {
      const matchesSearch = !searchTerm ||
        item.itemName?.toLowerCase().includes(searchTerm) ||
        splitValues(item.category).some(cat => cat.toLowerCase().includes(searchTerm)) ||
        splitValues(item.type).some(type => type.toLowerCase().includes(searchTerm)) ||
        splitValues(item.subtype).some(subtype => subtype.toLowerCase().includes(searchTerm));

      const itemCategories = splitValues(item.category);
      const matchesCategory = categoryFilter === 'all' || 
        itemCategories.some(cat => cat.toLowerCase() === categoryFilter);
      
      const itemTypes = splitValues(item.type);
      const matchesType = typeFilter === 'all' || 
        itemTypes.some(type => type.toLowerCase() === typeFilter);
      
      const itemSubtypes = splitValues(item.subtype);
      const matchesSubtype = subtypeFilter === 'all' || 
        itemSubtypes.some(subtype => subtype.toLowerCase() === subtypeFilter);

      return matchesSearch && matchesCategory && matchesType && matchesSubtype;
    });

    // Apply sorting
    const [field, direction] = sortBy.split('-');
    const isAsc = direction === 'asc';

    const sorted = [...filtered].sort((a, b) => {
      let valA, valB;
      
      switch (field) {
        case 'name':
          valA = a.itemName ?? '';
          valB = b.itemName ?? '';
          break;
        case 'price':
          valA = a.buyPrice ?? 0;
          valB = b.buyPrice ?? 0;
          break;
        default:
          valA = a[field] ?? '';
          valB = b[field] ?? '';
      }
      
      return isAsc
        ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
        : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
    });


    // Apply pagination
    const totalPages = Math.ceil(sorted.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = sorted.slice(startIndex, endIndex);

    // Update results info
    const resultsInfo = document.querySelector('.model-results-info');
    if (resultsInfo) {
      if (itemsPerPageSelect.value === 'all') {
        resultsInfo.textContent = `Showing all ${sorted.length} starter gear items`;
      } else {
        resultsInfo.textContent = `Showing ${paginatedItems.length} of ${sorted.length} starter gear items (Page ${page} of ${totalPages})`;
      }
    }

    // Render the paginated items
    renderStarterGearCards(paginatedItems, page, sorted.length);

    // Update pagination
    if (itemsPerPageSelect.value !== 'all' && sorted.length > itemsPerPage) {
      updateStarterGearPagination(page, totalPages, sorted.length);
    } else {
      const contentDiv = document.getElementById('model-details-data');
      if (contentDiv) {
        const existingPagination = contentDiv.querySelector('.pagination');
        if (existingPagination) {
          existingPagination.remove();
        }
      }
    }
  };

  // ------------------- Function: showPageJumpModal -------------------
  // Shows the page jump modal when ellipsis is clicked
  function showPageJumpModal(minPage, maxPage, totalPages) {
    // Remove existing modal if any
    const existingModal = document.getElementById('starter-gear-page-jump-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const pageRange = minPage === maxPage ? `Page ${minPage}` : `Pages ${minPage}-${maxPage}`;
    
    const overlay = document.createElement('div');
    overlay.className = 'blank-page-jump-modal-overlay';
    overlay.id = 'starter-gear-page-jump-modal';
    
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
        <label class="blank-page-jump-modal-label" for="starter-gear-page-jump-input">
          Enter a page number (${pageRange}):
        </label>
        <input 
          type="number" 
          id="starter-gear-page-jump-input" 
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
        <div class="blank-page-jump-modal-error" id="starter-gear-page-jump-error"></div>
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
    
    const input = modal.querySelector('#starter-gear-page-jump-input');
    const errorMsg = modal.querySelector('#starter-gear-page-jump-error');
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
      window.filterStarterGearItems(pageNum);
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

  // Create pagination for filtered results
  function updateStarterGearPagination(currentPage, totalPages, totalItems) {
    const contentDiv = document.getElementById('model-details-data');
    if (!contentDiv) {  
      return;
    }

    // Remove existing pagination
    const existingPagination = contentDiv.querySelector('.pagination');
    if (existingPagination) {
      existingPagination.remove();
    }

    // Only show pagination if there are multiple pages
    if (totalPages > 1) {
      
      const handlePageChange = async (pageNum) => {
        window.filterStarterGearItems(pageNum);
      };

      // Create pagination container with standard classes
      let paginationContainer = document.getElementById('starter-gear-pagination');
      if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'starter-gear-pagination';
        paginationContainer.className = 'model-pagination blank-pagination';
        contentDiv.appendChild(paginationContainer);
      }
      paginationContainer.innerHTML = '';

      // Create pagination div with proper classes
      const paginationDiv = document.createElement('div');
      paginationDiv.className = 'pagination';
      
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

      // Add previous button
      if (currentPage > 1) {
        paginationDiv.appendChild(createButton('Previous', currentPage - 1, false, 'left'));
      }

      // Add page numbers
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

      // Add next button
      if (currentPage < totalPages) {
        paginationDiv.appendChild(createButton('Next', currentPage + 1, false, 'right'));
      }

      paginationContainer.appendChild(paginationDiv);
    }
  }

  // Add event listeners
  searchInput.addEventListener('input', () => window.filterStarterGearItems(1));
  categorySelect.addEventListener('change', () => window.filterStarterGearItems(1));
  typeSelect.addEventListener('change', () => window.filterStarterGearItems(1));
  subtypeSelect.addEventListener('change', () => window.filterStarterGearItems(1));
  sortSelect.addEventListener('change', () => window.filterStarterGearItems(1));
  itemsPerPageSelect.addEventListener('change', () => window.filterStarterGearItems(1));

  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    categorySelect.value = 'all';
    typeSelect.value = 'all';
    subtypeSelect.value = 'all';
    sortSelect.value = 'name-asc';
    itemsPerPageSelect.value = '12';
    
    // Clear saved filter state
    window.savedStarterGearFilterState = {};
    
    // Re-apply filters
    window.filterStarterGearItems(1);
  });

  window.starterGearFiltersInitialized = true;
  window.filterStarterGearItems();
}

function renderStarterGearCards(items) {
  // Scroll to top of the page
  scrollToTop();
  
  const grid = document.getElementById('items-container');
  if (!grid) return;
  grid.innerHTML = items.map(item => {
    // Emoji: show as image if it looks like a URL, else as text, but hide Discord codes
    let emoji = '';
    if (item.emoji && item.emoji.startsWith('http')) {
      emoji = `<img src="${item.emoji}" alt="emoji" class="item-emoji-img">`;
    } else if (item.emoji && !item.emoji.startsWith('<:')) {
      emoji = `<span class="item-emoji">${item.emoji}</span>`;
    }
    // Item image
    const itemImage = item.image && item.image !== 'No Image' ? 
      (item.image.startsWith('http') ? item.image : `/api/images/${item.image}`) : 
      '/images/ankleicon.png';
    return `
      <div class="model-details-item item-card modern-item-card">
        <div class="item-header-row modern-item-header">
          <div class="item-image-card">
            <img src="${itemImage}" alt="${item.itemName}" class="item-image modern-item-image" onerror="this.src='/images/ankleicon.png';">
            ${emoji}
          </div>
          <div class="item-header-info modern-item-header-info">
            <div class="item-name-row">
              <span class="item-name-big">${item.itemName}</span>
            </div>
          </div>
        </div>
        <div class="item-section modern-item-details">
          <div class="item-section-label modern-item-section-label"><i class="fas fa-info-circle"></i> Details</div>
          <div class="item-detail-list modern-item-detail-list">
            <div class="item-detail-row modern-item-detail-row">
              <strong>Buy:</strong> <span>${item.buyPrice ?? 0}</span> 
              <strong style="margin-left:1.2em;">Sell:</strong> <span>${item.sellPrice ?? 0}</span>
            </div>
            <div class="item-detail-row modern-item-detail-row">
              <strong>Stackable:</strong> <span>${item.stackable ? `Yes (Max: ${item.maxStackSize || 10})` : 'No'}</span>
            </div>
          </div>
        </div>
        <div class="item-section modern-item-section">
          <div class="item-section-label modern-item-section-label"><i class="fas fa-chart-bar"></i> Stats</div>
          <div class="item-stats-row modern-item-stats-row">
            ${(() => {
              const isArmor = (item.category && (Array.isArray(item.category) ? item.category.includes('Armor') : item.category === 'Armor'));
              const isWeapon = (item.category && (Array.isArray(item.category) ? item.category.includes('Weapon') : item.category === 'Weapon'));
              
              if (isArmor || isWeapon) {
                return `
                  <span class="item-stat-pill modern-item-stat-pill">
                    <i class="fas fa-heart"></i>
                    <span class="stat-label">Modifier:</span>
                    <span class="stat-value">${item.modifierHearts ?? 0}</span>
                  </span>
                  ${item.staminaToCraft !== null && item.staminaToCraft !== undefined ? `
                    <span class="item-stat-pill modern-item-stat-pill">
                      <i class="fas fa-fire"></i>
                      <span class="stat-label">Stamina to Craft:</span>
                      <span class="stat-value">${item.staminaToCraft}</span>
                    </span>
                  ` : ''}
                `;
              } else {
                return `
                  <span class="item-stat-pill modern-item-stat-pill">
                    <i class="fas fa-heart"></i>
                    <span class="stat-label">Hearts Recovered:</span>
                    <span class="stat-value">${item.modifierHearts ?? 0}</span>
                  </span>
                  <span class="item-stat-pill modern-item-stat-pill">
                    <i class="fas fa-bolt"></i>
                    <span class="stat-label">Stamina Recovered:</span>
                    <span class="stat-value">${item.staminaRecovered ?? 0}</span>
                  </span>
                  ${item.staminaToCraft !== null && item.staminaToCraft !== undefined ? `
                    <span class="item-stat-pill modern-item-stat-pill">
                      <i class="fas fa-fire"></i>
                      <span class="stat-label">Stamina to Craft:</span>
                      <span class="stat-value">${item.staminaToCraft}</span>
                    </span>
                  ` : ''}
                `;
              }
            })()}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function initializeStarterGearPage(data, page = 1, contentDiv) {
  // Filter data to only starter gear
  const starterGearItems = filterStarterGear(data);

  // Create filters wrapper (like blank.js and characters.js)
  let filtersWrapper = document.querySelector('.starter-gear-filters-wrapper');
  if (!filtersWrapper) {
    filtersWrapper = document.createElement('div');
    filtersWrapper.className = 'starter-gear-filters-wrapper blank-filters-wrapper';
    contentDiv.insertBefore(filtersWrapper, contentDiv.firstChild);
  }
  filtersWrapper.innerHTML = '';

  // Create separate search bar (like blank.js and characters.js)
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'model-search-wrapper blank-search-wrapper';
  
  const searchBar = document.createElement('div');
  searchBar.className = 'model-search-bar blank-search-bar';
  
  const searchIcon = document.createElement('i');
  searchIcon.className = 'fas fa-search model-search-icon blank-search-icon';
  searchIcon.setAttribute('aria-hidden', 'true');
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'starter-gear-search-input';
  searchInput.className = 'model-search-input blank-search-input';
  searchInput.placeholder = 'Search starter gear...';
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.setAttribute('aria-label', 'Search starter gear');
  
  searchBar.appendChild(searchIcon);
  searchBar.appendChild(searchInput);
  searchWrapper.appendChild(searchBar);
  filtersWrapper.appendChild(searchWrapper);

  // Create separate filter bar (like blank.js and characters.js)
  const filterWrapper = document.createElement('div');
  filterWrapper.className = 'model-filter-wrapper blank-filter-wrapper';
  
  const filterBar = document.createElement('div');
  filterBar.className = 'model-filter-bar blank-filter-bar';

  // Category Filter
  const categoryControl = document.createElement('div');
  categoryControl.className = 'model-filter-control blank-filter-control';
  const categoryLabel = document.createElement('label');
  categoryLabel.className = 'model-filter-label blank-filter-label';
  categoryLabel.innerHTML = '<i class="fas fa-tag"></i> Category';
  categoryLabel.setAttribute('for', 'starter-gear-filter-category');
  const categorySelect = document.createElement('select');
  categorySelect.id = 'starter-gear-filter-category';
  categorySelect.className = 'model-filter-select blank-filter-select';
  categorySelect.innerHTML = '<option value="all" selected>All Categories</option>';
  categoryControl.appendChild(categoryLabel);
  categoryControl.appendChild(categorySelect);
  filterBar.appendChild(categoryControl);

  // Type Filter
  const typeControl = document.createElement('div');
  typeControl.className = 'model-filter-control blank-filter-control';
  const typeLabel = document.createElement('label');
  typeLabel.className = 'model-filter-label blank-filter-label';
  typeLabel.innerHTML = '<i class="fas fa-layer-group"></i> Type';
  typeLabel.setAttribute('for', 'starter-gear-filter-type');
  const typeSelect = document.createElement('select');
  typeSelect.id = 'starter-gear-filter-type';
  typeSelect.className = 'model-filter-select blank-filter-select';
  typeSelect.innerHTML = '<option value="all" selected>All Types</option>';
  typeControl.appendChild(typeLabel);
  typeControl.appendChild(typeSelect);
  filterBar.appendChild(typeControl);

  // Subtype Filter
  const subtypeControl = document.createElement('div');
  subtypeControl.className = 'model-filter-control blank-filter-control';
  const subtypeLabel = document.createElement('label');
  subtypeLabel.className = 'model-filter-label blank-filter-label';
  subtypeLabel.innerHTML = '<i class="fas fa-th"></i> Subtype';
  subtypeLabel.setAttribute('for', 'starter-gear-filter-subtype');
  const subtypeSelect = document.createElement('select');
  subtypeSelect.id = 'starter-gear-filter-subtype';
  subtypeSelect.className = 'model-filter-select blank-filter-select';
  subtypeSelect.innerHTML = '<option value="all" selected>All Subtypes</option>';
  subtypeControl.appendChild(subtypeLabel);
  subtypeControl.appendChild(subtypeSelect);
  filterBar.appendChild(subtypeControl);

  // Sort Filter
  const sortControl = document.createElement('div');
  sortControl.className = 'model-filter-control blank-filter-control';
  const sortLabel = document.createElement('label');
  sortLabel.className = 'model-filter-label blank-filter-label';
  sortLabel.innerHTML = '<i class="fas fa-sort"></i> Sort By';
  sortLabel.setAttribute('for', 'starter-gear-sort-by');
  const sortSelect = document.createElement('select');
  sortSelect.id = 'starter-gear-sort-by';
  sortSelect.className = 'model-filter-select blank-filter-select';
  sortSelect.innerHTML = `
    <option value="name-asc" selected>Name (A-Z)</option>
    <option value="name-desc">Name (Z-A)</option>
    <option value="price-desc">Price (High-Low)</option>
    <option value="price-asc">Price (Low-High)</option>
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
  itemsPerPageLabel.setAttribute('for', 'starter-gear-items-per-page');
  const itemsPerPageSelect = document.createElement('select');
  itemsPerPageSelect.id = 'starter-gear-items-per-page';
  itemsPerPageSelect.className = 'model-filter-select blank-filter-select';
  itemsPerPageSelect.innerHTML = `
    <option value="12" selected>12 per page</option>
    <option value="24">24 per page</option>
    <option value="36">36 per page</option>
    <option value="48">48 per page</option>
    <option value="all">All items</option>
  `;
  itemsPerPageControl.appendChild(itemsPerPageLabel);
  itemsPerPageControl.appendChild(itemsPerPageSelect);
  filterBar.appendChild(itemsPerPageControl);

  // Clear Filters Button
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.id = 'starter-gear-clear-filters';
  clearButton.className = 'model-clear-filters-btn blank-clear-filters-btn';
  clearButton.innerHTML = '<i class="fas fa-times"></i> Clear Filters';
  filterBar.appendChild(clearButton);

  filterWrapper.appendChild(filterBar);
  filtersWrapper.appendChild(filterWrapper);

  // Create container if it doesn't exist
  let container = document.getElementById('items-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'items-container';
    container.className = 'item-details-grid';
    contentDiv.appendChild(container);
  }

  // Add results info section using standard class
  let resultsInfo = document.querySelector('.model-results-info');
  if (!resultsInfo) {
    resultsInfo = document.createElement('div');
    resultsInfo.className = 'model-results-info';
    resultsInfo.textContent = `Showing ${starterGearItems.length} starter gear item${starterGearItems.length !== 1 ? 's' : ''}`;
    contentDiv.insertBefore(resultsInfo, container);
  } else {
    resultsInfo.textContent = `Showing ${starterGearItems.length} starter gear item${starterGearItems.length !== 1 ? 's' : ''}`;
  }

  // Setup filters
  setupStarterGearFilters(starterGearItems);
}

export {
  initializeStarterGearPage
}; 