/* ====================================================================== */
/* Character Rendering and Filtering Module                              */
/* Handles character card rendering, filtering, pagination, avatar logic */
/* ====================================================================== */

import { getVillageCrestUrl, capitalize } from './utils.js';
import { scrollToTop, createSearchFilterBar } from './ui.js';

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

/**
 * Escapes HTML attributes to prevent XSS and string literal issues
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtmlAttribute(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// ------------------- Mobile-Friendly Utilities -------------------
// Touch optimizations and responsive behavior helpers
// ============================================================================

// ------------------- Function: isMobileDevice -------------------
// Detects if the current device is mobile/touch-based
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         window.innerWidth <= 768 ||
         ('ontouchstart' in window);
}

// ------------------- Function: isTouchDevice -------------------
// Detects if the device supports touch events
function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// ------------------- Function: getMobileGridColumns -------------------
// Returns appropriate grid columns based on screen size
function getMobileGridColumns() {
  const width = window.innerWidth;
  if (width <= 360) return 1;      // Extra small phones
  if (width <= 480) return 2;      // Small phones
  if (width <= 768) return 2;      // Tablets/large phones
  if (width <= 1024) return 3;     // Large tablets
  return 4;                        // Desktop
}

// ------------------- Function: optimizeForMobile -------------------
// Applies mobile-specific optimizations to character cards
function optimizeForMobile() {
  const isMobile = isMobileDevice();
  const isTouch = isTouchDevice();
  
  // Add mobile-specific classes to body
  if (isMobile) {
    document.body.classList.add('mobile-device');
  }
  if (isTouch) {
    document.body.classList.add('touch-device');
  }
  
  // Adjust grid layout for mobile
  const grid = document.getElementById('characters-container');
  if (grid) {
    const columns = getMobileGridColumns();
    grid.style.setProperty('--mobile-columns', columns);
  }
  
  return { isMobile, isTouch };
}

// ------------------- Function: setupMobileEventHandlers -------------------
// Sets up touch-optimized event handlers for mobile devices
function setupMobileEventHandlers() {
  const isMobile = isMobileDevice();
  const isTouch = isTouchDevice();
  
  if (!isMobile && !isTouch) return;
  
  // Add touch feedback to character cards
  const characterCards = document.querySelectorAll('.character-card');
  characterCards.forEach(card => {
    // Remove hover effects on touch devices
    if (isTouch) {
      card.style.setProperty('--hover-transform', 'none');
      card.style.setProperty('--hover-shadow', 'var(--card-shadow)');
    }
    
    // Add touch feedback with proper sensitivity handling
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let hasMoved = false;
    
    card.addEventListener('touchstart', function(e) {
      touchStartTime = Date.now();
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      hasMoved = false;
      
      this.style.transform = 'scale(0.98)';
      this.style.transition = 'transform 0.1s ease';
    }, { passive: true });
    
    card.addEventListener('touchmove', function(e) {
      if (touchStartX && touchStartY) {
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
        
        if (deltaX > 10 || deltaY > 10) {
          hasMoved = true;
          this.style.transform = '';
          this.style.transition = '';
        }
      }
    }, { passive: true });
    
    card.addEventListener('touchend', function(e) {
      this.style.transform = '';
      this.style.transition = '';
      
      const touchDuration = Date.now() - touchStartTime;
      const isValidTouch = touchDuration > 50 && touchDuration < 1000 && !hasMoved;
      
      if (isValidTouch) {
        e.preventDefault();
        this.click();
      }
      
      touchStartTime = 0;
      touchStartX = 0;
      touchStartY = 0;
      hasMoved = false;
    }, { passive: false });
  });
  
  // Optimize filter controls for mobile
  const filterControls = document.querySelectorAll('.search-filter-control select, .search-filter-control input');
  filterControls.forEach(control => {
    // Increase touch target size
    control.style.minHeight = '44px';
    control.style.fontSize = '16px'; // Prevents zoom on iOS
    
    // Add mobile-specific styling
    if (isMobile) {
      control.classList.add('mobile-optimized');
    }
  });
  
  // Optimize pagination buttons for mobile
  const paginationButtons = document.querySelectorAll('.pagination-button');
  paginationButtons.forEach(button => {
    button.style.minHeight = '44px';
    button.style.minWidth = '44px';
    button.style.fontSize = '16px';
  });
}

// ------------------- Function: handleMobileOrientationChange -------------------
// Handles orientation changes on mobile devices
function handleMobileOrientationChange() {
  const isMobile = isMobileDevice();
  if (!isMobile) return;
  
  // Debounce the orientation change handler
  let orientationTimeout;
  const handleOrientationChange = () => {
    clearTimeout(orientationTimeout);
    orientationTimeout = setTimeout(() => {

      
      // Re-apply mobile optimizations
      optimizeForMobile();
      setupMobileEventHandlers();
      
      // Re-render character cards with new layout
      if (window.allCharacters) {
        const currentPage = 1; // Reset to first page on orientation change
        renderCharacterCards(window.allCharacters, currentPage, true, false);
      }
    }, 300);
  };
  
  window.addEventListener('orientationchange', handleOrientationChange);
  window.addEventListener('resize', handleOrientationChange);
  
  return handleOrientationChange;
}

// ------------------- Function: createMobileFriendlyModal -------------------
// Creates a mobile-optimized modal for character details
function createMobileFriendlyModal(character) {
  const isMobile = isMobileDevice();
  const isTouch = isTouchDevice();
  
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  
  // Add mobile-specific classes
  if (isMobile) {
    modal.classList.add('mobile-modal');
  }
  if (isTouch) {
    modal.classList.add('touch-modal');
  }
  
  modal.innerHTML = generateCharacterModalHTML(character);
  
  // Mobile-specific modal behavior
  if (isMobile) {
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    
    // Add swipe-to-close functionality
    let startY = 0;
    let currentY = 0;
    
    modal.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    });
    
    modal.addEventListener('touchmove', (e) => {
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      
      if (diff > 50) { // Swipe down to close
        modal.style.transform = `translateY(${diff}px)`;
        modal.style.opacity = Math.max(0, 1 - (diff / 200));
      }
    });
    
    modal.addEventListener('touchend', (e) => {
      const diff = currentY - startY;
      if (diff > 100) { // Close if swiped down far enough
        closeModal(modal);
      } else {
        // Reset modal position
        modal.style.transform = '';
        modal.style.opacity = '';
      }
    });
  }
  
  return modal;
}

// ------------------- Function: closeModal -------------------
// Closes modal with mobile-friendly cleanup
function closeModal(modal) {
  const isMobile = isMobileDevice();
  
  if (isMobile) {
    // Restore body scroll
    document.body.style.overflow = '';
  }
  
  modal.remove();
}

// ============================================================================
// ------------------- Rendering: Character Cards -------------------
// Displays characters with pagination and status-based styling
// ============================================================================

// ------------------- Function: renderCharacterCards -------------------
// Renders all character cards with pagination and stat sections
function renderCharacterCards(characters, page = 1, enableModals = true, isFromFiltering = false) {


    // Apply mobile optimizations
    const { isMobile, isTouch } = optimizeForMobile();

    // Scroll to top of the page
    scrollToTop();

    const grid = document.getElementById('characters-container');
    if (!grid) {
      console.error('❌ Grid container not found');
      return;
    }
  
      // ------------------- No Characters Found -------------------
      if (!characters || characters.length === 0) {
      grid.innerHTML = `
        <div class="blank-empty-state">
          <i class="fas fa-inbox"></i>
          <h3>No characters found</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      `;
      const pagination = document.getElementById('character-pagination');
      if (pagination) pagination.innerHTML = '';
      return;
    }
  
    // Update the global characters array
    window.allCharacters = characters;
  
    // Get characters per page setting
    const charactersPerPageSelect = document.getElementById('characters-per-page');
    const charactersPerPage = charactersPerPageSelect ? 
      (charactersPerPageSelect.value === 'all' ? characters.length : parseInt(charactersPerPageSelect.value)) : 
      (isMobile ? 6 : 12); // Fewer characters per page on mobile
    
    // Calculate pagination info
    const totalPages = Math.ceil(characters.length / charactersPerPage);
    const startIndex = (page - 1) * charactersPerPage;
    const endIndex = Math.min(startIndex + charactersPerPage, characters.length);
  
    // ------------------- Render Character Cards -------------------
    
    grid.innerHTML = characters.map(character => {
      let statusClass = '';
      let statusText = '';
      let cardStatusClass = '';
  
      if (character.blighted) {
        statusClass = 'status-blighted fas fa-skull-crossbones';
        statusText = 'Blighted';
        cardStatusClass = 'blighted';
      } else if (character.ko) {
        statusClass = 'status-ko fas fa-skull';
        statusText = 'KO\'d';
        cardStatusClass = 'ko';
      }
  
      const heartPercent = (character.currentHearts / character.maxHearts) * 100;
      const staminaPercent = (character.currentStamina / character.maxStamina) * 100;
      const attackPercent = Math.min((character.attack / 10) * 100, 100);
      const defensePercent = Math.min((character.defense / 15) * 100, 100);
  
      return `
        <div class="character-card ${cardStatusClass} ${isMobile ? 'mobile-card' : ''} ${isTouch ? 'touch-card' : ''} ${character.isModCharacter ? 'mod-character' : ''}" data-character="${character.name}">
          <div class="character-header">
            ${character.homeVillage ? `
              <div class="village-crest">
                <img 
                  src="${getVillageCrestUrl(character.homeVillage)}" 
                  alt="${character.homeVillage} Crest"
                  class="village-crest-img"
                  onerror="this.src='/images/ankleicon.png'"
                >
              </div>` : ''
            }
  
            <div class="character-avatar-container">
              <img 
                src="${formatCharacterIconUrl(character.icon)}" 
                alt="${character.name}" 
                class="character-avatar"
                onerror="console.error('❌ Failed to load:', this.src); this.src='/images/ankleicon.png';"
                crossorigin="anonymous"
              >
            </div>
  
                          <div class="character-title">
                <div class="character-name-row">
                  <h3 class="character-name">${character.name}</h3>
                  ${character.isModCharacter ? `
                    <div class="mod-character-badge">
                      <i class="fas fa-crown"></i>
                      <span class="mod-character-title">${character.modTitle || 'Mod'}</span>
                    </div>
                  ` : ''}
                  ${statusText ? `
              <div class="character-status">
                <i class="character-status-icon ${statusClass}"></i>
                <span class="character-status-text">${statusText}</span>
              </div>` : ''}
              </div>
              <div class="character-race-job-row">
                ${character.race ? capitalize(character.race) : ''}
                ${character.race && character.job ? ' &bull; ' : ''}
                ${character.job ? capitalize(character.job) : ''}
              </div>
              
              ${character.owner ? `
              <div class="character-owner">
                <i class="fab fa-discord"></i>
                <span class="character-owner-name">@${character.owner.displayName}</span>
              </div>` : ''}
              
              ${!character.owner ? `
              <div class="character-owner">
                <i class="fab fa-discord"></i>
                <span class="character-owner-name">@No Owner Data</span>
              </div>` : ''}
  
              <div class="character-links">
                ${character.appLink ? `
                  <a href="${character.appLink}" target="_blank" class="character-link">
                    <i class="fas fa-external-link-alt"></i> ${isMobile ? 'Sheet' : 'Character Sheet'}
                  </a>` : ''}
                ${character.inventory ? `
                  <a href="${character.inventory}" target="_blank" class="character-link">
                    <i class="fas fa-backpack"></i> ${isMobile ? 'Items' : 'Inventory'}
                  </a>` : ''}
                ${character.shopLink ? `
                  <a href="${character.shopLink}" target="_blank" class="character-link">
                    <i class="fas fa-store"></i> Shop
                  </a>` : ''}
              </div>
            </div>
          </div>
  
          <div class="character-content">
            ${renderStatRow('HEARTS', `${character.currentHearts}/${character.maxHearts}`, 'heart-bar', heartPercent)}
            ${renderStatRow('STAMINA', `${character.currentStamina}/${character.maxStamina}`, 'stamina-bar', staminaPercent)}
            ${renderStatRow('ATTACK', character.attack || 0, 'attack-bar', attackPercent)}
            ${renderStatRow('DEFENSE', character.defense || 0, 'defense-bar', defensePercent)}
  
                         <div class="character-section">
               <h4 class="character-section-title">Basic Info</h4>
               <div class="character-detail-list">
                 ${character.isModCharacter ? renderDetail('Mod Type', character.modType ? capitalize(character.modType) : 'Unknown') : ''}
                 ${renderDetail('Home Village', character.homeVillage ? capitalize(character.homeVillage) : 'Unknown')}
                 ${renderDetail('Current Village', character.currentVillage ? capitalize(character.currentVillage) : (character.homeVillage ? capitalize(character.homeVillage) : 'Unknown'))}
                 ${renderDetail('Pronouns', character.pronouns ? capitalize(character.pronouns) : 'Not specified')}
                 ${renderDetail('Birthday', character.birthday || 'Not specified')}
                 ${character.age ? renderDetail('Age', character.age) : ''}
                 ${character.height ? renderDetail('Height', `${character.height} cm | ${convertCmToFeetInches(character.height)}`) : ''}
                 ${!character.isModCharacter ? renderDetail('Spirit Orbs', character.spiritOrbs || 0) : ''}
                 ${!character.isModCharacter ? renderDetail('Job Changed', formatPrettyDate(character.jobDateChanged)) : ''}
                 ${!character.isModCharacter ? renderDetail('Last Stamina Usage', formatPrettyDate(character.lastStaminaUsage)) : ''}
                 ${!character.isModCharacter ? renderDetail('Blighted', character.blighted ? 'Yes' : 'No') : ''}
                 ${!character.isModCharacter ? renderDetail('Blight Stage', character.blightStage ?? 0) : ''}
                 ${!character.isModCharacter ? renderDetail('Debuff', (character.debuff?.active)
                   ? `Debuffed${character.debuff.endDate ? ' | Ends ' + new Date(character.debuff.endDate).toLocaleDateString() : ''}`
                   : 'Not Debuffed') : ''}
               </div>
             </div>
  
            <div class="character-section">
              <h4 class="character-section-title">Gear</h4>
              <div class="character-detail-list">
                ${renderDetail('Weapon', character.gearWeapon?.name ? `${character.gearWeapon.name} | ${getGearStat(character.gearWeapon, 'modifierHearts', 'weapon')}` : 'None')}
                ${renderDetail('Shield', character.gearShield?.name ? `${character.gearShield.name} | ${getGearStat(character.gearShield, 'modifierHearts', 'shield')}` : 'None')}
                ${renderDetail('Head', character.gearArmor?.head?.name ? `${character.gearArmor.head.name} | ${getGearStat(character.gearArmor.head, 'modifierHearts', 'armor')}` : 'None')}
                ${renderDetail('Chest', character.gearArmor?.chest?.name ? `${character.gearArmor.chest.name} | ${getGearStat(character.gearArmor.chest, 'modifierHearts', 'armor')}` : 'None')}
                ${renderDetail('Legs', character.gearArmor?.legs?.name ? `${character.gearArmor.legs.name} | ${getGearStat(character.gearArmor.legs, 'modifierHearts', 'armor')}` : 'None')}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  
    // ------------------- Attach Click Handlers -------------------
    // Navigate to OC page when character card is clicked
    const characterCards = grid.querySelectorAll('.character-card');
    characterCards.forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't navigate if clicking on a link or button inside the card
        if (e.target.closest('a') || e.target.closest('button')) {
          return;
        }
        
        const name = card.getAttribute('data-character');
        if (!name) return;
        
        // Generate URL slug from character name (same logic as backend)
        const nameSlug = name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
        
        // Navigate to OC page
        window.location.href = `/ocs/${nameSlug}`;
      });
      
      // Add cursor pointer style to indicate clickability
      card.style.cursor = 'pointer';
    });

    // Setup mobile event handlers after rendering
    setupMobileEventHandlers();

    // Update results info - only if we're not in a filtered state and not called from filtering
    const resultsInfo = document.querySelector('.model-results-info, .character-results-info');
    if (resultsInfo && !window.filteredCharacters && !isFromFiltering) {
      // Recalculate to ensure variables are defined
      const charactersPerPageSelect = document.getElementById('characters-per-page');
      const charsPerPage = charactersPerPageSelect ? 
        (charactersPerPageSelect.value === 'all' ? characters.length : parseInt(charactersPerPageSelect.value)) : 
        (isMobile ? 6 : 12);
      const totalPages = Math.ceil(characters.length / charsPerPage);
      const startIdx = (page - 1) * charsPerPage;
      const endIdx = Math.min(startIdx + charsPerPage, characters.length);
      
      if (charactersPerPageSelect && charactersPerPageSelect.value === 'all') {
        resultsInfo.textContent = `Showing all ${characters.length} characters`;
      } else {
        resultsInfo.textContent = `Showing ${startIdx + 1}-${endIdx} of ${characters.length} characters (Page ${page} of ${totalPages})`;
      }
    }
    // If we're in a filtered state or called from filtering, let the filtering functions handle the results info
  }
  
  // ============================================================================
// ------------------- Rendering: Helpers -------------------
// Returns stat rows, detail items, formatted values, and modal content
// ============================================================================

// ------------------- Function: renderStatRow -------------------
// Returns HTML for a character stat bar row
function renderStatRow(label, value, barClass, percent) {
    return `
      <div class="character-stat-row">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-bar-container">
          <div class="stat-bar ${barClass}" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }
  
  // ------------------- Function: renderDetail -------------------
  // Returns HTML for a basic character detail row
  function renderDetail(label, value) {
    return `
      <div class="character-detail">
        <div class="character-detail-label">${label}</div>
        <div class="character-detail-value">${value}</div>
      </div>
    `;
  }
  
  // ------------------- Function: getGearStat -------------------
  // Returns a stat string with + prefix if positive and appropriate label (ATK/DEF)
  function getGearStat(gear, statName, gearType = 'armor') {
    if (!gear) return '';
    // Check both gear.stats.modifierHearts and gear.modifierHearts for compatibility
    const value = gear.stats?.[statName] || gear[statName];
    if (!value || value === 0) return '';
    
    // Determine label based on gear type
    let label = 'DEF'; // Default to DEF for armor, shield, etc.
    if (gearType === 'weapon') {
      label = 'ATK';
    }
    
    return value > 0 ? `+${value} ${label}` : `${value} ${label}`;
  }
  
  // ------------------- Function: formatPrettyDate -------------------
  // Converts a date string into a human-readable format
  function formatPrettyDate(date) {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  }
  
  // ------------------- Function: convertCmToFeetInches -------------------
  // Converts centimeters to feet and inches format
  function convertCmToFeetInches(heightInCm) {
    const totalInches = heightInCm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}'${inches}"`;
  }
  
  // ------------------- Function: formatCharacterIconUrl -------------------
  // Formats and returns character icon URL
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
  
  // ------------------- Function: generateCharacterModalHTML -------------------
  // Returns full HTML string for the character modal
  function generateCharacterModalHTML(character) {
    return `
      <div class="character-modal-content">
        <div class="character-modal-header">
          <h2>${character.name}</h2>
          <button class="close-modal">&times;</button>
        </div>
        <div class="character-modal-body">
  
          <div class="character-modal-section">
            <h3>Basic Info</h3>
            <div class="character-modal-grid">
              ${character.isModCharacter ? `<div class="character-modal-item"><span class="label">Mod Type:</span><span class="value">${character.modType ? capitalize(character.modType) : 'Unknown'}</span></div>` : ''}
              ${character.isModCharacter ? `<div class="character-modal-item"><span class="label">Mod Title:</span><span class="value">${character.modTitle || 'Unknown'}</span></div>` : ''}
              <div class="character-modal-item"><span class="label">Race:</span><span class="value">${character.race ? capitalize(character.race) : 'Unknown'}</span></div>
              <div class="character-modal-item"><span class="label">Job:</span><span class="value">${character.job ? capitalize(character.job) : 'Unknown'}</span></div>
              <div class="character-modal-item"><span class="label">Home Village:</span><span class="value">${character.homeVillage ? capitalize(character.homeVillage) : 'Unknown'}</span></div>
              <div class="character-modal-item"><span class="label">Current Village:</span><span class="value">${character.currentVillage ? capitalize(character.currentVillage) : 'Unknown'}</span></div>
              <div class="character-modal-item"><span class="label">Pronouns:</span><span class="value">${character.pronouns || 'Unknown'}</span></div>
              <div class="character-modal-item"><span class="label">Age:</span><span class="value">${character.age || 'Unknown'}</span></div>
              <div class="character-modal-item"><span class="label">Birthday:</span><span class="value">${character.birthday || 'Unknown'}</span></div>
              <div class="character-modal-item"><span class="label">Height:</span><span class="value">${character.height ? `${character.height} cm | ${convertCmToFeetInches(character.height)}` : 'Unknown'}</span></div>
            </div>
          </div>
  
          <div class="character-modal-section">
            <h3>Stats</h3>
            <div class="character-modal-grid">
              <div class="character-modal-item"><span class="label">Hearts:</span><span class="value">${character.currentHearts}/${character.maxHearts}</span></div>
              <div class="character-modal-item"><span class="label">Stamina:</span><span class="value">${character.currentStamina}/${character.maxStamina}</span></div>
              <div class="character-modal-item"><span class="label">Attack:</span><span class="value">${character.attack || 0}</span></div>
              <div class="character-modal-item"><span class="label">Defense:</span><span class="value">${character.defense || 0}</span></div>
              ${!character.isModCharacter ? `<div class="character-modal-item"><span class="label">Spirit Orbs:</span><span class="value">${character.spiritOrbs || 0}</span></div>` : ''}
            </div>
          </div>
  
          <div class="character-modal-section">
            <h3>Gear</h3>
            <div class="character-modal-grid">
              <div class="character-modal-item"><span class="label">Weapon:</span><span class="value">${character.gearWeapon?.name ? `${character.gearWeapon.name} | ${getGearStat(character.gearWeapon, 'modifierHearts', 'weapon')}` : 'None'}</span></div>
              <div class="character-modal-item"><span class="label">Shield:</span><span class="value">${character.gearShield?.name ? `${character.gearShield.name} | ${getGearStat(character.gearShield, 'modifierHearts', 'shield')}` : 'None'}</span></div>
              <div class="character-modal-item"><span class="label">Head:</span><span class="value">${character.gearArmor?.head?.name ? `${character.gearArmor.head.name} | ${getGearStat(character.gearArmor.head, 'modifierHearts', 'armor')}` : 'None'}</span></div>
              <div class="character-modal-item"><span class="label">Chest:</span><span class="value">${character.gearArmor?.chest?.name ? `${character.gearArmor.chest.name} | ${getGearStat(character.gearArmor.chest, 'modifierHearts', 'armor')}` : 'None'}</span></div>
              <div class="character-modal-item"><span class="label">Legs:</span><span class="value">${character.gearArmor?.legs?.name ? `${character.gearArmor.legs.name} | ${getGearStat(character.gearArmor.legs, 'modifierHearts', 'armor')}` : 'None'}</span></div>
            </div>
          </div>
  
          <div class="character-modal-section">
            <h3>Status</h3>
            <div class="character-modal-grid">
              ${!character.isModCharacter ? `<div class="character-modal-item"><span class="label">Blighted:</span><span class="value">${character.blighted ? 'Yes' : 'No'}</span></div>` : ''}
              ${!character.isModCharacter ? `<div class="character-modal-item"><span class="label">Blight Stage:</span><span class="value">${character.blightStage ?? 0}</span></div>` : ''}
              ${!character.isModCharacter ? `<div class="character-modal-item"><span class="label">Debuff:</span><span class="value">${character.debuff?.active
                ? `Debuffed${character.debuff.endDate ? ' | Ends ' + new Date(character.debuff.endDate).toLocaleDateString() : ''}`
                : 'Not Debuffed'}</span></div>` : ''}
              ${!character.isModCharacter ? `<div class="character-modal-item"><span class="label">Last Stamina Usage:</span><span class="value">${formatPrettyDate(character.lastStaminaUsage)}</span></div>` : ''}
              ${!character.isModCharacter ? `<div class="character-modal-item"><span class="label">Job Changed:</span><span class="value">${formatPrettyDate(character.jobDateChanged)}</span></div>` : ''}
            </div>
          </div>
  
          <div class="character-modal-section">
            <h3>Links</h3>
            <div class="character-modal-links">
              ${character.appLink ? `<a href="${character.appLink}" target="_blank" class="character-link"><i class="fas fa-external-link-alt"></i> Character Sheet</a>` : ''}
              ${character.inventory ? `<a href="${character.inventory}" target="_blank" class="character-link"><i class="fas fa-backpack"></i> Inventory</a>` : ''}
              ${character.shopLink ? `<a href="${character.shopLink}" target="_blank" class="character-link"><i class="fas fa-store"></i> Shop</a>` : ''}
            </div>
          </div>
  
        </div>
      </div>
    `;
  }

  // ============================================================================
// ------------------- Filtering: Dropdown and Search -------------------
// Applies filters to character list based on UI selection
// ============================================================================

// ------------------- Function: populateFilterOptions -------------------
// Populates dropdowns for job, race, and village based on unique values from database
async function populateFilterOptions(characters) {
  try {
    
    // Fetch all characters from database to get unique filter values
    const response = await fetch('/api/models/character?all=true');
    if (!response.ok) {
      return; 
    }
    
    const { data: allCharacters } = await response.json();
    
    // Extract unique values from all characters
    const jobMap = new Map();
    const raceSet = new Set();
    const villageSet = new Set();
    
    allCharacters.forEach(c => {
      if (c.job) jobMap.set(c.job.toLowerCase(), c.job);
      if (c.race) raceSet.add(c.race.toLowerCase());
      if (c.homeVillage) villageSet.add(c.homeVillage.toLowerCase());
    });
    
    // Populate the select dropdowns
    populateSelect('filter-job', Array.from(jobMap.values()));
    populateSelect('filter-race', Array.from(raceSet));
    populateSelect('filter-village', Array.from(villageSet));
    
  } catch (error) {
    console.error('❌ Error loading character filter options from database:', error);
  }
}
  
  // ------------------- Function: populateSelect -------------------
  // Helper to populate a <select> element with new options
  function populateSelect(id, values) {
    const select = document.getElementById(id);
    if (!select) return;
  
    select.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());
  
    const formatted = values
      .map(v => capitalize(v.toLowerCase()))
      .sort();
  
    formatted.forEach(val => {
      const option = document.createElement('option');
      option.value = val.toLowerCase();
      option.textContent = val;
      select.appendChild(option);
    });
  }
  
  // ------------------- Function: setupCharacterFilters -------------------
  // Adds listeners to filter UI and re-renders characters on change
  async function setupCharacterFilters(characters) {
  
    window.allCharacters = characters;
  
    if (window.characterFiltersInitialized) {
      window.filterCharacters(1);
      return;
    }
  
    // Show the filters container
    const filtersContainer = document.querySelector('.character-filters-wrapper');
    if (filtersContainer) {
        filtersContainer.style.display = 'block';
    }
  
    const searchInput = document.getElementById('character-search-input');
    const jobSelect = document.getElementById('filter-job');
    const raceSelect = document.getElementById('filter-race');
    const villageSelect = document.getElementById('filter-village');
    const sortSelect = document.getElementById('sort-by');
    const charactersPerPageSelect = document.getElementById('characters-per-page');

    const clearFiltersBtn = document.getElementById('clear-filters');
  
    const missing = [searchInput, jobSelect, raceSelect, villageSelect, sortSelect, charactersPerPageSelect, clearFiltersBtn].some(el => !el);
    if (missing) {
      if (!window.filterSetupRetried) {
        window.filterSetupRetried = true;
        requestAnimationFrame(() => setupCharacterFilters(characters));
      } else {
        console.error('❌ Failed to initialize character filters. Please refresh.');
      }
      return;
    }
  
    window.filterSetupRetried = false;
  
    // Apply mobile optimizations to filter controls
    const { isMobile, isTouch } = optimizeForMobile();
    
    // Mobile-specific filter optimizations
    if (isMobile) {
      // Adjust characters per page options for mobile
      const mobileOptions = ['6', '12', '24', 'all'];
      charactersPerPageSelect.innerHTML = '';
      mobileOptions.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option === 'all' ? 'All characters' : `${option} per page`;
        charactersPerPageSelect.appendChild(opt);
      });
      charactersPerPageSelect.value = '6'; // Default to 6 on mobile
      
      // Add mobile-specific classes to filter controls
      [searchInput, jobSelect, raceSelect, villageSelect, sortSelect, charactersPerPageSelect].forEach(control => {
        if (control) {
          control.classList.add('mobile-filter-control');
          control.style.minHeight = '44px';
          control.style.fontSize = '16px';
        }
      });
      
      // Optimize clear filters button for mobile
      if (clearFiltersBtn) {
        clearFiltersBtn.classList.add('mobile-clear-btn');
        clearFiltersBtn.style.minHeight = '44px';
        clearFiltersBtn.style.fontSize = '16px';
      }
    }

    // Populate filter options with available values from database
    await populateFilterOptions(characters);

    // Restore filter state if it exists
    const savedFilterState = window.savedFilterState || {};
  
    // ------------------- Function: filterCharacters -------------------
    // Main filtering function that handles both server-side and client-side filtering
    window.filterCharacters = async function (page = 1) {
      const searchTerm = searchInput.value.toLowerCase();
      const jobFilter = jobSelect.value.toLowerCase();
      const raceFilter = raceSelect.value.toLowerCase();
      const villageFilter = villageSelect.value.toLowerCase();
      const sortBy = sortSelect.value;
      const charactersPerPage = charactersPerPageSelect.value;



      
      // Save current filter state
      window.savedFilterState = {
        searchTerm: searchInput.value,
        jobFilter,
        raceFilter,
        villageFilter,
        sortBy,
        charactersPerPage,

      };

      // Check if any filters are active
      const hasActiveFilters = searchTerm || 
        jobFilter !== 'all' || 
        raceFilter !== 'all' || 
        villageFilter !== 'all';

      // If we have cached data and no new filters, use client-side filtering
      if (window.cachedCharacterData && !hasActiveFilters) {
        filterCharactersClientSide(page);
        return;
      }

      // Always use server-side filtering when filters are active OR when characters per page is not 'all'
      // This ensures we have all the data needed for proper pagination
      if (hasActiveFilters || charactersPerPage !== 'all') {
        // When filters are active or pagination is needed, always fetch all characters and filter client-side
        await filterCharactersWithAllData(page);
      } else {
        // For simple pagination without filters, use client-side filtering
        filterCharactersClientSide(page);
      }
    };

    // ------------------- Function: filterCharactersWithAllData -------------------
    // Fetches all characters from database and applies client-side filtering
    async function filterCharactersWithAllData(page = 1) {
      const startTime = Date.now();
      const searchTerm = searchInput.value.toLowerCase();
      const jobFilter = jobSelect.value.toLowerCase();
      const raceFilter = raceSelect.value.toLowerCase();
      const villageFilter = villageSelect.value.toLowerCase();
      const sortBy = sortSelect.value;
      const charactersPerPage = charactersPerPageSelect.value === 'all' ? 999999 : parseInt(charactersPerPageSelect.value);

        // Show loading state
        const resultsInfo = document.querySelector('.model-results-info, .character-results-info');
        if (resultsInfo) {
          resultsInfo.textContent = 'Loading filtered characters...';
        }

      try {
        // Check if we have cached data and it's recent (less than 5 minutes old)
        const now = Date.now();
        const cacheAge = window.cachedCharacterData ? (now - window.cachedCharacterData.timestamp) : Infinity;
        const isCacheValid = cacheAge < (5 * 60 * 1000); // 5 minutes

        let allCharacters;
        if (window.cachedCharacterData && isCacheValid) {
          allCharacters = window.cachedCharacterData.data;
          trackPerformance('character_filter_cache_hit', startTime);
        } else {
          // Fetch all characters from database
          const fetchStartTime = Date.now();
          const response = await fetch('/api/models/character?all=true');
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const { data } = await response.json();
          allCharacters = data;
          
          trackPerformance('character_data_fetch', fetchStartTime);
          
          // Cache the data
          window.cachedCharacterData = {
            data: allCharacters,
            timestamp: now
          };
        }

        // Apply filtering and sorting to ALL characters
        const filterStartTime = Date.now();
        const filteredAndSorted = applyFiltersAndSort(allCharacters);
        trackPerformance('character_filter_sort', filterStartTime);

        // Store the filtered results for pagination
        window.filteredCharacters = filteredAndSorted;

        // Apply pagination
        const totalPages = Math.ceil(filteredAndSorted.length / charactersPerPage);
        const startIndex = (page - 1) * charactersPerPage;    
        const endIndex = startIndex + charactersPerPage;
        const paginatedCharacters = filteredAndSorted.slice(startIndex, endIndex);



        // Update global characters for this filtered view
        window.allCharacters = filteredAndSorted;

          // Update results info
          if (resultsInfo) {
            const currentPage = page || 1;
            const charsPerPage = charactersPerPage || 12;
            const totalPgs = totalPages || Math.ceil(filteredAndSorted.length / charsPerPage);
            
            if (charactersPerPageSelect && charactersPerPageSelect.value === 'all') {
              resultsInfo.textContent = `Showing all ${filteredAndSorted.length} filtered characters`;
            } else {
              const startIdx = (currentPage - 1) * charsPerPage + 1;
              const endIdx = Math.min(startIdx + paginatedCharacters.length - 1, filteredAndSorted.length);

              resultsInfo.textContent = `Showing ${startIdx}-${endIdx} of ${filteredAndSorted.length} characters (Page ${currentPage} of ${totalPgs})`;
            }
          }

        // Render the paginated filtered characters
        const renderStartTime = Date.now();
        renderCharacterCards(paginatedCharacters, page, false, true);
        trackPerformance('character_render', renderStartTime);

        // Update pagination
        if (charactersPerPageSelect.value !== 'all' && filteredAndSorted.length > charactersPerPage) {
          updateFilteredPagination(page, totalPages, filteredAndSorted.length);
        } else {
          const paginationContainer = document.getElementById('character-pagination');
          if (paginationContainer) {
            paginationContainer.innerHTML = '';
          }
        }

        trackPerformance('character_filter_complete', startTime);

      } catch (error) {
        console.error('❌ Error filtering characters:', error);
        if (resultsInfo) {
          resultsInfo.textContent = 'Error loading filtered characters';
        }
      }
    }

    // ------------------- Function: filterCharactersClientSide -------------------
    // Filters characters that are already loaded in memory
    function filterCharactersClientSide(page = 1) {
      const searchTerm = searchInput.value.toLowerCase();
      const jobFilter = jobSelect.value.toLowerCase();
      const raceFilter = raceSelect.value.toLowerCase();
      const villageFilter = villageSelect.value.toLowerCase();
      const sortBy = sortSelect.value;
      const charactersPerPage = charactersPerPageSelect.value === 'all' ? window.allCharacters.length : parseInt(charactersPerPageSelect.value);

      // Use cached data if available, otherwise use stored filtered characters or all characters
      const charactersToFilter = window.cachedCharacterData?.data || window.filteredCharacters || window.allCharacters;

      const filtered = charactersToFilter.filter(c => {
        const matchesSearch = !searchTerm ||
          c.name?.toLowerCase().includes(searchTerm) ||
          c.race?.toLowerCase().includes(searchTerm) ||
          c.job?.toLowerCase().includes(searchTerm);

        const matchesJob = jobFilter === 'all' || c.job?.toLowerCase() === jobFilter;
        const matchesRace = raceFilter === 'all' || c.race?.toLowerCase() === raceFilter;
        const matchesVillage = villageFilter === 'all' || c.homeVillage?.toLowerCase() === villageFilter;

        return matchesSearch && matchesJob && matchesRace && matchesVillage;
      });

      const [field, direction] = sortBy.split('-');
      const isAsc = direction === 'asc';

      const sorted = [...filtered].sort((a, b) => {
        const valA = a[field] ?? '';
        const valB = b[field] ?? '';
        return isAsc
          ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
          : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
      });

      // Apply pagination
      const totalPages = Math.ceil(sorted.length / charactersPerPage);
      const startIndex = (page - 1) * charactersPerPage;
      const endIndex = startIndex + charactersPerPage;
      const paginatedCharacters = sorted.slice(startIndex, endIndex);

      const resultsInfo = document.querySelector('.model-results-info, .character-results-info');
      if (resultsInfo) {
        const currentPage = page || 1;
        const charsPerPage = charactersPerPage || 12;
        const totalPgs = totalPages || Math.ceil(sorted.length / charsPerPage);
        
        if (charactersPerPageSelect && charactersPerPageSelect.value === 'all') {
          resultsInfo.textContent = `Showing all ${sorted.length} of ${window.allCharacters ? window.allCharacters.length : sorted.length} characters`;
        } else {
          const startIdx = (currentPage - 1) * charsPerPage + 1;
          const endIdx = Math.min(startIdx + paginatedCharacters.length - 1, sorted.length);

          resultsInfo.textContent = `Showing ${startIdx}-${endIdx} of ${sorted.length} characters (Page ${currentPage} of ${totalPgs})`;
        }
      }

      renderCharacterCards(paginatedCharacters, page, false, true);

      // Update pagination
      if (charactersPerPageSelect.value !== 'all' && sorted.length > charactersPerPage) {
        updateFilteredPagination(page, totalPages, sorted.length);
      } else {
        const paginationContainer = document.getElementById('character-pagination');
        if (paginationContainer) {
          paginationContainer.innerHTML = '';
        }
      }
    }

    // ------------------- Function: applyFiltersAndSort -------------------
    // Applies all filters and sorting to a character array
    function applyFiltersAndSort(characters) {
      const searchTerm = searchInput.value.toLowerCase();
      const jobFilter = jobSelect.value.toLowerCase();
      const raceFilter = raceSelect.value.toLowerCase();
      const villageFilter = villageSelect.value.toLowerCase();
      const sortBy = sortSelect.value;


      // Apply filters
      const filtered = characters.filter(c => {
        const matchesSearch = !searchTerm ||
          c.name?.toLowerCase().includes(searchTerm) ||
          c.race?.toLowerCase().includes(searchTerm) ||
          c.job?.toLowerCase().includes(searchTerm);

        const matchesJob = jobFilter === 'all' || c.job?.toLowerCase() === jobFilter;
        const matchesRace = raceFilter === 'all' || c.race?.toLowerCase() === raceFilter;
        const matchesVillage = villageFilter === 'all' || c.homeVillage?.toLowerCase() === villageFilter;
        return matchesSearch && matchesJob && matchesRace && matchesVillage;
      });

      // Apply sorting
      const [field, direction] = sortBy.split('-');
      const isAsc = direction === 'asc';

      return [...filtered].sort((a, b) => {
        const valA = a[field] ?? '';
        const valB = b[field] ?? '';
        return isAsc
          ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
          : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
      });
    }

      // ------------------- Function: updateFilteredPagination -------------------
      // Updates pagination for filtered results (matching blank.js structure)
      function updateFilteredPagination(currentPage, totalPages, totalItems) {
      const paginationContainer = document.getElementById('character-pagination');
      if (!paginationContainer) return;

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
        if (icon) {
          btn.innerHTML = `<i class="fas fa-chevron-${icon}"></i>`;
        } else {
          btn.textContent = label;
        }
        btn.title = `Page ${pageNum}`;
        btn.addEventListener('click', () => {
          if (pageNum < 1 || pageNum > totalPages) return;
          window.filterCharacters(pageNum);
        });
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

    // ------------------- Function: showPageJumpModal -------------------
    // Shows the page jump modal when ellipsis is clicked
    function showPageJumpModal(minPage, maxPage, totalPages) {
      // Remove existing modal if any
      const existingModal = document.getElementById('character-page-jump-modal');
      if (existingModal) {
        existingModal.remove();
      }

      const pageRange = minPage === maxPage ? `Page ${minPage}` : `Pages ${minPage}-${maxPage}`;
      
      const overlay = document.createElement('div');
      overlay.className = 'blank-page-jump-modal-overlay';
      overlay.id = 'character-page-jump-modal';
      
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
          <label class="blank-page-jump-modal-label" for="character-page-jump-input">
            Enter a page number (${pageRange}):
          </label>
          <input 
            type="number" 
            id="character-page-jump-input" 
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
          <div class="blank-page-jump-modal-error" id="character-page-jump-error"></div>
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
      
      const input = modal.querySelector('#character-page-jump-input');
      const errorMsg = modal.querySelector('#character-page-jump-error');
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
        window.filterCharacters(pageNum);
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

    // ------------------- Function: createNormalPagination -------------------
    // Creates pagination controls (for unfiltered results)
    function createNormalPagination(currentPage, totalPages, handlePageChange) {
      const paginationContainer = document.getElementById('character-pagination');
      if (!paginationContainer) return;

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
        if (icon) {
          btn.innerHTML = `<i class="fas fa-chevron-${icon}"></i>`;
        } else {
          btn.textContent = label;
        }
        btn.title = `Page ${pageNum}`;
        btn.addEventListener('click', () => {
          if (pageNum < 1 || pageNum > totalPages) return;
          handlePageChange(pageNum);
        });
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
    searchInput.addEventListener('input', () => window.filterCharacters(1));
    jobSelect.addEventListener('change', () => window.filterCharacters(1));
    raceSelect.addEventListener('change', () => window.filterCharacters(1));
    villageSelect.addEventListener('change', () => window.filterCharacters(1));
    sortSelect.addEventListener('change', () => window.filterCharacters(1));
    charactersPerPageSelect.addEventListener('change', () => window.filterCharacters(1));

  
    clearFiltersBtn.addEventListener('click', async () => {

      
      searchInput.value = '';
      jobSelect.value = 'all';
      raceSelect.value = 'all';
      villageSelect.value = 'all';
      sortSelect.value = 'name-asc';
      charactersPerPageSelect.value = '12';

      

      
      // Clear the saved filter state
      window.savedFilterState = {};
      
      // Reset the global character list to the original data
      try {
        // Use cached data if available and recent
        const now = Date.now();
        const cacheAge = window.cachedCharacterData ? (now - window.cachedCharacterData.timestamp) : Infinity;
        const isCacheValid = cacheAge < (5 * 60 * 1000); // 5 minutes

        let sortedCharacters;
        if (window.cachedCharacterData && isCacheValid) {
          sortedCharacters = window.cachedCharacterData.data;
        } else {
          // Fetch fresh data if cache is invalid
          const response = await fetch('/api/models/character?all=true');
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const { data: allCharacters } = await response.json();
          
          // Sort characters alphabetically by name
          sortedCharacters = [...allCharacters].sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
          });
          
          // Update cache
          window.cachedCharacterData = {
            data: sortedCharacters,
            timestamp: now
          };
        }
        
        // Update the global character list with all characters
        window.allCharacters = sortedCharacters;

        
        // Get the selected characters per page value
        const charactersPerPage = charactersPerPageSelect.value === 'all' ? sortedCharacters.length : parseInt(charactersPerPageSelect.value);
        
        // Apply pagination - show only first page of characters
        const paginatedCharacters = sortedCharacters.slice(0, charactersPerPage);
        
        // Render paginated characters
        renderCharacterCards(paginatedCharacters, 1, false, false);
        
        // Update results info
        const resultsInfo = document.querySelector('.model-results-info, .character-results-info');
        if (resultsInfo) {
          if (charactersPerPageSelect && charactersPerPageSelect.value === 'all') {
            resultsInfo.textContent = `Showing all ${sortedCharacters.length} characters`;
          } else {
            const charsPerPage = parseInt(charactersPerPage) || 12;
            const totalPgs = Math.ceil(sortedCharacters.length / charsPerPage);
            const startIdx = 1;
            const endIdx = Math.min(charsPerPage, sortedCharacters.length);
            resultsInfo.textContent = `Showing ${startIdx}-${endIdx} of ${sortedCharacters.length} characters (Page 1 of ${totalPgs})`;
          }
        }
        
        // Create pagination if needed
        if (charactersPerPageSelect.value !== 'all' && sortedCharacters.length > charactersPerPage) {
          const totalPages = Math.ceil(sortedCharacters.length / charactersPerPage);
          const paginationContainer = document.getElementById('character-pagination');
          if (paginationContainer) {
            const handlePageChange = async (pageNum) => {
              if (pageNum < 1 || pageNum > totalPages) return;
              
              const startIndex = (pageNum - 1) * charactersPerPage;
              const endIndex = startIndex + charactersPerPage;
              const pageCharacters = sortedCharacters.slice(startIndex, endIndex);
              
              renderCharacterCards(pageCharacters, pageNum, false, false);
              
              // Update results info
              if (resultsInfo) {
                const startIndex = (pageNum - 1) * charactersPerPage + 1;
                const endIndex = Math.min(startIndex + pageCharacters.length - 1, sortedCharacters.length);

                resultsInfo.textContent = `Showing ${startIndex}-${endIndex} of ${sortedCharacters.length} characters (Page ${pageNum} of ${totalPages})`;
              }
              
              // Update pagination
              paginationContainer.innerHTML = createNormalPagination(pageNum, totalPages, handlePageChange);
            };
            
            paginationContainer.innerHTML = createNormalPagination(1, totalPages, handlePageChange);
          }
        } else {
          // Clear pagination if not needed
          const paginationContainer = document.getElementById('character-pagination');
          if (paginationContainer) {
            paginationContainer.innerHTML = '';
          }
        }
        
      } catch (error) {
        console.error('❌ Error resetting character list:', error);
        // Fallback to just calling filterCharacters
        window.filterCharacters(1);
      }
    });
  
    window.characterFiltersInitialized = true;

    window.filterCharacters(1);
  }
  
  // ============================================================================
// ------------------- Page Initialization -------------------
// Sets up the filters and character grid on first load
// ============================================================================

// ------------------- Function: initializeCharacterPage -------------------
// Initializes the character page with filters, pagination, and card rendering
async function initializeCharacterPage(data, page = 1, contentDiv) {
    // Store characters globally for filtering
    window.allCharacters = data;
    

    // Apply mobile optimizations early
    const { isMobile, isTouch } = optimizeForMobile();

    // Create filters wrapper (like blank.js)
    let filtersWrapper = document.querySelector('.character-filters-wrapper');
    if (!filtersWrapper) {
        filtersWrapper = document.createElement('div');
        filtersWrapper.className = 'character-filters-wrapper blank-filters-wrapper';
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
    searchInput.id = 'character-search-input';
    searchInput.className = 'model-search-input blank-search-input';
    searchInput.placeholder = 'Search characters...';
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('aria-label', 'Search characters');
    
    searchBar.appendChild(searchIcon);
    searchBar.appendChild(searchInput);
    searchWrapper.appendChild(searchBar);
    filtersWrapper.appendChild(searchWrapper);

    // Create separate filter bar (like blank.js)
    const filterWrapper = document.createElement('div');
    filterWrapper.className = 'model-filter-wrapper blank-filter-wrapper';
    
    const filterBar = document.createElement('div');
    filterBar.className = 'model-filter-bar blank-filter-bar';

    // Job Filter
    const jobControl = document.createElement('div');
    jobControl.className = 'model-filter-control blank-filter-control';
    const jobLabel = document.createElement('label');
    jobLabel.className = 'model-filter-label blank-filter-label';
    jobLabel.innerHTML = '<i class="fas fa-briefcase"></i> Job';
    jobLabel.setAttribute('for', 'filter-job');
    const jobSelect = document.createElement('select');
    jobSelect.id = 'filter-job';
    jobSelect.className = 'model-filter-select blank-filter-select';
    jobSelect.innerHTML = '<option value="all">All Jobs</option>';
    jobControl.appendChild(jobLabel);
    jobControl.appendChild(jobSelect);
    filterBar.appendChild(jobControl);

    // Race Filter
    const raceControl = document.createElement('div');
    raceControl.className = 'model-filter-control blank-filter-control';
    const raceLabel = document.createElement('label');
    raceLabel.className = 'model-filter-label blank-filter-label';
    raceLabel.innerHTML = '<i class="fas fa-users"></i> Race';
    raceLabel.setAttribute('for', 'filter-race');
    const raceSelect = document.createElement('select');
    raceSelect.id = 'filter-race';
    raceSelect.className = 'model-filter-select blank-filter-select';
    raceSelect.innerHTML = '<option value="all">All Races</option>';
    raceControl.appendChild(raceLabel);
    raceControl.appendChild(raceSelect);
    filterBar.appendChild(raceControl);

    // Village Filter
    const villageControl = document.createElement('div');
    villageControl.className = 'model-filter-control blank-filter-control';
    const villageLabel = document.createElement('label');
    villageLabel.className = 'model-filter-label blank-filter-label';
    villageLabel.innerHTML = '<i class="fas fa-home"></i> Village';
    villageLabel.setAttribute('for', 'filter-village');
    const villageSelect = document.createElement('select');
    villageSelect.id = 'filter-village';
    villageSelect.className = 'model-filter-select blank-filter-select';
    villageSelect.innerHTML = '<option value="all">All Villages</option>';
    villageControl.appendChild(villageLabel);
    villageControl.appendChild(villageSelect);
    filterBar.appendChild(villageControl);

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
    `;
    sortControl.appendChild(sortLabel);
    sortControl.appendChild(sortSelect);
    filterBar.appendChild(sortControl);

    // Characters Per Page
    const perPageControl = document.createElement('div');
    perPageControl.className = 'model-filter-control blank-filter-control';
    const perPageLabel = document.createElement('label');
    perPageLabel.className = 'model-filter-label blank-filter-label';
    perPageLabel.innerHTML = '<i class="fas fa-list"></i> Per Page';
    perPageLabel.setAttribute('for', 'characters-per-page');
    const perPageSelect = document.createElement('select');
    perPageSelect.id = 'characters-per-page';
    perPageSelect.className = 'model-filter-select blank-filter-select';
    perPageSelect.innerHTML = `
      <option value="6">6 per page</option>
      <option value="12" selected>12 per page</option>
      <option value="24">24 per page</option>
      <option value="36">36 per page</option>
      <option value="48">48 per page</option>
      <option value="all">All characters</option>
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

    // Create character container if it doesn't exist
    let container = document.getElementById('characters-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'characters-container';
        container.className = 'characters-grid';
        
        // Add mobile-specific classes
        if (isMobile) {
            container.classList.add('mobile-characters-grid');
        }
        if (isTouch) {
            container.classList.add('touch-characters-grid');
        }
        
        contentDiv.appendChild(container);
    }

    // Add results info section using new styling
    let resultsInfo = document.querySelector('.character-results-info');
    if (!resultsInfo) {
        resultsInfo = document.createElement('div');
        resultsInfo.className = 'model-results-info';
        resultsInfo.textContent = 'Loading characters...';
        contentDiv.insertBefore(resultsInfo, container);
    }

    // Create pagination container if it doesn't exist using new styling
    let paginationContainer = document.getElementById('character-pagination');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'character-pagination';
        paginationContainer.className = 'model-pagination blank-pagination';
        
        // Add mobile-specific classes
        if (isMobile) {
            paginationContainer.classList.add('mobile-pagination');
        }
        
        contentDiv.appendChild(paginationContainer);
    } else {
        // Ensure it has the right classes
        if (!paginationContainer.classList.contains('model-pagination')) {
            paginationContainer.classList.add('model-pagination', 'blank-pagination');
        }
    }

    // Setup mobile orientation change handler
    handleMobileOrientationChange();

    // Show initial loading state using new loading overlay
    container.innerHTML = `
        <div class="model-loading-overlay">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading characters...</p>
        </div>
    `;

    // Only initialize filters if they haven't been initialized yet
    if (!window.characterFiltersInitialized) {
        await setupCharacterFilters(data);
    } else {
        // If filters are already initialized, just update the character display
        renderCharacterCards(data, page, false, false);
    }

    // Don't override results info here - let the filtering functions handle it
    // The results info will be updated by filterCharacters or renderCharacterCards
}
  
// ============================================================================
// ------------------- Performance Monitoring -------------------
// Tracks loading times and performance metrics
// ============================================================================

// ------------------- Function: trackPerformance -------------------
// Tracks performance metrics for character loading
function trackPerformance(operation, startTime) {
  const duration = Date.now() - startTime;
  console.log(`⏱️ Performance: ${operation} took ${duration}ms`);
  
  // Store performance data for analytics
  if (!window.performanceMetrics) {
    window.performanceMetrics = {};
  }
  
  if (!window.performanceMetrics[operation]) {
    window.performanceMetrics[operation] = [];
  }
  
  window.performanceMetrics[operation].push(duration);
  
  // Keep only last 10 measurements
  if (window.performanceMetrics[operation].length > 10) {
    window.performanceMetrics[operation].shift();
  }
  
  // Log average performance
  const avg = window.performanceMetrics[operation].reduce((a, b) => a + b, 0) / window.performanceMetrics[operation].length;
  console.log(`📊 Average ${operation}: ${Math.round(avg)}ms`);
  
  return duration;
}

// ------------------- Function: getPerformanceSummary -------------------
// Returns a summary of performance metrics
function getPerformanceSummary() {
  if (!window.performanceMetrics) {
    return 'No performance data available';
  }
  
  const summary = {};
  Object.keys(window.performanceMetrics).forEach(operation => {
    const measurements = window.performanceMetrics[operation];
    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);
    
    summary[operation] = {
      average: Math.round(avg),
      min,
      max,
      count: measurements.length
    };
  });
  
  return summary;
}

// ============================================================================
// ------------------- Exports -------------------
// Public API for character rendering module
// ============================================================================
export {
    renderCharacterCards,
    populateFilterOptions,
    setupCharacterFilters,
    initializeCharacterPage,
    // Mobile-friendly utilities
    isMobileDevice,
    isTouchDevice,
    optimizeForMobile,
    setupMobileEventHandlers,
    handleMobileOrientationChange,
    createMobileFriendlyModal,
    closeModal,
    // Performance monitoring
    trackPerformance,
    getPerformanceSummary
  };
  
  