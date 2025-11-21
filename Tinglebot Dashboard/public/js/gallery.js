// ============================================================================
// Gallery JavaScript
// Handles gallery display, filtering, and pagination for approved submissions
// ============================================================================

import { createSearchFilterBar } from './ui.js';

class Gallery {
  constructor() {
    this.currentPage = 1;
    this.artItemsPerPage = 8;
    this.writingItemsPerPage = 4;
    this.currentCategory = 'all';
    this.currentUser = 'all';
    this.currentCharacter = 'all';
    this.currentSort = 'newest';
    this.submissions = [];
    this.filteredSubmissions = [];
    this.users = [];
    this.characters = [];
    this.currentUserId = null;
    
    this.renderFilterBar();
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadSubmissions();
  }

  renderFilterBar() {
    const container = document.querySelector('.gallery-filters');
    if (!container) return;

    container.innerHTML = '';

    const { bar } = createSearchFilterBar({
      id: 'gallery-filter-bar',
      layout: 'wide',
      filters: [
        {
          type: 'select',
          id: 'category-filter',
          options: [
            { value: 'all', label: 'All Categories', selected: true },
            { value: 'art', label: '🎨 Art' },
            { value: 'writing', label: '📝 Writing' }
          ],
          attributes: { 'aria-label': 'Filter by submission category' }
        },
        {
          type: 'select',
          id: 'user-filter',
          options: [{ value: 'all', label: 'All Users', selected: true }],
          attributes: { 'aria-label': 'Filter by submitting user' },
          width: 'double'
        },
        {
          type: 'select',
          id: 'character-filter',
          options: [{ value: 'all', label: 'All Characters', selected: true }],
          attributes: { 'aria-label': 'Filter by character' },
          width: 'double'
        },
        {
          type: 'select',
          id: 'sort-filter',
          options: [
            { value: 'newest', label: '🕒 Newest First', selected: true },
            { value: 'oldest', label: '⏰ Oldest First' },
            { value: 'tokens', label: '💰 Most Tokens' }
          ],
          attributes: { 'aria-label': 'Sort submissions' }
        }
      ],
      buttons: [
        {
          id: 'refresh-gallery',
          className: 'clear-filters-btn',
          html: '<i class="fas fa-sync-alt"></i> Refresh',
          attributes: { 'aria-label': 'Refresh gallery submissions' }
        }
      ]
    });

    container.appendChild(bar);
  }

