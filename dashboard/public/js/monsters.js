// ============================================================================
// Monster Rendering and Filtering Module
// ============================================================================

import { scrollToTop, createSearchFilterBar } from './ui.js';
import { capitalize } from './utils.js';

// ------------------- Function: renderMonsterCards -------------------
// Renders all monster cards with pagination
function renderMonsterCards(monsters, page = 1, totalMonsters = null) {


  // Scroll to top of the page
  scrollToTop();

  // Check if this is a paginated call from main pagination system
  const isPaginatedCall = totalMonsters !== null && totalMonsters > monsters.length;
  
  let monstersToRender = monsters;
  let startIndex = 0;
  let endIndex = monsters.length;
  let totalPages = 1;
  
  if (!isPaginatedCall) {
    // This is a filtering call, so we need to paginate the data
    const sortedMonsters = [...monsters].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Get monsters per page setting
    const monstersPerPageSelect = document.getElementById('monsters-per-page');
    const monstersPerPage = monstersPerPageSelect ? 
      (monstersPerPageSelect.value === 'all' ? sortedMonsters.length : parseInt(monstersPerPageSelect.value)) : 
      15;
    
    const monstersForPagination = totalMonsters !== null ? totalMonsters : sortedMonsters.length;
    totalPages = Math.ceil(monstersForPagination / monstersPerPage);
    startIndex = (page - 1) * monstersPerPage;
    endIndex = Math.min(startIndex + monstersPerPage, monstersForPagination);
    monstersToRender = sortedMonsters.slice(startIndex, endIndex);
  } else {
    // This is a paginated call, so the data is already paginated
    const monstersPerPageSelect = document.getElementById('monsters-per-page');
    const monstersPerPage = monstersPerPageSelect ? 
      (monstersPerPageSelect.value === 'all' ? totalMonsters : parseInt(monstersPerPageSelect.value)) : 
      15;
    
    startIndex = (page - 1) * monstersPerPage;
    endIndex = startIndex + monsters.length;
    totalPages = Math.ceil(totalMonsters / monstersPerPage);
  }

  const grid = document.getElementById('monsters-container');
  if (!grid) {
    console.error('❌ Monster grid container not found');
    return;
  }

      // ------------------- No Monsters Found -------------------
  if (!monstersToRender || monstersToRender.length === 0) {
    grid.innerHTML = '<div class="monster-loading">No monsters found</div>';
    return;
  }

  grid.innerHTML = monstersToRender.map(monster => {
    // Format locations properly
    const locations = Array.isArray(monster.locations) ? monster.locations : [];
    
    // First, combine "Central" and "Hyrule" into "Central Hyrule" if they appear together
    let processedLocations = [...locations];
    const centralIndex = processedLocations.findIndex(loc => loc === 'Central');
    const hyruleIndex = processedLocations.findIndex(loc => loc === 'Hyrule');
    
    if (centralIndex !== -1 && hyruleIndex !== -1) {
      // Remove both "Central" and "Hyrule" and add "Central Hyrule"
      processedLocations = processedLocations.filter((_, index) => index !== centralIndex && index !== hyruleIndex);
      processedLocations.push('Central Hyrule');
    }
    
    const formattedLocations = processedLocations.filter(loc => loc && loc.trim()).map(loc => {
      // Handle multi-word locations like "Central Hyrule" properly
      // Don't split multi-word locations - keep them as single units
      // Handle hyphens properly by splitting on spaces and hyphens, then rejoining
      const result = loc.trim()
        .split(/[\s-]+/) // Split on spaces and hyphens
        .map(word => capitalize(word))
        .join(' '); // Rejoin with spaces
      return result;
    }).filter(loc => loc.length > 0);
    

    // Format jobs properly
    const jobs = Array.isArray(monster.job) ? monster.job : [];
    const formattedJobs = jobs.filter(job => job && job.trim()).map(job => capitalize(job)).filter(job => job.length > 0);

    // Get species from name if not set
    const species = monster.species || getSpeciesFromName(monster.name);
    
    // Get type from name if not set
    const type = monster.type && monster.type !== 'Unknown' ? monster.type : getTypeFromName(monster.name);

    return `
      <div class="model-details-item monster-card modern-monster-card" data-monster-name="${monster.name}" onclick="this.classList.toggle('flipped')">
        <div class="monster-card-front">
          <div class="monster-header">
            <div class="monster-image">
              <img src="${formatMonsterImageUrl(monster.image, monster.name)}" alt="${monster.name}" onerror="this.src='/images/ankleicon.png'">
            </div>
            <div class="monster-title">
              <div class="monster-name">${monster.name}</div>
              <div class="monster-species">${species}</div>
              <div class="monster-type">${type}</div>
            </div>
          </div>
          
          <div class="monster-stats">
            <div class="stat-row">
              <span class="stat-label">Tier:</span>
              <span class="stat-value tier-${monster.tier || 1}">${monster.tier || 1}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Hearts:</span>
              <span class="stat-value">${monster.hearts || 0}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Damage:</span>
              <span class="stat-value">${monster.dmg || 0}</span>
            </div>
            ${monster.bloodmoon ? '<div class="bloodmoon-indicator">🌙 Blood Moon</div>' : ''}
          </div>
          
          ${formattedLocations.length > 0 ? `
            <div class="monster-section">
              <div class="section-title">Locations</div>
              <div class="monster-locations">
                ${renderMonsterLocationTags(formattedLocations)}
              </div>
            </div>
          ` : ''}
          
          ${formattedJobs.length > 0 ? `
            <div class="monster-section">
              <div class="section-title">Jobs</div>
              <div class="monster-jobs">
                ${formattedJobs.map(job => `<span class="monster-job-tag">${job}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        
        <div id="monster-${monster.name.replace(/[^a-zA-Z0-9]/g, '-')}-back" class="monster-card-back">
          <div class="monster-loot-section">
            <div class="monster-loot-title">Loot dropped by ${monster.name}</div>
            <div class="monster-loot-empty">
              <i class="fas fa-spinner fa-spin"></i> Loading loot data...
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Update results info
  const resultsInfo = document.querySelector('.monster-results-info p');
  if (resultsInfo) {
    const monstersForPagination = totalMonsters !== null ? totalMonsters : monstersToRender.length;
    const monstersPerPageSelect = document.getElementById('monsters-per-page');
    const isShowingAll = monstersPerPageSelect && monstersPerPageSelect.value === 'all';
    
    if (isShowingAll) {
      resultsInfo.textContent = `Showing all ${monstersForPagination} monsters`;
    } else {
      resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${monstersForPagination} monsters (Page ${page} of ${totalPages})`;
    }
  }

  // ------------------- Attach Loot Loading Handlers -------------------
  monsters.forEach(monster => {
    const safeMonsterName = monster.name.replace(/[^a-zA-Z0-9]/g, '-');
    const backContent = document.querySelector(`#monster-${safeMonsterName}-back`);
    if (!backContent) return;
    
    // Add click handler for lazy loading
    const card = document.querySelector(`.monster-card[data-monster-name="${monster.name}"]`);
    if (!card) {
      return;
    }

    card.addEventListener('click', async () => {
      const startTime = Date.now();
      
      // Initialize cache if needed
      const cache = initializeLootCache();
      
          // Check cache first
    const cachedData = cache.get(monster.name);
    if (cachedData) {
      
      // Debug: Check if this is Chuchu (Large) and clear cache if needed
      if (monster.name === 'Chuchu (Large)') {
        cache.clearForMonster(monster.name);
      } else {
        backContent.innerHTML = cachedData;
        return;
      }
    }
      
      
      // Show loading state
      backContent.innerHTML = `
        <div class="monster-loot-section">
          <div class="monster-loot-title">Loot dropped by ${monster.name}</div>
          <div class="monster-loot-empty">
            <i class="fas fa-spinner fa-spin"></i> Loading loot data...
          </div>
        </div>
      `;
      
      try {
        const lootHTML = await fetchMonsterLoot(monster.name);
        
        backContent.innerHTML = lootHTML;
      } catch (error) {
        
        backContent.innerHTML = `
          <div class="monster-loot-section">
            <div class="monster-loot-title">Loot dropped by ${monster.name}</div>
            <div class="monster-loot-empty">Error loading loot data</div>
          </div>
        `;
      }
    });
  });
}

// ============================================================================
// ------------------- Loot System -------------------
// Handles fetching and displaying monster loot data
// ============================================================================

// ------------------- Function: initializeLootCache -------------------
// Initializes the loot cache with localStorage persistence
function initializeLootCache() {
  if (window.lootCache) {
    return window.lootCache;
  }

  
  // Load cached data from localStorage
  let cachedData = {};
  try {
    const stored = localStorage.getItem('monsterLootCache');
    if (stored) {
      cachedData = JSON.parse(stored);
    }
  } catch (error) {
  }

  const cache = {
    data: cachedData,
    hitCount: 0,
    missCount: 0,
    CACHE_DURATION: 30 * 60 * 1000, // 30 minutes
    MAX_SIZE: 50,

    set(key, value) {
      this.data[key] = {
        value,
        timestamp: Date.now()
      };
      
      // Enforce max size
      const keys = Object.keys(this.data);
      if (keys.length > this.MAX_SIZE) {
        this.evictOldest();
      }
      
      this.persistToStorage();
    },

    get(key) {
      const entry = this.data[key];
      if (!entry) {
        return null;
      }

      // Check if cache is still valid
      if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
        delete this.data[key];
        this.persistToStorage();
        return null;
      }

      return entry.value;
    },

    has(key) {
      const entry = this.data[key];
      if (!entry) return false;
      
      // Check if cache is still valid
      if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
        delete this.data[key];
        this.persistToStorage();
        return false;
      }
      
      return true;
    },

    evictOldest() {
      const keys = Object.keys(this.data);
      if (keys.length === 0) return;

      let oldestKey = keys[0];
      let oldestTime = this.data[oldestKey].timestamp;

      for (const key of keys) {
        if (this.data[key].timestamp < oldestTime) {
          oldestKey = key;
          oldestTime = this.data[key].timestamp;
        }
      }

      delete this.data[oldestKey];
    },

    persistToStorage() {
      try {
        localStorage.setItem('monsterLootCache', JSON.stringify(this.data));
      } catch (error) {
      }
    },

    clear() {
      this.data = {};
      this.hitCount = 0;
      this.missCount = 0;
      try {
        localStorage.removeItem('monsterLootCache');
      } catch (error) {
      }
    },

    clearForMonster(monsterName) {
      if (this.data[monsterName]) {
        delete this.data[monsterName];
        this.persistToStorage();
      }
    },

    getStats() {
      return {
        size: Object.keys(this.data).length,
        hitCount: this.hitCount,
        missCount: this.missCount,
        hitRate: this.hitCount + this.missCount > 0 ? 
          (this.hitCount / (this.hitCount + this.missCount) * 100).toFixed(1) + '%' : '0%'
      };
    }
  };

  window.lootCache = cache;
  
  // Add global function to clear cache (for debugging)
  window.clearLootCache = function() {
    cache.clear();
  };
  
  // Add global function to clear cache for specific monster
  window.clearLootCacheForMonster = function(monsterName) {
    cache.clearForMonster(monsterName);
  };
  
  // Add global function to show cache stats
  window.showLootCacheStats = function() {
    const stats = cache.getStats();
    return stats;
  };
  
  return cache;
}

