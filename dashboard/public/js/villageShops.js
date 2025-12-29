/* ====================================================================== */
/* Village Shops Rendering and Filtering Module                          */
/* Handles village shop item card rendering, filtering, pagination       */
/* ====================================================================== */

import { scrollToTop, createSearchFilterBar } from './ui.js';
import { capitalize } from './utils.js';

// ============================================================================
// ------------------- Rendering: Village Shop Item Cards -------------------
// Displays village shop items with pagination and category-based styling
// ============================================================================

// ------------------- Function: renderVillageShopCards -------------------
// Renders village shop item cards in a grid layout
function renderVillageShopCards(items, page = 1, totalItems = null) {
    // ------------------- Sort Items Alphabetically by Default -------------------
    const sortedItems = [...items].sort((a, b) => {
      const nameA = (a.itemName || '').toLowerCase();
      const nameB = (b.itemName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Scroll to top of the page
    scrollToTop();

    const grid = document.getElementById('village-shops-container');
    if (!grid) {
      return;
    }
  
    // ------------------- No Items Found -------------------
    if (!sortedItems || sortedItems.length === 0) {
      grid.innerHTML = '<div class="village-shop-loading">No village shop items found</div>';
      const pagination = document.getElementById('village-shop-pagination');
      if (pagination) pagination.innerHTML = '';
      return;
    }

    
    // Get items per page setting
    const itemsPerPageSelect = document.getElementById('village-shop-items-per-page');
    const itemsPerPage = itemsPerPageSelect ? 
      (itemsPerPageSelect.value === 'all' ? sortedItems.length : parseInt(itemsPerPageSelect.value)) : 
      12;
    
    // Calculate pagination info - use totalItems if provided, otherwise use current items length
    const itemsForPagination = totalItems !== null ? totalItems : sortedItems.length;
    const totalPages = Math.ceil(itemsForPagination / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, itemsForPagination);
  
    // ------------------- Render Village Shop Item Cards -------------------
    grid.innerHTML = sortedItems.map(item => {
      
      // Debug: Log image URL processing for first few items
      if (sortedItems.indexOf(item) < 3) {
        console.log(`🔍 Processing item: ${item.itemName}, image: ${item.image}`);
        console.log(`🖼️ Formatted URL: ${formatItemImageUrl(item.image)}`);
      }
      
      // Helper for tags
      const renderTags = arr => (Array.isArray(arr) ? arr.filter(Boolean).map(tag => `<span class="item-tag">${tag.trim()}</span>`).join('') : '');
      
      // Emoji: show as image if it looks like a URL, else as text, but hide Discord codes
      let emoji = '';
      if (item.emoji && item.emoji.startsWith('http')) {
        emoji = `<img src="${item.emoji}" alt="emoji" class="item-emoji-img">`;
      } else if (item.emoji && !item.emoji.startsWith('<:')) {
        emoji = `<span class="item-emoji">${item.emoji}</span>`;
      }
      
      // Section helpers
      const obtainTags = item.obtainTags?.length ? item.obtainTags : item.obtain;
      const locationsTags = item.locationsTags?.length ? item.locationsTags : item.locations;
      const jobsTags = item.allJobsTags?.length ? item.allJobsTags : item.allJobs;
      
      // Special weather
      let weatherTags = '';
      if (item.specialWeather) {
        // Handle both boolean and object formats for backward compatibility
        if (typeof item.specialWeather === 'boolean' && item.specialWeather) {
          weatherTags = '<span class="item-tag">Special Weather</span>';
        } else if (typeof item.specialWeather === 'object') {
          const weatherMap = {
            muggy: 'Muggy',
            flowerbloom: 'Flowerbloom',
            fairycircle: 'Fairycircle',
            jubilee: 'Jubilee',
            meteorShower: 'Meteor Shower',
            rockslide: 'Rockslide',
            avalanche: 'Avalanche'
          };
          weatherTags = Object.entries(weatherMap)
            .filter(([key]) => item.specialWeather[key])
            .map(([, label]) => `<span class="item-tag">${label}</span>`)
            .join('');
        }
      }
      
      // Subtype
      const subtype = Array.isArray(item.subtype) ? item.subtype.filter(Boolean).join(', ') : (item.subtype || '');
      
      // Slot (Head/Chest/Legs/Weapon/Shield etc.)
      const slot = (item.type && item.type.length > 0) ? item.type[0] : '';
      
      // Type bar color/icon
      const mainType = (item.category && (Array.isArray(item.category) ? item.category[0] : item.category)) || 'Misc';
      
      // Type bar color (fallback to blue)
      const typeColorMap = {
        'Armor': '#1F5D50',
        'Weapon': '#B99F65',
        'Shield': '#6A8ED6',
        'Material': '#0169A0',
        'Recipe': '#AF966D',
        'Misc': '#888888',
      };
      const typeBarColor = typeColorMap[mainType] || '#1F5D50';
      
      // Stats logic variables
      const isCraftable = Array.isArray(item.craftingMaterial) && item.craftingMaterial.length > 0;
      const isArmor = (item.category && (Array.isArray(item.category) ? item.category.includes('Armor') : item.category === 'Armor'));
      const isWeapon = (item.category && (Array.isArray(item.category) ? item.category.includes('Weapon') : item.category === 'Weapon'));
      const isRecipe = (item.category && (Array.isArray(item.category) ? item.category.includes('Recipe') : item.category === 'Recipe'));

      return `
        <div class="model-details-item village-shop-card modern-item-card" data-item-name="${item.itemName}">
          <div class="item-header-row modern-item-header">
            <div class="item-image-card">
              <img 
                src="${formatItemImageUrl(item.image)}" 
                alt="${item.itemName}" 
                class="item-image modern-item-image"
                onerror="console.error('❌ Failed to load:', this.src); this.src='/images/ankleicon.png';"
                crossorigin="anonymous"
              >
              ${emoji}
            </div>
            <div class="item-header-info modern-item-header-info">
              <div class="item-name-row">
                <span class="item-name-big">${item.itemName}</span>
                <div class="stock-badge" title="Current stock in village shops">
                  <i class="fas fa-boxes"></i>
                  <span class="stock-count">${item.stock || 0}</span>
                </div>
              </div>
              <div class="item-type-bar" style="background:${typeBarColor};">
                ${renderItemTypeIcon(item.imageType)}
                <span class="item-type-bar-label">${mainType}</span>
              </div>
              <div class="item-slot-row">
                ${slot ? `<span class="item-slot-label">${slot}</span>` : ''}
                ${subtype ? `<span class="item-subtype-label">${subtype}</span>` : ''}
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
                <strong>Stock:</strong> <span>${item.stock || 0}</span>
              </div>
              ${(item.modifierHearts > 0 && (isRecipe || isWeapon || isArmor)) ? `
              <div class="item-detail-row modern-item-detail-row">
                <strong>${isRecipe ? 'Hearts Healed' : 'Modifier'}:</strong> <span>${item.modifierHearts}</span>
              </div>
              ` : ''}
              ${item.staminaRecovered > 0 ? `
              <div class="item-detail-row modern-item-detail-row">
                <strong>Stamina Recovered:</strong> <span>${item.staminaRecovered}</span>
              </div>
              ` : ''}
              ${item.staminaToCraft !== null ? `
              <div class="item-detail-row modern-item-detail-row">
                <strong>Stamina to Craft:</strong> <span>${item.staminaToCraft}</span>
              </div>
              ` : ''}
            </div>
          </div>
          

        </div>
      `;
    }).join('');

    // Update pagination
    if (totalPages > 1) {
      updateVillageShopPagination(page, totalPages, itemsForPagination);
    } else {
      const pagination = document.getElementById('village-shop-pagination');
      if (pagination) pagination.innerHTML = '';
    }

    // Update results info
    const resultsInfo = document.querySelector('.village-shop-results-info p');
    if (resultsInfo) {
      const startItem = startIndex + 1;
      const endItem = Math.min(endIndex, itemsForPagination);
      resultsInfo.textContent = `Showing ${startItem}-${endItem} of ${itemsForPagination} village shop items`;
    }

  }
  
  // ============================================================================
// ------------------- Rendering: Helpers -------------------
// Returns detail items, formatted values, and modal content
// ============================================================================

// ------------------- Function: renderDetail -------------------
// Returns HTML for a basic item detail row
function renderDetail(label, value) {
  return `
    <div class="item-detail">
      <div class="item-detail-label">${label}</div>
      <div class="item-detail-value">${value}</div>
    </div>
  `;
}

// ------------------- Function: formatItemImageUrl -------------------
// Formats and returns item image URL
function formatItemImageUrl(image) {
  if (!image || image === 'No Image') return '/images/ankleicon.png';
  
  // If it's a GCS URL, route it through our proxy to avoid CORS issues
  if (image.startsWith('https://storage.googleapis.com/tinglebot/')) {
    const path = image.replace('https://storage.googleapis.com/tinglebot/', '');
    const proxyUrl = `/api/images/${path}`;
    console.log(`🖼️ Converting GCS URL: ${image} -> ${proxyUrl}`);
    return proxyUrl;
  }
  
  if (image.startsWith('http')) return image;
  return `/api/images/${image}`;
}

// ------------------- Function: renderLocationTags -------------------
// Renders location tags with color classes
function renderLocationTags(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.filter(Boolean).map(tag => {
    const key = tag.trim().toLowerCase();
    const colorClass = LOCATION_COLORS[key] || '';
    return `<span class="item-tag ${colorClass}">${tag.trim()}</span>`;
  }).join('');
}

// ------------------- Function: renderItemTypeIcon -------------------
// Renders the item type icon for a given image type
function renderItemTypeIcon(imageType) {
  if (imageType && imageType !== 'No Image Type') {
    // Use imageType as a direct image URL
    return `<img src="${imageType}" alt="Type Icon" class="item-type-icon" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<i class=\'fas fa-star\'></i>')">`;
  } else {
    // Fallback icon (FontAwesome star)
    return `<i class="fas fa-star"></i>`;
  }
}

// ============================================================================
// ------------------- Filtering: Dropdown and Search -------------------
// Applies filters to village shop item list based on UI selection
// ============================================================================

// Helper function to split comma-separated values and handle arrays
const splitValues = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    // Flatten and split any comma-separated strings inside the array
    return value.flatMap(v => splitValues(v));
  }
  if (typeof value === 'string') {
    // Split comma-separated, trim, and filter out empty
    return value.split(',').map(v => v.trim()).filter(v => v);
  }
  return [];
};

// Fetch all village shop items for filter dropdowns and cache them
async function fetchAllVillageShopItemsForFilters() {
  if (window.allVillageShopItemsForFilters) return window.allVillageShopItemsForFilters;
  try {
    const response = await fetch('/api/models/villageShops?all=true');
    if (!response.ok) throw new Error('Failed to fetch all village shop items for filters');
    const { data } = await response.json();
    window.allVillageShopItemsForFilters = data;
    return data;
  } catch (err) {
    // Fallback: use current page items if available
    return window.allVillageShopItems || [];
  }
}

// ------------------- Function: populateFilterOptions -------------------
// Populates filter dropdowns with available values
async function populateFilterOptions(items) {

  // Always load from JSON file first
  await loadFilterOptionsFromJSON();
  
  // If we have items, we could also populate from live data, but for now we'll just use the JSON
  if (items?.length) {
    // Fallback: populate from live data if JSON failed
    const categorySelect = document.getElementById('village-shop-filter-category');
    const typeSelect = document.getElementById('village-shop-filter-type');
    
    if (categorySelect && categorySelect.options.length <= 1) {
      console.log('🔄 Populating categories from live data...');
      const categories = [...new Set(items.map(item => item.category).flat().filter(Boolean))];
      populateSelect('village-shop-filter-category', categories);
    }
    
    if (typeSelect && typeSelect.options.length <= 1) {
      console.log('🔄 Populating types from live data...');
      const types = [...new Set(items.map(item => item.type).flat().filter(Boolean))];
      populateSelect('village-shop-filter-type', types);
    }
  }
  
}

// ------------------- Function: loadFilterOptionsFromJSON -------------------
// Loads filter options from the JSON file as a fallback
async function loadFilterOptionsFromJSON() {
  try {
    console.log('📂 Loading filter options from JSON file...');
    const response = await fetch('/js/itemFilterOptions.json');
    if (!response.ok) {
      console.warn('⚠️ Failed to load filter options JSON:', response.status, response.statusText);
      return;
    }
    
    const filterOptions = await response.json();
    console.log('📋 Loaded filter options:', filterOptions);
    
    // Ensure we have valid arrays before populating
    if (filterOptions.categories && Array.isArray(filterOptions.categories)) {
      populateSelect('village-shop-filter-category', filterOptions.categories);
    } else {
      console.warn('⚠️ No valid categories found in filter options');
    }
    
    if (filterOptions.types && Array.isArray(filterOptions.types)) {
      populateSelect('village-shop-filter-type', filterOptions.types);
    } else {
      console.warn('⚠️ No valid types found in filter options');
    }
    
  } catch (error) {
    console.error('❌ Error loading filter options from JSON:', error);
  }
}

// ------------------- Function: populateSelect -------------------
// Helper to populate a <select> element with new options
function populateSelect(id, values) {
  const select = document.getElementById(id);
  if (!select) {
    console.warn(`⚠️ Select element with id '${id}' not found`);
    return;
  }

  console.log(`🔧 Populating select '${id}' with values:`, values);

  // Ensure values is an array and has content
  if (!Array.isArray(values) || values.length === 0) {
    console.warn(`⚠️ No valid values provided for select '${id}'`);
    return;
  }

  // Remove all options except "all"
  select.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());

  // Format and add new options
  const formatted = values
    .filter(v => v && v.toString().trim() !== '') // Filter out empty/null values
    .map(v => capitalize(v.toString().toLowerCase()))
    .sort();

  console.log(`📝 Formatted values for '${id}':`, formatted);

  if (formatted.length === 0) {
    console.warn(`⚠️ No valid formatted values for select '${id}'`);
    return;
  }

  formatted.forEach(val => {
    const option = document.createElement('option');
    option.value = val.toLowerCase();
    option.textContent = val;
    select.appendChild(option);
  });

  console.log(`✅ Populated select '${id}' with ${formatted.length} options`);
}