  bindEvents() {
    // Filter controls
    document.getElementById('category-filter')?.addEventListener('change', (e) => {
      this.currentCategory = e.target.value;
      this.updateURL();
      this.filterAndDisplay();
    });

    document.getElementById('user-filter')?.addEventListener('change', (e) => {
      this.currentUser = e.target.value;
      this.updateURL();
      this.filterAndDisplay();
    });

    document.getElementById('sort-filter')?.addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.updateURL();
      this.filterAndDisplay();
    });

    document.getElementById('character-filter')?.addEventListener('change', (e) => {
      this.currentCharacter = e.target.value;
      this.updateURL();
      this.filterAndDisplay();
    });

    document.getElementById('refresh-gallery')?.addEventListener('click', () => {
      this.loadSubmissions();
    });

    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.updateURL();
        this.displaySubmissions();
        this.scrollToTop();
      }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
      const totalPages = this.calculateTotalPages();
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.updateURL();
        this.displaySubmissions();
        this.scrollToTop();
      }
    });

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      this.parseURL();
      this.filterAndDisplay();
    });
    
    // Handle hash changes
    window.addEventListener('hashchange', (e) => {
      const hash = window.location.hash;
      if (hash.includes('gallery-section')) {
        // Show gallery section if not already visible
        const gallerySection = document.getElementById('gallery-section');
        if (gallerySection && gallerySection.style.display === 'none') {
          gallerySection.style.display = 'block';
          // Hide other sections
          const sections = document.querySelectorAll('main > section');
          sections.forEach(section => {
            if (section.id !== 'gallery-section') {
              section.style.display = 'none';
            }
          });
        }
        
        // Initialize gallery if not already initialized
        if (!window.gallery) {
          window.gallery = new Gallery();
        }
      }
      
      this.parseURL();
      this.filterAndDisplay();
    });

    // Parse URL on load
    this.parseURL();
  }

  async loadSubmissions() {
    try {
      this.showLoading();
      
      // First, get current user info
      await this.getCurrentUser();
      
      const response = await fetch('/api/gallery/submissions');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.submissions = data.submissions || [];
      await this.populateUsers();
      await this.populateCharacters();
      this.filterAndDisplay();
    } catch (error) {
      console.error('Error loading gallery submissions:', error);
      this.showError('Failed to load gallery submissions. Please try again.');
    }
  }

  filterAndDisplay() {
    // Filter by category, user, and character
    this.filteredSubmissions = this.submissions.filter(submission => {
      const categoryMatch = this.currentCategory === 'all' || submission.category === this.currentCategory;
      const userMatch = this.currentUser === 'all' || submission.userId === this.currentUser;
      const characterMatch = this.currentCharacter === 'all' || 
        (submission.taggedCharacters && submission.taggedCharacters.includes(this.currentCharacter));
      
      return categoryMatch && userMatch && characterMatch;
    });

    // Reset to page 1 when filtering changes
    this.currentPage = 1;

    // Sort submissions
    this.filteredSubmissions.sort((a, b) => {
      switch (this.currentSort) {
        case 'newest':
          return new Date(b.approvedAt) - new Date(a.approvedAt);
        case 'oldest':
          return new Date(a.approvedAt) - new Date(b.approvedAt);
        case 'tokens':
          return b.finalTokenAmount - a.finalTokenAmount;
        default:
          return 0;
      }
    });

    this.currentPage = 1;
    this.displaySubmissions();
  }

  updateURL() {
    const params = new URLSearchParams();
    if (this.currentCategory !== 'all') params.set('category', this.currentCategory);
    if (this.currentUser !== 'all') params.set('user', this.currentUser);
    if (this.currentCharacter !== 'all') params.set('character', this.currentCharacter);
    if (this.currentSort !== 'newest') params.set('sort', this.currentSort);
    if (this.currentPage > 1) params.set('page', this.currentPage);
    
    const newURL = `${window.location.pathname}#gallery-section${params.toString() ? '?' + params.toString() : ''}`;
    window.history.pushState({}, '', newURL);
  }

  parseURL() {
    // Check if we're on the gallery section and DOM elements exist
    const hash = window.location.hash;
    if (!hash.includes('gallery-section') || !document.getElementById('gallery-section')) {
      return; // Don't parse if not on gallery section or DOM not ready
    }
    
    // Extract query parameters from hash
    const hashParts = hash.split('?');
    const params = hashParts.length > 1 ? new URLSearchParams(hashParts[1]) : new URLSearchParams();
    
    this.currentCategory = params.get('category') || 'all';
    this.currentUser = params.get('user') || 'all';
    this.currentCharacter = params.get('character') || 'all';
    this.currentSort = params.get('sort') || 'newest';
    this.currentPage = parseInt(params.get('page')) || 1;
    
    // Update UI
    const categoryFilter = document.getElementById('category-filter');
    const userFilter = document.getElementById('user-filter');
    const characterFilter = document.getElementById('character-filter');
    const sortFilter = document.getElementById('sort-filter');
    
    if (categoryFilter) categoryFilter.value = this.currentCategory;
    if (userFilter) userFilter.value = this.currentUser;
    if (characterFilter) characterFilter.value = this.currentCharacter;
    if (sortFilter) sortFilter.value = this.currentSort;
  }

  displaySubmissions() {
    const sections = document.getElementById('gallery-sections');
    if (!sections) return;

    if (this.filteredSubmissions.length === 0) {
      this.showEmpty();
      return;
    }

    // Clear sections
    sections.innerHTML = '';

    // Separate art and writing submissions first
    const artSubmissions = this.filteredSubmissions.filter(s => s && s.category === 'art');
    const writingSubmissions = this.filteredSubmissions.filter(s => s && s.category === 'writing');
    
    // Calculate pagination for each category separately
    const artStartIndex = (this.currentPage - 1) * this.artItemsPerPage;
    const artEndIndex = artStartIndex + this.artItemsPerPage;
    const paginatedArtSubmissions = artSubmissions.slice(artStartIndex, artEndIndex);
    
    const writingStartIndex = (this.currentPage - 1) * this.writingItemsPerPage;
    const writingEndIndex = writingStartIndex + this.writingItemsPerPage;
    const paginatedWritingSubmissions = writingSubmissions.slice(writingStartIndex, writingEndIndex);

    // Create art section if there are paginated art submissions
    if (paginatedArtSubmissions.length > 0) {
      const artSection = this.createGallerySection('art', paginatedArtSubmissions);
      sections.appendChild(artSection);
    }

    // Create writing section if there are paginated writing submissions
    if (paginatedWritingSubmissions.length > 0) {
      const writingSection = this.createGallerySection('writing', paginatedWritingSubmissions);
      sections.appendChild(writingSection);
    }

    this.updatePagination();
  }

  async populateUsers() {
    const userFilter = document.getElementById('user-filter');
    if (!userFilter) return;

    // Get unique users from submissions
    const uniqueUsers = [...new Set(this.submissions.map(s => s.userId))];
    this.users = uniqueUsers.map(userId => {
      const submission = this.submissions.find(s => s.userId === userId);
      return {
        id: userId,
        username: submission.username,
        avatar: submission.userAvatar
      };
    });

    // Get all unique collaborators from all submissions
    const allCollaborators = [...new Set(this.submissions.flatMap(s => s.collab || []))];
    
    // Fetch user data for collaborators who aren't already in users list
    for (const collaboratorId of allCollaborators) {
      if (!this.users.find(u => u.id === collaboratorId)) {
        try {
          // Clean the collaborator ID (remove Discord mention format)
          const cleanId = collaboratorId.replace(/[<@>]/g, '');
          
          // Try to fetch user data from our server
          const response = await fetch(`/api/users/${cleanId}`);
          if (response.ok) {
            const responseData = await response.json();
            const userData = responseData.user; // The user data is wrapped in a 'user' object
            this.users.push({
              id: collaboratorId, // Keep original ID for display
              username: userData.username || userData.nickname || `User ${cleanId}`,
              avatar: userData.avatar
            });
          } else {
            // Fallback: add with cleaned ID as display name
            this.users.push({
              id: collaboratorId, // Keep original ID for display
              username: `User ${cleanId}`,
              avatar: null
            });
          }
        } catch (error) {
          // Fallback: add with cleaned ID as display name
          const cleanId = collaboratorId.replace(/[<@>]/g, '');
          this.users.push({
            id: collaboratorId, // Keep original ID for display
            username: `User ${cleanId}`,
            avatar: null
          });
        }
      }
    }

    // Sort users alphabetically
    this.users.sort((a, b) => a.username.localeCompare(b.username));

    // Clear existing options except "All Users"
    userFilter.innerHTML = '<option value="all">All Users</option>';

    // Add user options
    this.users.forEach(user => {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = user.username;
      userFilter.appendChild(option);
    });
  }

  async populateCharacters() {
    const characterFilter = document.getElementById('character-filter');
    if (!characterFilter) return;

    try {
      // Get characters from the API
      const characters = await this.getCharacters();
      this.characters = characters;

      // Clear existing options except "All Characters"
      characterFilter.innerHTML = '<option value="all">All Characters</option>';

      // Add character options
      characters.forEach(character => {
        const option = document.createElement('option');
        option.value = character._id;
        option.textContent = character.name;
        characterFilter.appendChild(option);
      });
    } catch (error) {
      console.error('Error populating characters:', error);
    }
  }

  createGallerySection(category, submissions) {
    const section = document.createElement('div');
    section.className = 'gallery-section';
    
    const icon = category === 'art' ? 'fas fa-palette' : 'fas fa-pen-fancy';
    const title = category === 'art' ? 'Art Submissions' : 'Writing Submissions';
    
    section.innerHTML = `
      <div class="gallery-section-header">
        <i class="gallery-section-icon ${icon}"></i>
        <h2 class="gallery-section-title">${title}</h2>
        <span class="gallery-section-count">${submissions.length}</span>
      </div>
      <div class="gallery-${category}-grid">
        ${submissions.map(submission => this.createGalleryItemHTML(submission)).join('')}
      </div>
    `;
    
    return section;
  }

  createGalleryItemHTML(submission) {
    // Ensure submission has required properties
    if (!submission) return '';
    
    const isArt = submission.category === 'art';
    const hasImage = isArt && submission.fileUrl;
    
    // Determine image aspect ratio class for adaptive sizing
    let imageClass = 'gallery-item-image';
    if (hasImage) {
      // We'll determine this dynamically when the image loads
      imageClass += ' adaptive-image';
    }
    
    if (isArt) {
      return `
        <div class="gallery-item ${submission.category}-item" onclick="window.gallery.showModal(${JSON.stringify(submission).replace(/"/g, '&quot;')})">
          <div class="gallery-item-image-container">
            ${hasImage 
              ? `<img src="${submission.fileUrl}" alt="${submission.title}" class="${imageClass}" loading="lazy" onload="window.gallery.adaptImageSize(this)">`
              : `<div class="gallery-item-image" style="display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); color: var(--text-muted);">
                   <i class="fas fa-image" style="font-size: 48px;"></i>
                 </div>`
            }
            ${this.canEditSubmission(submission) ? `
              <div class="gallery-item-actions">
                <button class="edit-btn" onclick="event.stopPropagation(); window.gallery.editSubmission('${submission.submissionId}')" title="Edit submission">
                  <i class="fas fa-edit"></i>
                </button>
              </div>
            ` : ''}
          </div>
          <div class="gallery-item-content">
            <div class="gallery-item-header">
              <h3 class="gallery-item-title">${this.escapeHtml(submission.title)}</h3>
              <span class="gallery-item-category ${submission.category}">${submission.category}</span>
            </div>
            <div class="gallery-item-meta">
              <div class="gallery-item-author">
                ${submission.userAvatar 
                  ? `<img src="${submission.userAvatar}" alt="${submission.username}" class="gallery-item-author-avatar">`
                  : `<div class="gallery-item-author-avatar" style="background: var(--accent-color); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">${submission.username.charAt(0).toUpperCase()}</div>`
                }
                <span>${this.escapeHtml(submission.username)}</span>
              </div>
              <div class="gallery-item-tokens">
                <i class="fas fa-coins"></i>
                <span>${submission.finalTokenAmount} tokens</span>
              </div>
              <div class="gallery-item-date">
                ${this.formatDate(submission.approvedAt)}
              </div>
            </div>
            ${submission.description ? `
              <div class="gallery-item-description">
                ${this.escapeHtml(submission.description)}
              </div>
            ` : ''}
            ${submission.collab && Array.isArray(submission.collab) && submission.collab.length > 0 ? `
              <div class="gallery-item-collaborators">
                <div class="gallery-item-collaborators-title">Collaborators:</div>
                <div class="gallery-item-collaborators-list">
                  ${submission.collab.map(collaborator => {
                    const user = this.users.find(u => u.id === collaborator);
                    const displayName = user ? user.username : collaborator;
                    return `<span class="gallery-item-collaborator">${this.escapeHtml(displayName)}</span>`;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    } else {
      // Writing submission - clean, spacious layout
      return `
        <div class="gallery-item ${submission.category}-item" onclick="window.gallery.showModal(${JSON.stringify(submission).replace(/"/g, '&quot;')})">
          <div class="gallery-item-content">
            <div class="gallery-item-header">
              <h3 class="gallery-item-title">${this.escapeHtml(submission.title)}</h3>
              <span class="gallery-item-category">${submission.category.toUpperCase()}</span>
            </div>
            ${submission.description ? `
              <div class="gallery-item-description">
                ${this.escapeHtml(submission.description)}
              </div>
            ` : ''}
            <div class="gallery-item-meta">
              <div class="gallery-item-author">
                ${submission.userAvatar 
                  ? `<img src="${submission.userAvatar}" alt="${submission.username}" class="gallery-item-author-avatar">`
                  : `<div class="gallery-item-author-avatar" style="background: var(--accent-color); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">${submission.username.charAt(0).toUpperCase()}</div>`
                }
                <span>${this.escapeHtml(submission.username)}</span>
              </div>
              <div class="gallery-item-tokens">
                <i class="fas fa-coins"></i>
                <span>${submission.finalTokenAmount} tokens</span>
              </div>
              <div class="gallery-item-date">
                ${this.formatDate(submission.approvedAt)}
              </div>
            </div>
            ${submission.collab && Array.isArray(submission.collab) && submission.collab.length > 0 ? `
              <div class="gallery-item-collaborators">
                <div class="gallery-item-collaborators-title">Collaborators:</div>
                <div class="gallery-item-collaborators-list">
                  ${submission.collab.map(collaborator => {
                    const user = this.users.find(u => u.id === collaborator);
                    const displayName = user ? user.username : collaborator;
                    return `<span class="gallery-item-collaborator">${this.escapeHtml(displayName)}</span>`;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
  }

  createGalleryItem(submission) {
    // Ensure submission has required properties
    if (!submission) return document.createElement('div');
    
    const item = document.createElement('div');
    item.className = `gallery-item ${submission.category || 'unknown'}-item`;
    item.addEventListener('click', () => this.showModal(submission));

    const isArt = submission.category === 'art';
    const hasImage = isArt && submission.fileUrl;
    
    item.innerHTML = `
      <div class="gallery-item-image-container">
        ${hasImage 
          ? `<img src="${submission.fileUrl}" alt="${submission.title}" class="gallery-item-image adaptive-image" loading="lazy" onload="this.adaptImageSize && this.adaptImageSize()">`
          : `<div class="gallery-item-image" style="display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); color: var(--text-muted);">
               <i class="fas fa-${isArt ? 'image' : 'pen-fancy'}" style="font-size: 48px;"></i>
             </div>`
        }
      </div>
      <div class="gallery-item-content">
        <div class="gallery-item-header">
          <h3 class="gallery-item-title">${this.escapeHtml(submission.title)}</h3>
          <span class="gallery-item-category ${submission.category}">${submission.category}</span>
        </div>
        <div class="gallery-item-meta">
          <div class="gallery-item-author">
            ${submission.userAvatar 
              ? `<img src="${submission.userAvatar}" alt="${submission.username}" class="gallery-item-author-avatar">`
              : `<div class="gallery-item-author-avatar" style="background: var(--accent-color); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">${submission.username.charAt(0).toUpperCase()}</div>`
            }
            <span>${this.escapeHtml(submission.username)}</span>
          </div>
          <div class="gallery-item-tokens">
            <i class="fas fa-coins"></i>
            <span>${submission.finalTokenAmount} tokens</span>
          </div>
          <div class="gallery-item-date">
            ${this.formatDate(submission.approvedAt)}
          </div>
        </div>
        ${submission.description ? `
          <div class="gallery-item-description">
            ${this.escapeHtml(submission.description)}
          </div>
        ` : ''}
        ${submission.collab && Array.isArray(submission.collab) && submission.collab.length > 0 ? `
          <div class="gallery-item-collaborators">
            <div class="gallery-item-collaborators-title">Collaborators:</div>
            <div class="gallery-item-collaborators-list">
              ${submission.collab.map(collaborator => {
                const user = this.users.find(u => u.id === collaborator);
                const displayName = user ? user.username : collaborator;
                return `<span class="gallery-item-collaborator">${this.escapeHtml(displayName)}</span>`;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    return item;
  }

  showModal(submission) {
    // Remove existing modal
    const existingModal = document.querySelector('.gallery-modal');
    if (existingModal) {
      existingModal.remove();
    }


    const modal = document.createElement('div');
    modal.className = 'gallery-modal';
    modal.innerHTML = `
      <div class="gallery-modal-content">
        <button class="gallery-modal-close" onclick="this.closest('.gallery-modal').remove()">
          <i class="fas fa-times"></i>
        </button>
        ${submission.fileUrl && submission.category === 'art' 
          ? `<img src="${submission.fileUrl}" alt="${submission.title}" class="gallery-modal-image">`
          : submission.category === 'writing' 
            ? `<div class="gallery-modal-writing-preview">
                <div class="gallery-modal-writing-icon">
                  <i class="fas fa-pen-fancy"></i>
                </div>
                <div class="gallery-modal-writing-info">
                  <h3>Writing Submission</h3>
                  <p>Click the link below to read the full submission</p>
                </div>
              </div>`
            : ''
        }
        <div class="gallery-modal-info">
          <h2 class="gallery-modal-title">${this.escapeHtml(submission.title)}</h2>
          <div class="gallery-modal-meta">
            <div class="gallery-modal-meta-item">
              <div class="gallery-modal-meta-label">Category</div>
              <div class="gallery-modal-meta-value">${submission.category}</div>
            </div>
            <div class="gallery-modal-meta-item">
              <div class="gallery-modal-meta-label">Author</div>
              <div class="gallery-modal-meta-value">${this.escapeHtml(submission.username)}</div>
            </div>
            <div class="gallery-modal-meta-item">
              <div class="gallery-modal-meta-label">Total Tokens</div>
              <div class="gallery-modal-meta-value">${submission.finalTokenAmount}</div>
            </div>
            ${submission.category !== 'writing' && (submission.tokenBreakdown || submission.tokenCalculation) ? `
              <div class="gallery-modal-meta-item gallery-modal-token-breakdown">
                <div class="gallery-modal-meta-label">Token Breakdown</div>
                <div class="gallery-modal-meta-value">
                  <div class="token-breakdown">
                    ${submission.tokenBreakdown ? Object.entries(submission.tokenBreakdown).map(([key, value]) => `
                      <div class="token-breakdown-item">
                        <span class="token-breakdown-label">${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span>
                        <span class="token-breakdown-value">${value}</span>
                      </div>
                    `).join('') : ''}
                    ${submission.baseSelections && submission.baseSelections.length > 0 ? `
                      <div class="token-breakdown-section">
                        <div class="token-breakdown-section-title">Base Selections</div>
                        ${submission.baseSelections.map(selection => {
                          const count = submission.baseCounts && submission.baseCounts[selection] ? submission.baseCounts[selection] : 0;
                          return `
                            <div class="token-breakdown-item">
                              <span class="token-breakdown-label">${selection}:</span>
                              <span class="token-breakdown-value">${count}</span>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    ` : ''}
                    ${submission.typeMultiplierSelections && submission.typeMultiplierSelections.length > 0 ? `
                      <div class="token-breakdown-section">
                        <div class="token-breakdown-section-title">Type Multipliers</div>
                        ${submission.typeMultiplierSelections.map(selection => {
                          const count = submission.typeMultiplierCounts && submission.typeMultiplierCounts[selection] ? submission.typeMultiplierCounts[selection] : 0;
                          return `
                            <div class="token-breakdown-item">
                              <span class="token-breakdown-label">${selection}:</span>
                              <span class="token-breakdown-value">${count}</span>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    ` : ''}
                    ${submission.addOnsApplied && submission.addOnsApplied.length > 0 ? `
                      <div class="token-breakdown-section">
                        <div class="token-breakdown-section-title">Add-ons Applied</div>
                        ${submission.addOnsApplied.map(addon => `
                          <div class="token-breakdown-item">
                            <span class="token-breakdown-label">${addon.addOn}:</span>
                            <span class="token-breakdown-value">${addon.count}</span>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                    ${submission.specialWorksApplied && submission.specialWorksApplied.length > 0 ? `
                      <div class="token-breakdown-section">
                        <div class="token-breakdown-section-title">Special Works</div>
                        ${submission.specialWorksApplied.map(work => `
                          <div class="token-breakdown-item">
                            <span class="token-breakdown-label">${work.work}:</span>
                            <span class="token-breakdown-value">${work.count}</span>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
            ` : ''}
            <div class="gallery-modal-meta-item">
              <div class="gallery-modal-meta-label">Approved</div>
              <div class="gallery-modal-meta-value">${this.formatDate(submission.approvedAt)}</div>
            </div>
            ${submission.wordCount ? `
              <div class="gallery-modal-meta-item">
                <div class="gallery-modal-meta-label">Word Count</div>
                <div class="gallery-modal-meta-value">${submission.wordCount}</div>
              </div>
            ` : ''}
            ${submission.category === 'writing' && submission.link ? `
              <div class="gallery-modal-meta-item">
                <div class="gallery-modal-meta-label">Submission Link</div>
                <div class="gallery-modal-meta-value">
                  <a href="${submission.link}" target="_blank" rel="noopener noreferrer" class="gallery-modal-link">
                    <i class="fas fa-external-link-alt"></i> View Submission
                  </a>
                </div>
              </div>
            ` : ''}
            ${submission.category !== 'writing' && (submission.fileUrl || submission.messageUrl) ? `
              <div class="gallery-modal-meta-item">
                <div class="gallery-modal-meta-label">Submission Link</div>
                <div class="gallery-modal-meta-value">
                  <a href="${submission.fileUrl || submission.messageUrl}" target="_blank" rel="noopener noreferrer" class="gallery-modal-link">
                    <i class="fas fa-external-link-alt"></i> View Original Submission
                  </a>
                </div>
              </div>
            ` : ''}
          </div>
          ${submission.description ? `
            <div class="gallery-modal-description">
              ${this.escapeHtml(submission.description)}
            </div>
          ` : ''}
          ${submission.collab && Array.isArray(submission.collab) && submission.collab.length > 0 ? `
            <div class="gallery-modal-collaborators">
              <div class="gallery-modal-collaborators-title">Collaborators</div>
              <div class="gallery-modal-collaborators-list">
                ${submission.collab.map(collaborator => {
                  const user = this.users.find(u => u.id === collaborator);
                  const displayName = user ? user.username : collaborator;
                  return `<span class="gallery-modal-collaborator">${this.escapeHtml(displayName)}</span>`;
                }).join('')}
              </div>
            </div>
          ` : ''}
          ${submission.taggedCharacters && Array.isArray(submission.taggedCharacters) && submission.taggedCharacters.length > 0 ? `
            <div class="gallery-modal-tagged-characters">
              <div class="gallery-modal-tagged-characters-title">Tagged Characters</div>
              <div class="gallery-modal-tagged-characters-list">
                ${submission.taggedCharacters.map(characterId => {
                  const character = this.characters.find(c => c._id === characterId);
                  const displayName = character ? character.name : characterId;
                  return `<span class="gallery-modal-tagged-character">${this.escapeHtml(displayName)}</span>`;
                }).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close modal on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Close modal on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  calculateTotalPages() {
    const artSubmissions = this.filteredSubmissions.filter(s => s && s.category === 'art');
    const writingSubmissions = this.filteredSubmissions.filter(s => s && s.category === 'writing');
    
    const artPages = Math.ceil(artSubmissions.length / this.artItemsPerPage);
    const writingPages = Math.ceil(writingSubmissions.length / this.writingItemsPerPage);
    
    return Math.max(artPages, writingPages);
  }

  updatePagination() {
    const pagination = document.getElementById('gallery-pagination');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    if (!pagination || !prevBtn || !nextBtn || !pageInfo) return;

    const totalPages = this.calculateTotalPages();
    
    if (totalPages <= 1) {
      pagination.style.display = 'none';
      return;
    }

    pagination.style.display = 'flex';
    prevBtn.disabled = this.currentPage <= 1;
    nextBtn.disabled = this.currentPage >= totalPages;
    
    pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
  }

  showLoading() {
    const sections = document.getElementById('gallery-sections');
    if (!sections) return;

    sections.innerHTML = `
      <div class="gallery-loading">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading gallery...</p>
      </div>
    `;
  }

  showEmpty() {
    const sections = document.getElementById('gallery-sections');
    if (!sections) return;

    sections.innerHTML = `
      <div class="gallery-empty">
        <i class="fas fa-images"></i>
        <h3>No submissions found</h3>
        <p>No approved submissions match your current filters. Try adjusting your search criteria.</p>
      </div>
    `;
  }

  showError(message) {
    const sections = document.getElementById('gallery-sections');
    if (!sections) return;

    sections.innerHTML = `
      <div class="gallery-empty">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    `;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  adaptImageSize(img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    const container = img.closest('.gallery-item');
    
    if (aspectRatio > 1.2) {
      // Landscape
      img.classList.add('landscape');
    } else if (aspectRatio < 0.8) {
      // Portrait
      img.classList.add('portrait');
    } else {
      // Square
      img.classList.add('square');
    }
  }

  async editSubmission(submissionId) {
    try {
      // Get the submission data
      const submission = this.submissions.find(s => s.submissionId === submissionId);
      if (!submission) return;

      console.log('Editing submission:', {
        submissionId,
        currentTaggedCharacters: submission.taggedCharacters
      });

      // Get characters for tagging
      const characters = await this.getCharacters();
      console.log('Loaded characters for editing:', characters.length);
      
      // Show edit modal
      this.showEditModal(submission, characters);
    } catch (error) {
      console.error('Error editing submission:', error);
      this.showErrorPopup('Failed to load edit form. Please try again.');
    }
  }

  async getCharacters() {
    try {
      const response = await fetch('/api/characters');
      if (!response.ok) throw new Error('Failed to fetch characters');
      const data = await response.json();
      // The API returns { characters: [...] }, so extract the characters array
      const characters = data.characters || [];
      return characters;
    } catch (error) {
      console.error('Error fetching characters:', error);
      return [];
    }
  }

  showEditModal(submission, characters) {
    // Remove existing modal
    const existingModal = document.querySelector('.gallery-edit-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Ensure characters is an array
    const characterList = Array.isArray(characters) ? characters : [];

    const modal = document.createElement('div');
    modal.className = 'gallery-edit-modal';
    modal.innerHTML = `
      <div class="gallery-edit-content">
        <div class="gallery-edit-header">
          <h2>Edit Submission: ${this.escapeHtml(submission.title)}</h2>
          <button class="gallery-edit-close" onclick="this.closest('.gallery-edit-modal').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="gallery-edit-body">
          <div class="edit-form-group">
            <label for="edit-title">Title:</label>
            <input type="text" id="edit-title" value="${this.escapeHtml(submission.title)}" class="edit-input">
          </div>
          <div class="edit-form-group">
            <label>Tag Characters:</label>
            <div class="character-search-container">
              <input type="text" id="character-search" placeholder="Search characters..." class="character-search-input">
              <div class="character-tags" id="character-tags">
                ${characterList.map(char => `
                  <label class="character-tag" data-name="${this.escapeHtml(char.name.toLowerCase())}">
                    <input type="checkbox" value="${char._id}" ${submission.taggedCharacters && submission.taggedCharacters.includes(char._id) ? 'checked' : ''}>
                    <span class="character-checkmark">✓</span>
                    <span class="character-name">${this.escapeHtml(char.name)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="gallery-edit-footer">
          <button class="edit-cancel-btn" onclick="this.closest('.gallery-edit-modal').remove()">Cancel</button>
          <button class="edit-save-btn" onclick="window.gallery.saveSubmission('${submission.submissionId}')">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add character search functionality
    const searchInput = modal.querySelector('#character-search');
    const characterTags = modal.querySelectorAll('.character-tag');
    
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      characterTags.forEach(tag => {
        const name = tag.getAttribute('data-name');
        if (name.includes(searchTerm)) {
          tag.style.display = 'flex';
        } else {
          tag.style.display = 'none';
        }
      });
    });

    // Close modal on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  async saveSubmission(submissionId) {
    try {
      const title = document.getElementById('edit-title').value;
      const taggedCharacters = Array.from(document.querySelectorAll('.character-tag input:checked')).map(cb => cb.value);

      console.log('Saving submission with data:', {
        submissionId,
        title,
        taggedCharacters
      });

      const response = await fetch(`/api/gallery/submissions/${submissionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          taggedCharacters
        })
      });

      if (!response.ok) throw new Error('Failed to save changes');

      // Remove edit modal
      document.querySelector('.gallery-edit-modal')?.remove();
      
      // Refresh gallery
      this.loadSubmissions();
      
      // Show success popup
      this.showSuccessPopup('Submission updated successfully!');
    } catch (error) {
      console.error('Error saving submission:', error);
      this.showErrorPopup('Failed to save changes. Please try again.');
    }
  }

  canEditSubmission(submission) {
    // Only allow editing if user is authenticated and owns the submission
    if (!this.currentUserId) {
      console.log('No current user ID, denying edit access');
      return false;
    }
    
    const canEdit = submission.userId === this.currentUserId;
    
    return canEdit;
  }

  showSuccessPopup(message) {
    this.showPopup(message, 'success');
  }

  showErrorPopup(message) {
    this.showPopup(message, 'error');
  }

  showPopup(message, type = 'success') {
    // Remove existing popup
    const existingPopup = document.querySelector('.gallery-popup');
    if (existingPopup) {
      existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.className = 'gallery-popup';
    popup.innerHTML = `
      <div class="gallery-popup-content">
        <div class="gallery-popup-icon">
          <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>
        </div>
        <div class="gallery-popup-message">${message}</div>
        <button class="gallery-popup-close">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    document.body.appendChild(popup);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (popup.parentNode) {
        popup.remove();
      }
    }, 3000);

    // Close on button click
    popup.querySelector('.gallery-popup-close').addEventListener('click', () => {
      popup.remove();
    });

    // Close on background click
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        popup.remove();
      }
    });
  }

  formatTokenCalculation(calculation) {
    if (typeof calculation === 'string') {
      // Parse the calculation string and format it nicely
      return this.parseTokenCalculationString(calculation);
    } else if (typeof calculation === 'object') {
      // Handle object format
      return Object.entries(calculation).map(([key, value]) => `
        <div class="token-breakdown-item">
          <span class="token-breakdown-label">${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span>
          <span class="token-breakdown-value">${value}</span>
        </div>
      `).join('');
    }
    return '';
  }

  parseTokenCalculationString(calculationString) {
    try {
      // Clean up the string and parse it
      const cleanString = calculationString.replace(/[`]/g, '').trim();
      
      // Split by lines and format each line
      const lines = cleanString.split('\n').filter(line => line.trim());
      let formattedLines = [];
      let totalTokens = '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (!trimmedLine) continue;
        
        // Check if this is the total tokens line
        if (trimmedLine.includes('Tokens')) {
          totalTokens = trimmedLine;
          continue;
        }
        
        // Check if this is a separator line
        if (trimmedLine.includes('---')) {
          formattedLines.push(`<div class="token-calculation-separator">${trimmedLine}</div>`);
          continue;
        }
        
        // Format regular calculation lines
        formattedLines.push(`<div class="token-calculation-line">${trimmedLine}</div>`);
      }
      
      // Add the total at the end
      if (totalTokens) {
        formattedLines.push(`<div class="token-total">${totalTokens}</div>`);
      }
      
      return formattedLines.join('');
    } catch (error) {
      console.error('Error parsing token calculation:', error);
      return '<div class="token-calculation-error">Error parsing calculation</div>';
    }
  }

  formatCalculationLine(line) {
    // Format a calculation line (e.g., "Chibi (15×1)" -> "Chibi (15×1)")
    const match = line.match(/(\w+)\s*\((\d+)\s*×\s*(\d+)\)/);
    if (match) {
      const [, name, multiplier, count] = match;
      return `<div class="token-calculation-line">${name} (${multiplier}×${count})</div>`;
    }
    
    // Handle other patterns
    if (line.includes('×')) {
      return `<div class="token-calculation-line">${line}</div>`;
    }
    
    return `<div class="token-calculation-line">${line}</div>`;
  }

  extractTokenTotal(calculationString) {
    // Extract the final token total from the calculation string
    const match = calculationString.match(/(\d+)\s*Tokens/);
    return match ? `${match[1]} Tokens` : 'Unknown Tokens';
  }

  scrollToTop() {
    // Smooth scroll to the top of the gallery section
    const gallerySection = document.getElementById('gallery-section');
    if (gallerySection) {
      gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async getCurrentUser() {
    try {
      const response = await fetch('/api/user');
      if (response.ok) {
        const userData = await response.json();
        if (userData.isAuthenticated && userData.user) {
          this.currentUserId = userData.user.discordId;
          console.log('Current user ID set to:', this.currentUserId);
        } else {
          this.currentUserId = null;
          console.log('No authenticated user found');
        }
      } else {
        this.currentUserId = null;
        console.log('Failed to fetch user data');
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
      this.currentUserId = null;
    }
  }
}

// Initialize gallery when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if we're on a page with gallery functionality
  if (document.getElementById('gallery-section')) {
    // Check if we're loading directly to gallery section
    const hash = window.location.hash;
    if (hash.includes('gallery-section')) {
      // Show the gallery section
      const gallerySection = document.getElementById('gallery-section');
      if (gallerySection) {
        gallerySection.style.display = 'block';
        // Hide other sections
        const sections = document.querySelectorAll('main > section');
        sections.forEach(section => {
          if (section.id !== 'gallery-section') {
            section.style.display = 'none';
          }
        });
      }
    }
    
    // Small delay to ensure all DOM elements are ready
    setTimeout(() => {
      window.gallery = new Gallery();
    }, 100);
  }
});

// Handle section switching
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-section="gallery-section"]')) {
    // Refresh gallery when switching to gallery section
    if (window.gallery) {
      window.gallery.loadSubmissions();
    }
  }
});

// Handle initial page load with gallery hash
window.addEventListener('load', () => {
  const hash = window.location.hash;
  if (hash.includes('gallery-section')) {
    // Show the gallery section
    const gallerySection = document.getElementById('gallery-section');
    if (gallerySection) {
      gallerySection.style.display = 'block';
      // Hide other sections
      const sections = document.querySelectorAll('main > section');
      sections.forEach(section => {
        if (section.id !== 'gallery-section') {
          section.style.display = 'none';
        }
      });
      
      // Initialize gallery if not already initialized
      if (!window.gallery) {
        setTimeout(() => {
          window.gallery = new Gallery();
        }, 100);
      }
    }
  }
});
