// ============================================================================
// Character of Week JavaScript
// Handles loading and displaying the featured character of the week
// ============================================================================

import { capitalize } from './utils.js';

// ------------------- Global Variables -------------------
let characterOfWeekData = null;

// ------------------- Function: loadCharacterOfWeek -------------------
// Loads the current character of the week from the API
async function loadCharacterOfWeek() {
  const container = document.getElementById('character-of-week-content');
  if (!container) {
    console.error('[characterOfWeek.js]: Character of week content container not found');
    return;
  }

  // Show loading state
  showCharacterOfWeekLoading(container);

  try {
    const response = await fetch('/api/character-of-week');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.data) {
      showCharacterOfWeekNoData(container);
      return;
    }
    
    characterOfWeekData = result.data;
    
    // Display the character
    displayCharacterOfWeek(container, characterOfWeekData);
    
  } catch (error) {
    console.error('[characterOfWeek.js]: Error loading character of the week:', error);
    showCharacterOfWeekError(container, error);
  }
}

// ------------------- Function: displayCharacterOfWeek -------------------
// Displays the character of the week in the UI
function displayCharacterOfWeek(container, data) {
  const character = data.characterId;
  
  if (!character) {
    showCharacterOfWeekError(container, new Error('Character data is missing'));
    return;
  }

  // Format character icon URL
  const iconUrl = formatCharacterIconUrl(character.icon);
  
  // Calculate time remaining
  const endDate = new Date(data.endDate);
  const now = new Date();
  const timeRemaining = endDate - now;
  const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
  
  // Format the time remaining text
  let timeRemainingText = '';
  if (daysRemaining > 1) {
    timeRemainingText = `${daysRemaining} days left`;
  } else if (daysRemaining === 1) {
    timeRemainingText = '1 day left';
  } else if (daysRemaining === 0) {
    timeRemainingText = 'Less than 1 day left';
  } else {
    timeRemainingText = 'Expired';
  }
  

    
    // Determine character status
  let statusClass = '';
  let statusText = '';
  let statusIcon = '';
  
  if (character.blighted) {
    statusClass = 'blighted';
    statusText = 'Blighted';
    statusIcon = 'fas fa-skull';
  } else if (character.ko) {
    statusClass = 'ko';
    statusText = 'KO\'d';
    statusIcon = 'fas fa-heart-broken';
  } else {
    statusClass = 'online';
    statusText = 'Active';
    statusIcon = 'fas fa-heart';
  }

  const html = `
    <div class="character-of-week-card">
      <div class="character-of-week-avatar">
        ${iconUrl ? `<img src="${iconUrl}" alt="${character.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />` : `<i class="fas fa-user"></i>`}
      </div>
      
      <h3 class="character-of-week-name">${character.name}</h3>
      
      <div class="character-of-week-details">
        <div class="character-of-week-job">
          <i class="fas fa-briefcase"></i>
          ${character.job ? capitalize(character.job) : 'Unknown Job'}
        </div>
        
        <div class="character-of-week-village">
          <i class="fas fa-home"></i>
          ${character.currentVillage ? capitalize(character.currentVillage) : (character.homeVillage ? capitalize(character.homeVillage) : 'Unknown Village')}
        </div>
      </div>
      
      <div class="character-of-week-links">
        <a href="${character.appLink || '#'}" class="character-of-week-link" target="_blank" rel="noopener noreferrer">
          <i class="fas fa-user-circle"></i>
          View Profile
        </a>
      </div>
    </div>
  `;

  // Render the card
  container.innerHTML = html;
}

// ------------------- Function: showCharacterOfWeekLoading -------------------
// Shows loading state for character of the week
function showCharacterOfWeekLoading(container) {
  container.innerHTML = `
    <div class="character-of-week-loading">
      <div class="loading-spinner"></div>
      <p>Loading featured character...</p>
    </div>
  `;
}

// ------------------- Function: showCharacterOfWeekError -------------------
// Shows error state for character of the week
function showCharacterOfWeekError(container, error) {
  container.innerHTML = `
    <div class="character-of-week-error">
      <i class="fas fa-exclamation-triangle"></i>
      <p>Failed to load featured character</p>
      <button class="character-of-week-retry-btn" onclick="loadCharacterOfWeek()">
        <i class="fas fa-redo"></i>
        Retry
      </button>
    </div>
  `;
}

// ------------------- Function: showCharacterOfWeekNoData -------------------
// Shows no data state for character of the week
function showCharacterOfWeekNoData(container) {
  container.innerHTML = `
    <div class="character-of-week-no-data">
      <i class="fas fa-star"></i>
      <h3>No Featured Character</h3>
      <p>No character is currently featured this week. Check back later!</p>
    </div>
  `;
}

// ------------------- Function: formatCharacterIconUrl -------------------
// Formats character icon URL for display
function formatCharacterIconUrl(icon) {
  if (!icon) return null;
  
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

// ------------------- Function: refreshCharacterOfWeek -------------------
// Refreshes the character of the week display
function refreshCharacterOfWeek() {
  loadCharacterOfWeek();
}

// ------------------- Function: initCharacterOfWeek -------------------
// Initialize the character of week module
function initCharacterOfWeek() {
  // Load character of week when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCharacterOfWeek);
  } else {
    loadCharacterOfWeek();
  }
}

// ------------------- Event Listeners -------------------
// Load character of the week when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on the dashboard section
  const dashboardSection = document.getElementById('dashboard-section');
  
  if (dashboardSection && dashboardSection.style.display !== 'none') {
    loadCharacterOfWeek();
  }
});

// ------------------- Function: viewCharacterProfile -------------------
// Opens the character profile in a modal or navigates to character details
function viewCharacterProfile(characterId) {
  // Check if we're on the dashboard or character details page
  const dashboardSection = document.getElementById('dashboard-section');
  const modelDetailsPage = document.getElementById('model-details-page');
  
  if (dashboardSection && dashboardSection.style.display !== 'none') {
    // We're on dashboard, navigate to character details
    
    // Find and click the character model card
    const characterCard = document.querySelector('.model-card[data-model="character"]');
    if (characterCard) {
      characterCard.click();
      
      // Wait for character page to load, then search for this specific character
      setTimeout(() => {
        const searchInput = document.getElementById('character-search-input');
        if (searchInput) {
          // We'll need to get the character name first
          fetch(`/api/models/character/${characterId}`)
            .then(response => response.json())
            .then(data => {
              if (data.data && data.data.name) {
                searchInput.value = data.data.name;
                searchInput.dispatchEvent(new Event('input'));
              }
            })
            .catch(error => {
              console.error('[characterOfWeek.js]: Error fetching character:', error);
            });
        }
      }, 1000);
    }
  } else if (modelDetailsPage && modelDetailsPage.style.display !== 'none') {
    // We're already on a model details page, check if it's character page
    const modelTitle = document.getElementById('model-details-title');
    if (modelTitle && modelTitle.textContent.toLowerCase() === 'character') {
      // We're on character page, search for this character
      const searchInput = document.getElementById('character-search-input');
      if (searchInput) {
        fetch(`/api/models/character/${characterId}`)
          .then(response => response.json())
          .then(data => {
            if (data.data && data.data.name) {
              searchInput.value = data.data.name;
              searchInput.dispatchEvent(new Event('input'));
            }
          })
          .catch(error => {
            console.error('[characterOfWeek.js]: Error fetching character:', error);
          });
      }
    } else {
      // We're on a different model page, navigate to character page first
      const characterCard = document.querySelector('.model-card[data-model="character"]');
      if (characterCard) {
        characterCard.click();
        
        setTimeout(() => {
          const searchInput = document.getElementById('character-search-input');
          if (searchInput) {
            fetch(`/api/models/character/${characterId}`)
              .then(response => response.json())
              .then(data => {
                if (data.data && data.data.name) {
                  searchInput.value = data.data.name;
                  searchInput.dispatchEvent(new Event('input'));
                }
              })
              .catch(error => {
                console.error('[characterOfWeek.js]: Error fetching character:', error);
              });
          }
        }, 1000);
      }
    }
  }
}

// ------------------- Function: triggerFirstCharacterOfWeek -------------------
// Triggers the creation of the first character of the week if none exists
async function triggerFirstCharacterOfWeek() {
  try {
    const response = await fetch('/api/character-of-week/trigger-simple', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // Reload the character of week display
      loadCharacterOfWeek();
    } else {
      console.error('[characterOfWeek.js]: Error creating first character:', result.error);
    }
  } catch (error) {
    console.error('[characterOfWeek.js]: Error triggering first character:', error);
  }
}

// ------------------- Module Export -------------------
// Export functions to global scope for use by other modules
window.characterOfWeek = {
  loadCharacterOfWeek,
  displayCharacterOfWeek,
  showCharacterOfWeekLoading,
  showCharacterOfWeekError,
  showCharacterOfWeekNoData,
  refreshCharacterOfWeek,
  initCharacterOfWeek,
  viewCharacterProfile
};

// Also export viewCharacterProfile globally for HTML onclick events
window.viewCharacterProfile = viewCharacterProfile;

// ------------------- Auto-Initialize -------------------
// Initialize when script loads
initCharacterOfWeek(); 