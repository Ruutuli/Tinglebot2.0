/* ====================================================================== */
/* Pet Rendering and Filtering Module                                   */
/* Handles pet card rendering, filtering, pagination, and pet details */
/* ====================================================================== */

import { scrollToTop, createSearchFilterBar } from './ui.js';
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
    grid.innerHTML = '<div class="pet-loading">No pets found</div>';
    const pagination = document.getElementById('pet-pagination');
    if (pagination) pagination.innerHTML = '';
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
  const resultsInfo = document.querySelector('.pet-results-info p');
  if (resultsInfo) {
    const totalPages = Math.ceil(petsForPagination / petsPerPage);
    resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${petsForPagination} pets (Page ${page} of ${totalPages})`;
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
    const resultsInfo = document.querySelector('.pet-results-info p');
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
      if (resultsInfo) {
        if (petsPerPageSelect.value === 'all') {
          resultsInfo.textContent = `Showing all ${filteredAndSorted.length} filtered pets`;
        } else {
          resultsInfo.textContent = `Showing ${paginatedPets.length} of ${filteredAndSorted.length} filtered pets (Page ${page} of ${totalPages})`;
        }
      }

      // Render the paginated filtered pets
      renderPetCards(paginatedPets, page, filteredAndSorted.length);

      // Update pagination for filtered results
      if (petsPerPageSelect.value !== 'all' && filteredAndSorted.length > petsPerPage) {
        updateFilteredPagination(page, totalPages, filteredAndSorted.length);
      } else {
        const contentDiv = document.getElementById('model-details-data');
        if (contentDiv) {
          const existingPagination = contentDiv.querySelector('.pagination');
          if (existingPagination) {
            existingPagination.remove();
          }
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
    const resultsInfo = document.querySelector('.pet-results-info p');
    if (resultsInfo) {
      if (petsPerPageSelect.value === 'all') {
        resultsInfo.textContent = `Showing all ${sorted.length} of ${window.allPets.length} pets`;
      } else {
        resultsInfo.textContent = `Showing ${paginatedPets.length} of ${sorted.length} pets (Page ${page} of ${totalPages})`;
      }
    }

    // Render the paginated pets
    renderPetCards(paginatedPets, page, sorted.length);

    // Update pagination
    if (petsPerPageSelect.value !== 'all' && sorted.length > petsPerPage) {
      updateFilteredPagination(page, totalPages, sorted.length);
    } else {
      const contentDiv = document.getElementById('model-details-data');
      if (contentDiv) {
        const existingPagination = contentDiv.querySelector('.pagination');
        if (existingPagination) {
          existingPagination.remove();
        }
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

  // ------------------- Function: updateFilteredPagination -------------------
  // Creates pagination for filtered results
  function updateFilteredPagination(currentPage, totalPages, totalPets) {
    const contentDiv = document.getElementById('model-details-data');
    if (!contentDiv) {
      console.error('❌ Content div not found');
      return;
    }

    // Remove ALL existing pagination
    const existingPagination = contentDiv.querySelector('.pagination');
    if (existingPagination) {
      existingPagination.remove();
    }

    // Only show pagination if there are multiple pages
    if (totalPages > 1) {
      const handlePageChange = async (pageNum) => {
        window.filterPets(pageNum);
      };

      // Create pagination manually
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
      const resultsInfo = document.querySelector('.pet-results-info p');
      if (resultsInfo) {
        resultsInfo.textContent = `Showing ${data.length} of ${pagination.total} pets`;
      }
      
      // Re-render with original data
      renderPetCards(data, 1, pagination.total);
      
      // Remove any filtered pagination
      const contentDiv = document.getElementById('model-details-data');
      if (contentDiv) {
        const existingPagination = contentDiv.querySelector('.pagination');
        if (existingPagination) {
          existingPagination.remove();
        }
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

  // Create or refresh the standardized filter bar
  let filtersContainer = document.querySelector('.pet-filters');
  if (!filtersContainer) {
    filtersContainer = document.createElement('div');
    filtersContainer.className = 'pet-filters';
  }
  filtersContainer.innerHTML = '';

  const { bar: petFilterBar } = createSearchFilterBar({
    layout: 'wide',
    filters: [
      {
        type: 'input',
        id: 'pet-search-input',
        placeholder: 'Search pets...',
        attributes: { autocomplete: 'off' },
        width: 'double'
      },
      { type: 'select', id: 'filter-species', options: [{ value: 'all', label: 'All Species' }] },
      { type: 'select', id: 'filter-petType', options: [{ value: 'all', label: 'All Types' }] },
      { type: 'select', id: 'filter-status', options: [{ value: 'all', label: 'All Statuses' }] },
      { type: 'select', id: 'filter-owner', options: [{ value: 'all', label: 'All Owners' }] },
      {
        type: 'select',
        id: 'sort-by',
        options: [
          { value: 'name-asc', label: 'Name (A-Z)', selected: true },
          { value: 'name-desc', label: 'Name (Z-A)' },
          { value: 'level-desc', label: 'Level (High-Low)' },
          { value: 'level-asc', label: 'Level (Low-High)' },
          { value: 'rolls-desc', label: 'Rolls (High-Low)' },
          { value: 'rolls-asc', label: 'Rolls (Low-High)' }
        ]
      },
      {
        type: 'select',
        id: 'pets-per-page',
        options: [
          { value: '12', label: '12 per page', selected: true },
          { value: '24', label: '24 per page' },
          { value: '36', label: '36 per page' },
          { value: '48', label: '48 per page' },
          { value: 'all', label: 'All pets' }
        ]
      }
    ],
    buttons: [
      { id: 'clear-filters', label: 'Clear Filters', className: 'clear-filters-btn' }
    ]
  });

  filtersContainer.appendChild(petFilterBar);
  contentDiv.insertBefore(filtersContainer, contentDiv.firstChild);

  // Create pet container if it doesn't exist
  let container = document.getElementById('pets-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pets-container';
    container.className = 'pet-details-grid';
    contentDiv.appendChild(container);
  }

  // Add results info section
  let resultsInfo = document.querySelector('.pet-results-info');
  if (!resultsInfo) {
    resultsInfo = document.createElement('div');
    resultsInfo.className = 'pet-results-info';
    resultsInfo.innerHTML = '<p>Loading pets...</p>';
    contentDiv.insertBefore(resultsInfo, container);
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

  // Update results info
  if (resultsInfo) {
    resultsInfo.innerHTML = `<p>Showing ${data.length} pets (sorted alphabetically)</p>`;
  }
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