// ------------------- Function: fetchMonsterLoot -------------------
// Fetches loot data for a specific monster
async function fetchMonsterLoot(monsterName) {
  const cache = initializeLootCache();
  
  try {
    // Check cache first
    const cachedHTML = cache.get(monsterName);
    if (cachedHTML) {
      cache.hitCount++;
      
      // Debug: Check if this is Chuchu (Large) and clear cache if needed
      if (monsterName === 'Chuchu (Large)') {
        cache.clearForMonster(monsterName);
      } else {
        return cachedHTML;
      }
    }
    
    cache.missCount++;
    
    // Convert monster name to the format used in ItemModel
    const monsterField = convertMonsterNameToField(monsterName);
    if (!monsterField) {
      return createLootHTML(monsterName, []);
    }
    
    // Build the API URL
    const apiUrl = `/api/models/item?${monsterField}=true&all=true`;
    
    // Fetch items that this monster drops
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const responseData = await response.json();
    const { data: lootItems } = responseData;
    
    // Create HTML
    const lootHTML = createLootHTML(monsterName, lootItems);
    
    // Cache the result
    cache.set(monsterName, lootHTML);
    
    return lootHTML;
  } catch (error) {
    throw error;
  }
}

// ------------------- Function: convertMonsterNameToField -------------------
// Converts monster name to the corresponding field name in ItemModel
function convertMonsterNameToField(monsterName) {
  if (!monsterName) return null;
  
  // Convert to lowercase and remove spaces/special characters
  const normalizedName = monsterName.toLowerCase()
    .replace(/\s+/g, '') // Remove spaces
    .replace(/[()]/g, '') // Remove parentheses
    .replace(/-/g, ''); // Remove hyphens
  
  // Mapping from monster names to ItemModel fields
  const monsterFieldMap = {
    'blackbokoblin': 'blackBokoblin',
    'bluebokoblin': 'blueBokoblin',
    'cursedbokoblin': 'cursedBokoblin',
    'goldenbokoblin': 'goldenBokoblin',
    'silverbokoblin': 'silverBokoblin',
    'bokoblin': 'bokoblin',
    'electricchuchularge': 'electricChuchuLarge',
    'firechuchularge': 'fireChuchuLarge',
    'icechuchularge': 'iceChuchuLarge',
    'chuchularge': 'chuchuLarge',
    'electricchuchumedium': 'electricChuchuMedium',
    'firechuchumedium': 'fireChuchuMedium',
    'icechuchumedium': 'iceChuchuMedium',
    'chuchumedium': 'chuchuMedium',
    'electricchuchusmall': 'electricChuchuSmall',
    'firechuchusmall': 'fireChuchuSmall',
    'icechuchusmall': 'iceChuchuSmall',
    'chuchusmall': 'chuchuSmall',
    'blackhinox': 'blackHinox',
    'bluehinox': 'blueHinox',
    'hinox': 'hinox',
    'electrickeese': 'electricKeese',
    'firekeese': 'fireKeese',
    'icekeese': 'iceKeese',
    'keese': 'keese',
    'blacklizalfos': 'blackLizalfos',
    'bluelizalfos': 'blueLizalfos',
    'cursedlizalfos': 'cursedLizalfos',
    'electriclizalfos': 'electricLizalfos',
    'firebreathlizalfos': 'fireBreathLizalfos',
    'goldenlizalfos': 'goldenLizalfos',
    'icebreathlizalfos': 'iceBreathLizalfos',
    'silverlizalfos': 'silverLizalfos',
    'lizalfos': 'lizalfos',
    'bluemanedlynel': 'blueManedLynel',
    'goldenlynel': 'goldenLynel',
    'silverlynel': 'silverLynel',
    'whitemanedlynel': 'whiteManedLynel',
    'lynel': 'lynel',
    'blackmoblin': 'blackMoblin',
    'bluemoblin': 'blueMoblin',
    'cursedmoblin': 'cursedMoblin',
    'goldenmoblin': 'goldenMoblin',
    'silvermoblin': 'silverMoblin',
    'moblin': 'moblin',
    'molduga': 'molduga',
    'molduking': 'molduking',
    'forestoctorok': 'forestOctorok',
    'rockoctorok': 'rockOctorok',
    'skyoctorok': 'skyOctorok',
    'snowoctorok': 'snowOctorok',
    'treasureoctorok': 'treasureOctorok',
    'wateroctorok': 'waterOctorok',
    'frostpebblit': 'frostPebblit',
    'igneopebblit': 'igneoPebblit',
    'stonepebblit': 'stonePebblit',
    'stalizalfos': 'stalizalfos',
    'stalkoblin': 'stalkoblin',
    'stalmoblin': 'stalmoblin',
    'stalnox': 'stalnox',
    'frosttalus': 'frostTalus',
    'igneotalus': 'igneoTalus',
    'luminoustalus': 'luminousTalus',
    'raretalus': 'rareTalus',
    'stonetalus': 'stoneTalus',
    'blizzardwizzrobe': 'blizzardWizzrobe',
    'electricwizzrobe': 'electricWizzrobe',
    'firewizzrobe': 'fireWizzrobe',
    'icewizzrobe': 'iceWizzrobe',
    'meteowizzrobe': 'meteoWizzrobe',
    'thunderwizzrobe': 'thunderWizzrobe',
    'likelike': 'likeLike',
    'evermean': 'evermean',
    'gibdo': 'gibdo',
    'horriblin': 'horriblin',
    'gloomhands': 'gloomHands',
    'bossbokoblin': 'bossBokoblin',
    'mothgibdo': 'mothGibdo',
    'littlefrox': 'littleFrox'
  };
  
  const mappedField = monsterFieldMap[normalizedName];
  return mappedField;
}

