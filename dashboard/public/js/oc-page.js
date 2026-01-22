/* ============================================================================
   oc-page.js
   Purpose: Handles OC page functionality - loading character, displaying info, editing, and resubmission
============================================================================ */

// ============================================================================
// ------------------- Global Variables -------------------
// ============================================================================
let character = null;
let races = [];
let allJobs = [];
let villageJobsMap = {};
let starterGear = {
  weapons: [],
  shields: [],
  armor: {
    head: [],
    chest: [],
    legs: []
  }
};
let isEditMode = false;

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
    // Get character name from URL
    const pathParts = window.location.pathname.split('/');
    const nameSlug = pathParts[pathParts.length - 1];
    
    if (!nameSlug || nameSlug === 'ocs') {
      showError('Invalid character URL');
      return;
    }
    
    // Load character data
    await loadCharacter(nameSlug);
    
    // Load form data (races, jobs, gear) if needed for editing
    await loadFormData();
    
    // Setup event listeners
    setupEventListeners();
    
  } catch (error) {
    console.error('Error initializing page:', error);
    showError(error.message || 'Failed to load character');
  }
}

// ============================================================================
// ------------------- Character Loading -------------------
// ============================================================================
async function loadCharacter(nameSlug) {
  try {
    showLoading();
    
    // Check if page is being served correctly (not via file://)
    if (window.location.protocol === 'file:') {
      throw new Error('This page must be accessed through the web server. Please use http://localhost:5001/ocs/[character-name] instead of opening the HTML file directly.');
    }
    
    const response = await fetch(`/api/characters/by-name/${encodeURIComponent(nameSlug)}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Character not found or you do not have permission to view it');
      }
      if (response.status === 401) {
        throw new Error('Please log in to view this character');
      }
      const data = await response.json();
      throw new Error(data.error || 'Failed to load character');
    }
    
    character = await response.json();
    
    // Display character
    await displayCharacter();
    
  } catch (error) {
    console.error('Error loading character:', error);
    
    // Provide helpful error messages for network errors
    let errorMessage = error.message || 'Failed to load character';
    
    // Check for network/connection errors
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      errorMessage = 'Unable to connect to the server. Please make sure the dashboard server is running on port 5001.';
    } else if (error.name === 'NetworkError' || error.message.includes('ERR_CONNECTION_REFUSED')) {
      errorMessage = 'Connection refused. Please make sure the dashboard server is running on port 5001.';
    }
    
    showError(errorMessage);
  }
}

// ============================================================================
// ------------------- Character Display -------------------
// ============================================================================
async function displayCharacter() {
  hideLoading();
  
  // Update breadcrumb
  document.getElementById('breadcrumb').textContent = character.name;
  
  // Display character icon
  const iconImg = document.getElementById('character-icon');
  iconImg.src = character.icon || '/images/ankleicon.png';
  iconImg.alt = `${character.name}'s icon`;
  
  // Display character name
  document.getElementById('character-name').textContent = character.name;
  
  // Display character meta
  document.getElementById('character-pronouns').textContent = character.pronouns || 'N/A';
  document.getElementById('character-age').textContent = character.age ? `${character.age} years old` : 'N/A';
  document.getElementById('character-height').textContent = character.height ? `${character.height} cm` : 'N/A';
  
  // Display character details
  document.getElementById('character-race').textContent = character.race ? character.race.charAt(0).toUpperCase() + character.race.slice(1) : 'N/A';
  document.getElementById('character-village').textContent = character.homeVillage ? character.homeVillage.charAt(0).toUpperCase() + character.homeVillage.slice(1) : 'N/A';
  document.getElementById('character-job').textContent = character.job ? character.job : 'N/A';
  
  // Display stats
  document.getElementById('stat-hearts').textContent = `${character.currentHearts || 0}/${character.maxHearts || 0}`;
  document.getElementById('stat-stamina').textContent = `${character.currentStamina || 0}/${character.maxStamina || 0}`;
  document.getElementById('stat-attack').textContent = character.attack || 0;
  document.getElementById('stat-defense').textContent = character.defense || 0;
  
  // Display spirit orbs if available
  if (character.spiritOrbs !== undefined && character.spiritOrbs !== null) {
    document.getElementById('stat-spirit-orbs').textContent = character.spiritOrbs;
    document.getElementById('stat-spirit-orbs-card').style.display = 'flex';
  }
  
  // Display current location if different from home
  if (character.currentVillage && character.currentVillage !== character.homeVillage) {
    const currentLocationText = document.getElementById('current-location-text');
    const currentLocationSection = document.getElementById('current-location-section');
    currentLocationText.textContent = `Currently in ${character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1)}`;
    currentLocationSection.style.display = 'block';
  }
  
  // Display birthday if available
  if (character.birthday && character.birthday.trim() !== '') {
    const birthdayText = document.getElementById('birthday-text');
    const birthdaySection = document.getElementById('birthday-section');
    birthdayText.textContent = character.birthday;
    birthdaySection.style.display = 'block';
  }
  
  // Display gear
  await displayGear(character);
  
  // Display links
  displayLinks(character);
  
  // Display additional stats
  await displayAdditionalStats(character);
  
  // Display travel log
  displayTravelLog(character);
  
  // Display help wanted info
  displayHelpWanted(character);
  
  // Display status badge
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  statusBadge.className = 'status-badge';
  
  switch (character.status) {
    case 'pending':
      statusBadge.classList.add('status-pending');
      statusText.textContent = 'Pending Review';
      break;
    case 'accepted':
      statusBadge.classList.add('status-accepted');
      statusText.textContent = 'Accepted';
      break;
    case 'denied':
      statusBadge.classList.add('status-denied');
      statusText.textContent = 'Denied';
      break;
    default:
      statusBadge.classList.add('status-pending');
      statusText.textContent = 'Unknown';
  }
  
  // Display denial reason if denied
  if (character.status === 'denied' && character.denialReason) {
    const denialContainer = document.getElementById('denial-reason-container');
    const denialText = document.getElementById('denial-reason-text');
    denialText.textContent = character.denialReason;
    denialContainer.style.display = 'block';
  } else {
    document.getElementById('denial-reason-container').style.display = 'none';
  }
  
  // Show/hide edit button based on status and ownership
  const actionButtons = document.getElementById('action-buttons');
  const isOwner = character.isOwner !== false; // Default to true if not specified (for backwards compatibility)
  
  if (isOwner && (character.status === 'denied' || character.status === 'accepted')) {
    actionButtons.style.display = 'block';
  } else {
    actionButtons.style.display = 'none';
  }
  
  // Show character display
  document.getElementById('character-display').style.display = 'block';
}

// ============================================================================
// ------------------- Gear Display -------------------
// ============================================================================
async function displayGear(character) {
  let hasGear = false;
  
  // Helper function to fetch and set item icon
  async function setGearIcon(gearName, iconElementId) {
    if (!gearName) return;
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(gearName)}`);
      if (response.ok) {
        const item = await response.json();
        if (item.image) {
          const iconElement = document.getElementById(iconElementId);
          if (iconElement) {
            iconElement.innerHTML = `<img src="${item.image}" alt="${gearName}" class="gear-item-icon" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-sword\\'></i>';">`;
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching icon for ${gearName}:`, error);
    }
  }
  
  // Weapon
  if (character.gearWeapon?.name) {
    const weaponCard = document.getElementById('gear-weapon');
    document.getElementById('gear-weapon-name').textContent = character.gearWeapon.name;
    const weaponStats = [];
    if (character.gearWeapon.stats?.modifierHearts) {
      weaponStats.push(`+${character.gearWeapon.stats.modifierHearts} Hearts`);
    }
    if (character.gearWeapon.stats?.staminaToCraft) {
      weaponStats.push(`${character.gearWeapon.stats.staminaToCraft} Stamina`);
    }
    document.getElementById('gear-weapon-stats').textContent = weaponStats.join(' • ') || 'No stats';
    await setGearIcon(character.gearWeapon.name, 'gear-weapon-icon');
    weaponCard.style.display = 'flex';
    hasGear = true;
  }
  
  // Shield
  if (character.gearShield?.name) {
    const shieldCard = document.getElementById('gear-shield');
    document.getElementById('gear-shield-name').textContent = character.gearShield.name;
    const shieldStats = [];
    if (character.gearShield.stats?.modifierHearts) {
      shieldStats.push(`+${character.gearShield.stats.modifierHearts} Hearts`);
    }
    document.getElementById('gear-shield-stats').textContent = shieldStats.join(' • ') || 'No stats';
    await setGearIcon(character.gearShield.name, 'gear-shield-icon');
    shieldCard.style.display = 'flex';
    hasGear = true;
  }
  
  // Head Armor
  if (character.gearArmor?.head?.name) {
    const headCard = document.getElementById('gear-armor-head');
    document.getElementById('gear-armor-head-name').textContent = character.gearArmor.head.name;
    const headStats = [];
    if (character.gearArmor.head.stats?.modifierHearts) {
      headStats.push(`+${character.gearArmor.head.stats.modifierHearts} Hearts`);
    }
    document.getElementById('gear-armor-head-stats').textContent = headStats.join(' • ') || 'No stats';
    await setGearIcon(character.gearArmor.head.name, 'gear-armor-head-icon');
    headCard.style.display = 'flex';
    hasGear = true;
  }
  
  // Chest Armor
  if (character.gearArmor?.chest?.name) {
    const chestCard = document.getElementById('gear-armor-chest');
    document.getElementById('gear-armor-chest-name').textContent = character.gearArmor.chest.name;
    const chestStats = [];
    if (character.gearArmor.chest.stats?.modifierHearts) {
      chestStats.push(`+${character.gearArmor.chest.stats.modifierHearts} Hearts`);
    }
    document.getElementById('gear-armor-chest-stats').textContent = chestStats.join(' • ') || 'No stats';
    await setGearIcon(character.gearArmor.chest.name, 'gear-armor-chest-icon');
    chestCard.style.display = 'flex';
    hasGear = true;
  }
  
  // Leg Armor
  if (character.gearArmor?.legs?.name) {
    const legsCard = document.getElementById('gear-armor-legs');
    document.getElementById('gear-armor-legs-name').textContent = character.gearArmor.legs.name;
    const legsStats = [];
    if (character.gearArmor.legs.stats?.modifierHearts) {
      legsStats.push(`+${character.gearArmor.legs.stats.modifierHearts} Hearts`);
    }
    document.getElementById('gear-armor-legs-stats').textContent = legsStats.join(' • ') || 'No stats';
    await setGearIcon(character.gearArmor.legs.name, 'gear-armor-legs-icon');
    legsCard.style.display = 'flex';
    hasGear = true;
  }
  
  // Show empty message if no gear
  if (!hasGear) {
    document.getElementById('gear-empty').style.display = 'block';
  }
}

// ============================================================================
// ------------------- Links Display -------------------
// ============================================================================
function displayLinks(character) {
  // Application link
  if (character.appLink && character.appLink.trim() !== '') {
    const appLink = document.getElementById('app-link');
    appLink.href = character.appLink;
    appLink.style.display = 'flex';
  }
  
  // Inventory link
  if (character.inventory && character.inventory.trim() !== '') {
    const inventoryLink = document.getElementById('inventory-link');
    inventoryLink.href = character.inventory;
    inventoryLink.style.display = 'flex';
  }
}

// ============================================================================
// ------------------- Additional Stats Display -------------------
// ============================================================================
async function displayAdditionalStats(character) {
  const statsGrid = document.getElementById('additional-stats-grid');
  const section = document.getElementById('additional-stats-section');
  statsGrid.innerHTML = '';
  
  // Organize stats into categories
  const statsByCategory = {
    economy: [],
    status: [],
    combat: [],
    activities: [],
    other: []
  };
  
  const additionalStats = [];
  
  // Vending points (show even if 0)
  if (character.vendingPoints !== undefined && character.vendingPoints !== null) {
    additionalStats.push({
      label: 'Vending Points',
      value: character.vendingPoints,
      icon: 'fa-coins',
      category: 'economy'
    });
  }
  
  // Vendor type
  if (character.vendorType && character.vendorType.trim() !== '') {
    additionalStats.push({
      label: 'Vendor Type',
      value: character.vendorType,
      icon: 'fa-store',
      category: 'economy'
    });
  }
  
  // Shop pouch
  if (character.shopPouch && character.shopPouch.trim() !== '') {
    additionalStats.push({
      label: 'Shop Pouch',
      value: character.shopPouch,
      icon: 'fa-shopping-bag',
      category: 'economy'
    });
  }
  
  // Pouch size (show even if 0)
  if (character.pouchSize !== undefined && character.pouchSize !== null) {
    additionalStats.push({
      label: 'Pouch Size',
      value: character.pouchSize,
      icon: 'fa-bag',
      category: 'economy'
    });
  }
  
  // Shop link
  if (character.shopLink && character.shopLink.trim() !== '') {
    additionalStats.push({
      label: 'Shop Link',
      value: character.shopLink,
      icon: 'fa-link',
      isLink: true,
      category: 'economy'
    });
  }
  
  // Job date changed
  if (character.jobDateChanged) {
    const date = new Date(character.jobDateChanged);
    additionalStats.push({
      label: 'Job Changed',
      value: date.toLocaleDateString(),
      icon: 'fa-calendar-alt',
      category: 'activities'
    });
  }
  
  // Job voucher
  if (character.jobVoucher) {
    additionalStats.push({
      label: 'Job Voucher',
      value: character.jobVoucherJob || 'Active',
      icon: 'fa-ticket-alt',
      category: 'activities'
    });
  }
  
  // Last stamina usage
  if (character.lastStaminaUsage) {
    const date = new Date(character.lastStaminaUsage);
    additionalStats.push({
      label: 'Last Stamina Use',
      value: date.toLocaleString(),
      icon: 'fa-clock',
      category: 'activities'
    });
  }
  
  // Last special weather gather
  if (character.lastSpecialWeatherGather) {
    const date = new Date(character.lastSpecialWeatherGather);
    additionalStats.push({
      label: 'Last Weather Gather',
      value: date.toLocaleString(),
      icon: 'fa-cloud-sun',
      category: 'activities'
    });
  }
  
  // Blighted status and details
  if (character.blighted) {
    additionalStats.push({
      label: 'Blighted',
      value: 'Yes',
      icon: 'fa-skull',
      warning: true,
      category: 'status'
    });
    
    if (character.blightStage && character.blightStage > 0) {
      additionalStats.push({
        label: 'Blight Stage',
        value: character.blightStage,
        icon: 'fa-exclamation-triangle',
        warning: true,
        category: 'status'
      });
    }
    
    if (character.blightedAt) {
      const date = new Date(character.blightedAt);
      additionalStats.push({
        label: 'Blighted Since',
        value: date.toLocaleDateString(),
        icon: 'fa-calendar-times',
        warning: true,
        category: 'status'
      });
    }
    
    if (character.deathDeadline) {
      const date = new Date(character.deathDeadline);
      additionalStats.push({
        label: 'Death Deadline',
        value: date.toLocaleString(),
        icon: 'fa-hourglass-end',
        warning: true,
        category: 'status'
      });
    }
    
    if (character.blightPaused) {
      additionalStats.push({
        label: 'Blight Paused',
        value: character.blightPauseInfo?.reason || 'Yes',
        icon: 'fa-pause-circle',
        category: 'status'
      });
    }
  }
  
  // Blight effects
  if (character.blightEffects) {
    const effects = [];
    if (character.blightEffects.rollMultiplier && character.blightEffects.rollMultiplier !== 1) {
      effects.push(`Roll x${character.blightEffects.rollMultiplier}`);
    }
    if (character.blightEffects.noMonsters) effects.push('No Monsters');
    if (character.blightEffects.noGathering) effects.push('No Gathering');
    if (effects.length > 0) {
      additionalStats.push({
        label: 'Blight Effects',
        value: effects.join(', '),
        icon: 'fa-vial',
        warning: true,
        category: 'status'
      });
    }
  }
  
  // In jail and details
  if (character.inJail) {
    additionalStats.push({
      label: 'In Jail',
      value: character.jailReleaseTime ? new Date(character.jailReleaseTime).toLocaleString() : 'Yes',
      icon: 'fa-lock',
      warning: true,
      category: 'status'
    });
    
    if (character.jailStartTime) {
      const date = new Date(character.jailStartTime);
      additionalStats.push({
        label: 'Jail Start',
        value: date.toLocaleString(),
        icon: 'fa-calendar-check',
        warning: true,
        category: 'status'
      });
    }
    
    if (character.jailDurationMs) {
      const hours = Math.floor(character.jailDurationMs / (1000 * 60 * 60));
      additionalStats.push({
        label: 'Jail Duration',
        value: `${hours} hours`,
        icon: 'fa-hourglass',
        warning: true,
        category: 'status'
      });
    }
    
    if (character.jailBoostSource) {
      additionalStats.push({
        label: 'Jail Boost',
        value: character.jailBoostSource,
        icon: 'fa-rocket',
        category: 'combat'
      });
    }
  }
  
  // KO status
  if (character.ko) {
    additionalStats.push({
      label: 'KO Status',
      value: 'Knocked Out',
      icon: 'fa-heartbeat',
      warning: true,
      category: 'combat'
    });
  }
  
  // Can be stolen from
  if (character.canBeStolenFrom !== undefined) {
    additionalStats.push({
      label: 'Steal Protection',
      value: character.canBeStolenFrom ? 'Vulnerable' : 'Protected',
      icon: character.canBeStolenFrom ? 'fa-unlock' : 'fa-shield-alt',
      category: 'combat'
    });
  }
  
  // Steal protection details
  if (character.stealProtection) {
    if (character.stealProtection.isProtected) {
      const endTime = character.stealProtection.protectionEndTime 
        ? new Date(character.stealProtection.protectionEndTime).toLocaleString()
        : 'Active';
      additionalStats.push({
        label: 'Protection Until',
        value: endTime,
        icon: 'fa-shield-alt',
        category: 'combat'
      });
    }
  }
  
  // Failed steal attempts
  if (character.failedStealAttempts && character.failedStealAttempts > 0) {
    additionalStats.push({
      label: 'Failed Steals',
      value: character.failedStealAttempts,
      icon: 'fa-hand-paper',
      category: 'combat'
    });
  }
  
  // Failed flee attempts
  if (character.failedFleeAttempts && character.failedFleeAttempts > 0) {
    additionalStats.push({
      label: 'Failed Flees',
      value: character.failedFleeAttempts,
      icon: 'fa-running',
      category: 'combat'
    });
  }
  
  // Buff information
  if (character.buff && character.buff.active) {
    const buffEffects = [];
    if (character.buff.effects) {
      Object.entries(character.buff.effects).forEach(([key, value]) => {
        if (value && value > 0) {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          buffEffects.push(`${label}: +${value}`);
        }
      });
    }
    if (buffEffects.length > 0) {
      additionalStats.push({
        label: 'Active Buff',
        value: character.buff.type || buffEffects.join(', '),
        icon: 'fa-arrow-up',
        positive: true,
        category: 'combat'
      });
    }
  }
  
  // Debuff information
  if (character.debuff && character.debuff.active) {
    const endTime = character.debuff.endDate 
      ? new Date(character.debuff.endDate).toLocaleString()
      : 'Active';
    additionalStats.push({
      label: 'Active Debuff',
      value: `Until ${endTime}`,
      icon: 'fa-arrow-down',
      warning: true,
      category: 'combat'
    });
  }
  
  // Special weather usage
  if (character.specialWeatherUsage && Object.keys(character.specialWeatherUsage).length > 0) {
    const weatherEntries = Object.entries(character.specialWeatherUsage).map(([village, date]) => {
      const d = new Date(date);
      return `${village}: ${d.toLocaleDateString()}`;
    });
    additionalStats.push({
      label: 'Weather Usage',
      value: weatherEntries.join('; '),
      icon: 'fa-cloud-sun-rain',
      category: 'activities'
    });
  }
  
  // Daily roll cooldowns
  if (character.dailyRoll) {
    const rollEntries = Object.entries(character.dailyRoll).map(([type, date]) => {
      const d = new Date(date);
      const now = new Date();
      const hoursAgo = Math.floor((now - d) / (1000 * 60 * 60));
      return `${type}: ${hoursAgo}h ago`;
    });
    if (rollEntries.length > 0) {
      additionalStats.push({
        label: 'Daily Rolls',
        value: rollEntries.join('; '),
        icon: 'fa-dice',
        category: 'activities'
      });
    }
  }
  
  // Last roll date
  if (character.lastRollDate) {
    const date = new Date(character.lastRollDate);
    additionalStats.push({
      label: 'Last Roll',
      value: date.toLocaleString(),
      icon: 'fa-dice-d20',
      category: 'activities'
    });
  }
  
  // Help wanted quest info
  if (character.helpWanted) {
    if (character.helpWanted.cooldownUntil) {
      const date = new Date(character.helpWanted.cooldownUntil);
      additionalStats.push({
        label: 'HWQ Cooldown',
        value: date.toLocaleString(),
        icon: 'fa-hourglass-half',
        category: 'activities'
      });
    }
    if (character.helpWanted.completions && character.helpWanted.completions.length > 0) {
      additionalStats.push({
        label: 'HWQ Completions',
        value: character.helpWanted.completions.length,
        icon: 'fa-check-double',
        category: 'activities'
      });
    }
  }
  
  // Boosted by
  if (character.boostedBy) {
    additionalStats.push({
      label: 'Boosted By',
      value: character.boostedBy,
      icon: 'fa-magic',
      category: 'combat'
    });
  }
  
  // Travel log
  if (character.travelLog && character.travelLog.length > 0) {
    additionalStats.push({
      label: 'Travel History',
      value: `${character.travelLog.length} locations`,
      icon: 'fa-map-marked-alt',
      category: 'activities'
    });
  }
  
  // Vending sync
  if (character.vendingSync !== undefined) {
    additionalStats.push({
      label: 'Vending Sync',
      value: character.vendingSync ? 'Enabled' : 'Disabled',
      icon: character.vendingSync ? 'fa-sync' : 'fa-sync-alt',
      category: 'economy'
    });
  }
  
  // Last collected month
  if (character.lastCollectedMonth && character.lastCollectedMonth > 0) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    additionalStats.push({
      label: 'Last Collected',
      value: monthNames[character.lastCollectedMonth - 1] || `Month ${character.lastCollectedMonth}`,
      icon: 'fa-calendar-check',
      category: 'economy'
    });
  }
  
  // Shop image
  if (character.shopImage && character.shopImage.trim() !== '') {
    additionalStats.push({
      label: 'Shop Image',
      value: character.shopImage,
      icon: 'fa-image',
      isLink: true,
      category: 'economy'
    });
  }
  
  // Birthday
  if (character.birthday && character.birthday.trim() !== '') {
    additionalStats.push({
      label: 'Birthday',
      value: character.birthday,
      icon: 'fa-birthday-cake',
      category: 'other'
    });
  }
  
  // Job voucher job (if voucher exists)
  if (character.jobVoucher && character.jobVoucherJob) {
    additionalStats.push({
      label: 'Job Voucher Job',
      value: character.jobVoucherJob,
      icon: 'fa-briefcase',
      category: 'activities'
    });
  }
  
  // Current active pet - fetch pet name
  if (character.currentActivePet) {
    try {
      // Try to fetch pet name from API
      const petId = character.currentActivePet;
      const petResponse = await fetch(`/api/models/pet/${petId}`, { credentials: 'include' });
      if (petResponse.ok) {
        const pet = await petResponse.json();
        additionalStats.push({
          label: 'Active Pet',
          value: pet.name || petId,
          icon: 'fa-paw',
          category: 'other'
        });
      } else {
        // Fallback to ID if fetch fails
        additionalStats.push({
          label: 'Active Pet',
          value: petId,
          icon: 'fa-paw',
          category: 'other'
        });
      }
    } catch (error) {
      // Fallback to ID if fetch fails
      additionalStats.push({
        label: 'Active Pet',
        value: character.currentActivePet,
        icon: 'fa-paw',
        category: 'other'
      });
    }
  }
  
  // Current active mount - fetch mount name
  if (character.currentActiveMount) {
    try {
      // Try to fetch mount name from API
      const mountId = character.currentActiveMount;
      const mountResponse = await fetch(`/api/models/mount/${mountId}`, { credentials: 'include' });
      if (mountResponse.ok) {
        const mount = await mountResponse.json();
        additionalStats.push({
          label: 'Active Mount',
          value: mount.name || mountId,
          icon: 'fa-horse',
          category: 'other'
        });
      } else {
        // Fallback to ID if fetch fails
        additionalStats.push({
          label: 'Active Mount',
          value: mountId,
          icon: 'fa-horse',
          category: 'other'
        });
      }
    } catch (error) {
      // Fallback to ID if fetch fails
      additionalStats.push({
        label: 'Active Mount',
        value: character.currentActiveMount,
        icon: 'fa-horse',
        category: 'other'
      });
    }
  }
  
  // Organize stats into categories
  additionalStats.forEach(stat => {
    const category = stat.category || 'other';
    if (!statsByCategory[category]) {
      statsByCategory[category] = [];
    }
    statsByCategory[category].push(stat);
  });
  
  // Render stats by category
  const categoryLabels = {
    economy: '💰 Economy',
    status: '📊 Status',
    combat: '⚔️ Combat',
    activities: '🎯 Activities',
    other: '📝 Other'
  };
  
  let hasAnyStats = false;
  
  Object.entries(statsByCategory).forEach(([category, stats]) => {
    if (stats.length > 0) {
      hasAnyStats = true;
      
      // Add category header
      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'stats-category-header';
      categoryHeader.textContent = categoryLabels[category] || category;
      statsGrid.appendChild(categoryHeader);
      
      // Add stats in this category
      stats.forEach(stat => {
        const statItem = document.createElement('div');
        statItem.className = 'additional-stat-item';
        if (stat.warning) {
          statItem.classList.add('warning');
        }
        if (stat.positive) {
          statItem.classList.add('positive');
        }
        if (stat.isLink) {
          statItem.innerHTML = `
            <i class="fas ${stat.icon}"></i>
            <div class="stat-details">
              <span class="stat-detail-label">${stat.label}</span>
              <span class="stat-detail-value"><a href="${stat.value}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color, #00A3DA); text-decoration: underline;">${stat.value}</a></span>
            </div>
          `;
        } else {
          statItem.innerHTML = `
            <i class="fas ${stat.icon}"></i>
            <div class="stat-details">
              <span class="stat-detail-label">${stat.label}</span>
              <span class="stat-detail-value">${stat.value}</span>
            </div>
          `;
        }
        statsGrid.appendChild(statItem);
      });
    }
  });
  
  if (hasAnyStats) {
    section.style.display = 'block';
  }
}

// ============================================================================
// ------------------- Travel Log Display -------------------
// ============================================================================
function displayTravelLog(character) {
  const section = document.getElementById('travel-log-section');
  const list = document.getElementById('travel-log-list');
  
  if (!character.travelLog || character.travelLog.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  list.innerHTML = '';
  
  // Show most recent travels first
  const sortedLog = [...character.travelLog].reverse().slice(0, 10); // Show last 10
  
  sortedLog.forEach((entry, index) => {
    const logItem = document.createElement('div');
    logItem.className = 'travel-log-item';
    
    let content = '';
    if (typeof entry === 'string') {
      content = entry;
    } else if (entry.location) {
      const date = entry.date ? new Date(entry.date).toLocaleString() : '';
      content = `${entry.location}${date ? ` - ${date}` : ''}`;
    } else {
      content = JSON.stringify(entry);
    }
    
    logItem.innerHTML = `
      <i class="fas fa-map-pin"></i>
      <span>${content}</span>
    `;
    list.appendChild(logItem);
  });
  
  if (character.travelLog.length > 10) {
    const moreItem = document.createElement('div');
    moreItem.className = 'travel-log-more';
    moreItem.textContent = `... and ${character.travelLog.length - 10} more entries`;
    list.appendChild(moreItem);
  }
  
  section.style.display = 'block';
}

// ============================================================================
// ------------------- Help Wanted Display -------------------
// ============================================================================
function displayHelpWanted(character) {
  const section = document.getElementById('help-wanted-section');
  const info = document.getElementById('help-wanted-info');
  
  if (!character.helpWanted) {
    section.style.display = 'none';
    return;
  }
  
  info.innerHTML = '';
  
  const hwqInfo = [];
  
  if (character.helpWanted.lastCompletion) {
    const date = new Date(character.helpWanted.lastCompletion);
    hwqInfo.push({
      label: 'Last Completion',
      value: date.toLocaleString(),
      icon: 'fa-check-circle'
    });
  }
  
  if (character.helpWanted.cooldownUntil) {
    const date = new Date(character.helpWanted.cooldownUntil);
    const now = new Date();
    if (date > now) {
      hwqInfo.push({
        label: 'Cooldown Until',
        value: date.toLocaleString(),
        icon: 'fa-hourglass-half',
        warning: true
      });
    } else {
      hwqInfo.push({
        label: 'Cooldown',
        value: 'Available',
        icon: 'fa-check',
        positive: true
      });
    }
  }
  
  if (character.helpWanted.completions && character.helpWanted.completions.length > 0) {
    hwqInfo.push({
      label: 'Total Completions',
      value: character.helpWanted.completions.length,
      icon: 'fa-trophy'
    });
    
    // Show recent completions
    const recentCompletions = character.helpWanted.completions.slice(-5).reverse();
    if (recentCompletions.length > 0) {
      const completionsList = document.createElement('div');
      completionsList.className = 'hwq-completions-list';
      completionsList.innerHTML = '<h4>Recent Completions:</h4>';
      
      recentCompletions.forEach(completion => {
        const item = document.createElement('div');
        item.className = 'hwq-completion-item';
        if (typeof completion === 'string') {
          item.textContent = completion;
        } else if (completion.date) {
          const date = new Date(completion.date).toLocaleString();
          item.textContent = `${completion.questId || 'Quest'} - ${date}`;
        } else {
          item.textContent = JSON.stringify(completion);
        }
        completionsList.appendChild(item);
      });
      
      info.appendChild(completionsList);
    }
  }
  
  if (hwqInfo.length > 0) {
    hwqInfo.forEach(stat => {
      const statItem = document.createElement('div');
      statItem.className = 'additional-stat-item';
      if (stat.warning) statItem.classList.add('warning');
      if (stat.positive) statItem.classList.add('positive');
      statItem.innerHTML = `
        <i class="fas ${stat.icon}"></i>
        <div class="stat-details">
          <span class="stat-detail-label">${stat.label}</span>
          <span class="stat-detail-value">${stat.value}</span>
        </div>
      `;
      info.appendChild(statItem);
    });
  }
  
  if (hwqInfo.length > 0 || (character.helpWanted.completions && character.helpWanted.completions.length > 0)) {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
}

// ============================================================================
// ------------------- Form Data Loading -------------------
// ============================================================================
async function loadFormData() {
  try {
    // Load races
    const racesResponse = await fetch('/api/characters/races');
    if (racesResponse.ok) {
      const racesData = await racesResponse.json();
      races = racesData.data || [];
    }
    
    // Load jobs
    const jobsResponse = await fetch('/api/characters/jobs');
    if (jobsResponse.ok) {
      const jobsData = await jobsResponse.json();
      allJobs = jobsData.data || [];
    }
    
    // Load village-specific jobs
    const villages = ['inariko', 'rudania', 'vhintl'];
    for (const village of villages) {
      const villageResponse = await fetch(`/api/characters/jobs?village=${village}`);
      if (villageResponse.ok) {
        const villageData = await villageResponse.json();
        villageJobsMap[village] = villageData.data || [];
      }
    }
    
    // Load starter gear
    const gearResponse = await fetch('/api/characters/starter-gear');
    if (gearResponse.ok) {
      const gearData = await gearResponse.json();
      starterGear = gearData.categorized || {
        weapons: [],
        shields: [],
        armor: { head: [], chest: [], legs: [] }
      };
    }
  } catch (error) {
    console.error('Error loading form data:', error);
  }
}

// ============================================================================
// ------------------- Event Listeners -------------------
// ============================================================================
function setupEventListeners() {
  // Edit toggle button
  const editToggleBtn = document.getElementById('edit-toggle-btn');
  if (editToggleBtn) {
    editToggleBtn.addEventListener('click', toggleEditMode);
  }
  
  // Cancel edit button
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', cancelEdit);
  }
  
  // Resubmit button
  const resubmitBtn = document.getElementById('resubmit-btn');
  if (resubmitBtn) {
    resubmitBtn.addEventListener('click', () => {
      document.getElementById('resubmit-btn').setAttribute('data-resubmit', 'true');
      document.getElementById('character-edit-form').dispatchEvent(new Event('submit'));
    });
  }
  
  // Form submission
  const editForm = document.getElementById('character-edit-form');
  if (editForm) {
    editForm.addEventListener('submit', handleFormSubmit);
  }
  
  // Village change handler
  const villageSelect = document.getElementById('edit-character-village');
  if (villageSelect) {
    villageSelect.addEventListener('change', handleVillageChange);
  }
  
  // Icon preview
  setupIconPreview();
}

// ============================================================================
// ------------------- Edit Mode -------------------
// ============================================================================
function toggleEditMode() {
  isEditMode = !isEditMode;
  
  if (isEditMode) {
    showEditForm();
  } else {
    hideEditForm();
  }
}

function showEditForm() {
  const editContainer = document.getElementById('edit-form-container');
  editContainer.style.display = 'block';
  
  // Populate form with character data
  populateEditForm();
  
  // Always make Age field readonly (never editable, but still submitted)
  const ageField = document.getElementById('edit-character-age');
  if (ageField) {
    ageField.readOnly = true;
    ageField.disabled = false; // Use readonly instead of disabled so value is submitted
    ageField.title = 'Age cannot be edited';
  }
  
  // Show/hide and enable/disable fields based on status
  if (character.status === 'denied') {
    // Show all fields for denied characters and enable them
    document.getElementById('name-field-group').style.display = 'block';
    document.getElementById('stats-section').style.display = 'block';
    document.getElementById('details-section').style.display = 'block';
    document.getElementById('gear-section').style.display = 'block';
    document.getElementById('resubmit-btn').style.display = 'inline-block';
    document.getElementById('save-btn-text').textContent = 'Save Changes';
    document.getElementById('icon-required').style.display = 'none';
    
    // Enable all fields for denied characters (except age, which is always disabled)
    document.getElementById('edit-character-name').disabled = false;
    document.getElementById('edit-character-hearts').disabled = false;
    document.getElementById('edit-character-stamina').disabled = false;
    document.getElementById('edit-character-race').disabled = false;
    document.getElementById('edit-character-village').disabled = false;
    document.getElementById('edit-character-job').disabled = false;
    document.getElementById('edit-starter-weapon').disabled = false;
    document.getElementById('edit-starter-shield').disabled = false;
    document.getElementById('edit-starter-armor-chest').disabled = false;
    document.getElementById('edit-starter-armor-legs').disabled = false;
  } else if (character.status === 'accepted') {
    // Show all sections but disable restricted fields for accepted characters
    document.getElementById('name-field-group').style.display = 'block';
    document.getElementById('stats-section').style.display = 'block';
    document.getElementById('details-section').style.display = 'block';
    document.getElementById('gear-section').style.display = 'block';
    document.getElementById('resubmit-btn').style.display = 'none';
    document.getElementById('save-btn-text').textContent = 'Save Profile Changes';
    document.getElementById('icon-required').style.display = 'none';
    
    // Disable restricted fields for accepted characters
    document.getElementById('edit-character-name').disabled = true;
    document.getElementById('edit-character-name').title = 'Name cannot be edited for accepted characters';
    document.getElementById('edit-character-hearts').disabled = true;
    document.getElementById('edit-character-hearts').title = 'Stats cannot be edited for accepted characters';
    document.getElementById('edit-character-stamina').disabled = true;
    document.getElementById('edit-character-stamina').title = 'Stats cannot be edited for accepted characters';
    document.getElementById('edit-character-race').disabled = true;
    document.getElementById('edit-character-race').title = 'Race cannot be edited for accepted characters';
    document.getElementById('edit-character-village').disabled = true;
    document.getElementById('edit-character-village').title = 'Home village cannot be edited for accepted characters';
    document.getElementById('edit-character-job').disabled = true;
    document.getElementById('edit-character-job').title = 'Job cannot be edited for accepted characters';
    document.getElementById('edit-starter-weapon').disabled = true;
    document.getElementById('edit-starter-weapon').title = 'Starting gear cannot be edited for accepted characters';
    document.getElementById('edit-starter-shield').disabled = true;
    document.getElementById('edit-starter-shield').title = 'Starting gear cannot be edited for accepted characters';
    document.getElementById('edit-starter-armor-chest').disabled = true;
    document.getElementById('edit-starter-armor-chest').title = 'Starting gear cannot be edited for accepted characters';
    document.getElementById('edit-starter-armor-legs').disabled = true;
    document.getElementById('edit-starter-armor-legs').title = 'Starting gear cannot be edited for accepted characters';
    
    // Keep allowed fields enabled for accepted characters
    document.getElementById('edit-character-height').disabled = false;
    document.getElementById('edit-character-pronouns').disabled = false;
  }
  
  // Scroll to form
  editContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideEditForm() {
  const editContainer = document.getElementById('edit-form-container');
  editContainer.style.display = 'none';
  isEditMode = false;
}

function cancelEdit() {
  hideEditForm();
  hideMessage();
}

function populateEditForm() {
  if (!character) return;
  
  // Basic info
  document.getElementById('edit-character-name').value = character.name || '';
  document.getElementById('edit-character-age').value = character.age || '';
  document.getElementById('edit-character-height').value = character.height || '';
  document.getElementById('edit-character-pronouns').value = character.pronouns || '';
  
  // Always ensure Age field is readonly (not disabled, so value is submitted)
  const ageField = document.getElementById('edit-character-age');
  if (ageField) {
    ageField.readOnly = true;
    ageField.disabled = false; // Use readonly instead of disabled so value is submitted
  }
  
  // Stats - populate for both denied and accepted (accepted will be disabled)
  document.getElementById('edit-character-hearts').value = character.maxHearts || 3;
  document.getElementById('edit-character-stamina').value = character.maxStamina || 3;
  
  // Details - populate for both denied and accepted (accepted will be disabled)
  // Populate race dropdown
  const raceSelect = document.getElementById('edit-character-race');
  raceSelect.innerHTML = '<option value="">Select a race...</option>';
  races.forEach(race => {
    const option = document.createElement('option');
    option.value = race.toLowerCase();
    option.textContent = race;
    if (character.race && character.race.toLowerCase() === race.toLowerCase()) {
      option.selected = true;
    }
    raceSelect.appendChild(option);
  });
  
  // Set village
  const villageSelect = document.getElementById('edit-character-village');
  villageSelect.value = character.homeVillage || '';
  populateJobDropdown(character.homeVillage);
  
  // Set job
  const jobSelect = document.getElementById('edit-character-job');
  if (character.job) {
    jobSelect.value = character.job;
  }
  
  // Set app link
  document.getElementById('edit-character-app-link').value = character.appLink || '';
  
  // Populate starter gear
  populateStarterGearDropdowns();
  
  // Set current gear if any
  if (character.gearWeapon?.name) {
    document.getElementById('edit-starter-weapon').value = character.gearWeapon.name;
  }
  if (character.gearShield?.name) {
    document.getElementById('edit-starter-shield').value = character.gearShield.name;
  }
  if (character.gearArmor?.chest?.name) {
    document.getElementById('edit-starter-armor-chest').value = character.gearArmor.chest.name;
  }
  if (character.gearArmor?.legs?.name) {
    document.getElementById('edit-starter-armor-legs').value = character.gearArmor.legs.name;
  }
}

// ============================================================================
// ------------------- Dropdown Population -------------------
// ============================================================================
function populateJobDropdown(village) {
  const jobSelect = document.getElementById('edit-character-job');
  jobSelect.innerHTML = '<option value="">Select a job...</option>';
  
  if (!village) {
    jobSelect.disabled = true;
    return;
  }
  
  const jobs = villageJobsMap[village.toLowerCase()] || allJobs;
  jobs.sort().forEach(job => {
    const option = document.createElement('option');
    option.value = job;
    option.textContent = job;
    jobSelect.appendChild(option);
  });
  
  jobSelect.disabled = false;
}

function populateStarterGearDropdowns() {
  // Populate weapon dropdown
  const weaponSelect = document.getElementById('edit-starter-weapon');
  if (weaponSelect && starterGear.weapons) {
    starterGear.weapons.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      weaponSelect.appendChild(option);
    });
  }
  
  // Populate shield dropdown
  const shieldSelect = document.getElementById('edit-starter-shield');
  if (shieldSelect && starterGear.shields) {
    starterGear.shields.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      shieldSelect.appendChild(option);
    });
  }
  
  // Populate chest armor dropdown
  const chestSelect = document.getElementById('edit-starter-armor-chest');
  if (chestSelect && starterGear.armor && starterGear.armor.chest) {
    starterGear.armor.chest.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      chestSelect.appendChild(option);
    });
  }
  
  // Populate leg armor dropdown
  const legsSelect = document.getElementById('edit-starter-armor-legs');
  if (legsSelect && starterGear.armor && starterGear.armor.legs) {
    starterGear.armor.legs.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      legsSelect.appendChild(option);
    });
  }
}

function handleVillageChange(event) {
  const village = event.target.value;
  populateJobDropdown(village);
  
  // Clear job selection when village changes
  const jobSelect = document.getElementById('edit-character-job');
  jobSelect.value = '';
}

// ============================================================================
// ------------------- Icon Preview -------------------
// ============================================================================
function setupIconPreview() {
  const iconInput = document.getElementById('edit-character-icon');
  const previewContainer = document.getElementById('edit-icon-preview-container');
  const previewImg = document.getElementById('edit-icon-preview');
  const removeBtn = document.getElementById('remove-edit-icon-preview');
  
  if (!iconInput || !previewContainer || !previewImg) return;
  
  iconInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showMessage('Invalid file type. Please select a JPEG, PNG, GIF, or WebP image.', 'error');
        iconInput.value = '';
        return;
      }
      
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        showMessage('Image file is too large. Maximum size is 5MB.', 'error');
        iconInput.value = '';
        return;
      }
      
      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewContainer.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      previewContainer.style.display = 'none';
    }
  });
  
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      iconInput.value = '';
      previewContainer.style.display = 'none';
      previewImg.src = '';
    });
  }
}

// ============================================================================
// ------------------- Form Submission -------------------
// ============================================================================
async function handleFormSubmit(event) {
  event.preventDefault();
  
  const form = event.target;
  const submitBtn = document.getElementById('save-btn');
  const originalText = submitBtn.innerHTML;
  const resubmit = document.getElementById('resubmit-btn')?.getAttribute('data-resubmit') === 'true';
  
  // Automatically set resubmit flag for denied characters
  const isDenied = character.status === 'denied';
  const shouldResubmit = resubmit || isDenied;
  
  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
  
  // Clear previous messages
  hideMessage();
  
  try {
    // Create FormData
    const formData = new FormData(form);
    
    // Add resubmit flag if resubmitting or if character is denied (automatic resubmission)
    if (shouldResubmit) {
      formData.append('resubmit', 'true');
    }
    
    // Submit to API
    const response = await fetch(`/api/characters/edit/${character._id}`, {
      method: 'PUT',
      body: formData,
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update character');
    }
    
    // Success
    const message = shouldResubmit 
      ? 'Character updated and resubmitted successfully! It is now pending review.'
      : 'Character updated successfully!';
    showMessage(message, 'success');
    
    // Reload character data
    const pathParts = window.location.pathname.split('/');
    const nameSlug = pathParts[pathParts.length - 1];
    await loadCharacter(nameSlug);
    
    // Hide edit form
    hideEditForm();
    
    // Reset resubmit flag
    if (document.getElementById('resubmit-btn')) {
      document.getElementById('resubmit-btn').removeAttribute('data-resubmit');
    }
    
  } catch (error) {
    console.error('Error updating character:', error);
    showMessage(error.message || 'An error occurred while updating your character. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// ============================================================================
// ------------------- UI Helpers -------------------
// ============================================================================
function showLoading() {
  document.getElementById('loading-state').style.display = 'block';
  document.getElementById('error-state').style.display = 'none';
  document.getElementById('character-display').style.display = 'none';
}

function hideLoading() {
  document.getElementById('loading-state').style.display = 'none';
}

function showError(message) {
  hideLoading();
  document.getElementById('error-state').style.display = 'block';
  document.getElementById('error-message').textContent = message;
  document.getElementById('character-display').style.display = 'none';
}

function showMessage(message, type = 'info') {
  const messageContainer = document.getElementById('message-container');
  const messageContent = document.getElementById('message-content');
  
  messageContent.textContent = message;
  messageContent.className = `message-content message-${type}`;
  messageContainer.style.display = 'block';
  
  // Scroll to message
  messageContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  
  // Auto-hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      hideMessage();
    }, 5000);
  }
}

function hideMessage() {
  document.getElementById('message-container').style.display = 'none';
}

// ============================================================================
// ------------------- Authentication -------------------
// ============================================================================
async function checkAuthentication() {
  try {
    const response = await fetch('/api/user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.user) {
        const usernameEl = document.getElementById('username');
        const avatarEl = document.getElementById('user-avatar');
        if (usernameEl) usernameEl.textContent = data.user.username || 'User';
        if (avatarEl && data.user.avatar) {
          avatarEl.src = `https://cdn.discordapp.com/avatars/${data.user.discordId}/${data.user.avatar}.png?size=256`;
        }
      }
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
  }
}
