/* ============================================================================
   quest-management.js
   Purpose: Handles quest management page - viewing and filtering all quests
============================================================================ */

import { checkUserAuthStatus } from '/js/auth.js';
import { setupSidebarNavigation } from '/js/modules/navigation.js';

// ============================================================================
// ------------------- Global Variables -------------------
// ============================================================================
let allQuests = [];
let filteredQuests = [];

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication and mod/admin access
  const authStatus = await checkUserAuthStatus();
  if (!authStatus.isAuthenticated) {
    window.location.href = '/';
    return;
  }

  // Check if user is admin/mod
  if (!authStatus.isAdmin) {
    // Redirect if not admin/mod
    window.location.href = '/';
    return;
  }

  // Initialize sidebar navigation
  setupSidebarNavigation();
  initializeDropdownToggles();

  // Initialize page
  await initializePage();
});

// ============================================================================
// ------------------- Sidebar Navigation -------------------
// ============================================================================
function initializeDropdownToggles() {
  const dropdownToggles = document.querySelectorAll('.nav-dropdown-toggle');
  
  if (dropdownToggles.length === 0) {
    setTimeout(initializeDropdownToggles, 100);
    return;
  }
  
  dropdownToggles.forEach(toggle => {
    if (toggle.dataset.listenerAttached) {
      return;
    }
    toggle.dataset.listenerAttached = 'true';
    
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const dropdown = toggle.closest('.nav-dropdown');
      if (!dropdown) return;
      
      const isActive = dropdown.classList.contains('active');
      
      // Close all other dropdowns
      document.querySelectorAll('.nav-dropdown').forEach(item => {
        if (item !== dropdown) {
          item.classList.remove('active');
          const otherToggle = item.querySelector('.nav-dropdown-toggle');
          if (otherToggle) {
            otherToggle.setAttribute('aria-expanded', 'false');
          }
        }
      });
      
      // Toggle current dropdown
      if (isActive) {
        dropdown.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        dropdown.classList.add('active');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });
  
  // Close dropdowns when clicking outside
  if (!document.dropdownOutsideClickHandler) {
    document.dropdownOutsideClickHandler = (e) => {
      if (!e.target.closest('.nav-dropdown')) {
        document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
          dropdown.classList.remove('active');
          const toggle = dropdown.querySelector('.nav-dropdown-toggle');
          if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
          }
        });
      }
    };
    document.addEventListener('click', document.dropdownOutsideClickHandler);
  }
}

// ============================================================================
// ------------------- Page Initialization -------------------
// ============================================================================
async function initializePage() {
  try {
    // Setup event listeners
    setupEventListeners();
    
    // Update user menu
    updateUserMenu();
    
    // Load quests
    await loadQuests();
  } catch (error) {
    console.error('Error initializing page:', error);
    showError('Failed to initialize page. Please refresh.');
  }
}

// ============================================================================
// ------------------- Event Listeners -------------------
// ============================================================================
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('quest-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }
  
  // Status filter
  const statusFilter = document.getElementById('quest-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', handleFilter);
  }
  
  // Type filter
  const typeFilter = document.getElementById('quest-type-filter');
  if (typeFilter) {
    typeFilter.addEventListener('change', handleFilter);
  }
}

