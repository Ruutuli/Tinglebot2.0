/* ====================================================================== */
/* Pet Rendering and Filtering Module                                   */
/* Handles pet card rendering, filtering, pagination, and pet details */
/* ====================================================================== */

import { scrollToTop } from './ui.js';
import { capitalize } from './utils.js';

// ============================================================================
// ------------------- Rendering: Pet Cards -------------------
// Displays pets with pagination and detail sections
// ============================================================================

// ------------------- Function: renderPetCards -------------------
// Renders all pet cards with pagination and detail sections
function renderPetCards(pets, page = 1, totalPets = null) {
  // ------------------- Sort Pets Alphabetically by Default -------------------
  const sortedPets = [...pets].sort((a, b) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Scroll to top of the page
  scrollToTop();

  const grid = document.getElementById('pets-container');
  if (!grid) {
    console.error('❌ Grid container not found');
    return;
  }

  // ------------------- No Pets Found -------------------
  if (!sortedPets || sortedPets.length === 0) {
    grid.innerHTML = `
      <div class="blank-empty-state">
        <i class="fas fa-inbox"></i>
        <h3>No pets found</h3>
        <p>Try adjusting your search or filters</p>
      </div>
    `;
    const paginationContainer = document.getElementById('pet-pagination');
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  // Get pets per page setting
  const petsPerPageSelect = document.getElementById('pets-per-page');
  const petsPerPage = petsPerPageSelect ? 
    (petsPerPageSelect.value === 'all' ? sortedPets.length : parseInt(petsPerPageSelect.value)) : 
    12;
  
  // Calculate pagination info - use totalPets if provided, otherwise use current pets length
  const petsForPagination = totalPets !== null ? totalPets : sortedPets.length;
  const totalPages = Math.ceil(petsForPagination / petsPerPage);
  const startIndex = (page - 1) * petsPerPage;
  const endIndex = Math.min(startIndex + petsPerPage, petsForPagination);

  // ------------------- Render Pet Cards -------------------
  grid.innerHTML = sortedPets.map(pet => {
    // Helper for tags
    const renderTags = arr => (Array.isArray(arr) ? arr.filter(Boolean).map(tag => `<span class="pet-tag">${tag.trim()}</span>`).join('') : '');
    
    // Status badge
    const statusBadge = pet.status ? `<span class="pet-status-badge ${pet.status}">${capitalize(pet.status)}</span>` : '';
    
    // Storage info
    const storageInfo = pet.storageLocation ? 
      `<div class="pet-storage-info">
        <i class="fas fa-warehouse"></i>
        <span>Stored at: ${pet.storageLocation}</span>
      </div>` : '';

    // Roll combination display
    const rollCombination = pet.rollCombination && pet.rollCombination.length > 0 ? 
      `<div class="pet-rolls-section">
        <div class="section-title">Roll Combination</div>
        <div class="pet-rolls-list">
          ${pet.rollCombination.map(roll => `<span class="pet-roll-tag">${roll}</span>`).join('')}
        </div>
      </div>` : '';

    // Last roll date
    const lastRollDate = pet.lastRollDate ? 
      `<div class="pet-last-roll">
        <i class="fas fa-calendar"></i>
        <span>Last roll: ${formatDate(pet.lastRollDate)}</span>
      </div>` : '';

    return `
      <div class="model-details-item pet-card modern-pet-card" data-pet-name="${pet.name}">
        <div class="pet-header-row modern-pet-header">
          <div class="pet-image-card">
            <img 
              src="${formatPetImageUrl(pet.imageUrl, pet.name)}" 
              alt="${pet.name}" 
              class="pet-image modern-pet-image"
              onerror="console.error('❌ Failed to load:', this.src); this.src='/images/ankleicon.png';"
              crossorigin="anonymous"
            >
          </div>
          <div class="pet-header-info modern-pet-header-info">
            <div class="pet-name-row">
              <span class="pet-name-big">${pet.name}</span>
              ${statusBadge}
            </div>
            <div class="pet-type-bar">
              <i class="fas fa-paw"></i>
              <span class="pet-type-bar-label">${pet.species} - ${pet.petType}</span>
            </div>
            <div class="pet-owner-row">
              <span class="pet-owner-label">Owner: ${pet.ownerName}</span>
            </div>
          </div>
        </div>
        
        <div class="pet-section modern-pet-details">
          <div class="pet-section-label modern-pet-section-label"><i class="fas fa-info-circle"></i> Details</div>
          <div class="pet-detail-list modern-pet-detail-list">
            <div class="pet-detail-row modern-pet-detail-row">
              <strong>Level:</strong> <span>${pet.level || 0}</span> 
              <strong style="margin-left:1.2em;">Rolls Remaining:</strong> <span>${pet.rollsRemaining || 0}</span>
            </div>
          </div>
        </div>
        
        ${storageInfo ? `
          <div class="pet-section modern-pet-section">
            <div class="pet-section-label modern-pet-section-label"><i class="fas fa-warehouse"></i> Storage</div>
            <div class="pet-storage-details">
              ${storageInfo}
            </div>
          </div>
        ` : ''}
        
        ${rollCombination ? `
          <div class="pet-section modern-pet-section">
            <div class="pet-section-label modern-pet-section-label"><i class="fas fa-dice"></i> Rolls</div>
            <div class="pet-rolls-details">
              ${rollCombination}
              ${lastRollDate}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');



  // Update results info
  const resultsInfo = document.querySelector('.pet-results-info, .model-results-info');
  if (resultsInfo) {
    const totalPages = Math.ceil(petsForPagination / petsPerPage);
    const isShowingAll = petsPerPageSelect && petsPerPageSelect.value === 'all';
    if (isShowingAll) {
      resultsInfo.textContent = `Showing all ${petsForPagination} pets`;
    } else {
      resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${petsForPagination} pets (Page ${page} of ${totalPages})`;
    }
  }
}

// ============================================================================
// ------------------- Rendering: Helpers -------------------
// Returns detail items, formatted values, and modal content
// ============================================================================

// ------------------- Function: renderDetail -------------------
// Returns HTML for a basic pet detail row
function renderDetail(label, value) {
  return `
    <div class="pet-detail">
      <div class="pet-detail-label">${label}</div>
      <div class="pet-detail-value">${value}</div>
    </div>
  `;
}

// ------------------- Function: formatPetImageUrl -------------------
// Formats and returns pet image URL
function formatPetImageUrl(imageUrl, petName) {
  if (!imageUrl || imageUrl === 'No Image') return '/images/ankleicon.png';
  if (imageUrl.startsWith('https://storage.googleapis.com/tinglebot/')) {
    // Extract the full path from Google Cloud Storage URL
    const path = imageUrl.replace('https://storage.googleapis.com/tinglebot/', '');
    return `/api/images/${path}`;
  }
  if (imageUrl.startsWith('http')) return imageUrl;
  return `/api/images/${imageUrl}`;
}

// ------------------- Function: formatDate -------------------
// Formats a date for display
function formatDate(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}



// ============================================================================
// ------------------- Filtering: Dropdown and Search -------------------
// Applies filters to pet list based on UI selection
// ============================================================================

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

// Fetch all pets for filter dropdowns and cache them
async function fetchAllPetsForFilters() {
  if (window.allPetsForFilters) return window.allPetsForFilters;
  try {
    const response = await fetch('/api/models/pet?all=true');
    if (!response.ok) throw new Error('Failed to fetch all pets for filters');
    const { data } = await response.json();
    window.allPetsForFilters = data;
    return data;
  } catch (err) {
    console.error('[Filter Debug] Failed to fetch all pets for filters, using current page only:', err);
    return window.allPets || [];
  }
}

// ------------------- Function: populateFilterOptions -------------------
// Populates dropdowns for species, petType, status, and owners based on unique values
async function populateFilterOptions(pets) {
  try {
    // Fetch all pets from database to get unique filter values
    const response = await fetch('/api/models/pet?all=true');
    if (!response.ok) {
      console.warn('⚠️ Could not load pet filter options from database');
      return;
    }
    
    const { data: allPets } = await response.json();
    
    const speciesSelect = document.getElementById('filter-species');
    const petTypeSelect = document.getElementById('filter-petType');
    const statusSelect = document.getElementById('filter-status');
    const ownerSelect = document.getElementById('filter-owner');

    if (speciesSelect) {
      const species = [...new Set(allPets.map(p => p.species))].sort();
      populateSelect(speciesSelect, species);
    }

    if (petTypeSelect) {
      const petTypes = [...new Set(allPets.map(p => p.petType))].sort();
      populateSelect(petTypeSelect, petTypes);
    }

    if (statusSelect) {
      const statuses = [...new Set(allPets.map(p => p.status))].sort();
      populateSelect(statusSelect, statuses);
    }

    if (ownerSelect) {
      const owners = [...new Set(allPets.map(p => p.ownerName))].sort();
      populateSelect(ownerSelect, owners);
    }
    
  } catch (error) {
    console.error('❌ Error loading pet filter options from database:', error);
  }
}

// ------------------- Function: populateSelect -------------------
// Helper to populate a <select> element with new options
function populateSelect(select, values) {
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

// ------------------- Function: setupPetFilters -------------------
// Adds listeners to filter UI and re-renders pets on change
async function setupPetFilters(pets) {
  window.allPets = pets;

  if (window.petFiltersInitialized) {  
    window.filterPets();
    return;
  }

  // Show the filters container
  const filtersContainer = document.querySelector('.pet-filters');
  if (filtersContainer) {
    filtersContainer.style.display = 'flex';
  }

  const searchInput = document.getElementById('pet-search-input');
  const speciesSelect = document.getElementById('filter-species');
  const petTypeSelect = document.getElementById('filter-petType');
  const statusSelect = document.getElementById('filter-status');
  const ownerSelect = document.getElementById('filter-owner');
  const sortSelect = document.getElementById('sort-by');
  const petsPerPageSelect = document.getElementById('pets-per-page');
  const clearFiltersBtn = document.getElementById('clear-filters');

  const missing = [searchInput, speciesSelect, petTypeSelect, statusSelect, ownerSelect, sortSelect, petsPerPageSelect, clearFiltersBtn].some(el => !el);
  if (missing) {
    if (!window.filterSetupRetried) {
      window.filterSetupRetried = true;
      requestAnimationFrame(() => setupPetFilters(pets));
    } else {
      console.error('❌ Failed to initialize pet filters. Please refresh.');
    }
    return;
  }

  window.filterSetupRetried = false;

  // Populate filter options with available values
  await populateFilterOptions(pets);

  // Restore filter state if it exists
  const savedFilterState = window.savedPetFilterState || {};
  if (savedFilterState.searchTerm) searchInput.value = savedFilterState.searchTerm;
  if (savedFilterState.speciesFilter) speciesSelect.value = savedFilterState.speciesFilter;
  if (savedFilterState.petTypeFilter) petTypeSelect.value = savedFilterState.petTypeFilter;
  if (savedFilterState.statusFilter) statusSelect.value = savedFilterState.statusFilter;
  if (savedFilterState.ownerFilter) ownerSelect.value = savedFilterState.ownerFilter;
  if (savedFilterState.sortBy) sortSelect.value = savedFilterState.sortBy;

  // ------------------- Function: filterPets -------------------
  // Main filtering function that handles both server-side and client-side filtering
  window.filterPets = async function (page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const speciesFilter = speciesSelect.value.toLowerCase();
    const petTypeFilter = petTypeSelect.value.toLowerCase();
    const statusFilter = statusSelect.value.toLowerCase();
    const ownerFilter = ownerSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const petsPerPage = petsPerPageSelect.value;

    // Save current filter state
    window.savedPetFilterState = {
      searchTerm: searchInput.value,
      speciesFilter,
      petTypeFilter,
      statusFilter,
      ownerFilter,
      sortBy,
      petsPerPage
    };

    // Check if any filters are active
    const hasActiveFilters = searchTerm || 
      speciesFilter !== 'all' || 
      petTypeFilter !== 'all' || 
      statusFilter !== 'all' ||
      ownerFilter !== 'all';

    // Always use server-side filtering when filters are active OR when pets per page is not 'all'
    if (hasActiveFilters || petsPerPage !== 'all') {
      await filterPetsWithAllData(page);
    } else {
      filterPetsClientSide(page);
    }
  };

  // ------------------- Function: filterPetsWithAllData -------------------
  // Fetches all pets from database and applies client-side filtering
  async function filterPetsWithAllData(page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const speciesFilter = speciesSelect.value.toLowerCase();
    const petTypeFilter = petTypeSelect.value.toLowerCase();
    const statusFilter = statusSelect.value.toLowerCase();
    const ownerFilter = ownerSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const petsPerPage = petsPerPageSelect.value === 'all' ? 999999 : parseInt(petsPerPageSelect.value);

    // Show loading state
    const resultsInfo = document.querySelector('.pet-results-info, .model-results-info');
    if (resultsInfo) {
      resultsInfo.textContent = 'Loading filtered pets...';
    }

    try {
      // Always fetch ALL pets from the database
      const response = await fetch('/api/models/pet?all=true');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const { data: allPets } = await response.json();

      // Apply filtering and sorting to ALL pets
      const filteredAndSorted = applyFiltersAndSort(allPets);

      // Apply pagination
      const totalPages = Math.ceil(filteredAndSorted.length / petsPerPage);
      const startIndex = (page - 1) * petsPerPage;
      const endIndex = startIndex + petsPerPage;
      const paginatedPets = filteredAndSorted.slice(startIndex, endIndex);

      // Update global pets for this filtered view
      window.allPets = filteredAndSorted;

      // Update results info
      const resultsInfo = document.querySelector('.pet-results-info, .model-results-info');
      if (resultsInfo) {
        if (petsPerPageSelect.value === 'all') {
          resultsInfo.textContent = `Showing all ${filteredAndSorted.length} filtered pets`;
        } else {
          resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${filteredAndSorted.length} filtered pets (Page ${page} of ${totalPages})`;
        }
      }

      // Render the paginated filtered pets
      renderPetCards(paginatedPets, page, filteredAndSorted.length);

      // Update pagination for filtered results
      if (petsPerPageSelect.value !== 'all' && filteredAndSorted.length > petsPerPage) {
        updateFilteredPagination(page, totalPages, filteredAndSorted.length);
      } else {
        const paginationContainer = document.getElementById('pet-pagination');
        if (paginationContainer) {
          paginationContainer.innerHTML = '';
        }
      }

    } catch (error) {
      console.error('❌ Error fetching all pets for filtering:', error);
      // Fallback to client-side filtering on current pets
      filterPetsClientSide(page);
    }
  }

  // ------------------- Function: filterPetsClientSide -------------------
  // Client-side filtering for when no server-side filtering is needed
  function filterPetsClientSide(page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const speciesFilter = speciesSelect.value.toLowerCase();
    const petTypeFilter = petTypeSelect.value.toLowerCase();
    const statusFilter = statusSelect.value.toLowerCase();
    const ownerFilter = ownerSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const petsPerPage = petsPerPageSelect.value === 'all' ? window.allPets.length : parseInt(petsPerPageSelect.value);

    const filtered = window.allPets.filter(pet => {
      const matchesSearch = !searchTerm ||
        pet.name?.toLowerCase().includes(searchTerm) ||
        pet.species?.toLowerCase().includes(searchTerm) ||
        pet.petType?.toLowerCase().includes(searchTerm) ||
        pet.ownerName?.toLowerCase().includes(searchTerm);

      const matchesSpecies = speciesFilter === 'all' || 
        pet.species?.toLowerCase() === speciesFilter;
      
      const matchesPetType = petTypeFilter === 'all' || 
        pet.petType?.toLowerCase() === petTypeFilter;
      
      const matchesStatus = statusFilter === 'all' || 
        pet.status?.toLowerCase() === statusFilter;
      
      const matchesOwner = ownerFilter === 'all' || 
        pet.ownerName?.toLowerCase() === ownerFilter;

      return matchesSearch && matchesSpecies && matchesPetType && matchesStatus && matchesOwner;
    });

    const [field, direction] = sortBy.split('-');
    const isAsc = direction === 'asc';

    const sorted = [...filtered].sort((a, b) => {
      let valA, valB;
      
      switch (field) {
        case 'name':
          valA = a.name ?? '';
          valB = b.name ?? '';
          break;
        case 'level':
          valA = a.level ?? 0;
          valB = b.level ?? 0;
          break;
        case 'rolls':
          valA = a.rollsRemaining ?? 0;
          valB = b.rollsRemaining ?? 0;
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
    const totalPages = Math.ceil(sorted.length / petsPerPage);
    const startIndex = (page - 1) * petsPerPage;
    const endIndex = startIndex + petsPerPage;
    const paginatedPets = sorted.slice(startIndex, endIndex);

    // Update results info
    const resultsInfo = document.querySelector('.pet-results-info, .model-results-info');
    if (resultsInfo) {
      if (petsPerPageSelect.value === 'all') {
        resultsInfo.textContent = `Showing all ${sorted.length} of ${window.allPets.length} pets`;
      } else {
        resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${sorted.length} pets (Page ${page} of ${totalPages})`;
      }
    }

    // Render the paginated pets
    renderPetCards(paginatedPets, page, sorted.length);

    // Update pagination
    if (petsPerPageSelect.value !== 'all' && sorted.length > petsPerPage) {
      updateFilteredPagination(page, totalPages, sorted.length);
    } else {
      const paginationContainer = document.getElementById('pet-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = '';
      }
    }
  }

  // ------------------- Function: applyFiltersAndSort -------------------
  // Unified function to apply filters and sorting to pets
  function applyFiltersAndSort(pets) {
    const searchTerm = searchInput.value.toLowerCase();
    const speciesFilter = speciesSelect.value.toLowerCase();
    const petTypeFilter = petTypeSelect.value.toLowerCase();
    const statusFilter = statusSelect.value.toLowerCase();
    const ownerFilter = ownerSelect.value.toLowerCase();
    const sortBy = sortSelect.value;

    // Apply filters
    const filtered = pets.filter(pet => {
      const matchesSearch = !searchTerm ||
        pet.name?.toLowerCase().includes(searchTerm) ||
        pet.species?.toLowerCase().includes(searchTerm) ||
        pet.petType?.toLowerCase().includes(searchTerm) ||
        pet.ownerName?.toLowerCase().includes(searchTerm);

      const matchesSpecies = speciesFilter === 'all' || 
        pet.species?.toLowerCase() === speciesFilter;
      
      const matchesPetType = petTypeFilter === 'all' || 
        pet.petType?.toLowerCase() === petTypeFilter;
      
      const matchesStatus = statusFilter === 'all' || 
        pet.status?.toLowerCase() === statusFilter;
      
      const matchesOwner = ownerFilter === 'all' || 
        pet.ownerName?.toLowerCase() === ownerFilter;

      return matchesSearch && matchesSpecies && matchesPetType && matchesStatus && matchesOwner;
    });

    // Apply sorting
    const [field, direction] = sortBy.split('-');
    const isAsc = direction === 'asc';

    return [...filtered].sort((a, b) => {
      let valA, valB;
      
      switch (field) {
        case 'name':
          valA = a.name ?? '';
          valB = b.name ?? '';
          break;
        case 'level':
          valA = a.level ?? 0;
          valB = b.level ?? 0;
          break;
        case 'rolls':
          valA = a.rollsRemaining ?? 0;
          valB = b.rollsRemaining ?? 0;
          break;
        default:
          valA = a[field] ?? '';
          valB = b[field] ?? '';
      }
      
      return isAsc
        ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
        : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
    });
  }

  // ------------------- Function: showPageJumpModal -------------------
  // Shows the page jump modal when ellipsis is clicked
  function showPageJumpModal(minPage, maxPage, totalPages) {
    // Remove existing modal if any
    const existingModal = document.getElementById('pet-page-jump-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const pageRange = minPage === maxPage ? `Page ${minPage}` : `Pages ${minPage}-${maxPage}`;
    
    const overlay = document.createElement('div');
    overlay.className = 'blank-page-jump-modal-overlay';
    overlay.id = 'pet-page-jump-modal';
    
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
        <label class="blank-page-jump-modal-label" for="pet-page-jump-input">
          Enter a page number (${pageRange}):
        </label>
        <input 
          type="number" 
          id="pet-page-jump-input" 
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
        <div class="blank-page-jump-modal-error" id="pet-page-jump-error"></div>
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
    
    const input = modal.querySelector('#pet-page-jump-input');
    const errorMsg = modal.querySelector('#pet-page-jump-error');
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
      window.filterPets(pageNum);
    };
    
    const hidePageJumpModal = () => {
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.remove();
      }, 300);
    };
    
    // Event listeners
    submitBtn.addEventListener('click', validateAndSubmit);
    cancelBtn.addEventListener('click', hidePageJumpModal);
    closeBtn.addEventListener('click', hidePageJumpModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        hidePageJumpModal();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        validateAndSubmit();
      } else if (e.key === 'Escape') {
        hidePageJumpModal();
      }
    });
  }

  // ------------------- Function: updateFilteredPagination -------------------
  // Creates pagination for filtered results
  function updateFilteredPagination(currentPage, totalPages, totalPets) {
    const paginationContainer = document.getElementById('pet-pagination');
    if (!paginationContainer) {
      console.error('❌ Pagination container not found');
      return;
    }

    // Ensure pagination container has the right class
    if (!paginationContainer.classList.contains('model-pagination')) {
      paginationContainer.classList.add('model-pagination', 'blank-pagination');
    }

    // Remove any existing pagination
    paginationContainer.innerHTML = '';

    if (totalPages <= 1) return;

    // Create pagination bar
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination';

    // Helper to create a button (matching blank.js style)
    const makeButton = (label, pageNum, isActive = false, icon = null) => {
      const btn = document.createElement('button');
      btn.className = `pagination-button ${isActive ? 'active' : ''}`;
      btn.textContent = icon ? '' : label;
      if (icon) {
        btn.innerHTML = `<i class="fas fa-chevron-${icon}"></i>`;
      }
      btn.title = `Page ${pageNum}`;
      btn.onclick = () => {
        if (pageNum < 1 || pageNum > totalPages) return;
        window.filterPets(pageNum);
      };
      return btn;
    };

    // Helper to create ellipsis (matching blank.js style)
    const makeEllipsis = (minPage, maxPage) => {
      const ell = document.createElement('span');
      ell.className = 'pagination-ellipsis';
      ell.textContent = '...';
      ell.title = `Click to jump to a page (${minPage}-${maxPage})`;
      ell.style.cursor = 'pointer';
      ell.onclick = () => {
        showPageJumpModal(minPage, maxPage, totalPages);
      };
      return ell;
    };

    // Previous button
    if (currentPage > 1) {
      paginationDiv.appendChild(makeButton('Previous', currentPage - 1, false, 'left'));
    }

    // Page numbers (matching blank.js logic)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
      paginationDiv.appendChild(makeButton('1', 1));
      if (startPage > 2) {
        paginationDiv.appendChild(makeEllipsis(2, startPage - 1));
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      paginationDiv.appendChild(makeButton(i.toString(), i, i === currentPage));
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationDiv.appendChild(makeEllipsis(endPage + 1, totalPages - 1));
      }
      paginationDiv.appendChild(makeButton(totalPages.toString(), totalPages));
    }

    // Next button
    if (currentPage < totalPages) {
      paginationDiv.appendChild(makeButton('Next', currentPage + 1, false, 'right'));
    }

    paginationContainer.appendChild(paginationDiv);
  }

  // Add event listeners
  searchInput.addEventListener('input', () => window.filterPets(1));
  speciesSelect.addEventListener('change', () => window.filterPets(1));
  petTypeSelect.addEventListener('change', () => window.filterPets(1));
  statusSelect.addEventListener('change', () => window.filterPets(1));
  ownerSelect.addEventListener('change', () => window.filterPets(1));
  sortSelect.addEventListener('change', () => window.filterPets(1));
  petsPerPageSelect.addEventListener('change', () => window.filterPets(1));

  clearFiltersBtn.addEventListener('click', async () => {
    searchInput.value = '';
    speciesSelect.value = 'all';
    petTypeSelect.value = 'all';
    statusSelect.value = 'all';
    ownerSelect.value = 'all';
    sortSelect.value = 'name-asc';
    petsPerPageSelect.value = '12';
    
    // Clear saved filter state
    window.savedPetFilterState = {};
    
    // Reload the original page data
    try {
      const response = await fetch('/api/models/pet?page=1');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const { data, pagination } = await response.json();
      
      // Update global pets with original page data
      window.allPets = data;
      
      // Update results info
      const resultsInfo = document.querySelector('.pet-results-info, .model-results-info');
      if (resultsInfo) {
        resultsInfo.textContent = `Showing ${data.length} of ${pagination.total} pets`;
      }
      
      // Re-render with original data
      renderPetCards(data, 1, pagination.total);
      
      // Remove any filtered pagination
      const paginationContainer = document.getElementById('pet-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = '';
      }
      
    } catch (error) {
      console.error('❌ Error reloading original data:', error);
      // Fallback to client-side filtering
      window.filterPets(1);
    }
  });

  window.petFiltersInitialized = true; 
  window.filterPets();
}

// ============================================================================
// ------------------- Page Initialization -------------------
// Sets up the filters and pet grid on first load
// ============================================================================

// ------------------- Function: initializePetPage -------------------
// Initializes the pet page with filters, pagination, and card rendering
function initializePetPage(data, page = 1, contentDiv) {
  // Store pets globally for filtering
  window.allPets = data;

  // Create filters wrapper (like blank.js)
  let filtersWrapper = document.querySelector('.pet-filters-wrapper');
  if (!filtersWrapper) {
    filtersWrapper = document.createElement('div');
    filtersWrapper.className = 'pet-filters-wrapper blank-filters-wrapper';
    contentDiv.insertBefore(filtersWrapper, contentDiv.firstChild);
  }
  filtersWrapper.innerHTML = '';

  // Create separate search bar (like blank.js)
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'model-search-wrapper blank-search-wrapper';
  
  const searchBar = document.createElement('div');
  searchBar.className = 'model-search-bar blank-search-bar';
  
  const searchIcon = document.createElement('i');
  searchIcon.className = 'fas fa-search model-search-icon blank-search-icon';
  searchIcon.setAttribute('aria-hidden', 'true');
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'pet-search-input';
  searchInput.className = 'model-search-input blank-search-input';
  searchInput.placeholder = 'Search pets...';
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.setAttribute('aria-label', 'Search pets');
  
  searchBar.appendChild(searchIcon);
  searchBar.appendChild(searchInput);
  searchWrapper.appendChild(searchBar);
  filtersWrapper.appendChild(searchWrapper);

  // Create separate filter bar (like blank.js)
  const filterWrapper = document.createElement('div');
  filterWrapper.className = 'model-filter-wrapper blank-filter-wrapper';
  
  const filterBar = document.createElement('div');
  filterBar.className = 'model-filter-bar blank-filter-bar';

  // Species Filter
  const speciesControl = document.createElement('div');
  speciesControl.className = 'model-filter-control blank-filter-control';
  const speciesLabel = document.createElement('label');
  speciesLabel.className = 'model-filter-label blank-filter-label';
  speciesLabel.innerHTML = '<i class="fas fa-paw"></i> Species';
  speciesLabel.setAttribute('for', 'filter-species');
  const speciesSelect = document.createElement('select');
  speciesSelect.id = 'filter-species';
  speciesSelect.className = 'model-filter-select blank-filter-select';
  speciesSelect.innerHTML = '<option value="all">All Species</option>';
  speciesControl.appendChild(speciesLabel);
  speciesControl.appendChild(speciesSelect);
  filterBar.appendChild(speciesControl);

  // Pet Type Filter
  const petTypeControl = document.createElement('div');
  petTypeControl.className = 'model-filter-control blank-filter-control';
  const petTypeLabel = document.createElement('label');
  petTypeLabel.className = 'model-filter-label blank-filter-label';
  petTypeLabel.innerHTML = '<i class="fas fa-tag"></i> Type';
  petTypeLabel.setAttribute('for', 'filter-petType');
  const petTypeSelect = document.createElement('select');
  petTypeSelect.id = 'filter-petType';
  petTypeSelect.className = 'model-filter-select blank-filter-select';
  petTypeSelect.innerHTML = '<option value="all">All Types</option>';
  petTypeControl.appendChild(petTypeLabel);
  petTypeControl.appendChild(petTypeSelect);
  filterBar.appendChild(petTypeControl);

  // Status Filter
  const statusControl = document.createElement('div');
  statusControl.className = 'model-filter-control blank-filter-control';
  const statusLabel = document.createElement('label');
  statusLabel.className = 'model-filter-label blank-filter-label';
  statusLabel.innerHTML = '<i class="fas fa-flag"></i> Status';
  statusLabel.setAttribute('for', 'filter-status');
  const statusSelect = document.createElement('select');
  statusSelect.id = 'filter-status';
  statusSelect.className = 'model-filter-select blank-filter-select';
  statusSelect.innerHTML = '<option value="all">All Statuses</option>';
  statusControl.appendChild(statusLabel);
  statusControl.appendChild(statusSelect);
  filterBar.appendChild(statusControl);

  // Owner Filter
  const ownerControl = document.createElement('div');
  ownerControl.className = 'model-filter-control blank-filter-control';
  const ownerLabel = document.createElement('label');
  ownerLabel.className = 'model-filter-label blank-filter-label';
  ownerLabel.innerHTML = '<i class="fas fa-user"></i> Owner';
  ownerLabel.setAttribute('for', 'filter-owner');
  const ownerSelect = document.createElement('select');
  ownerSelect.id = 'filter-owner';
  ownerSelect.className = 'model-filter-select blank-filter-select';
  ownerSelect.innerHTML = '<option value="all">All Owners</option>';
  ownerControl.appendChild(ownerLabel);
  ownerControl.appendChild(ownerSelect);
  filterBar.appendChild(ownerControl);

  // Sort Filter
  const sortControl = document.createElement('div');
  sortControl.className = 'model-filter-control blank-filter-control';
  const sortLabel = document.createElement('label');
  sortLabel.className = 'model-filter-label blank-filter-label';
  sortLabel.innerHTML = '<i class="fas fa-sort"></i> Sort By';
  sortLabel.setAttribute('for', 'sort-by');
  const sortSelect = document.createElement('select');
  sortSelect.id = 'sort-by';
  sortSelect.className = 'model-filter-select blank-filter-select';
  sortSelect.innerHTML = `
    <option value="name-asc" selected>Name (A-Z)</option>
    <option value="name-desc">Name (Z-A)</option>
    <option value="level-desc">Level (High-Low)</option>
    <option value="level-asc">Level (Low-High)</option>
    <option value="rolls-desc">Rolls (High-Low)</option>
    <option value="rolls-asc">Rolls (Low-High)</option>
  `;
  sortControl.appendChild(sortLabel);
  sortControl.appendChild(sortSelect);
  filterBar.appendChild(sortControl);

  // Pets Per Page
  const perPageControl = document.createElement('div');
  perPageControl.className = 'model-filter-control blank-filter-control';
  const perPageLabel = document.createElement('label');
  perPageLabel.className = 'model-filter-label blank-filter-label';
  perPageLabel.innerHTML = '<i class="fas fa-list"></i> Per Page';
  perPageLabel.setAttribute('for', 'pets-per-page');
  const perPageSelect = document.createElement('select');
  perPageSelect.id = 'pets-per-page';
  perPageSelect.className = 'model-filter-select blank-filter-select';
  perPageSelect.innerHTML = `
    <option value="12" selected>12 per page</option>
    <option value="24">24 per page</option>
    <option value="36">36 per page</option>
    <option value="48">48 per page</option>
    <option value="all">All pets</option>
  `;
  perPageControl.appendChild(perPageLabel);
  perPageControl.appendChild(perPageSelect);
  filterBar.appendChild(perPageControl);

  // Clear Filters Button
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.id = 'clear-filters';
  clearButton.className = 'model-clear-filters-btn blank-clear-filters-btn';
  clearButton.innerHTML = '<i class="fas fa-times"></i> Clear Filters';
  filterBar.appendChild(clearButton);

  filterWrapper.appendChild(filterBar);
  filtersWrapper.appendChild(filterWrapper);

  // Create pet container if it doesn't exist
  let container = document.getElementById('pets-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pets-container';
    container.className = 'pet-details-grid';
    contentDiv.appendChild(container);
  }

  // Add results info section using new styling
  let resultsInfo = document.querySelector('.pet-results-info');
  if (!resultsInfo) {
    resultsInfo = document.createElement('div');
    resultsInfo.className = 'model-results-info';
    resultsInfo.textContent = `Showing ${data.length} pets (sorted alphabetically)`;
    contentDiv.insertBefore(resultsInfo, container);
  }

  // Create pagination container if it doesn't exist using new styling
  let paginationContainer = document.getElementById('pet-pagination');
  if (!paginationContainer) {
    paginationContainer = document.createElement('div');
    paginationContainer.id = 'pet-pagination';
    paginationContainer.className = 'model-pagination blank-pagination';
    contentDiv.appendChild(paginationContainer);
  } else {
    // Ensure it has the right classes
    if (!paginationContainer.classList.contains('model-pagination')) {
      paginationContainer.classList.add('model-pagination', 'blank-pagination');
    }
  }

  // Always use all pets for filter dropdowns
  fetchAllPetsForFilters().then(async allPetsForFilters => {
    await populateFilterOptions(allPetsForFilters);
    // Only initialize filters if they haven't been initialized yet
    if (!window.petFiltersInitialized) {
      await setupPetFilters(data);
    } else {
      // If filters are already initialized, apply current filter state
      window.filterPets();
    }
  });
}

// ============================================================================
// ------------------- Exports -------------------
// Public API for pet rendering module
// ============================================================================
export {
  renderPetCards,
  populateFilterOptions,
  setupPetFilters,
  initializePetPage
}; 