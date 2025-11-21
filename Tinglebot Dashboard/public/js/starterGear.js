/* ====================================================================== */
/* Starter Gear Rendering and Filtering Module                            */
/* Only shows a specific set of starter gear items for new characters.    */
/* ====================================================================== */

import { scrollToTop, createSearchFilterBar } from './ui.js';
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

  // Show the filters container
  const filtersContainer = document.querySelector('.starter-gear-filters');
  if (filtersContainer) {
    filtersContainer.style.display = 'flex';
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
    const resultsInfo = document.querySelector('.starter-gear-results-info p');
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

      // Create pagination
      const paginationDiv = document.createElement('div');
      paginationDiv.className = 'pagination';
      
      // Add previous button
      if (currentPage > 1) {
        const prevButton = document.createElement('button');
        prevButton.className = 'pagination-button';
        prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevButton.title = 'Previous Page';
        prevButton.addEventListener('click', () => handlePageChange(currentPage - 1));
        paginationDiv.appendChild(prevButton);
      }

      // Add page numbers
      const startPage = Math.max(1, currentPage - 2);
      const endPage = Math.min(totalPages, currentPage + 2);

      if (startPage > 1) {
        const firstButton = document.createElement('button');
        firstButton.className = 'pagination-button';
        firstButton.textContent = '1';
        firstButton.addEventListener('click', () => handlePageChange(1));
        paginationDiv.appendChild(firstButton);

        if (startPage > 2) {
          const ellipsis = document.createElement('span');
          ellipsis.className = 'pagination-ellipsis';
          ellipsis.textContent = '...';
          paginationDiv.appendChild(ellipsis);
        }
      }

      for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.className = `pagination-button ${i === currentPage ? 'active' : ''}`;
        pageButton.textContent = i.toString();
        pageButton.addEventListener('click', () => handlePageChange(i));
        paginationDiv.appendChild(pageButton);
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          const ellipsis = document.createElement('span');
          ellipsis.className = 'pagination-ellipsis';
          ellipsis.textContent = '...';
          paginationDiv.appendChild(ellipsis);
        }

        const lastButton = document.createElement('button');
        lastButton.className = 'pagination-button';
        lastButton.textContent = totalPages.toString();
        lastButton.addEventListener('click', () => handlePageChange(totalPages));
        paginationDiv.appendChild(lastButton);
      }

      // Add next button
      if (currentPage < totalPages) {
        const nextButton = document.createElement('button');
        nextButton.className = 'pagination-button';
        nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextButton.title = 'Next Page';
        nextButton.addEventListener('click', () => handlePageChange(currentPage + 1));
        paginationDiv.appendChild(nextButton);
      }

      contentDiv.appendChild(paginationDiv);
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

  // Create or refresh the standardized filter bar
  let filtersContainer = document.querySelector('.starter-gear-filters');
  if (!filtersContainer) {
    filtersContainer = document.createElement('div');
    filtersContainer.className = 'starter-gear-filters';
  }
  filtersContainer.innerHTML = '';

  const { bar: starterGearFilterBar } = createSearchFilterBar({
    layout: 'wide',
    filters: [
      {
        type: 'input',
        id: 'starter-gear-search-input',
        placeholder: 'Search starter gear...',
        attributes: { autocomplete: 'off' },
        width: 'double'
      },
      { type: 'select', id: 'starter-gear-filter-category', options: [{ value: 'all', label: 'All Categories' }] },
      { type: 'select', id: 'starter-gear-filter-type', options: [{ value: 'all', label: 'All Types' }] },
      { type: 'select', id: 'starter-gear-filter-subtype', options: [{ value: 'all', label: 'All Subtypes' }] },
      {
        type: 'select',
        id: 'starter-gear-sort-by',
        options: [
          { value: 'name-asc', label: 'Name (A-Z)', selected: true },
          { value: 'name-desc', label: 'Name (Z-A)' },
          { value: 'price-desc', label: 'Price (High-Low)' },
          { value: 'price-asc', label: 'Price (Low-High)' }
        ]
      },
      {
        type: 'select',
        id: 'starter-gear-items-per-page',
        options: [
          { value: '12', label: '12 per page', selected: true },
          { value: '24', label: '24 per page' },
          { value: '36', label: '36 per page' },
          { value: '48', label: '48 per page' },
          { value: 'all', label: 'All items' }
        ]
      }
    ],
    buttons: [
      { id: 'starter-gear-clear-filters', label: 'Clear Filters', className: 'clear-filters-btn' }
    ]
  });

  filtersContainer.appendChild(starterGearFilterBar);
  contentDiv.insertBefore(filtersContainer, contentDiv.firstChild);

  // Create container if it doesn't exist
  let container = document.getElementById('items-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'items-container';
    container.className = 'item-details-grid';
    contentDiv.appendChild(container);
  }

  // Add results info section with styling
  let resultsInfo = document.querySelector('.starter-gear-results-info');
  if (!resultsInfo) {
    resultsInfo = document.createElement('div');
    resultsInfo.className = 'starter-gear-results-info';
    resultsInfo.style.cssText = `
      background: linear-gradient(135deg, #2c3e50, #34495e);
      color: #ecf0f1;
      padding: 15px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      border-left: 4px solid #3498db;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    resultsInfo.innerHTML = `
      <i class="fas fa-hiking" style="color: #3498db; font-size: 1.2em;"></i>
      <p style="margin: 0; font-size: 1.1em;">Showing ${starterGearItems.length} starter gear items</p>
    `;
    contentDiv.insertBefore(resultsInfo, container);
  } else {
    resultsInfo.innerHTML = `
      <i class="fas fa-hiking" style="color: #3498db; font-size: 1.2em;"></i>
      <p style="margin: 0; font-size: 1.1em;">Showing ${starterGearItems.length} starter gear items</p>
    `;
  }

  // Setup filters
  setupStarterGearFilters(starterGearItems);
}

export {
  initializeStarterGearPage
}; 