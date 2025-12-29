/* ============================================================================
   relationships.js — Relationships Feature Module
   Purpose: Handles character relationship management functionality
   Features: Character selection, relationship CRUD operations, modal management
   
   REFACTORING IMPROVEMENTS:
   - Eliminated duplicate relationship type definitions (RELATIONSHIP_CONFIG only)
   - Centralized character finding logic with robust ID handling
   - Created utility functions for consistent character display formatting
   - Centralized relationship type handling with validation
   - Unified modal management with consistent styling and behavior
   - Consolidated notification system with enhanced styling
   - Added comprehensive error handling wrapper for async operations
   - Improved code organization with clear section separation
   - Enhanced robustness with null checks and fallbacks
============================================================================ */

// ============================================================================
// ------------------- Centralized Relationship Configuration -------------------
// ============================================================================

// Centralized relationship type configuration
const RELATIONSHIP_CONFIG = {
  LOVERS: { 
    emoji: '❤️', 
    label: 'Lovers', 
    color: '#e57373'  // Soft red
  },
  CRUSH: { 
    emoji: '🧡', 
    label: 'Crush', 
    color: '#f4a261'  // Warm orange
  },
  CLOSE_FRIEND: { 
    emoji: '💛', 
    label: 'Close Friend', 
    color: '#f6e05e'  // Golden yellow
  },
  FRIEND: { 
    emoji: '💚', 
    label: 'Friend', 
    color: '#81c784'  // Muted green
  },
  ACQUAINTANCE: { 
    emoji: '💙', 
    label: 'Acquaintance', 
    color: '#64b5f6'  // Soft blue
  },
  DISLIKE: { 
    emoji: '💜', 
    label: 'Dislike', 
    color: '#ba68c8'  // Lavender purple
  },
  HATE: { 
    emoji: '🖤', 
    label: 'Hate', 
    color: '#424242'  // Dark grayish black
  },
  NEUTRAL: { 
    emoji: '🤍', 
    label: 'Neutral', 
    color: '#f5f5f5'  // Light gray
  },
  FAMILY: { 
    emoji: '👨‍👩‍👧‍👦', 
    label: 'Family', 
    color: '#ff8a65'  // Warm coral
  },
  RIVAL: { 
    emoji: '⚔️', 
    label: 'Rival', 
    color: '#d84315'  // Deep orange-red
  },
  ADMIRE: { 
    emoji: '⭐', 
    label: 'Admire', 
    color: '#ffd54f'  // Bright yellow
  },
  OTHER: { 
    emoji: '🤎', 
    label: 'Other', 
    color: '#a1887f'  // Soft brown
  }
};


// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================
const relationshipsModule = {
  init,
  showRelationshipsSection,
  loadUserCharacters,
  selectCharacter,
  loadCharacterRelationships,
  showAddRelationshipModal,
  saveRelationship,
  editRelationship,
  deleteRelationship,
  backToCharacterSelection,
  showAllRelationships,
  loadAllRelationships,
  showCharacterRelationshipsModal,
  closeModal,
  showRelationshipWeb,
  backToRelationshipList,
  toggleFullscreen,
  resetZoom,
  centerView,
  toggleUserCharacters,
  toggleRelationshipLines,
  toggleNodeLabels,
  toggleLayoutFreeze,
  spreadOutCharacters,
  toggleRelationshipAttraction,
  toggleMenu,
  toggleLegend,
  RELATIONSHIP_CONFIG // Export the config for use in other modules
};

// Make module available globally immediately
window.relationshipsModule = relationshipsModule;
window.RELATIONSHIP_CONFIG = RELATIONSHIP_CONFIG;

// Debug: Check if module is loaded
console.log('🔗 Relationships module loaded successfully');

// Generate CSS variables for relationship colors
function generateRelationshipCSSVariables() {
  const style = document.createElement('style');
  style.id = 'relationship-css-variables';
  
  let cssVariables = ':root {\n';
  Object.entries(RELATIONSHIP_CONFIG).forEach(([key, config]) => {
    const cssKey = key.toLowerCase().replace(/_/g, '-');
    cssVariables += `  --relationship-color-${cssKey}: ${config.color};\n`;
  });
  cssVariables += '}';
  
  style.textContent = cssVariables;
  document.head.appendChild(style);
}

// Initialize CSS variables when module loads
document.addEventListener('DOMContentLoaded', () => {
  generateRelationshipCSSVariables();
});

// ============================================================================
// ------------------- Global Variables -------------------
// ============================================================================
let currentCharacter = null;
let userCharacters = [];
let allCharacters = [];
let relationships = [];

// Cache for performance optimization
let allRelationshipsCache = {
  data: null,
  timestamp: 0,
  cacheDuration: 5 * 60 * 1000 // 5 minutes
};

// Relationship types - using centralized config
const RELATIONSHIP_TYPES = RELATIONSHIP_CONFIG;

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================
function init() {
  setupEventListeners();
}

function setupEventListeners() {
  // Modal close button
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('relationship-close-modal')) {
      closeModal();
    }
  });

  // Modal backdrop click
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('relationship-modal')) {
      closeModal();
    }
  });

  // Escape key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });
  
  // Escape key to exit fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const webView = document.querySelector('.relationship-web-view');
      if (webView && webView.classList.contains('fullscreen')) {
        toggleFullscreen();
      }
    }
  });
}

// ============================================================================
// ------------------- Main Section Display -------------------
// ============================================================================
async function showRelationshipsSection() {
  console.log('💕 Showing Relationships Section');
  
  // Scroll to top when showing relationships section
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  console.log('🔍 Main content element:', mainContent);
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  console.log('🔍 Found sections:', sections.length);
  
  sections.forEach(section => {
    console.log('🔍 Hiding section:', section.id);
    section.style.display = 'none';
  });
  
  // Show the relationships section
  const relationshipsSection = document.getElementById('relationships-section');
  console.log('🔍 Relationships section element:', relationshipsSection);
  if (relationshipsSection) {
    relationshipsSection.style.display = 'block';
    console.log('✅ Relationships section displayed');
  } else {
    console.error('❌ Relationships section not found');
    return;
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'relationships-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Relationships';
  }
  
  try {
    // Check if user is authenticated
    console.log('🔐 Checking authentication...');
    const isAuthenticated = await checkAuthentication();
    console.log('🔐 Authentication result:', isAuthenticated);
    
    if (!isAuthenticated) {
      console.log('🔐 User not authenticated, showing guest message');
      showGuestMessage();
      return;
    }

    console.log('🔐 User authenticated, showing loading state');
    showLoadingState();
    console.log('🔐 Loading user characters...');
    await loadUserCharacters();
    
  } catch (error) {
    console.error('❌ Error showing relationships section:', error);
    showErrorState('Failed to load relationships section');
  }
}

async function checkAuthentication() {
  try {
    console.log('🔐 Fetching auth status...');
    const response = await fetch('/api/auth/status');
    console.log('🔐 Auth status response:', response.status, response.statusText);
    const data = await response.json();
    console.log('🔐 Auth status data:', data);
    return data.authenticated;
  } catch (error) {
    console.error('❌ Error checking authentication:', error);
    return false;
  }
}

function showGuestMessage() {
  console.log('👤 Showing guest message');
  hideAllStates();
  const guestMessage = document.getElementById('relationships-guest-message');
  console.log('👤 Guest message element:', guestMessage);
  if (guestMessage) {
    guestMessage.style.display = 'flex';
    console.log('👤 Guest message display set to flex');
  } else {
    console.error('❌ Guest message element not found!');
  }
}

function showLoadingState() {
  console.log('🔄 Showing loading state');
  hideAllStates();
  const loadingElement = document.getElementById('relationships-loading');
  console.log('🔄 Loading element:', loadingElement);
  if (loadingElement) {
    loadingElement.style.display = 'flex';
    
    // Add a progress indicator for better UX
    const progressText = loadingElement.querySelector('.loading-text');
    if (progressText) {
      progressText.textContent = 'Loading relationships...';
    }
    
    console.log('🔄 Loading state displayed');
  } else {
    console.error('❌ Loading element not found!');
  }
}

function showErrorState(message) {
  hideAllStates();
  const errorElement = document.getElementById('relationships-error');
  errorElement.querySelector('p').textContent = message;
  errorElement.style.display = 'flex';
}

function hideAllStates() {
  console.log('🚫 Hiding all states');
  const states = [
    'relationships-guest-message',
    'relationships-character-selection',
    'relationships-management',
    'relationships-loading',
    'relationships-error',
    'relationships-all-view'
  ];
  
  states.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      console.log(`🚫 Hiding ${id}`);
      element.style.display = 'none';
    } else {
      console.log(`🚫 Element ${id} not found`);
    }
  });
}

function hideAllStatesExceptAllView() {
  console.log('🚫 Hiding all states except all view');
  const states = [
    'relationships-guest-message',
    'relationships-character-selection',
    'relationships-management',
    'relationships-loading',
    'relationships-error'
  ];
  
  states.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      console.log(`🚫 Hiding ${id}`);
      element.style.display = 'none';
    } else {
      console.log(`🚫 Element ${id} not found`);
    }
  });
}

