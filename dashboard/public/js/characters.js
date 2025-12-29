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
      grid.innerHTML = '<div class="character-loading">No characters found</div>';
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
                ${renderDetail('Weapon', character.gearWeapon?.name ? `${character.gearWeapon.name} | ${getGearStat(character.gearWeapon, 'modifierHearts')}` : 'None')}
                ${renderDetail('Shield', character.gearShield?.name ? `${character.gearShield.name} | ${getGearStat(character.gearShield, 'modifierHearts')}` : 'None')}
                ${renderDetail('Head', character.gearArmor?.head?.name ? `${character.gearArmor.head.name} | ${getGearStat(character.gearArmor.head, 'modifierHearts')}` : 'None')}
                ${renderDetail('Chest', character.gearArmor?.chest?.name ? `${character.gearArmor.chest.name} | ${getGearStat(character.gearArmor.chest, 'modifierHearts')}` : 'None')}
                ${renderDetail('Legs', character.gearArmor?.legs?.name ? `${character.gearArmor.legs.name} | ${getGearStat(character.gearArmor.legs, 'modifierHearts')}` : 'None')}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  
    // ------------------- Attach Modal Handlers -------------------
    if (enableModals) {
      const characterCards = grid.querySelectorAll('.character-card');
      characterCards.forEach(card => {
        card.addEventListener('click', () => {
          const name = card.getAttribute('data-character');
          const character = window.allCharacters.find(c => c.name === name);
          if (!character) return;
    
          const modal = createMobileFriendlyModal(character);
          document.body.appendChild(modal);
    
          const closeBtn = modal.querySelector('.close-modal');
          closeBtn?.addEventListener('click', () => closeModal(modal));
    
          modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
          });
    
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal(modal);
          }, { once: true });
        });
      });
      } else {
    }

    // Setup mobile event handlers after rendering
    setupMobileEventHandlers();

    // Update results info - only if we're not in a filtered state and not called from filtering
    const resultsInfo = document.querySelector('.character-results-info p');
    if (resultsInfo && !window.filteredCharacters && !isFromFiltering) {
      const totalPages = Math.ceil(characters.length / charactersPerPage);
      resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${characters.length} characters (Page ${page} of ${totalPages})`;
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
  // Returns a stat string with + prefix if positive
  function getGearStat(gear, statName) {
    if (!gear || !gear[statName]) return '';
    const value = gear[statName];
    return value > 0 ? `+${value}` : value;
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
              <div class="character-modal-item"><span class="label">Weapon:</span><span class="value">${character.gearWeapon?.name ? `${character.gearWeapon.name} | ${getGearStat(character.gearWeapon, 'modifierHearts')}` : 'None'}</span></div>
              <div class="character-modal-item"><span class="label">Shield:</span><span class="value">${character.gearShield?.name ? `${character.gearShield.name} | ${getGearStat(character.gearShield, 'modifierHearts')}` : 'None'}</span></div>
              <div class="character-modal-item"><span class="label">Head:</span><span class="value">${character.gearArmor?.head?.name ? `${character.gearArmor.head.name} | ${getGearStat(character.gearArmor.head, 'modifierHearts')}` : 'None'}</span></div>
              <div class="character-modal-item"><span class="label">Chest:</span><span class="value">${character.gearArmor?.chest?.name ? `${character.gearArmor.chest.name} | ${getGearStat(character.gearArmor.chest, 'modifierHearts')}` : 'None'}</span></div>
              <div class="character-modal-item"><span class="label">Legs:</span><span class="value">${character.gearArmor?.legs?.name ? `${character.gearArmor.legs.name} | ${getGearStat(character.gearArmor.legs, 'modifierHearts')}` : 'None'}</span></div>
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
    const filtersContainer = document.querySelector('.character-filters');
    if (filtersContainer) {
        filtersContainer.style.display = 'flex';
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
      const resultsInfo = document.querySelector('.character-results-info p');
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
          if (charactersPerPageSelect.value === 'all') {
            resultsInfo.textContent = `Showing all ${filteredAndSorted.length} filtered characters`;
          } else {
            const startIndex = (page - 1) * charactersPerPage + 1;
            const endIndex = Math.min(startIndex + paginatedCharacters.length - 1, filteredAndSorted.length);

            resultsInfo.textContent = `Showing ${startIndex}-${endIndex} of ${filteredAndSorted.length} characters (Page ${page} of ${totalPages})`;
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

      const resultsInfo = document.querySelector('.character-results-info p');
      if (resultsInfo) {
        if (charactersPerPageSelect.value === 'all') {
          resultsInfo.textContent = `Showing all ${sorted.length} of ${window.allCharacters.length} characters`;
        } else {
          const startIndex = (page - 1) * charactersPerPage + 1;
          const endIndex = Math.min(startIndex + paginatedCharacters.length - 1, sorted.length);

          resultsInfo.textContent = `Showing ${startIndex}-${endIndex} of ${sorted.length} characters (Page ${page} of ${totalPages})`;
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
    // Updates pagination for filtered results
    function updateFilteredPagination(currentPage, totalPages, totalItems) {
      const paginationContainer = document.getElementById('character-pagination');
      if (!paginationContainer) return;

      // Remove any existing pagination
      paginationContainer.innerHTML = '';

      if (totalPages <= 1) return;

      // Create pagination bar
      const paginationDiv = document.createElement('div');
      paginationDiv.className = 'pagination';

      // Helper to create a button
      const makeButton = (label, pageNum, isActive = false, isDisabled = false) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-button' + (isActive ? ' active' : '');
        btn.textContent = label;
        if (isDisabled) btn.disabled = true;
        btn.addEventListener('click', () => {
          if (pageNum < 1 || pageNum > totalPages) return;
          window.filterCharacters(pageNum);
        });
        return btn;
      };

      // Previous button
      if (currentPage > 1) {
        paginationDiv.appendChild(makeButton('<', currentPage - 1));
      }

      // Page numbers (show up to 5, with ellipsis if needed)
      const maxVisiblePages = 5;
      let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }
      if (startPage > 1) {
        paginationDiv.appendChild(makeButton('1', 1));
        if (startPage > 2) {
          const ell = document.createElement('span');
          ell.className = 'pagination-ellipsis';
          ell.textContent = '...';
          paginationDiv.appendChild(ell);
        }
      }
      for (let i = startPage; i <= endPage; i++) {
        paginationDiv.appendChild(makeButton(i.toString(), i, i === currentPage));
      }
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          const ell = document.createElement('span');
          ell.className = 'pagination-ellipsis';
          ell.textContent = '...';
          paginationDiv.appendChild(ell);
        }
        paginationDiv.appendChild(makeButton(totalPages.toString(), totalPages));
      }

      // Next button
      if (currentPage < totalPages) {
        paginationDiv.appendChild(makeButton('>', currentPage + 1));
      }

      paginationContainer.appendChild(paginationDiv);
    }

    // ------------------- Function: createNormalPagination -------------------
    // Creates pagination controls (for unfiltered results)
    function createNormalPagination(currentPage, totalPages, handlePageChange) {
      const paginationContainer = document.getElementById('character-pagination');
      if (!paginationContainer) return;

      // Remove any existing pagination
      paginationContainer.innerHTML = '';

      if (totalPages <= 1) return;

      // Create pagination bar
      const paginationDiv = document.createElement('div');
      paginationDiv.className = 'pagination';

      // Helper to create a button
      const makeButton = (label, pageNum, isActive = false, isDisabled = false) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-button' + (isActive ? ' active' : '');
        btn.textContent = label;
        if (isDisabled) btn.disabled = true;
        btn.addEventListener('click', () => {
          if (pageNum < 1 || pageNum > totalPages) return;
          handlePageChange(pageNum);
        });
        return btn;
      };

      // Previous button
      if (currentPage > 1) {
        paginationDiv.appendChild(makeButton('<', currentPage - 1));
      }

      // Page numbers (show up to 5, with ellipsis if needed)
      const maxVisiblePages = 5;
      let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }
      if (startPage > 1) {
        paginationContainer.appendChild(makeButton('1', 1));
        if (startPage > 2) {
          const ell = document.createElement('span');
          ell.className = 'pagination-ellipsis';
          ell.textContent = '...';
          paginationDiv.appendChild(ell);
        }
      }
      for (let i = startPage; i <= endPage; i++) {
        paginationDiv.appendChild(makeButton(i.toString(), i, i === currentPage));
      }
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          const ell = document.createElement('span');
          ell.className = 'pagination-ellipsis';
          ell.textContent = '...';
          paginationDiv.appendChild(ell);
        }
        paginationDiv.appendChild(makeButton(totalPages.toString(), totalPages));
      }

      // Next button
      if (currentPage < totalPages) {
        paginationDiv.appendChild(makeButton('>', currentPage + 1));
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
        const resultsInfo = document.querySelector('.character-results-info p');
        if (resultsInfo) {
          if (charactersPerPageSelect.value === 'all') {
            resultsInfo.textContent = `Showing all ${sortedCharacters.length} characters`;
          } else {
            const totalPages = Math.ceil(sortedCharacters.length / charactersPerPage);
            const startIndex = 1;
            const endIndex = Math.min(charactersPerPage, sortedCharacters.length);
            resultsInfo.textContent = `Showing ${startIndex}-${endIndex} of ${sortedCharacters.length} characters (Page 1 of ${totalPages})`;
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

    // Create or refresh the standard filter bar
    let filtersContainer = document.querySelector('.character-filters');
    if (!filtersContainer) {
        filtersContainer = document.createElement('div');
        filtersContainer.className = 'character-filters';
    }
    filtersContainer.innerHTML = '';

    const { bar: characterFilterBar } = createSearchFilterBar({
        layout: 'wide',
        filters: [
            {
                type: 'input',
                id: 'character-search-input',
                placeholder: 'Search characters...',
                attributes: { autocomplete: 'off' },
                width: 'double'
            },
            {
                type: 'select',
                id: 'filter-job',
                options: [{ value: 'all', label: 'All Jobs' }]
            },
            {
                type: 'select',
                id: 'filter-race',
                options: [{ value: 'all', label: 'All Races' }]
            },
            {
                type: 'select',
                id: 'filter-village',
                options: [{ value: 'all', label: 'All Villages' }]
            },
            {
                type: 'select',
                id: 'sort-by',
                options: [
                    { value: 'name-asc', label: 'Name (A-Z)', selected: true },
                    { value: 'name-desc', label: 'Name (Z-A)' },
                    { value: 'level-desc', label: 'Level (High-Low)' },
                    { value: 'level-asc', label: 'Level (Low-High)' }
                ]
            },
            {
                type: 'select',
                id: 'characters-per-page',
                options: [
                    { value: '6', label: '6 per page' },
                    { value: '12', label: '12 per page', selected: true },
                    { value: '24', label: '24 per page' },
                    { value: '36', label: '36 per page' },
                    { value: '48', label: '48 per page' },
                    { value: 'all', label: 'All characters' }
                ]
            }
        ],
        buttons: [
            {
                id: 'clear-filters',
                label: 'Clear Filters',
                className: 'clear-filters-btn'
            }
        ]
    });

    filtersContainer.appendChild(characterFilterBar);
    contentDiv.insertBefore(filtersContainer, contentDiv.firstChild);
    filtersContainer.style.display = 'flex';

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

    // Add results info section
    let resultsInfo = document.querySelector('.character-results-info');
    if (!resultsInfo) {
        resultsInfo = document.createElement('div');
        resultsInfo.className = 'character-results-info';
        resultsInfo.innerHTML = '<p>Loading characters...</p>';
        contentDiv.insertBefore(resultsInfo, container);
    }

    // Create pagination container if it doesn't exist
    let paginationContainer = document.getElementById('character-pagination');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'character-pagination';
        
        // Add mobile-specific classes
        if (isMobile) {
            paginationContainer.classList.add('mobile-pagination');
        }
        
        contentDiv.appendChild(paginationContainer);
    }

    // Setup mobile orientation change handler
    handleMobileOrientationChange();

    // Show initial loading state
    container.innerHTML = `
        <div class="character-loading">
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
  
  