// ============================================================================
// ------------------- Load Quests -------------------
// ============================================================================
window.loadQuests = async function() {
  const listContainer = document.getElementById('quests-list');
  if (!listContainer) return;
  
  listContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading quests...</div>';
  
  try {
    // Fetch all quests from admin API (use high limit to get all)
    let allQuestsData = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;
    
    while (hasMore) {
      const response = await fetch(`/api/admin/db/Quest?page=${page}&limit=${limit}&sortBy=createdAt&sortOrder=desc`, {
        credentials: 'include'
      });
      
      if (response.status === 403) {
        listContainer.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><h3>Access Denied</h3><p>You must be a moderator to access this page.</p></div>';
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to load quests');
      }
      
      const data = await response.json();
      const records = data.records || [];
      allQuestsData = allQuestsData.concat(records);
      
      // Check if there are more pages
      const pagination = data.pagination || {};
      hasMore = page < pagination.pages;
      page++;
      
      // Safety limit - don't fetch more than 1000 quests
      if (allQuestsData.length >= 1000) {
        hasMore = false;
      }
    }
    
    allQuests = allQuestsData;
    
    if (allQuests.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <h3>No Quests Found</h3>
          <p>No quests have been created yet. <a href="/quest-create.html">Create your first quest</a>!</p>
        </div>
      `;
      return;
    }
    
    // Apply filters and render
    applyFilters();
    
  } catch (error) {
    console.error('Error loading quests:', error);
    listContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error Loading Quests</h3>
        <p>${error.message || 'Failed to load quests. Please try again.'}</p>
      </div>
    `;
  }
};

// ============================================================================
// ------------------- Filtering and Search -------------------
// ============================================================================
function handleSearch(e) {
  applyFilters();
}

function handleFilter() {
  applyFilters();
}

function applyFilters() {
  const searchInput = document.getElementById('quest-search-input');
  const statusFilter = document.getElementById('quest-status-filter');
  const typeFilter = document.getElementById('quest-type-filter');
  
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const statusFilterValue = statusFilter ? statusFilter.value : '';
  const typeFilterValue = typeFilter ? typeFilter.value : '';
  
  filteredQuests = allQuests.filter(quest => {
    // Search filter
    if (searchTerm) {
      const matchesSearch = 
        quest.title?.toLowerCase().includes(searchTerm) ||
        quest.questID?.toLowerCase().includes(searchTerm) ||
        quest.location?.toLowerCase().includes(searchTerm) ||
        quest.description?.toLowerCase().includes(searchTerm);
      
      if (!matchesSearch) return false;
    }
    
    // Status filter
    if (statusFilterValue && quest.status !== statusFilterValue) {
      return false;
    }
    
    // Type filter
    if (typeFilterValue && quest.questType !== typeFilterValue) {
      return false;
    }
    
    return true;
  });
  
  // Sort by date (newest first)
  filteredQuests.sort((a, b) => {
    const dateA = new Date(a.postedAt || a.createdAt || 0);
    const dateB = new Date(b.postedAt || b.createdAt || 0);
    return dateB - dateA;
  });
  
  renderQuests();
}

// ============================================================================
// ------------------- Render Quests -------------------
// ============================================================================
function renderQuests() {
  const listContainer = document.getElementById('quests-list');
  if (!listContainer) return;
  
  if (filteredQuests.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fas fa-search"></i>
        <h3>No Quests Match Your Filters</h3>
        <p>Try adjusting your search or filter criteria.</p>
      </div>
    `;
    return;
  }
  
  listContainer.innerHTML = filteredQuests.map(quest => {
    const statusClass = quest.status === 'active' ? 'active' : 'completed';
    const statusIcon = quest.status === 'active' ? 'fa-check-circle' : 'fa-check-double';
    const statusText = quest.status === 'active' ? 'Active' : 'Completed';
    
    // Format dates
    const postedDate = quest.postedAt ? new Date(quest.postedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) : 'Not posted';
    
    const createdDate = quest.createdAt ? new Date(quest.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) : 'Unknown';
    
    // Participant count
    const participantCount = quest.participants ? (typeof quest.participants === 'object' ? Object.keys(quest.participants).length : 0) : 0;
    const participantCap = quest.participantCap || '∞';
    
    // Token reward
    const tokenReward = formatTokenReward(quest.tokenReward);
    
    // Quest type icon
    const questTypeIcon = getQuestTypeIcon(quest.questType);
    
    return `
      <div class="quest-management-card" data-quest-id="${quest.questID}">
        <div class="quest-management-card-header">
          <h3 class="quest-management-card-title">${escapeHtml(quest.title || 'Untitled Quest')}</h3>
          <div class="quest-management-card-status ${statusClass}">
            <i class="fas ${statusIcon}"></i>
            <span>${statusText}</span>
          </div>
        </div>
        
        <div class="quest-management-card-type">
          <i class="fas ${questTypeIcon}"></i>
          <span>${escapeHtml(quest.questType || 'Unknown')}</span>
        </div>
        
        <div class="quest-management-card-info">
          <div class="quest-management-card-info-item">
            <i class="fas fa-hashtag"></i>
            <span><strong>Quest ID:</strong> ${escapeHtml(quest.questID || 'N/A')}</span>
          </div>
          <div class="quest-management-card-info-item">
            <i class="fas fa-map-marker-alt"></i>
            <span><strong>Location:</strong> ${escapeHtml(quest.location || 'N/A')}</span>
          </div>
          <div class="quest-management-card-info-item">
            <i class="fas fa-users"></i>
            <span><strong>Participants:</strong> ${participantCount}/${participantCap}</span>
          </div>
          <div class="quest-management-card-info-item">
            <i class="fas fa-coins"></i>
            <span><strong>Token Reward:</strong> ${tokenReward}</span>
          </div>
          <div class="quest-management-card-info-item">
            <i class="fas fa-calendar"></i>
            <span><strong>Posted:</strong> ${postedDate}</span>
          </div>
          ${quest.timeLimit ? `
          <div class="quest-management-card-info-item">
            <i class="fas fa-clock"></i>
            <span><strong>Time Limit:</strong> ${escapeHtml(quest.timeLimit)}</span>
          </div>
          ` : ''}
        </div>
        
        <div class="quest-management-card-actions">
          <button class="btn btn-secondary" onclick="viewQuestDetails('${quest.questID}')">
            <i class="fas fa-eye"></i> View Details
          </button>
          <button class="btn btn-primary" onclick="editQuest('${quest.questID}')">
            <i class="fas fa-edit"></i> Edit
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================
function formatTokenReward(tokenReward) {
  if (!tokenReward) return 'N/A';
  
  if (typeof tokenReward === 'number') {
    return tokenReward.toString();
  }
  
  if (typeof tokenReward === 'string') {
    const noRewardValues = ['N/A', 'No reward', 'No reward specified', 'None'];
    if (noRewardValues.includes(tokenReward)) {
      return 'N/A';
    }
    return tokenReward;
  }
  
  return 'N/A';
}

function getQuestTypeIcon(questType) {
  const iconMap = {
    'Art': 'fa-palette',
    'Writing': 'fa-pen',
    'Interactive': 'fa-dice',
    'RP': 'fa-comments',
    'Art / Writing': 'fa-palette'
  };
  return iconMap[questType] || 'fa-tasks';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// ------------------- Quest Actions -------------------
// ============================================================================
window.viewQuestDetails = function(questID) {
  // Navigate to quest details in the main quest view
  window.location.href = `/#quest?questID=${questID}`;
};

window.editQuest = function(questID) {
  // Navigate to admin database editor for this quest
  window.location.href = `/#admin-area?model=Quest&id=${questID}`;
};

// ============================================================================
// ------------------- User Menu Update -------------------
// ============================================================================
async function updateUserMenu() {
  try {
    const authStatus = await checkUserAuthStatus();
    const usernameEl = document.getElementById('username');
    const userAvatar = document.getElementById('user-avatar');
    
    if (authStatus.currentUser && usernameEl) {
      usernameEl.textContent = authStatus.currentUser.username || authStatus.currentUser.discordId || 'User';
      
      if (authStatus.currentUser.avatar && userAvatar) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${authStatus.currentUser.discordId}/${authStatus.currentUser.avatar}.png`;
        userAvatar.src = avatarUrl;
        userAvatar.onerror = () => { userAvatar.src = '/images/ankleicon.png'; };
      }
    }
  } catch (error) {
    console.error('Error updating user menu:', error);
  }
}

// ============================================================================
// ------------------- Error Display -------------------
// ============================================================================
function showError(message) {
  const listContainer = document.getElementById('quests-list');
  if (listContainer) {
    listContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
}