// ------------------- Function: updateVillageShopPagination -------------------
// Updates the pagination controls for village shop items
function updateVillageShopPagination(currentPage, totalPages, totalItems) {
  const paginationContainer = document.getElementById('village-shop-pagination');
  if (!paginationContainer) {
    return;
  }

  // Clear existing pagination
  paginationContainer.innerHTML = '';

  // Only show pagination if there are multiple pages
  if (totalPages > 1) {
    
    const handlePageChange = (pageNum) => {
      window.filterVillageShopItems(pageNum);
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

    paginationContainer.appendChild(paginationDiv);
  }
}

// ------------------- Function: setupVillageShopFilters -------------------
// Sets up simple filters for village shop items
async function setupVillageShopFilters(items) {
  console.log('🚀 Setting up village shop filters...');

  // Fetch all village shop items for proper pagination
  try {  
    const response = await fetch('/api/models/villageShops?all=true');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const { data: allVillageShopItems } = await response.json();
    
    console.log('📊 Fetched village shop items:', allVillageShopItems.length);
    
    // Sort items alphabetically by name
    const sortedItems = [...allVillageShopItems].sort((a, b) => {
      const nameA = (a.itemName || '').toLowerCase();
      const nameB = (b.itemName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    // Update the global village shop list with all items
    window.allVillageShopItems = sortedItems;
  } catch (error) {
    console.warn('⚠️ Failed to fetch all village shop items, using provided items:', error);
    // Fallback to using the provided items
    window.allVillageShopItems = items;
  }

  if (window.villageShopFiltersInitialized) {
    window.filterVillageShopItems();
    return;
  }

  // Show the filters container
  const filtersContainer = document.querySelector('.village-shop-filters');
  if (filtersContainer) {
    filtersContainer.style.display = 'block';
  } else {
    console.error('❌ Village shop filters container not found');
  }

  // Wait longer for the DOM to update
  await new Promise(resolve => setTimeout(resolve, 200));

  const searchInput = document.getElementById('village-shop-search-input');
  const categorySelect = document.getElementById('village-shop-filter-category');
  const typeSelect = document.getElementById('village-shop-filter-type');
  const sortSelect = document.getElementById('village-shop-sort-by');
  const itemsPerPageSelect = document.getElementById('village-shop-items-per-page');
  const clearFiltersBtn = document.getElementById('village-shop-clear-filters');



  // Check which elements are missing for better debugging
  const missingElements = [];
  if (!searchInput) missingElements.push('village-shop-search-input');
  if (!categorySelect) missingElements.push('village-shop-filter-category');
  if (!typeSelect) missingElements.push('village-shop-filter-type');
  if (!sortSelect) missingElements.push('village-shop-sort-by');
  if (!itemsPerPageSelect) missingElements.push('village-shop-items-per-page');
  if (!clearFiltersBtn) missingElements.push('village-shop-clear-filters');

  if (missingElements.length > 0) {
    console.warn('Missing filter elements:', missingElements);
    if (!window.filterSetupRetried) {
      console.warn('Retrying filter setup once...');
      window.filterSetupRetried = true;
      requestAnimationFrame(() => setupVillageShopFilters(items));
    } else {
      console.error('❌ Failed to initialize village shop filters. Please refresh.');
      // Continue without filters - render the items anyway
      renderVillageShopCards(items, 1);
    }
    return;
  }

  window.filterSetupRetried = false;

  // Populate filter options with available values
  await populateFilterOptions(items);
  
  // Wait a moment for the DOM to update
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('🔧 Filter options populated. Current values:');
  console.log('Category select:', categorySelect?.value, categorySelect?.options?.length);
  console.log('Type select:', typeSelect?.value, typeSelect?.options?.length);
  
  // Verify the dropdowns were populated
  if (categorySelect && categorySelect.options.length <= 1) {
    console.warn('⚠️ Category dropdown not properly populated, retrying...');
    await loadFilterOptionsFromJSON();
  }
  
  if (typeSelect && typeSelect.options.length <= 1) {
    console.warn('⚠️ Type dropdown not properly populated, retrying...');
    await loadFilterOptionsFromJSON();
  }
  
  // Final verification and debug info
  console.log('🔍 Final dropdown verification:');
  console.log('Category options:', categorySelect?.options?.length, Array.from(categorySelect?.options || []).map(opt => opt.value));
  console.log('Type options:', typeSelect?.options?.length, Array.from(typeSelect?.options || []).map(opt => opt.value));

  // Restore filter state if it exists
  const savedFilterState = window.savedFilterState || {};
  if (savedFilterState.searchTerm) searchInput.value = savedFilterState.searchTerm;
  if (savedFilterState.categoryFilter) categorySelect.value = savedFilterState.categoryFilter;
  if (savedFilterState.typeFilter) typeSelect.value = savedFilterState.typeFilter;
  if (savedFilterState.sortBy) sortSelect.value = savedFilterState.sortBy;

  // ------------------- Function: filterVillageShopItems -------------------
  // Main filtering function
  window.filterVillageShopItems = async function (page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value.toLowerCase();
    const typeFilter = typeSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const itemsPerPage = itemsPerPageSelect.value === 'all' ? 999999 : parseInt(itemsPerPageSelect.value);



    // Save current filter state
    window.savedFilterState = {
      searchTerm: searchInput.value,
      categoryFilter,
      typeFilter,
      sortBy,
      itemsPerPage
    };

    // Check if any filters are active
    const hasActiveFilters = searchTerm || 
      categoryFilter !== 'all' || 
      typeFilter !== 'all';

    // Always use server-side filtering when filters are active OR when items per page is not 'all'
    if (hasActiveFilters || itemsPerPage !== 999999) {
      await filterVillageShopItemsWithAllData(page);
    } else {
      filterVillageShopItemsClientSide(page);
    }
  };

  // ------------------- Function: filterVillageShopItemsWithAllData -------------------
  // Fetches all village shop items from database and applies client-side filtering
  async function filterVillageShopItemsWithAllData(page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value.toLowerCase();
    const typeFilter = typeSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const itemsPerPage = itemsPerPageSelect.value === 'all' ? 999999 : parseInt(itemsPerPageSelect.value);

    // Show loading state
    const resultsInfo = document.querySelector('.village-shop-results-info p');
    if (resultsInfo) {
      resultsInfo.textContent = 'Loading filtered village shop items...';
    }

    try {
      // Always fetch ALL village shop items from the database
      const response = await fetch('/api/models/villageShops?all=true');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const { data: allVillageShopItems } = await response.json();

      // Apply filtering and sorting to ALL items
      const filteredAndSorted = applyVillageShopFiltersAndSort(allVillageShopItems);

      // Apply pagination
      const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedItems = filteredAndSorted.slice(startIndex, endIndex);

      // Update global items for this filtered view
      window.allVillageShopItems = filteredAndSorted;

      // Update results info
      if (resultsInfo) {
        if (itemsPerPageSelect.value === 'all') {
          resultsInfo.textContent = `Showing all ${filteredAndSorted.length} filtered village shop items`;
        } else {
          resultsInfo.textContent = `Showing ${paginatedItems.length} of ${filteredAndSorted.length} filtered village shop items (Page ${page} of ${totalPages})`;
        }
      }

      // Render the paginated filtered items
      renderVillageShopCards(paginatedItems, page, filteredAndSorted.length);

      // Update pagination
      if (itemsPerPageSelect.value !== 'all' && filteredAndSorted.length > itemsPerPage) {
        updateVillageShopPagination(page, totalPages, filteredAndSorted.length);
      } else {
        const paginationContainer = document.getElementById('village-shop-pagination');
        if (paginationContainer) {
          paginationContainer.innerHTML = '';
        }
      }

    } catch (error) {
      console.error('❌ Error filtering village shop items:', error);
      if (resultsInfo) {
        resultsInfo.textContent = 'Error loading filtered village shop items';
      }
    }
  }

  // ------------------- Function: filterVillageShopItemsClientSide -------------------
  // Client-side filtering for when no server-side filtering is needed
  function filterVillageShopItemsClientSide(page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value.toLowerCase();
    const typeFilter = typeSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const itemsPerPage = itemsPerPageSelect.value === 'all' ? window.allVillageShopItems.length : parseInt(itemsPerPageSelect.value);

    const filtered = window.allVillageShopItems.filter(item => {
      const matchesSearch = !searchTerm ||
        item.itemName?.toLowerCase().includes(searchTerm) ||
        (item.category && Array.isArray(item.category) && item.category.some(cat => cat.toLowerCase().includes(searchTerm))) ||
        (item.type && item.type.some(type => type.toLowerCase().includes(searchTerm)));

      const matchesCategory = categoryFilter === 'all' || 
        (item.category && Array.isArray(item.category) && item.category.some(cat => cat.toLowerCase() === categoryFilter));
      
      const matchesType = typeFilter === 'all' || 
        (item.type && item.type.some(type => type.toLowerCase() === typeFilter));

      return matchesSearch && matchesCategory && matchesType;
    });

    const sorted = sortItems(filtered, sortBy);

    // Apply pagination
    const totalPages = Math.ceil(sorted.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = sorted.slice(startIndex, endIndex);

    // Update results info
    const resultsInfo = document.querySelector('.village-shop-results-info p');
    if (resultsInfo) {
      if (itemsPerPageSelect.value === 'all') {
        resultsInfo.textContent = `Showing all ${sorted.length} of ${window.allVillageShopItems.length} village shop items`;
      } else {
        resultsInfo.textContent = `Showing ${paginatedItems.length} of ${sorted.length} village shop items (Page ${page} of ${totalPages})`;
      }
    }

    // Render the paginated items
    renderVillageShopCards(paginatedItems, page, sorted.length);

    // Update pagination
    if (itemsPerPageSelect.value !== 'all' && sorted.length > itemsPerPage) {
      updateVillageShopPagination(page, totalPages, sorted.length);
    } else {
      const paginationContainer = document.getElementById('village-shop-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = '';
      }
    }
  }

  // ------------------- Function: applyVillageShopFiltersAndSort -------------------
  // Unified function to apply filters and sorting to village shop items
  function applyVillageShopFiltersAndSort(items) {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value.toLowerCase();
    const typeFilter = typeSelect.value.toLowerCase();
    const sortBy = sortSelect.value;

    // Debug logging
    console.log('🔍 Filtering with:', { searchTerm, categoryFilter, typeFilter, sortBy });
    console.log('📊 Total items to filter:', items.length);
    
    // Debug the structure of items
    debugVillageShopItems(items);

    // Apply filters
    const filtered = items.filter(item => {
      // Search term matching
      const matchesSearch = !searchTerm ||
        item.itemName?.toLowerCase().includes(searchTerm) ||
        (item.category && Array.isArray(item.category) && item.category.some(cat => cat.toLowerCase().includes(searchTerm))) ||
        (item.type && item.type.some(type => type.toLowerCase().includes(searchTerm)));

      // Category matching - handle both array and string formats
      const matchesCategory = categoryFilter === 'all' || 
        (item.category && (
          (Array.isArray(item.category) && item.category.some(cat => cat.toLowerCase() === categoryFilter)) ||
          (typeof item.category === 'string' && item.category.toLowerCase() === categoryFilter)
        ));
      
      // Type matching - handle both array and string formats
      const matchesType = typeFilter === 'all' || 
        (item.type && (
          (Array.isArray(item.type) && item.type.some(type => type.toLowerCase() === typeFilter)) ||
          (typeof item.type === 'string' && item.type.toLowerCase() === typeFilter)
        ));

      // Debug logging for first few items
      if (items.indexOf(item) < 3) {
        console.log('🔍 Item:', item.itemName, {
          category: item.category,
          type: item.type,
          matchesSearch,
          matchesCategory,
          matchesType
        });
      }

      return matchesSearch && matchesCategory && matchesType;
    });

    console.log('✅ Filtered items count:', filtered.length);

    // Apply sorting
    return sortItems(filtered, sortBy);
  }

  // ------------------- Function: sortItems -------------------
  function sortItems(items, sortBy) {
    const sorted = [...items];
    
    switch (sortBy) {
      case 'name-asc':
        return sorted.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
      case 'name-desc':
        return sorted.sort((a, b) => (b.itemName || '').localeCompare(a.itemName || ''));
      case 'price-asc':
        return sorted.sort((a, b) => (a.buyPrice || 0) - (b.buyPrice || 0));
      case 'price-desc':
        return sorted.sort((a, b) => (b.buyPrice || 0) - (a.buyPrice || 0));
      case 'stock-asc':
        return sorted.sort((a, b) => (a.stock || 0) - (b.stock || 0));
      case 'stock-desc':
        return sorted.sort((a, b) => (b.stock || 0) - (a.stock || 0));
      default:
        return sorted;
    }
  }

  // Add event listeners to all filter elements
  const filterElements = [searchInput, categorySelect, typeSelect, sortSelect, itemsPerPageSelect];

  filterElements.forEach(element => {
    if (element) {
      element.addEventListener('change', (e) => {
        console.log(`🔄 Filter changed: ${element.id} = ${element.value}`);
        window.filterVillageShopItems(1);
      });
      if (element === searchInput) {
        element.addEventListener('input', (e) => {
          console.log(`🔍 Search input: ${element.value}`);
          window.filterVillageShopItems(1);
        });
      }
    }
  });

  // Clear filters button
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', async () => {
      
      searchInput.value = '';
      categorySelect.value = 'all';
      typeSelect.value = 'all';
      sortSelect.value = 'name-asc';
      itemsPerPageSelect.value = '35';
      
      // Clear saved state
      window.savedFilterState = {};
      
      // Reset the global village shop list to the original data
      try {
        const response = await fetch('/api/models/villageShops?all=true');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const { data: allVillageShopItems } = await response.json();
        
        // Sort items alphabetically by name
        const sortedItems = [...allVillageShopItems].sort((a, b) => {
          const nameA = (a.itemName || '').toLowerCase();
          const nameB = (b.itemName || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        // Update the global village shop list with all items
        window.allVillageShopItems = sortedItems;
        
        // Get the selected items per page value
        const itemsPerPage = itemsPerPageSelect.value === 'all' ? sortedItems.length : parseInt(itemsPerPageSelect.value);
        
        // Apply pagination - show only first page of items
        const paginatedItems = sortedItems.slice(0, itemsPerPage);
        
        // Render paginated items
        renderVillageShopCards(paginatedItems, 1, sortedItems.length);
        
        // Update results info
        const resultsInfo = document.querySelector('.village-shop-results-info p');
        if (resultsInfo) {
          if (itemsPerPageSelect.value === 'all') {
            resultsInfo.textContent = `Showing all ${sortedItems.length} village shop items`;
          } else {
            const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
            resultsInfo.textContent = `Showing ${paginatedItems.length} of ${sortedItems.length} village shop items (Page 1 of ${totalPages})`;
          }
        }
        
        // Create pagination if needed
        if (itemsPerPageSelect.value !== 'all' && sortedItems.length > itemsPerPage) {
          const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
          updateVillageShopPagination(1, totalPages, sortedItems.length);
        } else {
          // Clear pagination if not needed
          const paginationContainer = document.getElementById('village-shop-pagination');
          if (paginationContainer) {
            paginationContainer.innerHTML = '';
          }
        }
        
      } catch (error) {
        console.error('❌ Error resetting village shop list:', error);
        // Fallback to just calling filterVillageShopItems
        window.filterVillageShopItems(1);
      }
    });
  }

  window.villageShopFiltersInitialized = true;
}

// ============================================================================
// ------------------- Location Colors Mapping -------------------
// Maps location names to CSS color classes for tag styling
// ============================================================================

const LOCATION_COLORS = {
  'inariko': 'location-inariko',
  'rudania': 'location-rudania', 
  'vhintl': 'location-vhintl',
};

// ------------------- Function: debugVillageShopItems -------------------
// Debug function to log sample village shop items
function debugVillageShopItems(items, sampleSize = 5) {
  console.log('🔍 Sample village shop items structure:');
  const sample = items.slice(0, sampleSize);
  sample.forEach((item, index) => {
    console.log(`Item ${index + 1}:`, {
      itemName: item.itemName,
      category: item.category,
      type: item.type,
      categoryType: typeof item.category,
      typeType: typeof item.type,
      categoryIsArray: Array.isArray(item.category),
      typeIsArray: Array.isArray(item.type)
    });
  });
}

// ============================================================================
// ------------------- Export Functions -------------------
// Exports functions for use in other modules
// ============================================================================

// ------------------- Function: initializeVillageShopsPage -------------------
// Initializes the village shops page with data and sets up filters
async function initializeVillageShopsPage(data, page, contentDiv) {


  try {
    // Clear the content div first
    if (contentDiv) {
      contentDiv.innerHTML = '';
    }

    // Create the filters container with proper structure
    const filtersContainer = document.createElement('div');
    filtersContainer.className = 'village-shop-search-filters';

    const { bar: villageShopFilterBar } = createSearchFilterBar({
      layout: 'wide',
      filters: [
        {
          type: 'input',
          id: 'village-shop-search-input',
          placeholder: 'Search village shop items...',
          attributes: { autocomplete: 'off' },
          width: 'double'
        },
        { type: 'select', id: 'village-shop-filter-category', options: [{ value: 'all', label: 'All Categories' }] },
        { type: 'select', id: 'village-shop-filter-type', options: [{ value: 'all', label: 'All Types' }] },
        {
          type: 'select',
          id: 'village-shop-sort-by',
          options: [
            { value: 'name-asc', label: 'Name (A-Z)', selected: true },
            { value: 'name-desc', label: 'Name (Z-A)' },
            { value: 'price-asc', label: 'Price (Low-High)' },
            { value: 'price-desc', label: 'Price (High-Low)' },
            { value: 'stock-asc', label: 'Stock (Low-High)' },
            { value: 'stock-desc', label: 'Stock (High-Low)' }
          ]
        },
        {
          type: 'select',
          id: 'village-shop-items-per-page',
          options: [
            { value: '35', label: '35 per page', selected: true },
            { value: '15', label: '15 per page' },
            { value: '25', label: '25 per page' },
            { value: '45', label: '45 per page' },
            { value: '55', label: '55 per page' },
            { value: 'all', label: 'All items' }
          ]
        }
      ],
      buttons: [
        { id: 'village-shop-clear-filters', label: 'Clear Filters', className: 'clear-filters-btn' }
      ]
    });

    filtersContainer.appendChild(villageShopFilterBar);
    contentDiv.appendChild(filtersContainer);

    // Add results info section
    const resultsInfoSection = document.createElement('div');
    resultsInfoSection.className = 'village-shop-results-info';
    resultsInfoSection.innerHTML = '<p>Loading village shop items...</p>';
    contentDiv.appendChild(resultsInfoSection);

    // Create the grid container
    const gridContainer = document.createElement('div');
    gridContainer.id = 'village-shops-container';
    gridContainer.className = 'village-shops-grid';
    contentDiv.appendChild(gridContainer);

    // Create pagination container
    const paginationContainer = document.createElement('div');
    paginationContainer.id = 'village-shop-pagination';
    contentDiv.appendChild(paginationContainer);

    // Set up filters first
    try {
      await setupVillageShopFilters(data);
      // Apply initial filtering
      window.filterVillageShopItems(page);
    } catch (filterError) {
      console.warn('⚠️ Filter setup failed, continuing without filters:', filterError);
      // Continue without filters - render the items anyway
      renderVillageShopCards(data, page);
    }
    
    // Update results info
    const resultsInfo = document.querySelector('.village-shop-results-info p');
    if (resultsInfo) {
      resultsInfo.textContent = `Showing ${data.length} village shop items`;
    }
    
  } catch (error) {
    console.error('❌ Error initializing village shops page:', error);
    if (contentDiv) {
      contentDiv.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>Failed to initialize village shops page</p>
          <button class="retry-button" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }
}

export {
  renderVillageShopCards,
  setupVillageShopFilters,
  populateFilterOptions,
  fetchAllVillageShopItemsForFilters,
  initializeVillageShopsPage,
  debugVillageShopItems
};