// ============================================================================
// ------------------- Character Management -------------------
// ============================================================================
async function loadUserCharacters() {
  try {
    console.log('👥 Loading user characters');
    
    const response = await fetch('/api/user/characters');
    console.log('📡 Response status:', response.status);
    console.log('📡 Response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Response error text:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('📦 Response data:', data);
    console.log('📦 Response data.data:', data.data);
    console.log('📦 Response data.characters:', data.characters);
    userCharacters = data.data || [];
    console.log('👥 User characters loaded:', userCharacters.length);
    
    if (userCharacters.length === 0) {
      showErrorState('No characters found. Create a character first.');
      return;
    }
    
    renderCharacterSelector();
    
  } catch (error) {
    console.error('❌ Error loading user characters:', error);
    showErrorState('Failed to load characters');
  }
}

function renderCharacterSelector() {
  console.log('🎭 Rendering character selector');
  console.log('🎭 User characters to render:', userCharacters.length);
  
  hideAllStates();
  const characterSelection = document.getElementById('relationships-character-selection');
  console.log('🎭 Character selection element:', characterSelection);
  characterSelection.style.display = 'block';
  console.log('🎭 Character selection display set to block');
  
  const characterGrid = document.getElementById('relationships-character-grid');
  console.log('🎭 Character grid element:', characterGrid);
  characterGrid.innerHTML = '';
  characterGrid.className = 'relationship-character-grid';
  
  userCharacters.forEach(character => {
    console.log('🎭 Creating card for character:', character.name);
    const characterCard = createCharacterCard(character);
    characterGrid.appendChild(characterCard);
  });
  
  console.log('🎭 Character selector rendered');
}

function createCharacterCard(character) {
  const card = document.createElement('div');
  card.className = 'relationship-character-card';
  card.onclick = () => selectCharacter(character);
  
  const avatarUrl = formatCharacterIconUrl(character.icon);
  const displayInfo = getCharacterDisplayInfo(character);
  
  // Add mod character indicator
  const modIndicator = character.isModCharacter ? '<div class="mod-character-badge">👑 Mod</div>' : '';
  
  card.innerHTML = `
    <div class="relationship-character-card-header">
      <img src="${avatarUrl}" alt="${character.name}" class="relationship-character-avatar" />
      <div class="relationship-character-info">
        <h3>${displayInfo.name}</h3>
        <p>${displayInfo.info}</p>
        <p>${displayInfo.village}</p>
        ${modIndicator}
      </div>
    </div>
    <div class="relationship-character-card-footer">
      <button class="manage-relationships-btn">
        Manage Relationships
      </button>
    </div>
  `;
  
  return card;
}

async function selectCharacter(character) {
  console.log('🎯 Selected character:', character.name);
  
  currentCharacter = character;
  
  // Update character information display
  const characterNameElement = document.getElementById('relationships-character-name');
  characterNameElement.textContent = character.name;
  
  // Add mod character indicator to the name if applicable
  if (character.isModCharacter) {
    characterNameElement.innerHTML = `${character.name} <span class="mod-character-badge">👑 Mod</span>`;
  }
  
  // Update character avatar
  const avatarElement = document.getElementById('relationships-character-avatar');
  avatarElement.src = formatCharacterIconUrl(character.icon);
  avatarElement.alt = `${character.name}'s Avatar`;
  
  // Update character details using utility function
  const displayInfo = getCharacterDisplayInfo(character);
  const raceJobElement = document.getElementById('relationships-character-race-job');
  const villageElement = document.getElementById('relationships-character-village');
  
  raceJobElement.textContent = displayInfo.info;
  villageElement.textContent = displayInfo.village;
  
  hideAllStates();
  document.getElementById('relationships-management').style.display = 'block';
  
  await loadCharacterRelationships(character._id);
}

// ============================================================================
// ------------------- Relationship Management -------------------
// ============================================================================
async function loadCharacterRelationships(characterId) {
  try {
    console.log('💕 Loading relationships for character:', characterId);
    
    // Load all characters if not already loaded
    if (allCharacters.length === 0) {
      console.log('👥 Loading all characters for relationship display');
      const response = await fetch('/api/characters');
      if (response.ok) {
        const data = await response.json();
        allCharacters = data.characters || [];
        console.log('👥 Loaded all characters:', allCharacters.length);
        console.log('👥 Sample characters:', allCharacters.slice(0, 3).map(c => ({ name: c.name, isModCharacter: c.isModCharacter })));
      }
    }
    
    const response = await fetch(`/api/relationships/character/${characterId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    relationships = data.relationships || [];
    
    renderRelationships();
    
  } catch (error) {
    console.error('❌ Error loading relationships:', error);
    showErrorState('Failed to load relationships');
  }
}

function renderRelationships() {
  const relationshipsList = document.getElementById('relationships-list');
  relationshipsList.innerHTML = '';
  
  if (relationships.length === 0) {
    relationshipsList.innerHTML = `
      <div class="empty-relationships">
        <i class="fas fa-heart-broken"></i>
        <h3>No Relationships Yet</h3>
        <p>Start building relationships by adding connections to other characters.</p>
        <button class="add-relationship-btn" onclick="relationshipsModule.showAddRelationshipModal()">
          <i class="fas fa-plus"></i>
          Add Your First Relationship
        </button>
      </div>
    `;
    return;
  }
  
  // Group all relationships by target character
  const groupedRelationships = {};
  
  relationships.forEach(relationship => {
    const targetId = typeof relationship.targetCharacterId === 'object' && relationship.targetCharacterId
      ? relationship.targetCharacterId._id 
      : relationship.targetCharacterId;
    
    if (!groupedRelationships[targetId]) {
      groupedRelationships[targetId] = {
        outgoing: [],
        incoming: []
      };
    }
    
    if (relationship.isIncoming) {
      groupedRelationships[targetId].incoming.push(relationship);
    } else {
      groupedRelationships[targetId].outgoing.push(relationship);
    }
  });
  
  let html = '';
  
  // Create unified cards for each character
  Object.entries(groupedRelationships).forEach(([targetId, characterRelationships]) => {
    const targetCharacter = findCharacterById(targetId);
    const characterName = targetCharacter ? targetCharacter.name : 'Unknown Character';
    const avatarUrl = targetCharacter ? formatCharacterIconUrl(targetCharacter.icon) : '/images/ankleicon.png';
    const village = targetCharacter ? (targetCharacter.currentVillage || targetCharacter.homeVillage || 'Unknown Village') : 'Unknown Village';
    const characterInfo = targetCharacter ? `${targetCharacter.race || 'Unknown'} • ${targetCharacter.job || 'Unknown'} • ${village}` : '';
    
    html += `
      <div class="relationship-group-card">
        <div class="relationship-group-header">
          <div class="relationship-target-info">
            <img src="${avatarUrl}" alt="${characterName}" class="relationship-target-avatar" />
            <div class="relationship-target-details">
              <div class="relationship-target-name">${characterName}</div>
              ${characterInfo ? `<div class="relationship-target-info-text">${characterInfo}</div>` : ''}
            </div>
          </div>
          <button class="add-relationship-to-character-btn" onclick="relationshipsModule.showAddRelationshipModal('${targetCharacter ? targetCharacter._id : ''}')">
            <i class="fas fa-plus"></i> Add Relationship
          </button>
        </div>
        <div class="relationship-group-content">
          ${renderCharacterRelationships(characterRelationships)}
        </div>

      </div>
    `;
  });
  
  relationshipsList.innerHTML = html;
}

function renderCharacterRelationships(characterRelationships) {
  let html = '';
  
  // Render outgoing relationships (your character's feelings)
  if (characterRelationships.outgoing.length > 0) {
    html += `
      <div class="relationship-direction-section outgoing">
        <div class="relationship-direction-header">
          <i class="fas fa-arrow-right"></i>
          <span>Your character feels:</span>
        </div>
        ${characterRelationships.outgoing.map(relationship => {
          const typesDisplay = createRelationshipTypeBadges(relationship.relationshipTypes || [relationship.relationshipType] || ['OTHER']);
          
          return `
            <div class="relationship-item">
              <div class="relationship-item-main">
                <div class="relationship-item-types">
                  ${typesDisplay}
                </div>
                ${relationship.isMutual ? '<div class="relationship-mutual"><i class="fas fa-sync-alt"></i> Mutual</div>' : ''}
              </div>
              <div class="relationship-item-actions">
                <button class="edit-relationship-btn" onclick="relationshipsModule.editRelationship('${relationship._id}')">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="delete-relationship-btn" onclick="relationshipsModule.deleteRelationship('${relationship._id}')">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          `;
        }).join('')}
        ${(() => {
          const relationshipsWithNotes = characterRelationships.outgoing.filter(rel => rel.notes && rel.notes.trim());
          if (relationshipsWithNotes.length === 0) return '';
          
          return `
            <div class="relationship-notes">
              ${relationshipsWithNotes.map(relationship => `<div class="relationship-note-item"><p class="relationship-note">${relationship.notes}</p></div>`).join('')}
            </div>
          `;
        })()}
      </div>
    `;
  }
  
  // Render incoming relationships (other character's feelings)
  if (characterRelationships.incoming.length > 0) {
    html += `
      <div class="relationship-direction-section incoming">
        <div class="relationship-direction-header">
          <i class="fas fa-arrow-left"></i>
          <span>${characterRelationships.incoming[0].originalCharacterName || 'Unknown'} feels:</span>
        </div>
        ${characterRelationships.incoming.map(relationship => {
          const typesDisplay = createRelationshipTypeBadges(relationship.relationshipTypes || [relationship.relationshipType] || ['OTHER']);
          
          // Check if this relationship belongs to the current user
          const isOwnedByUser = relationship.originalCharacterId && userCharacters.some(c => c._id === relationship.originalCharacterId);
          
          return `
            <div class="relationship-item">
              <div class="relationship-item-main">
                <div class="relationship-item-types">
                  ${typesDisplay}
                </div>
                ${relationship.isMutual ? '<div class="relationship-mutual"><i class="fas fa-sync-alt"></i> Mutual</div>' : ''}
              </div>
              ${isOwnedByUser ? `
                <div class="relationship-item-actions">
                  <button class="edit-relationship-btn" onclick="relationshipsModule.editRelationship('${relationship._id}')">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="delete-relationship-btn" onclick="relationshipsModule.deleteRelationship('${relationship._id}')">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              ` : `
                <div class="relationship-item-actions">
                  <span class="relationship-readonly-indicator">
                    <i class="fas fa-eye"></i> Read-only
                  </span>
                </div>
              `}
            </div>
          `;
        }).join('')}
        ${(() => {
          const relationshipsWithNotes = characterRelationships.incoming.filter(rel => rel.notes && rel.notes.trim());
          if (relationshipsWithNotes.length === 0) return '';
          
          return `
            <div class="relationship-notes">
              ${relationshipsWithNotes.map(relationship => `<div class="relationship-note-item"><p class="relationship-note">${relationship.notes}</p></div>`).join('')}
            </div>
          `;
        })()}
      </div>
    `;
  }
  
  return html;
}



function createRelationshipCard(relationship) {
  console.log('🎭 Creating relationship card for:', relationship);
  console.log('🎭 Target character ID:', relationship.targetCharacterId);
  
  const card = document.createElement('div');
  card.className = 'relationship-card';
  
  const targetCharacter = findCharacterById(relationship.targetCharacterId);
  
  console.log('🎭 Target character found:', targetCharacter);
  
  const avatarUrl = targetCharacter ? formatCharacterIconUrl(targetCharacter.icon) : '/images/ankleicon.png';
  const displayInfo = getCharacterDisplayInfo(targetCharacter);
  
  // Create relationship types display using utility function
  const typesDisplay = createRelationshipTypeBadges(relationship.relationshipTypes || [relationship.relationshipType] || ['OTHER']);
  
  card.innerHTML = `
    <div class="relationship-header">
      <div class="relationship-types">
        ${typesDisplay}
      </div>
      <div class="relationship-actions">
        <button class="relationship-action-btn edit" onclick="relationshipsModule.editRelationship('${relationship._id}')" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="relationship-action-btn delete" onclick="relationshipsModule.deleteRelationship('${relationship._id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
    <div class="relationship-target-info">
      <img src="${avatarUrl}" alt="${displayInfo.name}" class="relationship-target-avatar" />
      <div class="relationship-target-details">
        <div class="relationship-target-name">${displayInfo.name}</div>
        ${displayInfo.info ? `<div class="relationship-target-info-text">${displayInfo.info}</div>` : ''}
      </div>
    </div>
    ${relationship.notes ? `<div class="relationship-notes">${relationship.notes}</div>` : ''}
    ${relationship.isMutual ? '<div class="relationship-mutual"><i class="fas fa-sync-alt"></i> Mutual Relationship</div>' : ''}
  `;
  
  return card;
}

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

/**
 * Enhanced character finding utility with robust ID handling
 * @param {string|object} characterId - Character ID or character object
 * @param {Array} characterArrays - Arrays to search in (defaults to [userCharacters, allCharacters])
 * @returns {object|null} Found character or null
 */
function findCharacterById(characterId, characterArrays = [userCharacters, allCharacters]) {
  if (!characterId) return null;
  
  // Handle case where characterId is actually a full character object
  if (typeof characterId === 'object' && characterId._id) {
    return characterId;
  }
  
  // Normalize ID to string
  const normalizedId = typeof characterId === 'string' ? characterId : characterId.toString();
  
  // Search in all provided arrays
  for (const characterArray of characterArrays) {
    if (!Array.isArray(characterArray)) continue;
    
    const character = characterArray.find(c => c._id === normalizedId);
    if (character) {
      return character;
    }
  }
  return null;
}

/**
 * Get character display information consistently
 * @param {object} character - Character object
 * @returns {object} Formatted character info
 */
function getCharacterDisplayInfo(character) {
  if (!character) return { name: 'Unknown Character', info: '', village: 'Unknown Village' };
  
  const race = character.race || 'Unknown';
  const job = character.job || 'Unknown';
  const village = character.currentVillage || character.homeVillage || 'Unknown Village';
  
  // Handle mod characters
  let displayName = character.name;
  let displayInfo = `${race.charAt(0).toUpperCase() + race.slice(1)} • ${job.charAt(0).toUpperCase() + job.slice(1)}`;
  
  if (character.isModCharacter) {
    const modTitle = character.modTitle || 'Mod';
    const modType = character.modType || '';
    displayName = `${character.name} (${modTitle})`;
    displayInfo = `${race.charAt(0).toUpperCase() + race.slice(1)} • ${job.charAt(0).toUpperCase() + job.slice(1)} • ${modType}`;
  }
  
  return {
    name: displayName,
    info: displayInfo,
    village: village.charAt(0).toUpperCase() + village.slice(1)
  };
}

/**
 * Format character icon URL consistently
 * @param {string} icon - Icon path or URL
 * @returns {string} Formatted icon URL
 */
function formatCharacterIconUrl(icon) {
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

/**
 * Get relationship type information consistently
 * @param {string|Array} types - Relationship type(s)
 * @returns {object} Formatted relationship type info
 */
function getRelationshipTypeInfo(types) {
  const typeArray = Array.isArray(types) ? types : [types];
  const validTypes = typeArray.filter(type => RELATIONSHIP_CONFIG[type]);
  
  if (validTypes.length === 0) {
    return {
      display: `${RELATIONSHIP_CONFIG.OTHER.emoji} ${RELATIONSHIP_CONFIG.OTHER.label}`,
      colors: [RELATIONSHIP_CONFIG.OTHER.color],
      types: ['OTHER']
    };
  }
  
  return {
    display: validTypes.map(type => `${RELATIONSHIP_CONFIG[type].emoji} ${RELATIONSHIP_CONFIG[type].label}`).join(', '),
    colors: validTypes.map(type => RELATIONSHIP_CONFIG[type].color),
    types: validTypes
  };
}

/**
 * Create relationship type badges HTML
 * @param {string|Array} types - Relationship type(s)
 * @returns {string} HTML for relationship type badges
 */
function createRelationshipTypeBadges(types) {
  const typeInfo = getRelationshipTypeInfo(types);
  return typeInfo.types.map(type => {
    const config = RELATIONSHIP_CONFIG[type];
    return `<span class="relationship-type-badge ${type.toLowerCase()}">${config.emoji} ${config.label}</span>`;
  }).join('');
}

function backToCharacterSelection() {
  console.log('⬅️ Going back to character selection');
  currentCharacter = null;
  relationships = [];
  renderCharacterSelector();
}

// ============================================================================
// ------------------- All Relationships View -------------------
// ============================================================================
async function showAllRelationships() {
  hideAllStates();
  document.getElementById('relationships-all-view').style.display = 'block';
  await loadAllRelationships();
}

async function loadAllRelationships() {
  try {
    showLoadingState();
    
    console.log('🔄 Loading all relationships...');
    const startTime = performance.now();
    
    // Check if we have valid cached data
    const now = Date.now();
    if (allRelationshipsCache.data && (now - allRelationshipsCache.timestamp) < allRelationshipsCache.cacheDuration) {
      console.log('📦 Using cached data');
      const data = allRelationshipsCache.data;
      
      relationships = data.relationships || [];
      allCharacters = data.characters || [];
      
      // Hide loading and show the all relationships view
      hideAllStates();
      document.getElementById('relationships-all-view').style.display = 'block';
      
      // Use requestAnimationFrame to ensure smooth rendering
      requestAnimationFrame(() => {
        const renderStartTime = performance.now();
        renderAllRelationships();
        const renderTime = performance.now() - renderStartTime;
        console.log(`✅ Rendering completed in ${renderTime.toFixed(2)}ms (from cache)`);
      });
      return;
    }
    
    // Fetch all relationships from the server
    const response = await fetch('/api/relationships/all', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Cache the data
    allRelationshipsCache.data = data;
    allRelationshipsCache.timestamp = now;
    
    const loadTime = performance.now() - startTime;
    console.log(`✅ Data loaded in ${loadTime.toFixed(2)}ms:`, {
      characters: data.characters?.length || 0,
      relationships: data.relationships?.length || 0
    });
    
    relationships = data.relationships || [];
    allCharacters = data.characters || [];
    
    // Hide loading and show the all relationships view
    hideAllStates();
    document.getElementById('relationships-all-view').style.display = 'block';
    
    // Use requestAnimationFrame to ensure smooth rendering
    requestAnimationFrame(() => {
      const renderStartTime = performance.now();
      renderAllRelationships();
      const renderTime = performance.now() - renderStartTime;
      console.log(`✅ Rendering completed in ${renderTime.toFixed(2)}ms`);
    });
    
  } catch (error) {
    console.error('❌ Error loading all relationships:', error);
    showErrorState('Failed to load all relationships');
  }
}

function renderAllRelationships() {
  const container = document.getElementById('relationships-all-list');
  if (!container) {
    console.error('❌ Container not found for all relationships');
    return;
  }

  console.log('🎭 Rendering all relationships for', allCharacters.length, 'characters and', relationships.length, 'relationships');

  // Pre-process relationships for better performance
  const relationshipsByCharacter = new Map();
  
  // Use a more efficient approach to group relationships
  relationships.forEach(relationship => {
    // Handle both populated character objects and character IDs
    const characterId = relationship.characterId?._id || relationship.characterId;
    const targetCharacterId = relationship.targetCharacterId?._id || relationship.targetCharacterId;
    
    // Count relationships where this character is either the initiator or the target
    if (characterId) {
      if (!relationshipsByCharacter.has(characterId)) {
        relationshipsByCharacter.set(characterId, []);
      }
      relationshipsByCharacter.get(characterId).push(relationship);
    }
    
    if (targetCharacterId) {
      if (!relationshipsByCharacter.has(targetCharacterId)) {
        relationshipsByCharacter.set(targetCharacterId, []);
      }
      relationshipsByCharacter.get(targetCharacterId).push(relationship);
    }
  });

  // Use DocumentFragment for better performance when adding many elements
  const fragment = document.createDocumentFragment();
  
  // Create character cards for ALL characters
  allCharacters.forEach(character => {
    const characterId = character._id;
    const characterRelationships = relationshipsByCharacter.get(characterId) || [];
    const hasRelationships = characterRelationships.length > 0;

    const displayInfo = getCharacterDisplayInfo(character);
    
    // Add mod character indicator
    const modIndicator = character.isModCharacter ? '<div class="mod-character-badge">👑 Mod</div>' : '';
    
    const characterCard = document.createElement('div');
    characterCard.className = `all-relationships-character-card ${hasRelationships ? 'has-relationships' : 'no-relationships'}`;
    characterCard.onclick = () => relationshipsModule.showCharacterRelationshipsModal(characterId);
    
    characterCard.innerHTML = `
      <div class="all-relationships-character-info">
        <img src="${formatCharacterIconUrl(character.icon)}" alt="${character.name}" class="all-relationships-character-avatar">
        <div class="all-relationships-character-details">
          <div class="all-relationships-character-name">${character.name}</div>
          <div class="all-relationships-character-info-text">
            ${displayInfo.info} • ${displayInfo.village}
          </div>
          ${modIndicator}
        </div>
      </div>
      <div class="all-relationships-character-stats">  
      </div>
    `;
    
    fragment.appendChild(characterCard);
  });

  // Clear container and append all cards at once
  container.innerHTML = '';
  container.appendChild(fragment);
  
  console.log('✅ All relationships rendered successfully');
}

// ============================================================================
// ------------------- Character Relationships Modal -------------------
// ============================================================================
function showCharacterRelationshipsModal(characterId) {
  // Find the character
  const character = findCharacterById(characterId);
  if (!character) {
    console.error('❌ Character not found for modal:', characterId);
    return;
  }
  
  // Find all relationships for this character
  const characterRelationships = relationships.filter(rel => {
    const relCharacterId = rel.characterId?._id || rel.characterId;
    const targetId = rel.targetCharacterId?._id || rel.targetCharacterId;
    // Only include relationships with valid IDs
    return relCharacterId && targetId && (relCharacterId === characterId || targetId === characterId);
  });
  
  // Separate outgoing and incoming relationships
  const outgoingRelationships = characterRelationships.filter(rel => {
    const relCharacterId = rel.characterId?._id || rel.characterId;
    return relCharacterId && relCharacterId === characterId;
  });
  
  const incomingRelationships = characterRelationships.filter(rel => {
    const targetId = rel.targetCharacterId?._id || rel.targetCharacterId;
    return targetId && targetId === characterId;
  });
  
  // Group relationships by target character
  const groupedRelationships = {};
  
  // Process outgoing relationships
  outgoingRelationships.forEach(relationship => {
    const targetId = typeof relationship.targetCharacterId === 'object' && relationship.targetCharacterId
      ? relationship.targetCharacterId._id 
      : relationship.targetCharacterId;
    
    if (!groupedRelationships[targetId]) {
      groupedRelationships[targetId] = {
        outgoing: [],
        incoming: []
      };
    }
    groupedRelationships[targetId].outgoing.push(relationship);
  });
  
  // Process incoming relationships
  incomingRelationships.forEach(relationship => {
    const sourceId = typeof relationship.characterId === 'object' && relationship.characterId
      ? relationship.characterId._id 
      : relationship.characterId;
    
    if (!groupedRelationships[sourceId]) {
      groupedRelationships[sourceId] = {
        outgoing: [],
        incoming: []
      };
    }
    groupedRelationships[sourceId].incoming.push(relationship);
  });
  
  // Create modal if it doesn't exist
  if (!document.getElementById('character-relationships-modal')) {
    createCharacterRelationshipsModal();
  }
  
  const modal = document.getElementById('character-relationships-modal');
  const modalContent = modal.querySelector('.character-relationships-modal-content');
  
  // Populate modal content
  const displayInfo = getCharacterDisplayInfo(character);
  const modIndicator = character.isModCharacter ? '<div class="mod-character-badge">👑 Mod</div>' : '';
  
  // Count unique character relationships (not individual relationship entries)
  const totalRelationships = Object.keys(groupedRelationships).length;
  
  modalContent.innerHTML = `
    <div class="character-relationships-modal-header">
      <div class="character-relationships-modal-character-info">
        <img src="${formatCharacterIconUrl(character.icon)}" alt="${character.name}" class="character-relationships-modal-avatar">
        <div class="character-relationships-modal-character-details">
          <h3><i class="fas fa-heart"></i> ${character.name}</h3>
          <p>${displayInfo.info} • ${displayInfo.village}</p>
          ${modIndicator}
        </div>
      </div>
      <button class="character-relationships-close-modal">&times;</button>
    </div>
    
    <div class="character-relationships-modal-body">
      ${totalRelationships === 0 ? `
        <div class="empty-relationships">
          <i class="fas fa-heart-broken"></i>
          <h3>No Relationships</h3>
          <p>${character.name} doesn't have any relationships recorded yet.</p>
        </div>
      ` : `
        <div class="character-relationships-header">
          <h4><i class="fas fa-users"></i> Relationships (${totalRelationships})</h4>
        </div>
        <div class="character-relationships-list">
          ${Object.entries(groupedRelationships).map(([otherCharacterId, characterRelationships]) => {
            const otherCharacter = findCharacterById(otherCharacterId);
            if (!otherCharacter) return '';
            
            const otherDisplayInfo = getCharacterDisplayInfo(otherCharacter);
            const otherModIndicator = otherCharacter.isModCharacter ? '<div class="mod-character-badge">👑 Mod</div>' : '';
            
            return `
              <div class="character-relationship-item">
                <div class="character-relationship-target">
                  <img src="${formatCharacterIconUrl(otherCharacter.icon)}" alt="${otherCharacter.name}" class="character-relationship-target-avatar">
                  <div class="character-relationship-target-info">
                    <div class="character-relationship-target-name">
                      <i class="fas fa-user"></i> ${otherCharacter.name}
                    </div>
                    <div class="character-relationship-target-details">
                      ${otherDisplayInfo.info} • ${otherDisplayInfo.village}
                    </div>
                    ${otherModIndicator}
                  </div>
                </div>
                <div class="character-relationship-details">
                  ${renderModalCharacterRelationships(characterRelationships, character.name)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
  
  // Show modal
  modal.classList.add('active');
  
  // Setup close button
  const closeBtn = modal.querySelector('.character-relationships-close-modal');
  closeBtn.onclick = () => {
    modal.classList.remove('active');
  };
  
  // Close on backdrop click
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  };
}

function renderModalCharacterRelationships(characterRelationships, characterName) {
  let html = '';
  
  // Render outgoing relationships (this character's feelings)
  if (characterRelationships.outgoing.length > 0) {
    html += `
      <div class="modal-relationship-direction-section outgoing">
        <div class="modal-relationship-direction-header">
          <i class="fas fa-arrow-right"></i>
          <span>${characterName} feels:</span>
        </div>
        ${characterRelationships.outgoing.map(relationship => {
          const typesDisplay = createRelationshipTypeBadges(relationship.relationshipTypes || [relationship.relationshipType] || ['OTHER']);
          
          return `
            <div class="modal-relationship-item">
              <div class="modal-relationship-types">
                ${typesDisplay}
              </div>
              ${relationship.isMutual ? '<div class="modal-relationship-mutual"><i class="fas fa-sync-alt"></i> Mutual</div>' : ''}
            </div>
          `;
        }).join('')}
        ${(() => {
          const relationshipsWithNotes = characterRelationships.outgoing.filter(rel => rel.notes && rel.notes.trim());
          if (relationshipsWithNotes.length === 0) return '';
          
          return `
            <div class="modal-relationship-notes">
              ${relationshipsWithNotes.map(relationship => `<p class="modal-relationship-note">${relationship.notes}</p>`).join('')}
            </div>
          `;
        })()}
      </div>
    `;
  }
  
  // Render incoming relationships (other character's feelings)
  if (characterRelationships.incoming.length > 0) {
    const otherCharacterName = characterRelationships.incoming[0].characterName || 'Unknown';
    
    html += `
      <div class="modal-relationship-direction-section incoming">
        <div class="modal-relationship-direction-header">
          <i class="fas fa-arrow-left"></i>
          <span>${otherCharacterName} feels:</span>
        </div>
        ${characterRelationships.incoming.map(relationship => {
          const typesDisplay = createRelationshipTypeBadges(relationship.relationshipTypes || [relationship.relationshipType] || ['OTHER']);
          
          return `
            <div class="modal-relationship-item">
              <div class="modal-relationship-types">
                ${typesDisplay}
              </div>
              ${relationship.isMutual ? '<div class="modal-relationship-mutual"><i class="fas fa-sync-alt"></i> Mutual</div>' : ''}
            </div>
          `;
        }).join('')}
        ${(() => {
          const relationshipsWithNotes = characterRelationships.incoming.filter(rel => rel.notes && rel.notes.trim());
          if (relationshipsWithNotes.length === 0) return '';
          
          return `
            <div class="modal-relationship-notes">
              ${relationshipsWithNotes.map(relationship => `<p class="modal-relationship-note">${relationship.notes}</p>`).join('')}
            </div>
          `;
        })()}
      </div>
    `;
  }
  
  return html;
}

function createCharacterRelationshipsModal() {
  const modal = document.createElement('div');
  modal.id = 'character-relationships-modal';
  modal.className = 'character-relationships-modal';
  
  modal.innerHTML = `
    <div class="character-relationships-modal-content">
      <!-- Content will be populated dynamically -->
    </div>
  `;
  
  document.body.appendChild(modal);
}

// ============================================================================
// ------------------- Modal Management -------------------
// ============================================================================

/**
 * Create a modal with consistent styling and behavior
 * @param {string} id - Modal ID
 * @param {string} title - Modal title
 * @param {string} content - Modal content HTML
 * @returns {HTMLElement} Created modal element
 */
function createModal(id, title, content) {
  // Remove existing modal if it exists
  const existingModal = document.getElementById(id);
  if (existingModal) {
    existingModal.remove();
  }
  
  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'relationship-modal';
  
  modal.innerHTML = `
    <div class="relationship-modal-content">
      <div class="relationship-modal-header">
        <h3>${title}</h3>
        <button class="relationship-close-modal">&times;</button>
      </div>
      ${content}
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Setup close functionality
  const closeBtn = modal.querySelector('.relationship-close-modal');
  closeBtn.onclick = () => closeModal();
  
  // Close on backdrop click
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
  
  return modal;
}

/**
 * Show modal with fade-in animation
 * @param {string} id - Modal ID
 */
function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * Close modal with fade-out animation
 * @param {string} id - Modal ID (optional, defaults to relationship-modal)
 */
function closeModal(id = 'relationship-modal') {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
  }
}
function showAddRelationshipModal(preSelectedTargetId = null) {
  console.log('➕ Showing add relationship modal');
  
  // Create modal if it doesn't exist
  if (!document.getElementById('relationship-modal')) {
    createRelationshipModal();
  }
  
  showModal('relationship-modal');
  
  // Reset form
  const form = document.querySelector('#relationship-modal .relationship-form');
  if (form) {
    form.reset();
    resetRelationshipTypeOptions();
    
    // Clear edit mode data attributes to ensure fresh state
    delete form.dataset.editMode;
    delete form.dataset.relationshipId;
    delete form.dataset.characterName;
    delete form.dataset.targetCharacterName;
    delete form.dataset.submitting;
    
    // Reset modal title to "Add Relationship"
    const modalTitle = document.querySelector('#relationship-modal .relationship-modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = 'Add Relationship';
    }
  }
  
  // Load available characters for dropdown
  loadAvailableCharacters(preSelectedTargetId);
}

function createRelationshipModal() {
  const modal = document.createElement('div');
  modal.id = 'relationship-modal';
  modal.className = 'relationship-modal';
  
  modal.innerHTML = `
    <div class="relationship-modal-content">
      <div class="relationship-modal-header">
        <h3>Add Relationship</h3>
        <button class="relationship-close-modal">&times;</button>
      </div>
      <form class="relationship-form" onsubmit="relationshipsModule.saveRelationship(event)">
        <div class="relationship-form-group">
          <label for="target-character">Target Character</label>
          <select id="target-character" name="targetCharacterId" required>
            <option value="">Select a character...</option>
          </select>
        </div>
        
        <div class="relationship-form-group">
          <label>Relationship Types</label>
          <div class="relationship-type-options">
            ${Object.entries(RELATIONSHIP_TYPES).map(([key, type]) => `
              <label class="relationship-type-option" role="checkbox" aria-checked="false">
                <input type="checkbox" name="relationshipTypes" value="${key}" aria-label="${type.label}">
                <span class="relationship-type-emoji" aria-hidden="true">${type.emoji}</span>
                <span>${type.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <div class="relationship-form-group">
          <label for="relationship-notes">Notes (Optional)</label>
          <textarea id="relationship-notes" name="notes" placeholder="Add any notes about this relationship..."></textarea>
        </div>
        
        <div class="form-actions">
          <button type="button" class="btn-cancel" onclick="relationshipsModule.closeModal()">Cancel</button>
          <button type="submit" class="btn-save">Save Relationship</button>
        </div>
      </form>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Setup relationship type selection
  setupRelationshipTypeSelection();
}

function setupRelationshipTypeSelection() {
  const options = document.querySelectorAll('.relationship-type-option');
  options.forEach(option => {
    // Click handler
    option.addEventListener('click', () => {
      toggleRelationshipTypeOption(option);
    });
    
    // Keyboard accessibility
    option.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleRelationshipTypeOption(option);
      }
    });
    
    // Make the option focusable
    option.setAttribute('tabindex', '0');
  });
}

function toggleRelationshipTypeOption(option) {
  const checkbox = option.querySelector('input[type="checkbox"]');
  checkbox.checked = !checkbox.checked;
  
  if (checkbox.checked) {
    option.classList.add('selected');
  } else {
    option.classList.remove('selected');
  }
}

function resetRelationshipTypeOptions() {
  const options = document.querySelectorAll('.relationship-type-option');
  options.forEach(option => {
    const checkbox = option.querySelector('input[type="checkbox"]');
    checkbox.checked = false;
    option.classList.remove('selected');
  });
}

async function loadAvailableCharacters(preSelectedTargetId = null) {
  try {
    // Load all characters if not already loaded
    if (allCharacters.length === 0) {
      const response = await fetch('/api/characters');
      if (response.ok) {
        const data = await response.json();
        allCharacters = data.characters || [];
      }
    }
    
    const select = document.getElementById('target-character');
    select.innerHTML = '<option value="">Select a character...</option>';
    
    // Filter out current character
    const availableCharacters = allCharacters.filter(char => 
      char._id !== currentCharacter._id
    );
    
    availableCharacters.forEach(character => {
      const option = document.createElement('option');
      option.value = character._id;
      
      // Create display text in format: Character name | Village
      const homeVillage = character.homeVillage || 'Unknown Village';
      // Capitalize first letter of village name
      const capitalizedVillage = homeVillage.charAt(0).toUpperCase() + homeVillage.slice(1).toLowerCase();
      let displayText = `${character.name} | ${capitalizedVillage}`;
      
      // Add mod indicator if it's a mod character
      if (character.isModCharacter) {
        const modTitle = character.modTitle || 'Mod';
        displayText = `${character.name} (${modTitle}) | ${capitalizedVillage}`;
      }
      
      option.textContent = displayText;
      select.appendChild(option);
    });
    
    // Pre-select target character if provided
    if (preSelectedTargetId) {
      select.value = preSelectedTargetId;
    }
    
  } catch (error) {
    console.error('❌ Error loading available characters:', error);
  }
}

async function saveRelationship(event) {
  event.preventDefault();
  
  const form = event.target;
  
  // Prevent double submissions
  if (form.dataset.submitting === 'true') {
    console.log('🔄 Form already submitting, ignoring duplicate submission');
    return;
  }
  
  form.dataset.submitting = 'true';
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';
  }
  
  const formData = new FormData(form);
  const isEditMode = form.dataset.editMode === 'true';
  const relationshipId = form.dataset.relationshipId;
  
  const relationshipTypes = formData.getAll('relationshipTypes');
  if (relationshipTypes.length === 0) {
    showNotification('Please select at least one relationship type', 'error');
    return;
  }
  
  // Get the target character name
  const targetCharacterId = formData.get('targetCharacterId');
  const targetCharacter = allCharacters.find(char => char._id === targetCharacterId);
  
  // Use stored names for editing, or get from characters for new relationships
  const characterName = isEditMode ? form.dataset.characterName : currentCharacter.name;
  const targetCharacterName = isEditMode ? form.dataset.targetCharacterName : (targetCharacter ? targetCharacter.name : 'Unknown Character');
  
  console.log('🔍 Character names for saving:', {
    isEditMode,
    characterName,
    targetCharacterName,
    storedCharacterName: form.dataset.characterName,
    storedTargetCharacterName: form.dataset.targetCharacterName
  });
  
  const relationshipData = {
    characterId: currentCharacter._id,
    targetCharacterId: targetCharacterId,
    characterName: characterName,
    targetCharacterName: targetCharacterName,
    relationshipType: relationshipTypes,
    notes: formData.get('notes')
  };
  
  try {
    console.log('💾 Saving relationship:', relationshipData);
    
    const url = isEditMode ? `/api/relationships/${relationshipId}` : '/api/relationships';
    const method = isEditMode ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(relationshipData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    console.log('✅ Relationship saved:', data);
    
    // Clear cache since relationships have changed
    allRelationshipsCache.data = null;
    allRelationshipsCache.timestamp = 0;
    
    closeModal();
    await loadCharacterRelationships(currentCharacter._id);
    
    // Show success message
    const message = isEditMode ? 'Relationship updated successfully!' : 'Relationship added successfully!';
    showNotification(message, 'success');
    
  } catch (error) {
    console.error('❌ Error saving relationship:', error);
    
    // Show specific error messages for common issues
    if (error.message.includes('Relationship already exists')) {
      showNotification('A relationship already exists between these characters. Please edit the existing relationship instead.', 'error');
    } else {
      showNotification(`Failed to save relationship: ${error.message}`, 'error');
    }
  } finally {
    // Reset form submission state
    form.dataset.submitting = 'false';
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Save Relationship';
    }
  }
}

async function editRelationship(relationshipId) {
  console.log('✏️ Editing relationship:', relationshipId);
  
  // Find the relationship to edit
  const relationship = relationships.find(r => r._id === relationshipId);
  if (!relationship) {
    console.error('❌ Relationship not found:', relationshipId);
    showNotification('Relationship not found', 'error');
    return;
  }
  
  // Show the add relationship modal with pre-filled data
  showAddRelationshipModal();
  
  // Wait for modal to be created
  setTimeout(() => {
    const modal = document.getElementById('relationship-modal');
    if (!modal) return;
    
    const form = modal.querySelector('.relationship-form');
    if (!form) return;
    
    // Pre-fill the form with existing data
    const targetSelect = form.querySelector('#target-character');
    const typeCheckboxes = form.querySelectorAll('input[name="relationshipTypes"]');
    const notesTextarea = form.querySelector('#relationship-notes');
    
    if (targetSelect) {
      targetSelect.value = typeof relationship.targetCharacterId === 'object' && relationship.targetCharacterId
        ? relationship.targetCharacterId._id 
        : relationship.targetCharacterId;
    }
    
    if (typeCheckboxes) {
      // First reset all checkboxes
      typeCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
        checkbox.closest('.relationship-type-option').classList.remove('selected');
      });
      
      // Then set the ones for this relationship
      typeCheckboxes.forEach(checkbox => {
        if (relationship.relationshipTypes && relationship.relationshipTypes.includes(checkbox.value)) {
          checkbox.checked = true;
          checkbox.closest('.relationship-type-option').classList.add('selected');
        }
      });
    }
    
    if (notesTextarea) {
      notesTextarea.value = relationship.notes || '';
    }
    
    // Update modal title
    const modalTitle = modal.querySelector('.relationship-modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = 'Edit Relationship';
    }
    
    // Update form to handle edit mode
    form.dataset.editMode = 'true';
    form.dataset.relationshipId = relationshipId;
    
    // Store character names for editing
    form.dataset.characterName = currentCharacter.name;
    
    // Get the target character name from the relationship data or find the character
    let targetCharacterName = relationship.targetCharacterName;
    if (!targetCharacterName) {
      const targetCharacter = findCharacterById(relationship.targetCharacterId);
      targetCharacterName = targetCharacter ? targetCharacter.name : 'Unknown Character';
    }
    form.dataset.targetCharacterName = targetCharacterName;
    
    console.log('🔍 Storing character names for editing:', {
      characterName: form.dataset.characterName,
      targetCharacterName: form.dataset.targetCharacterName,
      relationshipTargetCharacterName: relationship.targetCharacterName,
      relationshipTargetCharacterId: relationship.targetCharacterId
    });
    
  }, 100);
}

async function deleteRelationship(relationshipId) {
  if (!confirm('Are you sure you want to delete this relationship?')) {
    return;
  }
  
  try {
    console.log('🗑️ Deleting relationship:', relationshipId);
    
    const response = await fetch(`/api/relationships/${relationshipId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log('✅ Relationship deleted');
    
    // Clear cache since relationships have changed
    allRelationshipsCache.data = null;
    allRelationshipsCache.timestamp = 0;
    
    await loadCharacterRelationships(currentCharacter._id);
    
    // Show success message
    showNotification('Relationship deleted successfully!', 'success');
    
  } catch (error) {
    console.error('❌ Error deleting relationship:', error);
    showNotification('Failed to delete relationship', 'error');
  }
}



// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================



function loadCharacterImage(character) {
  const characterId = character._id || character.id;
  const iconUrl = formatCharacterIconUrl(character.icon);
  
  const img = new Image();
  img.onload = function() {
    characterImages.set(characterId, img);
  };
  img.onerror = function() {
    console.warn(`Failed to load character image for ${character.name}: ${iconUrl}`);
    // Don't cache failed images
  };
  img.src = iconUrl;
}



// ============================================================================
// ------------------- Module Initialization -------------------
// ============================================================================

/**
 * Enhanced error handling wrapper for async operations
 * @param {Function} asyncFn - Async function to wrap
 * @param {string} operationName - Name of the operation for error logging
 * @returns {Function} Wrapped function with error handling
 */
function withErrorHandling(asyncFn, operationName) {
  return async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      console.error(`❌ Error in ${operationName}:`, error);
      showNotification(`Failed to ${operationName.toLowerCase()}`, 'error');
      throw error;
    }
  };
}

// Wrap critical async functions with error handling
const loadUserCharactersWithErrorHandling = withErrorHandling(loadUserCharacters, 'load user characters');
const loadCharacterRelationshipsWithErrorHandling = withErrorHandling(loadCharacterRelationships, 'load character relationships');
const saveRelationshipWithErrorHandling = withErrorHandling(saveRelationship, 'save relationship');
const deleteRelationshipWithErrorHandling = withErrorHandling(deleteRelationship, 'delete relationship');

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initNotificationSystem();
  init();
});

// ============================================================================
// ------------------- Notification System -------------------
// ============================================================================

/**
 * Initialize notification system with styles
 */
function initNotificationSystem() {
  const notificationStyles = `
    .notification {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      border-radius: 0.5rem;
      color: white;
      font-weight: 600;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .notification.show {
      transform: translateX(0);
    }
    
    .notification-success {
      background: var(--success-color, #4CAF50);
    }
    
    .notification-error {
      background: var(--error-color, #f44336);
    }
    
    .notification-info {
      background: var(--primary-color, #2196F3);
    }
  `;

  // Inject notification styles if not already present
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = notificationStyles;
    document.head.appendChild(style);
  }
}

/**
 * Show notification with consistent styling
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, info)
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showNotification(message, type = 'info', duration = 3000) {
  // Initialize notification system if needed
  if (!document.getElementById('notification-styles')) {
    initNotificationSystem();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Show notification
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  // Remove after specified duration
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, duration);
}

// ============================================================================
// ------------------- Relationship Web Visualization -------------------
// ============================================================================

let relationshipWebCanvas = null;
let relationshipWebCtx = null;
let relationshipWebNodes = [];
let relationshipWebEdges = [];
let relationshipWebAnimationId = null;
let relationshipWebMouse = { x: 0, y: 0 };
let relationshipWebDraggedNode = null;
let relationshipWebIsDragging = false;
let relationshipWebLastMouseX = 0;
let relationshipWebLastMouseY = 0;
let relationshipWebZoom = 1;
let relationshipWebPanX = 0;
let relationshipWebPanY = 0;
let relationshipWebShowUserOnly = false; // Track if showing only user characters
let relationshipWebShowLines = true; // Track if showing relationship lines
let relationshipWebShowLabels = true; // Track if showing character names
let relationshipWebLayoutFrozen = false; // Track if layout is frozen
let relationshipWebAttractionEnabled = true; // Track if relationship attraction is enabled
let relationshipWebMenuCollapsed = false; // Track if menu is collapsed in fullscreen
let characterImages = new Map(); // Cache for character images

// Relationship colors extracted from centralized config
const RELATIONSHIP_COLORS = Object.fromEntries(
  Object.entries(RELATIONSHIP_CONFIG).map(([key, value]) => [key, value.color])
);

function showRelationshipWeb() {
  console.log('🕸️ Showing relationship web');
  
  // Hide the list view and show the web view
  document.getElementById('relationships-all-list').style.display = 'none';
  document.querySelector('.relationship-web-view').style.display = 'block';
  
  // Initialize the canvas
  initRelationshipWeb();
  
  // Generate the network data
  generateRelationshipWebData();
  
  // Start the animation
  animateRelationshipWeb();
}

function backToRelationshipList() {
  console.log('📋 Back to relationship list');
  
  // Stop the animation
  if (relationshipWebAnimationId) {
    cancelAnimationFrame(relationshipWebAnimationId);
    relationshipWebAnimationId = null;
  }
  
  // Exit fullscreen if active
  if (document.querySelector('.relationship-web-view').classList.contains('fullscreen')) {
    toggleFullscreen();
  }
  
  // Hide the web view and show the list view
  document.querySelector('.relationship-web-view').style.display = 'none';
  document.getElementById('relationships-all-list').style.display = 'grid';
}

function toggleFullscreen() {
  console.log('🖥️ Toggling fullscreen');
  
  const webView = document.querySelector('.relationship-web-view');
  const overlayBtn = document.querySelector('.fullscreen-btn-overlay');
  const headerBtn = document.querySelector('.fullscreen-btn');
  const canvas = document.getElementById('relationship-web-canvas');
  
  console.log('🔍 Elements found:', {
    webView: !!webView,
    overlayBtn: !!overlayBtn,
    headerBtn: !!headerBtn,
    canvas: !!canvas
  });
  
  if (!webView || !canvas) {
    console.error('❌ Required elements not found for fullscreen toggle');
    return;
  }
  
  if (webView.classList.contains('fullscreen')) {
    // Exit fullscreen
    webView.classList.remove('fullscreen');
    if (overlayBtn) {
      overlayBtn.classList.remove('fullscreen');
      overlayBtn.innerHTML = '<i class="fas fa-expand"></i> FULLSCREEN';
    }
    if (headerBtn) {
      headerBtn.innerHTML = '<i class="fas fa-expand"></i> FULLSCREEN';
    }
    
    // Reset canvas size
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    console.log('📱 Exited fullscreen');
  } else {
    // Enter fullscreen
    webView.classList.add('fullscreen');
    if (overlayBtn) {
      overlayBtn.classList.add('fullscreen');
      overlayBtn.innerHTML = '<i class="fas fa-compress"></i> EXIT FULLSCREEN';
    }
    if (headerBtn) {
      headerBtn.innerHTML = '<i class="fas fa-compress"></i> EXIT FULLSCREEN';
    }
    
    // Set canvas to full viewport size (accounting for legend space)
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    console.log('🖥️ Entered fullscreen');
    console.log('📏 Canvas dimensions:', {
      width: canvas.width,
      height: canvas.height,
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    });
  }
  
  // Restart animation to ensure proper rendering
  if (relationshipWebAnimationId) {
    cancelAnimationFrame(relationshipWebAnimationId);
  }
  animateRelationshipWeb();
}

function initRelationshipWeb() {
  const canvas = document.getElementById('relationship-web-canvas');
  if (!canvas) {
    console.error('❌ Relationship web canvas not found');
    return;
  }
  
  relationshipWebCanvas = canvas;
  relationshipWebCtx = canvas.getContext('2d');
  
  // Set canvas size
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  
  // Set up high-quality rendering
  relationshipWebCtx.imageSmoothingEnabled = true;
  relationshipWebCtx.imageSmoothingQuality = 'high';
  
  // Setup event listeners
  canvas.addEventListener('mousedown', handleRelationshipWebMouseDown);
  canvas.addEventListener('mousemove', handleRelationshipWebMouseMove);
  canvas.addEventListener('mouseup', handleRelationshipWebMouseUp);
  canvas.addEventListener('wheel', handleRelationshipWebWheel);
  
  // Setup window resize handler
  window.addEventListener('resize', handleRelationshipWebResize);
  
  // Setup toggle for isolated characters
  const isolatedToggle = document.getElementById('show-isolated-characters');
  if (isolatedToggle) {
    isolatedToggle.addEventListener('change', handleIsolatedToggleChange);
  }
}

function resetZoom() {
  console.log('🔍 Resetting zoom and pan');
  relationshipWebZoom = 1;
  relationshipWebPanX = 0;
  relationshipWebPanY = 0;
  
  // Reset all node positions to center
  const centerX = relationshipWebCanvas.width / 2;
  const centerY = relationshipWebCanvas.height / 2;
  
  relationshipWebNodes.forEach(node => {
    node.x = centerX + (Math.random() - 0.5) * 200;
    node.y = centerY + (Math.random() - 0.5) * 200;
    node.vx = 0;
    node.vy = 0;
  });
  
  showNotification('Zoom and view reset', 'info');
}

function centerView() {
  console.log('🎯 Centering view');
  
  // Calculate the center of all visible nodes
  const visibleNodes = relationshipWebNodes.filter(node => node.visible !== false);
  if (visibleNodes.length === 0) return;
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  visibleNodes.forEach(node => {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  });
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const canvasCenterX = relationshipWebCanvas.width / 2;
  const canvasCenterY = relationshipWebCanvas.height / 2;
  
  // Adjust pan to center the nodes
  relationshipWebPanX = canvasCenterX - centerX;
  relationshipWebPanY = canvasCenterY - centerY;
  
  showNotification('View centered on characters', 'info');
}

function toggleUserCharacters() {
  console.log('👤 Toggling user characters filter');
  relationshipWebShowUserOnly = !relationshipWebShowUserOnly;
  
  // Update button text
  const userBtn = document.querySelector('.web-control-btn[onclick*="toggleUserCharacters"]');
  if (userBtn) {
    const icon = userBtn.querySelector('i');
    const text = userBtn.textContent.trim();
    
    if (relationshipWebShowUserOnly) {
      icon.className = 'fas fa-users';
      userBtn.innerHTML = '<i class="fas fa-users"></i> All Characters';
      showNotification('Showing only your characters and their relationships', 'info');
    } else {
      icon.className = 'fas fa-user';
      userBtn.innerHTML = '<i class="fas fa-user"></i> My Characters';
      showNotification('Showing all characters', 'info');
    }
  }
  
  // Regenerate the web data with the new filter
  generateRelationshipWebData();
  
  // Reset view
  resetZoom();
}

function toggleRelationshipLines() {
  console.log('📊 Toggling relationship lines visibility');
  relationshipWebShowLines = !relationshipWebShowLines;
  
  // Update button text
  const linesBtn = document.querySelector('.web-control-btn[onclick*="toggleRelationshipLines"]');
  if (linesBtn) {
    if (relationshipWebShowLines) {
      linesBtn.innerHTML = '<i class="fas fa-project-diagram"></i> Hide Lines';
      showNotification('Relationship lines shown', 'info');
    } else {
      linesBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Show Lines';
      showNotification('Relationship lines hidden', 'info');
    }
  }
}

function toggleNodeLabels() {
  console.log('🏷️ Toggling node labels visibility');
  relationshipWebShowLabels = !relationshipWebShowLabels;
  
  // Update button text
  const labelsBtn = document.querySelector('.web-control-btn[onclick*="toggleNodeLabels"]');
  if (labelsBtn) {
    if (relationshipWebShowLabels) {
      labelsBtn.innerHTML = '<i class="fas fa-tag"></i> Hide Names';
      showNotification('Character names shown', 'info');
    } else {
      labelsBtn.innerHTML = '<i class="fas fa-eye"></i> Show Names';
      showNotification('Character names hidden', 'info');
    }
  }
}

function toggleLayoutFreeze() {
  console.log('🔒 Toggling layout freeze');
  relationshipWebLayoutFrozen = !relationshipWebLayoutFrozen;
  
  // Update button text
  const freezeBtn = document.querySelector('.web-control-btn[onclick*="toggleLayoutFreeze"]');
  if (freezeBtn) {
    if (relationshipWebLayoutFrozen) {
      freezeBtn.innerHTML = '<i class="fas fa-unlock"></i> Unfreeze Layout';
      showNotification('Layout frozen - drag characters to reposition', 'info');
    } else {
      freezeBtn.innerHTML = '<i class="fas fa-lock"></i> Freeze Layout';
      showNotification('Layout unfrozen - characters will auto-organize', 'info');
    }
  }
}

function spreadOutCharacters() {
  console.log('📐 Spreading out characters');
  
  // Calculate the center and available space
  const centerX = relationshipWebCanvas.width / 2;
  const centerY = relationshipWebCanvas.height / 2;
  
  // Calculate spread radius based on zoom level and screen size
  // When zoomed out, use more of the available space
  const baseRadius = Math.min(relationshipWebCanvas.width, relationshipWebCanvas.height) * 0.6; // Increased from 0.4
  const zoomFactor = Math.max(0.3, relationshipWebZoom); // Lowered minimum zoom factor from 0.5 to 0.3
  const spreadRadius = baseRadius * (1.5 / zoomFactor); // Increased multiplier from 1 to 1.5
  
  // Ensure we don't spread beyond the visible area
  const maxSpreadRadius = Math.min(relationshipWebCanvas.width, relationshipWebCanvas.height) * 0.65; // Increased from 0.45
  const finalRadius = Math.min(spreadRadius, maxSpreadRadius);
  
  console.log('📏 Spread calculation:', {
    baseRadius,
    zoomFactor,
    spreadRadius,
    maxSpreadRadius,
    finalRadius,
    canvasWidth: relationshipWebCanvas.width,
    canvasHeight: relationshipWebCanvas.height
  });
  
  // Spread characters in a larger circle pattern
  relationshipWebNodes.forEach((node, index) => {
    if (node.visible !== false) {
      const angle = (index / relationshipWebNodes.length) * 2 * Math.PI;
      const distance = finalRadius * (0.7 + Math.random() * 0.6); // More variation in distance
      
      // Set new position
      node.x = centerX + Math.cos(angle) * distance;
      node.y = centerY + Math.sin(angle) * distance;
      
      // Reset velocity
      node.vx = 0;
      node.vy = 0;
      node.recentlyDragged = false;
    }
  });
  
  showNotification('Characters spread out', 'info');
}

function toggleRelationshipAttraction() {
  console.log('🧲 Toggling relationship attraction');
  relationshipWebAttractionEnabled = !relationshipWebAttractionEnabled;
  
  // Update button text
  const attractionBtn = document.querySelector('.web-control-btn[onclick*="toggleRelationshipAttraction"]');
  if (attractionBtn) {
    if (relationshipWebAttractionEnabled) {
      attractionBtn.innerHTML = '<i class="fas fa-magnet"></i> Disable Attraction';
      showNotification('Relationship attraction enabled', 'info');
    } else {
      attractionBtn.innerHTML = '<i class="fas fa-unlink"></i> Enable Attraction';
      showNotification('Relationship attraction disabled', 'info');
    }
  }
}

function toggleMenu() {
  console.log('🍔 Toggling menu visibility');
  relationshipWebMenuCollapsed = !relationshipWebMenuCollapsed;
  
  const controls = document.getElementById('web-controls');
  const menuBtn = document.querySelector('.menu-toggle-btn');
  
  if (controls && menuBtn) {
    if (relationshipWebMenuCollapsed) {
      controls.classList.add('collapsed');
      menuBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
      showNotification('Menu collapsed - click to expand', 'info');
    } else {
      controls.classList.remove('collapsed');
      menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
      showNotification('Menu expanded', 'info');
    }
  }
}

function toggleLegend() {
  console.log('📋 Toggling legend visibility');
  const legendContent = document.getElementById('legend-content');
  const toggleBtn = document.querySelector('.legend-toggle-btn');
  
  if (legendContent && toggleBtn) {
    const isCollapsed = legendContent.classList.contains('collapsed');
    
    if (isCollapsed) {
      legendContent.classList.remove('collapsed');
      toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
      showNotification('Legend expanded', 'info');
    } else {
      legendContent.classList.add('collapsed');
      toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
      showNotification('Legend collapsed', 'info');
    }
  }
}

function handleRelationshipWebResize() {
  const webView = document.querySelector('.relationship-web-view');
  const canvas = document.getElementById('relationship-web-canvas');
  
  if (webView && webView.classList.contains('fullscreen')) {
    // Resize canvas for fullscreen using container dimensions
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  } else if (canvas) {
    // Resize canvas for normal view
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
}

function handleIsolatedToggleChange() {
  console.log('🔄 Toggling isolated characters visibility');
  
  const showIsolated = document.getElementById('show-isolated-characters').checked;
  
  // Update the nodes to show/hide isolated characters
  relationshipWebNodes.forEach(node => {
    if (!node.hasRelationships) {
      node.visible = showIsolated;
    }
  });
  
  // Restart animation to apply changes
  if (relationshipWebAnimationId) {
    cancelAnimationFrame(relationshipWebAnimationId);
  }
  animateRelationshipWeb();
}

function generateRelationshipWebData() {
  relationshipWebNodes = [];
  relationshipWebEdges = [];
  
  console.log('🕸️ Generating relationship web data...');
  const startTime = performance.now();
  
  // Determine which characters to show based on filter
  let charactersToShow = allCharacters;
  let relationshipsToShow = relationships;
  
  if (relationshipWebShowUserOnly) {
    // Get user's character IDs
    const userCharacterIds = new Set(userCharacters.map(char => char._id || char.id));
    
    // Filter characters to only show user's characters and those they have relationships with
    const relatedCharacterIds = new Set();
    
    // Add user's characters
    userCharacterIds.forEach(id => relatedCharacterIds.add(id));
    
    // Add characters that have relationships with user's characters
    relationships.forEach(relationship => {
      const sourceId = relationship.characterId?._id || relationship.characterId;
      const targetId = relationship.targetCharacterId?._id || relationship.targetCharacterId;
      
      // Only process relationships with valid IDs
      if (sourceId && targetId) {
        if (userCharacterIds.has(sourceId)) {
          relatedCharacterIds.add(targetId);
        }
        if (userCharacterIds.has(targetId)) {
          relatedCharacterIds.add(sourceId);
        }
      }
    });
    
    // Filter characters and relationships
    charactersToShow = allCharacters.filter(char => 
      relatedCharacterIds.has(char._id || char.id)
    );
    
    relationshipsToShow = relationships.filter(relationship => {
      const sourceId = relationship.characterId?._id || relationship.characterId;
      const targetId = relationship.targetCharacterId?._id || relationship.targetCharacterId;
      // Only include relationships that have valid IDs and involve user characters
      return sourceId && targetId && ((userCharacterIds.has(sourceId)) || (userCharacterIds.has(targetId)));
    });
  }
  
  // First pass: identify which characters have relationships (optimized with Set)
  const charactersWithRelationships = new Set();
  
  relationshipsToShow.forEach(relationship => {
    const sourceId = relationship.characterId?._id || relationship.characterId;
    const targetId = relationship.targetCharacterId?._id || relationship.targetCharacterId;
    
    if (sourceId) charactersWithRelationships.add(sourceId);
    if (targetId) charactersWithRelationships.add(targetId);
  });
  
  // Create nodes for the filtered characters (batch operation)
  const userCharacterIds = new Set(userCharacters.map(char => char._id || char.id));
  
  charactersToShow.forEach((character, index) => {
    const characterId = character._id || character.id;
    const hasRelationships = charactersWithRelationships.has(characterId);
    const isUserCharacter = userCharacterIds.has(characterId);
    
    // Calculate better initial positions - spread characters in a circle pattern
    const centerX = relationshipWebCanvas.width / 2;
    const centerY = relationshipWebCanvas.height / 2;
    const radius = Math.min(relationshipWebCanvas.width, relationshipWebCanvas.height) * 0.3;
    const angle = (index / charactersToShow.length) * 2 * Math.PI;
    const distanceVariation = 0.3; // Add some randomness to the distance
    
    const baseDistance = radius * (0.7 + Math.random() * distanceVariation);
    const x = centerX + Math.cos(angle) * baseDistance;
    const y = centerY + Math.sin(angle) * baseDistance;
    
    relationshipWebNodes.push({
      id: characterId,
      name: character.name,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      radius: 25,
      character: character,
      hasRelationships: hasRelationships,
      isUserCharacter: isUserCharacter,
      visible: true, // All nodes start visible
      recentlyDragged: false // Track if node was recently dragged
    });
    
    // Preload character image if not already cached
    if (character.icon && !characterImages.has(characterId)) {
      loadCharacterImage(character);
    }
  });
  
  const nodeGenerationTime = performance.now() - startTime;
  console.log(`✅ Nodes generated in ${nodeGenerationTime.toFixed(2)}ms:`, relationshipWebNodes.length, 'nodes');
  
  // Create edges for relationships (optimized)
  const relationshipMap = new Map(); // Track relationships between character pairs
  const nodeMap = new Map(); // Create a lookup map for nodes
  
  // Create node lookup map for faster access
  relationshipWebNodes.forEach(node => {
    nodeMap.set(node.id, node);
  });
  
  console.log('🔍 Processing relationships:', relationshipsToShow.length);
  const edgeStartTime = performance.now();
  
  relationshipsToShow.forEach(relationship => {
    const sourceId = relationship.characterId?._id || relationship.characterId;
    const targetId = relationship.targetCharacterId?._id || relationship.targetCharacterId;
    
    // Skip relationships with null IDs
    if (!sourceId || !targetId) {
      return;
    }
    
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);
    
    if (sourceNode && targetNode) {
      // Create a unique key for this character pair (sorted to ensure consistency)
      const pairKey = [sourceId, targetId].sort().join('_');
      
      if (!relationshipMap.has(pairKey)) {
        relationshipMap.set(pairKey, {
          source: sourceNode,
          target: targetNode,
          sourceToTarget: null,
          targetToSource: null
        });
      }
      
      const pair = relationshipMap.get(pairKey);
      
      // Determine which direction this relationship represents
      const sortedIds = [sourceId, targetId].sort();
      const isSourceToTarget = sourceId === sortedIds[0] && targetId === sortedIds[1];
      
      if (isSourceToTarget) {
        // This is source -> target relationship
        pair.sourceToTarget = {
          types: relationship.relationshipTypes || [relationship.relationshipType] || ['OTHER'],
          colors: (relationship.relationshipTypes || [relationship.relationshipType] || ['OTHER']).map(type => 
            RELATIONSHIP_COLORS[type] || RELATIONSHIP_COLORS.OTHER
          )
        };
      } else {
        // This is target -> source relationship
        pair.targetToSource = {
          types: relationship.relationshipTypes || [relationship.relationshipType] || ['OTHER'],
          colors: (relationship.relationshipTypes || [relationship.relationshipType] || ['OTHER']).map(type => 
            RELATIONSHIP_COLORS[type] || RELATIONSHIP_COLORS.OTHER
          )
        };
      }
    }
  });
  
  // Convert the relationship map to edges (batch operation)
  relationshipMap.forEach((pair, key) => {
    if (pair.sourceToTarget && pair.targetToSource) {
      // Bidirectional relationship - create two parallel lines
      relationshipWebEdges.push({
        source: pair.source,
        target: pair.target,
        bidirectional: true,
        sourceToTarget: pair.sourceToTarget,
        targetToSource: pair.targetToSource
      });
    } else if (pair.sourceToTarget) {
      // Unidirectional relationship - create single line from source to target
      relationshipWebEdges.push({
        source: pair.source,
        target: pair.target,
        bidirectional: false,
        direction: 'sourceToTarget',
        types: pair.sourceToTarget.types,
        colors: pair.sourceToTarget.colors
      });
    } else if (pair.targetToSource) {
      // Unidirectional relationship - create single line from target to source
      relationshipWebEdges.push({
        source: pair.target,
        target: pair.source,
        bidirectional: false,
        direction: 'targetToSource',
        types: pair.targetToSource.types,
        colors: pair.targetToSource.colors
      });
    }
  });
  
  const edgeGenerationTime = performance.now() - edgeStartTime;
  console.log(`✅ Edges generated in ${edgeGenerationTime.toFixed(2)}ms:`, relationshipWebEdges.length, 'edges');
  
  const totalGenerationTime = performance.now() - startTime;
  console.log(`✅ Total web data generation completed in ${totalGenerationTime.toFixed(2)}ms`);
}

function animateRelationshipWeb() {
  if (!relationshipWebCtx) return;
  
  // Clear canvas
  relationshipWebCtx.clearRect(0, 0, relationshipWebCanvas.width, relationshipWebCanvas.height);
  
  // Save context for transformations
  relationshipWebCtx.save();
  
  // Apply zoom and pan transformations
  relationshipWebCtx.translate(relationshipWebPanX, relationshipWebPanY);
  relationshipWebCtx.scale(relationshipWebZoom, relationshipWebZoom);
  
  // Apply forces
  applyRelationshipWebForces();
  
  // Draw edges (only if enabled)
  if (relationshipWebShowLines) {
    drawRelationshipWebEdges();
  }
  
  // Draw nodes
  drawRelationshipWebNodes();
  
  // Restore context
  relationshipWebCtx.restore();
  
  // Continue animation
  relationshipWebAnimationId = requestAnimationFrame(animateRelationshipWeb);
}

function applyRelationshipWebForces() {
  relationshipWebNodes.forEach(node => {
    // Only apply forces if node is not being dragged and layout is not frozen
    if (relationshipWebDraggedNode === node || relationshipWebLayoutFrozen) {
      // Reset velocity when dragging or frozen to prevent movement
      node.vx = 0;
      node.vy = 0;
      return;
    }
    
    // Repulsion between nodes (keep them from overlapping)
    relationshipWebNodes.forEach(otherNode => {
      if (node === otherNode) return;
      
      const dx = otherNode.x - node.x;
      const dy = otherNode.y - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0 && distance < 120) { // Increased repulsion distance
        const force = (120 - distance) / distance * 0.03; // Increased repulsion force
        node.vx -= (dx / distance) * force;
        node.vy -= (dy / distance) * force;
      }
    });
    
    // Attraction between connected nodes (only if enabled)
    if (relationshipWebAttractionEnabled) {
      relationshipWebEdges.forEach(edge => {
        if (edge.source === node) {
          const dx = edge.target.x - node.x;
          const dy = edge.target.y - node.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0 && distance < 80) { // Very small attraction distance
            const force = (distance - 60) / distance * 0.0005; // Very weak force
            node.vx += (dx / distance) * force;
            node.vy += (dy / distance) * force;
          }
        }
      });
    }
    
    // Center attraction for better organization (only if not recently dragged)
    if (!node.recentlyDragged) {
      const centerX = relationshipWebCanvas.width / 2;
      const centerY = relationshipWebCanvas.height / 2;
      const dx = centerX - node.x;
      const dy = centerY - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        const force = distance * 0.00002; // Further reduced center attraction
        node.vx += (dx / distance) * force;
        node.vy += (dy / distance) * force;
      }
    }
    
    // Light damping to prevent infinite movement
    node.vx *= 0.95;
    node.vy *= 0.95;
    
    // Update position
    node.x += node.vx;
    node.y += node.vy;
    
    // Keep nodes within bounds with some padding
    const padding = 50;
    node.x = Math.max(node.radius + padding, Math.min(relationshipWebCanvas.width - node.radius - padding, node.x));
    node.y = Math.max(node.radius + padding, Math.min(relationshipWebCanvas.height - node.radius - padding, node.y));
  });
}

function drawRelationshipWebEdges() {
  relationshipWebEdges.forEach(edge => {
    // Calculate line properties
    const dx = edge.target.x - edge.source.x;
    const dy = edge.target.y - edge.source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return; // Skip if nodes are at same position
    
    const lineAngle = Math.atan2(dy, dx);
    const perpendicularAngle = lineAngle + Math.PI / 2;
    
    if (edge.bidirectional) {
      // Bidirectional relationship - draw two separate lines with arrows
      const lineOffset = 3; // Increased distance between lines for better visibility
      
      // Draw source to target line (left) - arrow points TO the source (who is feeling it)
      const leftSourceX = edge.source.x - Math.cos(perpendicularAngle) * lineOffset;
      const leftSourceY = edge.source.y - Math.sin(perpendicularAngle) * lineOffset;
      const leftTargetX = edge.target.x - Math.cos(perpendicularAngle) * lineOffset;
      const leftTargetY = edge.target.y - Math.sin(perpendicularAngle) * lineOffset;
      
      drawRelationshipLine(leftSourceX, leftSourceY, leftTargetX, leftTargetY, edge.sourceToTarget.colors);

      
      // Draw target to source line (right) - arrow points toward the source
      const rightSourceX = edge.source.x + Math.cos(perpendicularAngle) * lineOffset;
      const rightSourceY = edge.source.y + Math.sin(perpendicularAngle) * lineOffset;
      const rightTargetX = edge.target.x + Math.cos(perpendicularAngle) * lineOffset;
      const rightTargetY = edge.target.y + Math.sin(perpendicularAngle) * lineOffset;
      
      drawRelationshipLine(rightSourceX, rightSourceY, rightTargetX, rightTargetY, edge.targetToSource.colors);

      
    } else {
      // Unidirectional relationship - draw single line
      drawRelationshipLine(edge.source.x, edge.source.y, edge.target.x, edge.target.y, edge.colors);
    }
  });
}

function drawRelationshipLine(startX, startY, endX, endY, colors) {
  relationshipWebCtx.beginPath();
  relationshipWebCtx.moveTo(startX, startY);
  relationshipWebCtx.lineTo(endX, endY);
  
  if (colors.length > 1) {
    // Draw gradient line for multiple relationship types
    const gradient = relationshipWebCtx.createLinearGradient(startX, startY, endX, endY);
    colors.forEach((color, index) => {
      const stop = index / (colors.length - 1);
      gradient.addColorStop(stop, color);
    });
    relationshipWebCtx.strokeStyle = gradient;
  } else {
    // Draw solid color line for single relationship type
    relationshipWebCtx.strokeStyle = colors[0];
  }
  
  relationshipWebCtx.lineWidth = 2;
  relationshipWebCtx.stroke();
}

function drawDirectionalArrow(x, y, angle, color) {
  const arrowLength = 12;
  const arrowAngle = Math.PI / 6; // 30 degrees for sharper arrows
  
  // Position arrow right at the edge of the target node
  const nodeRadius = 25; // Should match the node radius
  const arrowX = x - Math.cos(angle) * nodeRadius;
  const arrowY = y - Math.sin(angle) * nodeRadius;
  
  // Use the source color for arrows (first color in the array for gradients)
  const arrowColor = Array.isArray(color) ? color[0] : color;
  
  // Draw filled arrow head for better visibility
  relationshipWebCtx.beginPath();
  relationshipWebCtx.moveTo(arrowX, arrowY);
  relationshipWebCtx.lineTo(
    arrowX - Math.cos(angle - arrowAngle) * arrowLength,
    arrowY - Math.sin(angle - arrowAngle) * arrowLength
  );
  relationshipWebCtx.lineTo(
    arrowX - Math.cos(angle + arrowAngle) * arrowLength,
    arrowY - Math.sin(angle + arrowAngle) * arrowLength
  );
  relationshipWebCtx.closePath();
  
  // Fill the arrow head
  relationshipWebCtx.fillStyle = arrowColor;
  relationshipWebCtx.fill();
  
  // Add a subtle border for definition
  relationshipWebCtx.strokeStyle = arrowColor;
  relationshipWebCtx.lineWidth = 1;
  relationshipWebCtx.stroke();
}

function drawRelationshipWebNodes() {
  relationshipWebNodes.forEach(node => {
    // Skip nodes that are not visible (isolated characters when toggle is off)
    if (node.visible === false) {
      return;
    }
    
    const displayRadius = node.radius;
    
    // Draw node circle with enhanced styling
    relationshipWebCtx.beginPath();
    relationshipWebCtx.arc(node.x, node.y, displayRadius, 0, 2 * Math.PI);
    
    // Enhanced fill with gradient-like effect
    const gradient = relationshipWebCtx.createRadialGradient(
      node.x - 5, node.y - 5, 0,
      node.x, node.y, displayRadius
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(1, 'rgba(240, 240, 240, 0.9)');
    relationshipWebCtx.fillStyle = gradient;
    relationshipWebCtx.fill();
    
    // Border styling based on whether character has relationships and if it's a user character
    if (node.isUserCharacter) {
      // Blue border for user's characters
      relationshipWebCtx.strokeStyle = '#2196F3';
      relationshipWebCtx.lineWidth = 4;
    } else if (node.hasRelationships) {
      // Green border for characters with relationships
      relationshipWebCtx.strokeStyle = '#4CAF50';
      relationshipWebCtx.lineWidth = 3;
    } else {
      // Gray border for characters without relationships
      relationshipWebCtx.strokeStyle = '#9E9E9E';
      relationshipWebCtx.lineWidth = 2;
    }
    relationshipWebCtx.stroke();
    
    // Draw character icon if available
    if (node.character && node.character.icon) {
      const characterId = node.character._id || node.character.id;
      const cachedImage = characterImages.get(characterId);
      
      if (cachedImage) {
        const iconSize = displayRadius * 2.2; // Increased from 1.6 to 2.2
        const iconX = node.x - iconSize / 2;
        const iconY = node.y - iconSize / 2;
        
        // Create a circular clip for the icon
        relationshipWebCtx.save();
        relationshipWebCtx.beginPath();
        relationshipWebCtx.arc(node.x, node.y, displayRadius, 0, 2 * Math.PI);
        relationshipWebCtx.clip();
        
        // Draw the actual character image
        relationshipWebCtx.drawImage(cachedImage, iconX, iconY, iconSize, iconSize);
        
        relationshipWebCtx.restore();
      } else {
        // Draw a placeholder while image is loading
        const iconSize = displayRadius * 2.2; // Increased from 1.6 to 2.2
        const iconX = node.x - iconSize / 2;
        const iconY = node.y - iconSize / 2;
        
        // Create a circular clip for the icon
        relationshipWebCtx.save();
        relationshipWebCtx.beginPath();
        relationshipWebCtx.arc(node.x, node.y, displayRadius, 0, 2 * Math.PI);
        relationshipWebCtx.clip();
        
        // Draw a simple character silhouette as placeholder
        relationshipWebCtx.fillStyle = '#666';
        relationshipWebCtx.fillRect(iconX, iconY, iconSize, iconSize);
        
        relationshipWebCtx.fillStyle = '#333';
        relationshipWebCtx.beginPath();
        relationshipWebCtx.arc(node.x, node.y - 6, 8, 0, 2 * Math.PI);
        relationshipWebCtx.fill();
        relationshipWebCtx.beginPath();
        relationshipWebCtx.arc(node.x, node.y + 10, 12, 0, 2 * Math.PI);
        relationshipWebCtx.fill();
        
        relationshipWebCtx.restore();
      }
    }
    
    // Draw character name with improved styling
    relationshipWebCtx.font = 'bold 13px Arial, sans-serif';
    relationshipWebCtx.textAlign = 'center';
    relationshipWebCtx.textBaseline = 'middle';
    
    // Add text shadow for better readability
    relationshipWebCtx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    relationshipWebCtx.shadowBlur = 3;
    relationshipWebCtx.shadowOffsetX = 1;
    relationshipWebCtx.shadowOffsetY = 1;
    
    // Draw the name with different styling based on relationships
    if (node.hasRelationships) {
      relationshipWebCtx.fillStyle = '#FFFFFF';
    } else {
      relationshipWebCtx.fillStyle = '#BDBDBD'; // Gray for characters without relationships
    }
    
    // Only draw name if labels are enabled
    if (relationshipWebShowLabels) {
      relationshipWebCtx.fillText(node.name, node.x, node.y + displayRadius + 25);
    }
    
    // Reset effects
    relationshipWebCtx.shadowBlur = 0;
    relationshipWebCtx.shadowOffsetX = 0;
    relationshipWebCtx.shadowOffsetY = 0;
  });
}

function handleRelationshipWebMouseDown(event) {
  const rect = relationshipWebCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left - relationshipWebPanX) / relationshipWebZoom;
  const y = (event.clientY - rect.top - relationshipWebPanY) / relationshipWebZoom;
  
  // Check if clicking on a node
  relationshipWebDraggedNode = relationshipWebNodes.find(node => {
    const dx = x - node.x;
    const dy = y - node.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= node.radius + 10;
  });
  
  if (relationshipWebDraggedNode) {
    relationshipWebCanvas.style.cursor = 'grabbing';
  } else {
    // Start panning
    relationshipWebIsDragging = true;
    relationshipWebLastMouseX = event.clientX;
    relationshipWebLastMouseY = event.clientY;
    relationshipWebCanvas.style.cursor = 'grabbing';
  }
}

function handleRelationshipWebMouseMove(event) {
  if (relationshipWebDraggedNode) {
    const rect = relationshipWebCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - relationshipWebPanX) / relationshipWebZoom;
    const y = (event.clientY - rect.top - relationshipWebPanY) / relationshipWebZoom;
    
    relationshipWebDraggedNode.x = x;
    relationshipWebDraggedNode.y = y;
    relationshipWebDraggedNode.vx = 0;
    relationshipWebDraggedNode.vy = 0;
    relationshipWebDraggedNode.recentlyDragged = true; // Mark as recently dragged
    
    // Reset the recently dragged flag after a delay
    setTimeout(() => {
      if (relationshipWebDraggedNode) {
        relationshipWebDraggedNode.recentlyDragged = false;
      }
    }, 2000); // 2 seconds delay
  } else if (relationshipWebIsDragging) {
    // Handle panning
    const deltaX = event.clientX - relationshipWebLastMouseX;
    const deltaY = event.clientY - relationshipWebLastMouseY;
    
    relationshipWebPanX += deltaX;
    relationshipWebPanY += deltaY;
    
    relationshipWebLastMouseX = event.clientX;
    relationshipWebLastMouseY = event.clientY;
  }
}

function handleRelationshipWebMouseUp() {
  relationshipWebDraggedNode = null;
  relationshipWebIsDragging = false;
  relationshipWebCanvas.style.cursor = 'grab';
}

function handleRelationshipWebWheel(event) {
  event.preventDefault();
  
  // Zoom functionality
  const rect = relationshipWebCanvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  
  const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
  const newZoom = Math.max(0.5, Math.min(3, relationshipWebZoom * zoomFactor));
  
  // Zoom towards mouse position
  relationshipWebPanX = mouseX - (mouseX - relationshipWebPanX) * (newZoom / relationshipWebZoom);
  relationshipWebPanY = mouseY - (mouseY - relationshipWebPanY) * (newZoom / relationshipWebZoom);
  
  relationshipWebZoom = newZoom;
}

// Test function to check server and database
async function testServerAndDatabase() {
  console.log('🧪 Testing server and database...');
  
  try {
    // Test 1: Check if server is working
    console.log('🧪 Test 1: Checking if server is working...');
    const testResponse = await fetch('/api/test');
    if (testResponse.ok) {
      const testData = await testResponse.json();
      console.log('✅ Server is working:', testData);
    } else {
      console.error('❌ Server is not working');
      return;
    }
    
    // Test 2: Check character count
    console.log('🧪 Test 2: Checking character count...');
    const charResponse = await fetch('/api/test/characters');
    if (charResponse.ok) {
      const charData = await charResponse.json();
      console.log('✅ Character count:', charData);
      
      if (charData.totalCharacters === 0) {
        console.error('❌ No characters found in database');
        showErrorState('No characters found in database. Please create some characters first.');
        return;
      }
    } else {
      console.error('❌ Failed to get character count');
      return;
    }
    
    // Test 3: Try to load relationships
    console.log('🧪 Test 3: Testing relationships endpoint...');
    const relResponse = await fetch('/api/relationships/all');
    console.log('🧪 Relationships response status:', relResponse.status);
    
    if (relResponse.ok) {
      const relData = await relResponse.json();
      console.log('✅ Relationships endpoint working:', {
        characters: relData.characters?.length || 0,
        relationships: relData.relationships?.length || 0
      });
    } else {
      const errorText = await relResponse.text();
      console.error('❌ Relationships endpoint failed:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Add test function to global scope
window.testServerAndDatabase = testServerAndDatabase;
