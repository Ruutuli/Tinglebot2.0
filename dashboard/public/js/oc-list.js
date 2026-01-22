/* ============================================================================
   oc-list.js
   Purpose: Handles OC List page functionality - fetching and displaying all characters in a triangle grid
============================================================================ */

// ============================================================================
// ------------------- Global Variables -------------------
// ============================================================================
let characters = [];

// Village colors mapping
const VILLAGE_COLORS = {
  'Rudania': '#d7342a',
  'Inariko': '#277ecd',
  'Vhintl': '#25c059'
};

// Helper function to get village color
function getVillageColor(villageName) {
  if (!villageName) return '#666666';
  const village = villageName.charAt(0).toUpperCase() + villageName.slice(1).toLowerCase();
  return VILLAGE_COLORS[village] || '#666666';
}

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthentication();
  await initializePage();
});

// ============================================================================
// ------------------- Page Initialization -------------------
// ============================================================================
async function initializePage() {
  try {
    await loadCharacters();
    setupEventListeners();
  } catch (error) {
    console.error('Error initializing page:', error);
    showError(error.message || 'Failed to load characters');
  }
}

// ============================================================================
// ------------------- Authentication Check -------------------
// ============================================================================
async function checkAuthentication() {
  try {
    const { checkUserAuthStatus } = await import('/js/auth.js');
    const authStatus = await checkUserAuthStatus();
    
    // Update user menu
    const userMenu = document.getElementById('user-menu');
    const username = document.getElementById('username');
    const userAvatar = document.getElementById('user-avatar');
    
    if (authStatus.currentUser) {
      username.textContent = authStatus.currentUser.username || authStatus.currentUser.discordId;
      if (authStatus.currentUser.avatar) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${authStatus.currentUser.discordId}/${authStatus.currentUser.avatar}.png`;
        userAvatar.src = avatarUrl;
      }
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
  }
}

// ============================================================================
// ------------------- Character Loading -------------------
// ============================================================================
async function loadCharacters() {
  try {
    showLoading();
    
    const response = await fetch('/api/models/character?all=true', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    characters = result.data || [];
    
    // Filter to only show accepted characters
    characters = characters.filter(char => char.status === 'accepted');
    
    // Sort characters alphabetically by name
    characters.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    if (characters.length === 0) {
      showError('No characters found');
      return;
    }
    
    // Display characters in triangle grid
    displayTriangleGrid();
    
  } catch (error) {
    console.error('Error loading characters:', error);
    let errorMessage = 'Failed to load characters. Please try again later.';
    
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      errorMessage = 'Unable to connect to the server. Please make sure the dashboard server is running.';
    }
    
    showError(errorMessage);
  }
}

// ============================================================================
// ------------------- Character Name to Slug Conversion -------------------
// ============================================================================
function characterNameToSlug(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ============================================================================
// ------------------- Triangle Grid Display -------------------
// ============================================================================
function displayTriangleGrid() {
  hideLoading();
  
  const gridContainer = document.getElementById('triangle-grid-container');
  const grid = document.getElementById('triangle-grid');
  
  if (!grid || !gridContainer) {
    console.error('Triangle grid elements not found');
    return;
  }
  
  // Clear existing content
  grid.innerHTML = '';
  
  // Generate character cards in a clean grid
  characters.forEach((character) => {
    const slug = characterNameToSlug(character.name);
    const ocUrl = `https://tinglebot.xyz/ocs/${slug}`;
    
    // Get character icon or use default
    const iconUrl = character.icon || '/images/ankleicon.png';
    
    // Get village color
    const villageColor = getVillageColor(character.homeVillage || character.currentVillage);
    
    // Check if this is a mod character
    const isModCharacter = character.isModCharacter || character.modTitle || character.modType;
    
    // Create card element
    const card = document.createElement('a');
    card.href = ocUrl;
    card.className = `triangle-item ${isModCharacter ? 'mod-character' : ''}`;
    card.setAttribute('aria-label', `View ${character.name}`);
    card.setAttribute('title', character.name);
    card.style.setProperty('--village-color', villageColor);
    
    // Create wrapper for content
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'triangle-content';
    
    // Create image element
    const img = document.createElement('img');
    img.src = iconUrl;
    img.alt = character.name;
    img.className = 'triangle-icon';
    
    // Handle image load errors
    img.onerror = function() {
      this.src = '/images/ankleicon.png';
    };
    
    // Create name label
    const nameLabel = document.createElement('div');
    nameLabel.className = 'triangle-name';
    nameLabel.textContent = character.name;
    
    contentWrapper.appendChild(img);
    contentWrapper.appendChild(nameLabel);
    card.appendChild(contentWrapper);
    grid.appendChild(card);
  });
  
  // Show grid container
  gridContainer.style.display = 'block';
}

// ============================================================================
// ------------------- UI State Management -------------------
// ============================================================================
function showLoading() {
  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const gridContainer = document.getElementById('triangle-grid-container');
  
  if (loadingState) loadingState.style.display = 'flex';
  if (errorState) errorState.style.display = 'none';
  if (gridContainer) gridContainer.style.display = 'none';
}

function hideLoading() {
  const loadingState = document.getElementById('loading-state');
  if (loadingState) loadingState.style.display = 'none';
}

function showError(message) {
  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const errorMessage = document.getElementById('error-message');
  const gridContainer = document.getElementById('triangle-grid-container');
  
  if (loadingState) loadingState.style.display = 'none';
  if (errorState) errorState.style.display = 'flex';
  if (errorMessage) errorMessage.textContent = message;
  if (gridContainer) gridContainer.style.display = 'none';
}

// ============================================================================
// ------------------- Event Listeners -------------------
// ============================================================================
function setupEventListeners() {
  // Sidebar toggle is handled by navigation.js module
  // Navigation dropdowns are handled by navigation.js module
}