// ------------------- Function: createLootHTML -------------------
// Creates HTML for loot display
function createLootHTML(monsterName, lootItems) {
  if (!lootItems || lootItems.length === 0) {
    return `
      <div class="monster-loot-section">
        <div class="monster-loot-title">Loot dropped by ${monsterName}</div>
        <div class="monster-loot-empty">
          <i class="fas fa-box-open"></i>
          <p>This monster doesn't drop any items</p>
        </div>
      </div>
    `;
  }
  
  // Filter out general category items (items with validItems array)
  const filteredItems = lootItems.filter(item => !item.validItems || item.validItems.length === 0);
  
  if (filteredItems.length === 0) {
    return `
      <div class="monster-loot-section">
        <div class="monster-loot-title">Loot dropped by ${monsterName}</div>
        <div class="monster-loot-empty">
          <i class="fas fa-box-open"></i>
          <p>This monster doesn't drop any specific items</p>
        </div>
      </div>
    `;
  }
  
  // Sort items by name
  const sortedItems = [...filteredItems].sort((a, b) => {
    const nameA = (a.itemName || '').toLowerCase();
    const nameB = (b.itemName || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  let lootHTML = `
    <div class="monster-loot-section">
      <div class="monster-loot-title">
        Loot dropped by ${monsterName}
        <div class="loot-count">
          <i class="fas fa-box"></i>
          Total items: <strong>${sortedItems.length}</strong>
        </div>
      </div>
      <div class="monster-loot-list">
  `;

  sortedItems.forEach(item => {
    // Get item category for styling
    const mainCategory = (item.category && (Array.isArray(item.category) ? item.category[0] : item.category)) || 'Misc';
    
    // Get item image
    const itemImage = item.image && item.image !== 'No Image' ? 
      (item.image.startsWith('http') ? item.image : `/api/images/${item.image}`) : 
      '/images/ankleicon.png';
    
    // Get item emoji
    let emoji = '';
    if (item.emoji && item.emoji.startsWith('http')) {
      emoji = `<img src="${item.emoji}" alt="emoji" class="loot-item-emoji-img">`;
    } else if (item.emoji && !item.emoji.startsWith('<:')) {
      emoji = `<span class="loot-item-emoji">${item.emoji}</span>`;
    }
    
    lootHTML += `
      <div class="loot-item-card">
        <div class="loot-item-image">
          <img src="${itemImage}" alt="${item.itemName}" onerror="this.src='/images/ankleicon.png'">
          ${emoji}
        </div>
        <div class="loot-item-info">
          <div class="loot-item-name">${item.itemName}</div>
          <div class="loot-item-category">${mainCategory}</div>
          <div class="loot-item-prices">
            <span class="loot-item-buy">Buy: ${item.buyPrice || 0}</span>
            <span class="loot-item-sell">Sell: ${item.sellPrice || 0}</span>
          </div>
        </div>
      </div>
    `;
  });

  lootHTML += `
      </div>
    </div>
  `;
  
  return lootHTML;
}

// ------------------- Function: formatMonsterImageUrl -------------------
function formatMonsterImageUrl(image, monsterName) {
  // If we have a valid image URL, use it
  if (image && image !== 'No Image' && image !== '') {
    if (image.startsWith('http')) return image;
    return `/api/images/${image}`;
  }
  
  // If no image, try to get it from the monster mapping based on name
  const mappedImage = getMonsterImageFromName(monsterName);
  if (mappedImage) return mappedImage;
  
  // Fallback to default image
  return '/images/ankleicon.png';
}

// ------------------- Function: getMonsterImageFromName -------------------
function getMonsterImageFromName(name) {
  if (!name) return null;
  
  // Convert monster name to mapping key format
  const mappingKey = name.toLowerCase()
    .replace(/\s+/g, '') // Remove spaces
    .replace(/[()]/g, '') // Remove parentheses
    .replace(/-/g, ''); // Remove hyphens
  
  // Monster mapping based on MonsterModel.js
  const monsterMapping = {
    blackbokoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Bokoblin_Black.png',
    bluebokoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Bokoblin_Blue.png',
    cursedbokoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Cursed_Bokoblin.png',
    goldenbokoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Bokoblin_Gold.png',
    silverbokoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Bokoblin_Silver.png',
    bokoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Bokoblin.png',
    electricchuchularge: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Electric_Large.png',
    firechuchularge: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Fire_Large.png',
    icechuchularge: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Ice_Large.png',
    chuchularge: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Large.png',
    electricchuchumedium: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Electric_Medium.png',
    firechuchumedium: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Fire_Medium.png',
    icechuchumedium: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Ice_Medium.png',
    chuchumedium: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Medium.png',
    electricchuchusmall: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Electric_Small.png',
    firechuchusmall: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Fire_Small.png',
    icechuchusmall: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Ice_Small.png',
    chuchusmall: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Chuchu_Small.png',
    blackhinox: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Hinox_Black.png',
    bluehinox: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Hinox_Blue.png',
    hinox: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Hinox.png',
    electrickeese: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Keese_Electric.png',
    firekeese: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Keese_Fire.png',
    icekeese: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Keese_Ice.png',
    keese: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Keese.png',
    blacklizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lizalfos_Black.png',
    bluelizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lizalfos_Blue.png',
    cursedlizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Cursed_Lizalfos.png',
    electriclizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lizalfos_Electric.png',
    firebreathlizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lizalfos_Firebreathing.png',
    goldenlizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lizalfos_Gold.png',
    icebreathlizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lizalfos_Icebreathing.png',
    silverlizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lizalfos_Silver.png',
    lizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lizalfos.png',
    bluemanedlynel: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lynel_Blue.png',
    goldenlynel: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lynel_Gold.png',
    silverlynel: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lynel_Silver.png',
    whitemanedlynel: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lynel_White.png',
    lynel: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Lynel.png',
    blackmoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Moblin_Black.png',
    bluemoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Moblin_Blue.png',
    cursedmoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Cursed_Moblin.png',
    goldenmoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Moblin_Gold.png',
    silvermoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Moblin_Silver.png',
    moblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Moblin.png',
    molduga: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Molduga.png',
    molduking: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Molduking.png',
    forestoctorok: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Octorok_Forest.png',
    rockoctorok: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Octorok_Rock.png',
    skyoctorok: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Octorok_Sky.png',
    snowoctorok: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Octorok_Snow.png',
    treasureoctorok: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Octorok_Treasure.png',
    wateroctorok: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Octorok_Water.png',
    frostpebblit: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Pebblit_Frost.png',
    igneopebblit: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Pebblit_Igneo.png',
    stonepebblit: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Pebblit_Stone.png',
    stalizalfos: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Stalizalfos.png',
    stalkoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Stalkoblin.png',
    stalmoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Stalmoblin.png',
    stalnox: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Stalhinox.png',
    frosttalus: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Talus_Frost.png',
    igneotalus: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Talus_Igneo.png',
    luminoustalus: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Talos_Luminous.png',
    raretalus: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Talus_Rare.png',
    stonetalus: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Talus_Stone.png',
    blizzardwizzrobe: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Wizzrobe_Blizard.png',
    electricwizzrobe: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Wizzrobe_Electric.png',
    firewizzrobe: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Wizzrobe_Fire.png',
    icewizzrobe: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Wizzrobe_Ice.png',
    meteowizzrobe: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Wizzrobe_Meteo.png',
    thunderwizzrobe: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Wizzrobe_Thunder.png',
    likelike: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Like-Like.png',
    evermean: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Evermean.png',
    gibdo: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Gibdo.png',
    horriblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Horriblin.png',
    gloomhands: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_GloomHands.png',
    bossbokoblin: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Bokoblin_Boss.png',
    mothgibdo: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Gibdo_Moth.png',
    littlefrox: 'https://storage.googleapis.com/tinglebot/Monsters/%5BRotW%5D%20Monsters_Frox.png'
  };
  
  return monsterMapping[mappingKey] || null;
}

// ------------------- Function: getSpeciesFromName -------------------
function getSpeciesFromName(name) {
  if (name.includes('Bokoblin')) return 'Bokoblin';
  if (name.includes('Chuchu')) return 'Chuchu';
  if (name.includes('Hinox')) return 'Hinox';
  if (name.includes('Keese')) return 'Keese';
  if (name.includes('Lizalfos')) return 'Lizalfos';
  if (name.includes('Lynel')) return 'Lynel';
  if (name.includes('Moblin')) return 'Moblin';
  if (name.includes('Molduga')) return 'Molduga';
  if (name.includes('Octorok')) return 'Octorok';
  if (name.includes('Pebblit')) return 'Pebblit';
  if (name.includes('Stal')) return 'Stal';
  if (name.includes('Talus')) return 'Talus';
  if (name.includes('Wizzrobe')) return 'Wizzrobe';
  if (name.includes('Like Like')) return 'Like Like';
  if (name.includes('Evermean')) return 'Evermean';
  if (name.includes('Gibdo')) return 'Gibdo';
  if (name.includes('Horriblin')) return 'Horriblin';
  if (name.includes('Gloom Hands')) return 'Gloom Hands';
  if (name.includes('Frox')) return 'Frox';
  return 'Unknown';
}

// ------------------- Function: getTypeFromName -------------------
function getTypeFromName(name) {
  if (name.includes('Electric')) return 'Electric';
  if (name.includes('Fire')) return 'Fire';
  if (name.includes('Ice')) return 'Ice';
  if (name.includes('Frost')) return 'Frost';
  if (name.includes('Igneo')) return 'Igneo';
  if (name.includes('Blizzard')) return 'Blizzard';
  if (name.includes('Thunder')) return 'Thunder';
  if (name.includes('Meteo')) return 'Meteo';
  if (name.includes('Golden')) return 'Golden';
  if (name.includes('Silver')) return 'Silver';
  if (name.includes('Black')) return 'Black';
  if (name.includes('Blue')) return 'Blue';
  if (name.includes('Cursed')) return 'Cursed';
  if (name.includes('White')) return 'White';
  if (name.includes('Luminous')) return 'Luminous';
  if (name.includes('Rare')) return 'Rare';
  if (name.includes('Stone')) return 'Stone';
  if (name.includes('Forest')) return 'Forest';
  if (name.includes('Rock')) return 'Rock';
  if (name.includes('Sky')) return 'Sky';
  if (name.includes('Snow')) return 'Snow';
  if (name.includes('Treasure')) return 'Treasure';
  if (name.includes('Water')) return 'Water';
  if (name.includes('Moth')) return 'Moth';
  if (name.includes('Little')) return 'Little';
  if (name.includes('Large')) return 'Large';
  if (name.includes('Medium')) return 'Medium';
  if (name.includes('Small')) return 'Small';
  return 'Normal';
}

// ------------------- Function: renderMonsterLocationTags -------------------
// Renders location tags with color classes for monster cards
function renderMonsterLocationTags(locations) {
  if (!Array.isArray(locations)) return '';
  return locations.filter(Boolean).map(location => {
    // Use the full location string as the key, not individual words
    const key = location.trim().toLowerCase();
    const colorClass = MONSTER_LOCATION_COLORS[key] || '';
    return `<span class="monster-location-tag ${colorClass}">${location.trim()}</span>`;
  }).join('');
}

// ------------------- Constant: MONSTER_LOCATION_COLORS -------------------
// Location name to class name mapping for monster location tag rendering
const MONSTER_LOCATION_COLORS = {
  'eldin': 'location-eldin',
  'lanayru': 'location-lanayru',
  'faron': 'location-faron',
  'central hyrule': 'location-central-hyrule',
  'hebra': 'location-hebra',
  'gerudo': 'location-gerudo',
  'leaf-dew way': 'location-leafdew',
  'leaf dew way': 'location-leafdew',
  'path of scarlet leaves': 'location-scarletleaves',
  'inariko': 'location-inariko',
  'rudania': 'location-rudania',
  'vhintl': 'location-vhintl'
};


// ------------------- Function: setupMonsterFilters -------------------
async function setupMonsterFilters(monsters) {
  const searchInput = document.getElementById('monster-search-input');
  const speciesSelect = document.getElementById('filter-species');
  const typeSelect = document.getElementById('filter-type');
  const tierSelect = document.getElementById('filter-tier');
  const jobsSelect = document.getElementById('filter-jobs');
  const locationsSelect = document.getElementById('filter-locations');
  const sortSelect = document.getElementById('sort-by');
  const clearFiltersBtn = document.getElementById('clear-filters');

  if (!searchInput) return;

  // Populate filter options
  await populateFilterOptions(monsters);

  // Main filtering function
  window.filterMonsters = function(page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const speciesFilter = speciesSelect ? speciesSelect.value.toLowerCase() : 'all';
    const typeFilter = typeSelect ? typeSelect.value.toLowerCase() : 'all';
    const tierFilter = tierSelect ? tierSelect.value : 'all';
    const jobsFilter = jobsSelect ? jobsSelect.value.toLowerCase() : 'all';
    const locationsFilter = locationsSelect ? locationsSelect.value.toLowerCase() : 'all';
    const sortBy = sortSelect ? sortSelect.value : 'name-asc';



    // Save current filter state
    window.savedMonsterFilterState = {
      searchTerm: searchInput.value,
      speciesFilter,
      typeFilter,
      tierFilter,
      jobsFilter,
      locationsFilter,
      sortBy
    };

    // Check if any filters are active
    const hasActiveFilters = searchTerm || 
      speciesFilter !== 'all' || 
      typeFilter !== 'all' || 
      tierFilter !== 'all' ||
      jobsFilter !== 'all' ||
      locationsFilter !== 'all';

    // Get monsters per page setting
    const monstersPerPageSelect = document.getElementById('monsters-per-page');
    const monstersPerPage = monstersPerPageSelect ? monstersPerPageSelect.value : '15';

    // Always use server-side filtering when filters are active OR when monsters per page is not 'all'
    // This ensures we have all the data needed for proper filtering and pagination
    if (hasActiveFilters || monstersPerPage !== 'all') {
      filterMonstersWithAllData(page);
    } else {
      filterMonstersClientSide(page);
    }
  };

  // Client-side filtering
  function filterMonstersClientSide(page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const speciesFilter = speciesSelect ? speciesSelect.value.toLowerCase() : 'all';
    const typeFilter = typeSelect ? typeSelect.value.toLowerCase() : 'all';
    const tierFilter = tierSelect ? tierSelect.value : 'all';
    const jobsFilter = jobsSelect ? jobsSelect.value.toLowerCase() : 'all';
    const locationsFilter = locationsSelect ? locationsSelect.value.toLowerCase() : 'all';
    const sortBy = sortSelect ? sortSelect.value : 'name-asc';

    const filtered = window.allMonsters.filter(monster => {
      const matchesSearch = !searchTerm ||
        (monster.name || '').toLowerCase().includes(searchTerm) ||
        (monster.type || '').toLowerCase().includes(searchTerm) ||
        (monster.species || '').toLowerCase().includes(searchTerm) ||
        (Array.isArray(monster.job) ? monster.job.some(job => job.toLowerCase().includes(searchTerm)) : false);

      const monsterSpecies = getSpeciesFromName(monster.name).toLowerCase();
      const matchesSpecies = speciesFilter === 'all' || monsterSpecies === speciesFilter;

      const monsterType = getTypeFromName(monster.name).toLowerCase();
      const matchesType = typeFilter === 'all' || monsterType === typeFilter;

      const matchesTier = tierFilter === 'all' || (monster.tier || 1).toString() === tierFilter;

      // Check job filter
      const monsterJobs = Array.isArray(monster.job) ? monster.job : [];
      const matchesJobs = jobsFilter === 'all' || 
        monsterJobs.some(job => job.toLowerCase() === jobsFilter);

      // Check location filter
      const monsterLocations = Array.isArray(monster.locations) ? monster.locations : [];
      const matchesLocations = locationsFilter === 'all' || 
        monsterLocations.some(location => location.toLowerCase() === locationsFilter);

      return matchesSearch && matchesSpecies && matchesType && matchesTier && matchesJobs && matchesLocations;
    });

    // Apply sorting
    const [field, direction] = sortBy.split('-');
    const isAsc = direction === 'asc';

    const sorted = [...filtered].sort((a, b) => {
      let valA, valB;
      
      switch (field) {
        case 'name':
          valA = a.name ?? '';
          valB = b.name ?? '';
          break;
        case 'tier':
          valA = a.tier ?? 1;
          valB = b.tier ?? 1;
          break;
        case 'hearts':
          valA = a.hearts ?? 0;
          valB = b.hearts ?? 0;
          break;
        case 'damage':
          valA = a.dmg ?? 0;
          valB = b.dmg ?? 0;
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
    const monstersPerPageSelect = document.getElementById('monsters-per-page');
    const monstersPerPage = monstersPerPageSelect ? 
      (monstersPerPageSelect.value === 'all' ? sorted.length : parseInt(monstersPerPageSelect.value)) : 
      15;
    const totalPages = Math.ceil(sorted.length / monstersPerPage);
    const startIndex = (page - 1) * monstersPerPage;
    const endIndex = startIndex + monstersPerPage;
    const paginatedMonsters = sorted.slice(startIndex, endIndex);

    // Update results info
    const resultsInfo = document.querySelector('.monster-results-info p');
    if (resultsInfo) {
      const isShowingAll = monstersPerPageSelect && monstersPerPageSelect.value === 'all';
      if (isShowingAll) {
        resultsInfo.textContent = `Showing all ${sorted.length} filtered monsters`;
      } else {
        resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${sorted.length} filtered monsters (Page ${page} of ${totalPages})`;
      }
    }

    // Render the paginated monsters
    renderMonsterCards(paginatedMonsters, page, sorted.length);

    // Update pagination
    if (monstersPerPageSelect && monstersPerPageSelect.value !== 'all' && sorted.length > monstersPerPage) {
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

  // Server-side filtering
  async function filterMonstersWithAllData(page = 1) {
    try {
      // Always fetch ALL monsters from the database
      const response = await fetch('/api/models/monster?all=true');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const { data: allMonsters } = await response.json();

      // Apply filtering and sorting to ALL monsters
      const filteredAndSorted = applyFiltersAndSort(allMonsters);



      // Apply pagination
      const monstersPerPageSelect = document.getElementById('monsters-per-page');
      const monstersPerPage = monstersPerPageSelect ? 
        (monstersPerPageSelect.value === 'all' ? filteredAndSorted.length : parseInt(monstersPerPageSelect.value)) : 
        15;
      const totalPages = Math.ceil(filteredAndSorted.length / monstersPerPage);
      const startIndex = (page - 1) * monstersPerPage;
      const endIndex = startIndex + monstersPerPage;
      const paginatedMonsters = filteredAndSorted.slice(startIndex, endIndex);

      // Update global monsters for this filtered view
      window.allMonsters = filteredAndSorted;

      // Update results info
      const resultsInfo = document.querySelector('.monster-results-info p');
      if (resultsInfo) {
        const isShowingAll = monstersPerPageSelect && monstersPerPageSelect.value === 'all';
        if (isShowingAll) {
          resultsInfo.textContent = `Showing all ${filteredAndSorted.length} filtered monsters`;
        } else {
          resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${filteredAndSorted.length} filtered monsters (Page ${page} of ${totalPages})`;
        }
      }

      // Render the paginated filtered monsters
      renderMonsterCards(paginatedMonsters, page, filteredAndSorted.length);

      // Update pagination for filtered results
      if (monstersPerPageSelect && monstersPerPageSelect.value !== 'all' && filteredAndSorted.length > monstersPerPage) {
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
      console.error('❌ Error fetching all monsters for filtering:', error);
      // Fallback to client-side filtering on current monsters
      filterMonstersClientSide(page);
    }
  }

  // Apply filters and sorting
  function applyFiltersAndSort(monsters) {
    const searchTerm = searchInput.value.toLowerCase();
    const speciesFilter = speciesSelect ? speciesSelect.value.toLowerCase() : 'all';
    const typeFilter = typeSelect ? typeSelect.value.toLowerCase() : 'all';
    const tierFilter = tierSelect ? tierSelect.value : 'all';
    const jobsFilter = jobsSelect ? jobsSelect.value.toLowerCase() : 'all';
    const locationsFilter = locationsSelect ? locationsSelect.value.toLowerCase() : 'all';
    const sortBy = sortSelect ? sortSelect.value : 'name-asc';

    // Apply filters
    const filtered = monsters.filter(monster => {
      const matchesSearch = !searchTerm ||
        (monster.name || '').toLowerCase().includes(searchTerm) ||
        (monster.type || '').toLowerCase().includes(searchTerm) ||
        (monster.species || '').toLowerCase().includes(searchTerm) ||
        (Array.isArray(monster.job) ? monster.job.some(job => job.toLowerCase().includes(searchTerm)) : false);

      const monsterSpecies = getSpeciesFromName(monster.name).toLowerCase();
      const matchesSpecies = speciesFilter === 'all' || monsterSpecies === speciesFilter;

      const monsterType = getTypeFromName(monster.name).toLowerCase();
      const matchesType = typeFilter === 'all' || monsterType === typeFilter;

      const matchesTier = tierFilter === 'all' || (monster.tier || 1).toString() === tierFilter;

      // Check job filter
      const monsterJobs = Array.isArray(monster.job) ? monster.job : [];
      const matchesJobs = jobsFilter === 'all' || 
        monsterJobs.some(job => job.toLowerCase() === jobsFilter);

      // Check location filter
      const monsterLocations = Array.isArray(monster.locations) ? monster.locations : [];
      const matchesLocations = locationsFilter === 'all' || 
        monsterLocations.some(location => location.toLowerCase() === locationsFilter);

      return matchesSearch && matchesSpecies && matchesType && matchesTier && matchesJobs && matchesLocations;
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
        case 'tier':
          valA = a.tier ?? 1;
          valB = b.tier ?? 1;
          break;
        case 'hearts':
          valA = a.hearts ?? 0;
          valB = b.hearts ?? 0;
          break;
        case 'damage':
          valA = a.dmg ?? 0;
          valB = b.dmg ?? 0;
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

  // Update filtered pagination
  function updateFilteredPagination(currentPage, totalPages, totalMonsters) {
    const contentDiv = document.getElementById('model-details-data');
    if (!contentDiv) {
      console.error('❌ Content div not found');
      return;
    }

    // Remove existing pagination
    const existingPagination = contentDiv.querySelector('.pagination');
    if (existingPagination) {
      existingPagination.remove();
    }

    // Only show pagination if there are multiple pages
    if (totalPages > 1) {
      
      const handlePageChange = async (pageNum) => {
        window.filterMonsters(pageNum);
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
  searchInput.addEventListener('input', () => window.filterMonsters(1));
  if (speciesSelect) speciesSelect.addEventListener('change', () => window.filterMonsters(1));
  if (typeSelect) typeSelect.addEventListener('change', () => window.filterMonsters(1));
  if (tierSelect) tierSelect.addEventListener('change', () => window.filterMonsters(1));
  if (jobsSelect) jobsSelect.addEventListener('change', () => window.filterMonsters(1));
  if (locationsSelect) locationsSelect.addEventListener('change', () => window.filterMonsters(1));
  if (sortSelect) sortSelect.addEventListener('change', () => window.filterMonsters(1));
  
  // Add monsters per page event listener
  const monstersPerPageSelect = document.getElementById('monsters-per-page');
  if (monstersPerPageSelect) {
    monstersPerPageSelect.addEventListener('change', () => window.filterMonsters(1));
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', async () => {
      searchInput.value = '';
      if (speciesSelect) speciesSelect.value = 'all';
      if (typeSelect) typeSelect.value = 'all';
      if (tierSelect) tierSelect.value = 'all';
      if (jobsSelect) jobsSelect.value = 'all';
      if (locationsSelect) locationsSelect.value = 'all';
      if (sortSelect) sortSelect.value = 'name-asc';
      if (monstersPerPageSelect) monstersPerPageSelect.value = '15';
      
      // Clear saved filter state
      window.savedMonsterFilterState = {};
      
      // Reload the original page data

      try {
        const response = await fetch('/api/models/monster?page=1');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const { data, pagination } = await response.json();
        
        // Update global monsters with original page data
        window.allMonsters = data;
        
        // Update results info
        const resultsInfo = document.querySelector('.monster-results-info p');
        if (resultsInfo) {
          resultsInfo.textContent = `Showing ${data.length} of ${pagination.total} monsters`;
        }
        
        // Re-render with original data
        renderMonsterCards(data, 1, pagination.total);
        
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
        window.filterMonsters(1);
      }
    });
  }
}

// ------------------- Function: populateFilterOptions -------------------
async function populateFilterOptions(monsters) {
  try {
    
    // Fetch all monsters from database to get unique filter values
    const response = await fetch('/api/models/monster?all=true');
    if (!response.ok) {
      console.warn('⚠️ Could not load monster filter options from database');
      return;
    }
    
    const { data: allMonsters } = await response.json();
    
    const speciesSelect = document.getElementById('filter-species');
    const typeSelect = document.getElementById('filter-type');
    const tierSelect = document.getElementById('filter-tier');
    const jobsSelect = document.getElementById('filter-jobs');
    const locationsSelect = document.getElementById('filter-locations');

    if (speciesSelect) {
      const species = [...new Set(allMonsters.map(m => getSpeciesFromName(m.name)))].sort();
      populateSelect(speciesSelect, species);
    }

    if (typeSelect) {
      const types = [...new Set(allMonsters.map(m => getTypeFromName(m.name)))].sort();
      populateSelect(typeSelect, types);
    }

    if (tierSelect) {
      const tiers = [...new Set(allMonsters.map(m => m.tier || 1))].sort((a, b) => a - b);
      populateSelect(tierSelect, tiers);
    }

    if (jobsSelect) {
      const jobs = [...new Set(allMonsters.flatMap(m => Array.isArray(m.job) ? m.job : []))].sort();
      populateSelect(jobsSelect, jobs);
    }

    if (locationsSelect) {
      const locations = [...new Set(allMonsters.flatMap(m => Array.isArray(m.locations) ? m.locations : []))].sort();
      populateSelect(locationsSelect, locations);
    }
    
      
  } catch (error) {
    console.error('❌ Error loading monster filter options from database:', error);
  }
}

// ------------------- Function: populateSelect -------------------
function populateSelect(select, values) {
  select.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());

  values.forEach(val => {
    const option = document.createElement('option');
    option.value = val.toString().toLowerCase();
    option.textContent = val.toString();
    select.appendChild(option);
  });
}

// ------------------- Function: initializeMonsterPage -------------------
async function initializeMonsterPage(data, page = 1, contentDiv) {
  window.allMonsters = data;

  // Create or refresh the standardized filter bar
  let filtersContainer = document.querySelector('.monster-filters');
  if (!filtersContainer) {
    filtersContainer = document.createElement('div');
    filtersContainer.className = 'monster-filters';
  }
  filtersContainer.innerHTML = '';

  const { bar: monsterFilterBar } = createSearchFilterBar({
    layout: 'wide',
    filters: [
      {
        type: 'input',
        id: 'monster-search-input',
        placeholder: 'Search monsters...',
        attributes: { autocomplete: 'off' },
        width: 'double'
      },
      { type: 'select', id: 'filter-species', options: [{ value: 'all', label: 'All Species' }] },
      { type: 'select', id: 'filter-type', options: [{ value: 'all', label: 'All Types' }] },
      {
        type: 'select',
        id: 'sort-by',
        options: [
          { value: 'name-asc', label: 'Name (A-Z)', selected: true },
          { value: 'name-desc', label: 'Name (Z-A)' },
          { value: 'tier-asc', label: 'Tier (Low-High)' },
          { value: 'tier-desc', label: 'Tier (High-Low)' },
          { value: 'hearts-desc', label: 'Hearts (High-Low)' },
          { value: 'damage-desc', label: 'Damage (High-Low)' }
        ]
      },
      {
        type: 'select',
        id: 'monsters-per-page',
        options: [
          { value: '15', label: '15 per page', selected: true },
          { value: '30', label: '30 per page' },
          { value: '45', label: '45 per page' },
          { value: '60', label: '60 per page' },
          { value: 'all', label: 'All monsters' }
        ]
      }
    ],
    advancedFilters: [
      { type: 'select', id: 'filter-tier', options: [{ value: 'all', label: 'All Tiers' }] },
      { type: 'select', id: 'filter-jobs', options: [{ value: 'all', label: 'All Jobs' }] },
      { type: 'select', id: 'filter-locations', options: [{ value: 'all', label: 'All Locations' }] }
    ],
    buttons: [
      { id: 'clear-filters', label: 'Clear Filters', className: 'clear-filters-btn' }
    ]
  });

  filtersContainer.appendChild(monsterFilterBar);
  contentDiv.insertBefore(filtersContainer, contentDiv.firstChild);

  // Create monster container if it doesn't exist
  let container = document.getElementById('monsters-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'monsters-container';
    container.className = 'monster-details-grid';
    contentDiv.appendChild(container);
  }

  // Add results info section
  let resultsInfo = document.querySelector('.monster-results-info');
  if (!resultsInfo) {
    resultsInfo = document.createElement('div');
    resultsInfo.className = 'monster-results-info';
    resultsInfo.innerHTML = `<p>Showing ${data.length} monsters (sorted alphabetically)</p>`;
    contentDiv.insertBefore(resultsInfo, container);
  }

  renderMonsterCards(data, page, data.length);
  await setupMonsterFilters(data);
}

export {
  renderMonsterCards,
  initializeMonsterPage
}; 