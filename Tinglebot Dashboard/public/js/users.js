// ============================================================================
// users.js - User Lookup Feature
// Purpose: Handles user search, browsing, and display functionality
// ============================================================================

class UserLookup {
  constructor(autoLoad = true) {
    this.currentPage = 1;
    this.totalPages = 1;
    this.totalUsers = 0;
    this.searchQuery = '';
    this.searchTimeout = null;
    this.isLoading = false;
    
    if (autoLoad) {
      this.init();
    } else {
      // Just bind events without loading data
      this.bindEvents();
    }
  }

  init() {
    this.bindEvents();
    this.loadAllUsers();
  }

  // Method to manually initialize when section is shown
  initializeSection() {
    this.loadAllUsers();
  }

  bindEvents() {
    // Search input events
    const searchInput = document.getElementById('user-search-input');
    const searchBtn = document.getElementById('user-search-btn');
    
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearchInput(e.target.value);
      });
      
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.performSearch();
        }
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        this.performSearch();
      });
    }

    // Pagination events
    const prevBtn = document.getElementById('users-prev-page');
    const nextBtn = document.getElementById('users-next-page');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.goToPage(this.currentPage - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.goToPage(this.currentPage + 1);
      });
    }

    // Navigation events
    const backToAllBtn = document.getElementById('back-to-all-users');
    const browseAllBtn = document.getElementById('browse-all-users');
    const retryBtn = document.getElementById('users-retry-btn');
    
    if (backToAllBtn) {
      backToAllBtn.addEventListener('click', () => {
        this.loadAllUsers(); // Reload all users instead of just showing
      });
    }

    if (browseAllBtn) {
      browseAllBtn.addEventListener('click', () => {
        this.loadAllUsers(); // Reload all users instead of just showing
      });
    }

    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.loadAllUsers();
      });
    }

    // Event delegation for user view buttons
    const handleViewDetails = (e) => {
      const viewBtn = e.target.closest('.user-view-btn');
      if (viewBtn) {
        e.preventDefault();
        e.stopPropagation();
        const userId = viewBtn.getAttribute('data-user-id');
        if (userId) {
          this.viewUserDetails(userId);
        } else {
          console.error('No user ID found on button:', viewBtn);
        }
      }
    };
    
    document.addEventListener('click', handleViewDetails);
  }

  handleSearchInput(query) {
    this.searchQuery = query.trim();
    
    // Clear existing timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Set minimum character limit
    if (this.searchQuery.length < 2) {
      this.showAllUsers();
      return;
    }

    // Debounce search
    this.searchTimeout = setTimeout(() => {
      this.performSearch();
    }, 500);
  }

  async performSearch() {
    if (!this.searchQuery || this.searchQuery.length < 2) {
      return;
    }

    this.showLoading();
    this.hideAllStates();

    try {
      const response = await fetch(`/api/users/search?query=${encodeURIComponent(this.searchQuery)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.users.length === 0) {
        this.showNoResults();
      } else {
        this.showSearchResults(data.users);
      }
    } catch (error) {
      console.error('Search error:', error);
      this.showError('Failed to search users. Please try again.');
    } finally {
      this.hideLoading();
    }
  }

  async loadAllUsers(page = 1) {
    this.currentPage = page;
    this.showLoading();
    this.hideAllStates();

    try {
      const response = await fetch(`/api/users?page=${page}&limit=20`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      

      
      this.totalPages = data.pagination.totalPages;
      this.totalUsers = data.pagination.totalUsers;
      this.currentPage = data.pagination.currentPage;
      
      this.updatePagination();
      this.displayUsers(data.users, false); // false for all users
      this.showAllUsers();
    } catch (error) {
      console.error('Load users error:', error);
      this.showError('Failed to load users. Please try again.');
    } finally {
      this.hideLoading();
    }
  }

  async goToPage(page) {
    if (page < 1 || page > this.totalPages || this.isLoading) {
      return;
    }

    await this.loadAllUsers(page);
  }

  updatePagination() {
    const currentPageEl = document.getElementById('current-page');
    const totalPagesEl = document.getElementById('total-pages');
    const totalUsersEl = document.getElementById('total-users-count');
    const prevBtn = document.getElementById('users-prev-page');
    const nextBtn = document.getElementById('users-next-page');

    if (currentPageEl) currentPageEl.textContent = this.currentPage;
    if (totalPagesEl) totalPagesEl.textContent = this.totalPages;
    if (totalUsersEl) totalUsersEl.textContent = this.totalUsers;

    if (prevBtn) {
      prevBtn.disabled = this.currentPage <= 1;
    }

    if (nextBtn) {
      nextBtn.disabled = this.currentPage >= this.totalPages;
    }
  }

  displayUsers(users, isSearch = false) {
    let container;
    
    if (isSearch) {
      container = document.getElementById('users-search-list');
    } else {
      container = document.getElementById('users-grid');
    }
    
    if (!container) {
      return;
    }
    

    
    container.innerHTML = '';

    users.forEach(user => {
      const userCard = this.createUserCard(user);
      container.appendChild(userCard);
    });
  }

  createUserCard(user) {
    const card = document.createElement('div');
    card.className = 'user-card';
    
    // Ensure discordId exists
    const discordId = user.discordId || user._id;
    
    card.innerHTML = `
      <div class="user-card-header">
        <div class="user-avatar-container">
          <img 
            src="${this.getUserAvatar(user)}" 
            alt="${user.nickname || user.username || 'User'}" 
            class="user-avatar"
            onerror="this.src='/images/ankleicon.png'"
          />
          <div class="user-status ${user.status}">
            <span class="status-dot"></span>
          </div>
        </div>
        <div class="user-info">
          <h4 class="user-name">${user.nickname || user.username || 'Unknown User'}</h4>
        </div>
      </div>
      
      <div class="user-stats">
        <div class="user-stat-item">
          <span class="user-stat-label">Tokens</span>
          <span class="user-stat-value">${user.tokens || 0}</span>
        </div>
        <div class="user-stat-item">
          <span class="user-stat-label">Slots</span>
          <span class="user-stat-value">${user.characterSlot !== undefined ? user.characterSlot : 2}</span>
        </div>
        <div class="user-stat-item">
          <span class="user-stat-label">Characters</span>
          <span class="user-stat-value">${user.characterCount || 0}</span>
        </div>
      </div>
      
      <div class="user-actions">
        <button class="user-view-btn" data-user-id="${discordId}">
          <i class="fas fa-eye" aria-hidden="true"></i>
          <span>View Details</span>
        </button>
      </div>
    `;

    return card;
  }

  getUserAvatar(user) {
    const discordId = user.discordId || user._id;
    if (user.avatar && discordId) {
      return `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png`;
    }
    return '/images/ankleicon.png';
  }

  async viewUserDetails(discordId) {
    try {
      const response = await fetch(`/api/users/${discordId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.showUserDetails(data);
    } catch (error) {
      console.error('View user details error:', error);
      alert('Failed to load user details: ' + error.message);
      this.showError('Failed to load user details. Please try again.');
    }
  }

  showUserDetails(data) {
    this.createUserDetailsModal(data);
  }

  createUserDetailsModal(data) {
    try {
      // Create modal container
      const modal = document.createElement('div');
      modal.className = 'user-details-modal';
      modal.style.display = 'flex'; // Ensure modal is visible
      
      // Create modal content
      const modalContent = document.createElement('div');
      modalContent.className = 'user-details-modal-content';
      
      // Format user avatar
      const avatarUrl = this.getUserAvatar(data.user);
      
      // Characters per page for pagination
      const charactersPerPage = 6;
      const totalPages = Math.ceil(data.characters.length / charactersPerPage);
      
      // Create modal HTML
      modalContent.innerHTML = `
      <div class="user-details-modal-header">
        <div class="user-details-user-info">
          <img 
            src="${avatarUrl}" 
            alt="${data.user.nickname || data.user.username || 'User'}" 
            class="user-details-avatar"
            onerror="this.src='/images/ankleicon.png'"
          />
          <div class="user-details-info">
            <h2 class="user-details-name">${data.user.nickname || data.user.username || 'Unknown User'}</h2>
            <div class="user-details-status ${data.user.status}">
              <span class="status-dot"></span>
              <span>${data.user.status === 'active' ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
        <button class="close-modal">&times;</button>
      </div>
      
      <div class="user-details-modal-body">
        <div class="user-details-section">
          <h3>User Information</h3>
          <div class="user-details-grid">
            <div class="user-details-item">
              <span class="label">Tokens:</span>
              <span class="value">${data.user.tokens || 0}</span>
            </div>
            <div class="user-details-item">
              <span class="label">Character Slots:</span>
              <span class="value">${data.user.characterSlot !== undefined ? data.user.characterSlot : 2}</span>
            </div>
          </div>
        </div>
        
        <div class="user-details-section">
          <h3>Characters (${data.characters.length})</h3>
          ${data.characters.length > 0 ? `
            <div class="user-characters-container">
              <div class="user-characters-grid" id="user-characters-grid">
                ${this.renderCharactersPage(data.characters, 1, charactersPerPage)}
              </div>
              ${totalPages > 1 ? `
                <div class="user-characters-pagination" id="user-characters-pagination">
                  ${this.createCharacterPagination(1, totalPages, data.characters, charactersPerPage)}
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="user-no-characters">
              <i class="fas fa-user-slash"></i>
              <p>No characters found for this user.</p>
            </div>
          `}
        </div>
      </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Add close functionality
    const closeBtn = modal.querySelector('.close-modal');
    closeBtn?.addEventListener('click', () => {
      this.closeModal(modal);
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal(modal);
      }
    });
    
    // Add pagination event listeners
    if (totalPages > 1) {
      const paginationContainer = modal.querySelector('#user-characters-pagination');
      if (paginationContainer) {
        paginationContainer.addEventListener('click', (e) => {
          if (e.target.classList.contains('character-page-btn')) {
            e.preventDefault();
            const page = parseInt(e.target.dataset.page);
            if (page >= 1 && page <= totalPages) {
              this.updateCharactersPage(modal, data.characters, page, charactersPerPage, totalPages);
            }
          }
        });
      }
    }
    
      // Close on Escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          this.closeModal(modal);
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
    } catch (error) {
      console.error('Error creating modal:', error);
      alert('Error creating modal: ' + error.message);
    }
  }

  renderCharactersPage(characters, page, charactersPerPage) {
    const startIndex = (page - 1) * charactersPerPage;
    const endIndex = startIndex + charactersPerPage;
    const pageCharacters = characters.slice(startIndex, endIndex);
    
    return pageCharacters.map(character => this.createCharacterCard(character)).join('');
  }

  createCharacterPagination(currentPage, totalPages, characters, charactersPerPage) {
    let paginationHTML = '<div class="character-pagination-controls">';
    
    // Previous button
    if (currentPage > 1) {
      paginationHTML += `<button class="character-page-btn" data-page="${currentPage - 1}">
        <i class="fas fa-chevron-left"></i> Previous
      </button>`;
    }
    
    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    if (startPage > 1) {
      paginationHTML += `<button class="character-page-btn" data-page="1">1</button>`;
      if (startPage > 2) {
        paginationHTML += '<span class="pagination-ellipsis">...</span>';
      }
    }
    
    for (let i = startPage; i <= endPage; i++) {
      paginationHTML += `<button class="character-page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHTML += '<span class="pagination-ellipsis">...</span>';
      }
      paginationHTML += `<button class="character-page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    // Next button
    if (currentPage < totalPages) {
      paginationHTML += `<button class="character-page-btn" data-page="${currentPage + 1}">
        Next <i class="fas fa-chevron-right"></i>
      </button>`;
    }
    
    paginationHTML += '</div>';
    
    // Page info
    const startIndex = (currentPage - 1) * charactersPerPage + 1;
    const endIndex = Math.min(startIndex + charactersPerPage - 1, characters.length);
    paginationHTML += `<div class="character-page-info">
      Showing ${startIndex}-${endIndex} of ${characters.length} characters
    </div>`;
    
    return paginationHTML;
  }

  updateCharactersPage(modal, characters, page, charactersPerPage, totalPages) {
    const gridContainer = modal.querySelector('#user-characters-grid');
    const paginationContainer = modal.querySelector('#user-characters-pagination');
    
    if (gridContainer) {
      gridContainer.innerHTML = this.renderCharactersPage(characters, page, charactersPerPage);
    }
    
    if (paginationContainer) {
      paginationContainer.innerHTML = this.createCharacterPagination(page, totalPages, characters, charactersPerPage);
    }
  }

  createCharacterCard(character) {
    // Format character icon URL
    const iconUrl = this.formatCharacterIconUrl(character.icon);
    
    // Get village class for color coding
    const villageClass = character.homeVillage ? character.homeVillage.toLowerCase() : '';
    
    // Determine the profile link
    const profileLink = character.appLink || `/character/${character._id}`;
    
    // Get current village (prefer currentVillage over homeVillage for display)
    const displayVillage = character.currentVillage || character.homeVillage || 'Unknown';
    
    return `
      <div class="user-character-card ${villageClass}">
        <div class="user-character-avatar-container">
          <img 
            src="${iconUrl}" 
            alt="${character.name}" 
            class="user-character-avatar"
            onerror="this.src='/images/ankleicon.png'"
          />
        </div>
        <div class="user-character-content">
          <div class="user-character-info">
            <div class="user-character-main-info">
              <h4 class="user-character-name">${character.name}</h4>
              <div class="user-character-details">
                <span class="user-character-race">${this.capitalizeFirst(character.race) || 'Unknown'}</span>
                <span class="user-character-job">${this.capitalizeFirst(character.job) || 'Unknown'}</span>
                <span class="user-character-village">${this.capitalizeFirst(displayVillage)}</span>
              </div>
            </div>
            <div class="user-character-stats">
              <div class="user-character-stat">
                <span class="stat-label">Hearts</span>
                <span class="stat-value">${character.currentHearts}/${character.maxHearts}</span>
              </div>
              <div class="user-character-stat">
                <span class="stat-label">Stamina</span>
                <span class="stat-value">${character.currentStamina}/${character.maxStamina}</span>
              </div>
            </div>
          </div>
          <div class="user-character-actions">
            <a href="${profileLink}" class="user-character-profile-btn" target="_blank">
              <i class="fas fa-external-link-alt"></i>
              <span>Profile</span>
            </a>
            ${character.inventory ? `
              <a href="${character.inventory}" class="user-character-inventory-btn" target="_blank">
                <i class="fas fa-backpack"></i>
                <span>Inventory</span>
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  closeModal(modal) {
    // Add closing class for animation
    modal.classList.add('modal-closing');
    
    // Wait for animation to complete, then hide and remove
    setTimeout(() => {
      if (modal && modal.parentNode) {
        modal.style.display = 'none'; // Hide before removing to prevent flash
        modal.parentNode.removeChild(modal);
      }
    }, 280); // Slightly shorter to ensure it hides during animation
  }

  formatDate(date) {
    try {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return 'Unknown';
    }
  }

  formatCharacterIconUrl(icon) {
    if (!icon) return '/images/ankleicon.png';
    
    // Check for Google Cloud Storage URL first
    if (icon.includes('storage.googleapis.com/tinglebot/')) {
      const filename = icon.split('/').pop();
      return `/api/images/${filename}`;
    }
    
    // If it's another HTTP URL, return as is
    if (icon.startsWith('http')) {
      return icon;
    }
    
    // For local filenames/relative paths, serve from static images folder
    return `/images/${icon}`;
  }

  showLoading() {
    this.isLoading = true;
    const loadingEl = document.getElementById('users-loading');
    if (loadingEl) loadingEl.style.display = 'flex';
  }

  hideLoading() {
    this.isLoading = false;
    const loadingEl = document.getElementById('users-loading');
    if (loadingEl) loadingEl.style.display = 'none';
  }

  showAllUsers() {
    this.hideAllStates();
    const allContainer = document.getElementById('users-all-container');
    if (allContainer) allContainer.style.display = 'block';
  }

  showSearchResults(users) {
    this.hideAllStates();
    
    // Small delay to ensure hiding is complete
    setTimeout(() => {
      const searchResults = document.getElementById('users-search-results');
      if (searchResults) {
        searchResults.style.display = 'block';
      }
      this.displayUsers(users, true); // true for search results
    }, 10);
  }

  showNoResults() {
    this.hideAllStates();
    const noResults = document.getElementById('users-no-results');
    if (noResults) noResults.style.display = 'flex';
  }

  showError(message) {
    this.hideAllStates();
    const errorEl = document.getElementById('users-error');
    const errorMessageEl = document.getElementById('users-error-message');
    
    if (errorEl) errorEl.style.display = 'flex';
    if (errorMessageEl) errorMessageEl.textContent = message;
  }

  hideAllStates() {
    const states = [
      'users-all-container',
      'users-search-results', 
      'users-no-results',
      'users-error'
    ];

    states.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
      }
    });
  }

  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}

// Initialize user lookup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Create the UserLookup instance but don't auto-load
  window.userLookup = new UserLookup(false); // Pass false to not auto-load
});

// Export the UserLookup class for use in other modules
export { UserLookup }; 