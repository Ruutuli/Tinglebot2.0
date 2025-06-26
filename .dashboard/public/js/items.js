/* ====================================================================== */
/* Item Rendering and Filtering Module                                   */
/* Handles item card rendering, filtering, pagination, and item details */
/* ====================================================================== */

import { scrollToTop } from './ui.js';

// ============================================================================
// ------------------- Rendering: Item Cards -------------------
// Displays items with pagination and category-based styling
// ============================================================================

// ------------------- Function: renderItemCards -------------------
// Renders all item cards with pagination and detail sections
function renderItemCards(items, page = 1) {
    // ------------------- Sort Items Alphabetically by Default -------------------
    const sortedItems = [...items].sort((a, b) => {
      const nameA = (a.itemName || '').toLowerCase();
      const nameB = (b.itemName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    console.log('🎨 Starting item rendering:', { 
      itemsLength: sortedItems?.length,
      page,
      firstItem: sortedItems?.[0]?.itemName
    });

    // Scroll to top of the page
    scrollToTop();

    const grid = document.getElementById('items-container');
    if (!grid) {
      console.error('❌ Grid container not found');
      return;
    }
    console.log('✅ Found grid container');
  
    // ------------------- No Items Found -------------------
    if (!sortedItems || sortedItems.length === 0) {
      console.log('⚠️ No items to render');
      grid.innerHTML = '<div class="item-loading">No items found</div>';
      const pagination = document.getElementById('item-pagination');
      if (pagination) pagination.innerHTML = '';
      return;
    }
  
    console.log('✅ Items sorted alphabetically');
    
    // Get items per page setting
    const itemsPerPageSelect = document.getElementById('items-per-page');
    const itemsPerPage = itemsPerPageSelect ? 
      (itemsPerPageSelect.value === 'all' ? sortedItems.length : parseInt(itemsPerPageSelect.value)) : 
      12;
    
    // Calculate pagination info
    const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, sortedItems.length);
  
    // ------------------- Render Item Cards -------------------
    console.log('🎨 Rendering item cards');
    grid.innerHTML = sortedItems.map(item => {
      console.log('📦 Processing item:', item.itemName);
      
      // Helper for tags
      const renderTags = arr => (Array.isArray(arr) ? arr.filter(Boolean).map(tag => `<span class="item-tag">${tag.trim()}</span>`).join('') : '');
      
      // Emoji: show as image if it looks like a URL, else as text, but hide Discord codes
      let emoji = '';
      if (item.emoji && item.emoji.startsWith('http')) {
        emoji = `<img src="${item.emoji}" alt="emoji" class="item-emoji-img">`;
      } else if (item.emoji && !item.emoji.startsWith('<:')) {
        emoji = `<span class="item-emoji">${item.emoji}</span>`;
      }
      
      // Section helpers
      const obtainTags = item.obtainTags?.length ? item.obtainTags : item.obtain;
      const locationsTags = item.locationsTags?.length ? item.locationsTags : item.locations;
      const jobsTags = item.allJobsTags?.length ? item.allJobsTags : item.allJobs;
      
      // Crafting materials
      const craftingMaterials = Array.isArray(item.craftingMaterial) && item.craftingMaterial.length
        ? item.craftingMaterial.map(mat => `<div class="item-crafting-row"><span class="item-crafting-qty">${mat.quantity} ×</span> <span class="item-tag">${mat.itemName}</span></div>`).join('')
        : '';
      
      // Special weather
      let weatherTags = '';
      if (item.specialWeather && typeof item.specialWeather === 'object') {
        const weatherMap = {
          muggy: 'Muggy',
          flowerbloom: 'Flowerbloom',
          fairycircle: 'Fairycircle',
          jubilee: 'Jubilee',
          meteorShower: 'Meteor Shower',
          rockslide: 'Rockslide',
          avalanche: 'Avalanche'
        };
        weatherTags = Object.entries(weatherMap)
          .filter(([key]) => item.specialWeather[key])
          .map(([, label]) => `<span class="item-tag">${label}</span>`)
          .join('');
      }
      
      // Subtype
      const subtype = Array.isArray(item.subtype) ? item.subtype.filter(Boolean).join(', ') : (item.subtype || '');
      
      // Slot (Head/Chest/Legs/Weapon/Shield etc.)
      const slot = (item.type && item.type.length > 0) ? item.type[0] : '';
      
      // Type bar color/icon
      const mainType = (item.category && (Array.isArray(item.category) ? item.category[0] : item.category)) || 'Misc';
      
      // Type bar color (fallback to blue)
      const typeColorMap = {
        'Armor': '#1F5D50',
        'Weapon': '#B99F65',
        'Shield': '#6A8ED6',
        'Material': '#0169A0',
        'Recipe': '#AF966D',
        'Misc': '#888888',
      };
      const typeBarColor = typeColorMap[mainType] || '#1F5D50';
      
      // Stats logic variables
      const isCraftable = Array.isArray(item.craftingMaterial) && item.craftingMaterial.length > 0;
      const isArmor = (item.category && (Array.isArray(item.category) ? item.category.includes('Armor') : item.category === 'Armor'));
      const isWeapon = (item.category && (Array.isArray(item.category) ? item.category.includes('Weapon') : item.category === 'Weapon'));
      const isRecipe = (item.category && (Array.isArray(item.category) ? item.category.includes('Recipe') : item.category === 'Recipe'));

      return `
        <div class="model-details-item item-card modern-item-card" data-item-name="${item.itemName}" onclick="this.classList.toggle('flipped')">
          <div class="item-header-row modern-item-header">
            <div class="item-image-card">
              <img 
                src="${formatItemImageUrl(item.image)}" 
                alt="${item.itemName}" 
                class="item-image modern-item-image"
                onerror="console.error('❌ Failed to load:', this.src); this.src='/images/ankleicon.png';"
                crossorigin="anonymous"
              >
              ${emoji}
            </div>
            <div class="item-header-info modern-item-header-info">
              <div class="item-name-row">
                <span class="item-name-big">${item.itemName}</span>
              </div>
              <div class="item-type-bar" style="background:${typeBarColor};">
                ${renderItemTypeIcon(item.imageType)}
                <span class="item-type-bar-label">${mainType}</span>
              </div>
              <div class="item-slot-row">
                ${slot ? `<span class="item-slot-label">${slot}</span>` : ''}
                ${subtype ? `<span class="item-subtype-label">${subtype}</span>` : ''}
              </div>
            </div>
          </div>
          
          <div class="item-section modern-item-details">
            <div class="item-section-label modern-item-section-label"><i class="fas fa-info-circle"></i> Details</div>
            <div class="item-detail-list modern-item-detail-list">
              <div class="item-detail-row modern-item-detail-row">
                <strong>Buy:</strong> <span>${item.buyPrice ?? 0}</span> 
                <strong style="margin-left:1.2em;">Sell:</strong> <span>${item.sellPrice ?? 0}</span>
              </div>
              <div class="item-detail-row modern-item-detail-row">
                <strong>Stackable:</strong> <span>${item.stackable ? `Yes (Max: ${item.maxStackSize || 10})` : 'No'}</span>
              </div>
            </div>
          </div>
          
          <div class="item-section modern-item-section">
            <div class="item-section-label modern-item-section-label"><i class="fas fa-route"></i> Sources</div>
            <div class="item-tag-list modern-item-tag-list">
              ${obtainTags && obtainTags.filter(Boolean).length ? renderTags(obtainTags) : '<span class="item-tag">None</span>'}
            </div>
          </div>
          
          <div class="item-section modern-item-section">
            <div class="item-section-label modern-item-section-label"><i class="fas fa-map-marker-alt"></i> Locations</div>
            <div class="item-tag-list modern-item-tag-list">
              ${locationsTags && locationsTags.filter(Boolean).length ? renderLocationTags(locationsTags) : '<span class="item-tag">None</span>'}
            </div>
          </div>
          
          <div class="item-section modern-item-section">
            <div class="item-section-label modern-item-section-label"><i class="fas fa-user"></i> Jobs</div>
            <div class="item-tag-list modern-item-tag-list">
              ${jobsTags && jobsTags.filter(Boolean).length ? renderTags(jobsTags) : '<span class="item-tag">None</span>'}
            </div>
          </div>
          
          <div class="item-section modern-item-section">
            <div class="item-section-label modern-item-section-label"><i class="fas fa-tools"></i> Crafting Materials</div>
            <div class="item-crafting-list modern-item-crafting-list">
              ${craftingMaterials ? craftingMaterials : '<div class="item-crafting-row"><span class="item-tag">Not Craftable</span></div>'}
            </div>
          </div>
          
          <div class="item-section modern-item-section">
            <div class="item-section-label modern-item-section-label"><i class="fas fa-cloud-sun"></i> Special Weather</div>
            <div class="item-tag-list modern-item-tag-list">
              ${weatherTags ? weatherTags : '<span class="item-tag">None</span>'}
            </div>
          </div>
          
          ${isCraftable ? `
          <div class="item-section modern-item-section">
            <div class="item-section-label modern-item-section-label"><i class="fas fa-chart-bar"></i> Stats</div>
            <div class="item-stats-row modern-item-stats-row">
              ${isRecipe ? `
                <span class="item-stat-pill modern-item-stat-pill">
                  <i class="fas fa-heart"></i>
                  <span class="stat-label">Hearts Recovered:</span>
                  <span class="stat-value">${item.modifierHearts ?? 0}</span>
                </span>
                <span class="item-stat-pill modern-item-stat-pill">
                  <i class="fas fa-bolt"></i>
                  <span class="stat-label">Stamina Recovered:</span>
                  <span class="stat-value">${item.staminaRecovered ?? 0}</span>
                </span>
                ${item.staminaToCraft !== null && item.staminaToCraft !== undefined ? `
                  <span class="item-stat-pill modern-item-stat-pill">
                    <i class="fas fa-fire"></i>
                    <span class="stat-label">Stamina to Craft:</span>
                    <span class="stat-value">${item.staminaToCraft}</span>
                  </span>
                ` : ''}
              ` : (isArmor || isWeapon) ? `
                <span class="item-stat-pill modern-item-stat-pill">
                  <i class="fas fa-heart"></i>
                  <span class="stat-label">Modifier:</span>
                  <span class="stat-value">${item.modifierHearts ?? 0}</span>
                </span>
                ${item.staminaToCraft !== null && item.staminaToCraft !== undefined ? `
                  <span class="item-stat-pill modern-item-stat-pill">
                    <i class="fas fa-fire"></i>
                    <span class="stat-label">Stamina to Craft:</span>
                    <span class="stat-value">${item.staminaToCraft}</span>
                  </span>
                ` : ''}
              ` : `
                <span class="item-stat-pill modern-item-stat-pill">
                  <i class="fas fa-heart"></i>
                  <span class="stat-label">Hearts Recovered:</span>
                  <span class="stat-value">${item.modifierHearts ?? 0}</span>
                </span>
                <span class="item-stat-pill modern-item-stat-pill">
                  <i class="fas fa-bolt"></i>
                  <span class="stat-label">Stamina Recovered:</span>
                  <span class="stat-value">${item.staminaRecovered ?? 0}</span>
                </span>
                ${item.staminaToCraft !== null && item.staminaToCraft !== undefined ? `
                  <span class="item-stat-pill modern-item-stat-pill">
                    <i class="fas fa-fire"></i>
                    <span class="stat-label">Stamina to Craft:</span>
                    <span class="stat-value">${item.staminaToCraft}</span>
                  </span>
                ` : ''}
              `}
            </div>
          </div>
          ` : ''}
          
          <div id="item-${item.itemName.replace(/[^a-zA-Z0-9]/g, '-')}-back" class="item-card-back">
            <div class="character-inventory-section">
              <div class="character-inventory-title">Characters that have ${item.itemName}</div>
              <div class="character-inventory-empty">
                <i class="fas fa-spinner fa-spin"></i> Loading inventory data...
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    console.log('✅ Item cards rendered');
  
    // ------------------- Attach Inventory Loading Handlers -------------------
    console.log('🎯 Attaching inventory loading handlers');
    items.forEach(item => {
      const safeItemName = item.itemName.replace(/[^a-zA-Z0-9]/g, '-');
      const backContent = document.querySelector(`#item-${safeItemName}-back`);
      if (!backContent) return;
      
      // Add click handler for lazy loading
      const card = document.querySelector(`.item-card[data-item-name="${item.itemName}"]`);
      if (!card) {
        console.log(`[Inventory UI] ⚠️ Card not found for item: ${item.itemName}`);
        return;
      }

      console.log(`[Inventory UI] 🎯 Setting up click handler for item: ${item.itemName}`);
      
      card.addEventListener('click', async () => {
        console.log(`[Inventory UI] 🖱️ Card clicked for item: ${item.itemName}`);
        const startTime = Date.now();
        
        // Initialize cache if needed
        const cache = initializeInventoryCache();
        
        // Check cache first
        const cachedData = cache.get(item.itemName);
        if (cachedData) {
          console.log(`[Inventory UI] 🎯 Using cached data for item: ${item.itemName}`);
          console.log(`[Inventory UI] ⏱️ Cache response time: ${Date.now() - startTime}ms`);
          backContent.innerHTML = cachedData;
          return;
        }
        
        console.log(`[Inventory UI] 🔍 Cache miss for item: ${item.itemName}, fetching from API...`);
        
        // Show loading state
        backContent.innerHTML = `
          <div class="character-inventory-section">
            <div class="character-inventory-title">Character Inventories</div>
            <div class="character-inventory-empty">
              <i class="fas fa-spinner fa-spin"></i> Loading inventory data...
            </div>
          </div>
        `;
        
        try {
          console.log(`[Inventory UI] 📡 Fetching inventory data for: ${item.itemName}`);
          const inventoryHTML = await fetchItemInventory(item.itemName);
          console.log(`[Inventory UI] ✅ Received inventory data for: ${item.itemName}`);
          
          backContent.innerHTML = inventoryHTML;
          console.log(`[Inventory UI] 💾 Cached inventory data for: ${item.itemName}`);
          
          console.log(`[Inventory UI] ⏱️ Total load time: ${Date.now() - startTime}ms`);
        } catch (error) {
          console.error(`[Inventory UI] ❌ Error loading inventory data for ${item.itemName}:`, error);
          console.error(`[Inventory UI] ⏱️ Failed after: ${Date.now() - startTime}ms`);
          
          backContent.innerHTML = `
            <div class="character-inventory-section">
              <div class="character-inventory-title">Character Inventories</div>
              <div class="character-inventory-empty">Error loading inventory data</div>
            </div>
          `;
        }
      });
    });
    console.log('✅ Inventory handlers attached');

    // Update results info
    const resultsInfo = document.querySelector('.item-results-info p');
    if (resultsInfo) {
      const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
      resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${sortedItems.length} items (Page ${page} of ${totalPages})`;
    }
  }
  
  // ============================================================================
// ------------------- Rendering: Helpers -------------------
// Returns detail items, formatted values, and modal content
// ============================================================================

// ------------------- Function: renderDetail -------------------
// Returns HTML for a basic item detail row
function renderDetail(label, value) {
  return `
    <div class="item-detail">
      <div class="item-detail-label">${label}</div>
      <div class="item-detail-value">${value}</div>
    </div>
  `;
}

// ------------------- Function: capitalize -------------------
// Capitalizes the first letter of a string safely
function capitalize(str) {
  return typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// ------------------- Function: formatItemImageUrl -------------------
// Formats and returns item image URL
function formatItemImageUrl(image) {
  if (!image || image === 'No Image') return '/images/ankleicon.png';
  if (image.startsWith('http')) return image;
  return `/api/images/${image}`;
}

// ------------------- Function: renderLocationTags -------------------
// Renders location tags with color classes
function renderLocationTags(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.filter(Boolean).map(tag => {
    const key = tag.trim().toLowerCase();
    const colorClass = LOCATION_COLORS[key] || '';
    return `<span class="item-tag ${colorClass}">${tag.trim()}</span>`;
  }).join('');
}

// ------------------- Function: renderItemTypeIcon -------------------
// Renders the item type icon for a given image type
function renderItemTypeIcon(imageType) {
  if (imageType && imageType !== 'No Image Type') {
    // Use imageType as a direct image URL
    return `<img src="${imageType}" alt="Type Icon" class="item-type-icon" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<i class=\'fas fa-star\'></i>')">`;
  } else {
    // Fallback icon (FontAwesome star)
    return `<i class="fas fa-star"></i>`;
  }
}

// ============================================================================
// ------------------- Enhanced Inventory Cache System -------------------
// Optimized caching with localStorage persistence and performance improvements
// ============================================================================

// ------------------- Function: initializeInventoryCache -------------------
// Initializes the enhanced inventory cache system
function initializeInventoryCache() {
  if (window.inventoryCache) return window.inventoryCache;

  const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
  const MAX_CACHE_SIZE = 1000; // Maximum number of cached items
  const CACHE_KEY = 'tinglebot_inventory_cache';
  const TIMESTAMP_KEY = 'tinglebot_inventory_timestamps';

  // Load existing cache from localStorage
  let data = new Map();
  let timestamps = new Map();
  
  try {
    const savedData = localStorage.getItem(CACHE_KEY);
    const savedTimestamps = localStorage.getItem(TIMESTAMP_KEY);
    
    if (savedData && savedTimestamps) {
      const parsedData = JSON.parse(savedData);
      const parsedTimestamps = JSON.parse(savedTimestamps);
      
      // Filter out expired entries
      const now = Date.now();
      Object.entries(parsedTimestamps).forEach(([key, timestamp]) => {
        if (now - timestamp < CACHE_DURATION) {
          data.set(key, parsedData[key]);
          timestamps.set(key, timestamp);
        }
      });
      
      console.log(`[Cache] Loaded ${data.size} cached items from localStorage`);
    }
  } catch (error) {
    console.warn('[Cache] Failed to load cache from localStorage:', error);
  }

  window.inventoryCache = {
    data,
    timestamps,
    CACHE_DURATION,
    MAX_CACHE_SIZE,
    
    set(key, value) {
      // Remove oldest entries if cache is full
      if (this.data.size >= this.MAX_CACHE_SIZE) {
        this.evictOldest();
      }
      
      this.data.set(key, value);
      this.timestamps.set(key, Date.now());
      this.persistToStorage();
    },
    
    get(key) {
      const timestamp = this.timestamps.get(key);
      if (!timestamp) return null;
      
      if (Date.now() - timestamp > this.CACHE_DURATION) {
        this.data.delete(key);
        this.timestamps.delete(key);
        this.persistToStorage();
        return null;
      }
      
      return this.data.get(key);
    },
    
    has(key) {
      const timestamp = this.timestamps.get(key);
      if (!timestamp) return false;
      
      if (Date.now() - timestamp > this.CACHE_DURATION) {
        this.data.delete(key);
        this.timestamps.delete(key);
        this.persistToStorage();
        return false;
      }
      
      return true;
    },
    
    evictOldest() {
      if (this.data.size === 0) return;
      
      let oldestKey = null;
      let oldestTime = Date.now();
      
      for (const [key, timestamp] of this.timestamps) {
        if (timestamp < oldestTime) {
          oldestTime = timestamp;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        this.data.delete(oldestKey);
        this.timestamps.delete(oldestKey);
        console.log(`[Cache] Evicted oldest entry: ${oldestKey}`);
      }
    },
    
    persistToStorage() {
      try {
        const dataObj = Object.fromEntries(this.data);
        const timestampsObj = Object.fromEntries(this.timestamps);
        
        localStorage.setItem(CACHE_KEY, JSON.stringify(dataObj));
        localStorage.setItem(TIMESTAMP_KEY, JSON.stringify(timestampsObj));
      } catch (error) {
        console.warn('[Cache] Failed to persist cache to localStorage:', error);
      }
    },
    
    clear() {
      this.data.clear();
      this.timestamps.clear();
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(TIMESTAMP_KEY);
      console.log('[Cache] Cache cleared');
    },
    
    getStats() {
      return {
        size: this.data.size,
        maxSize: this.MAX_CACHE_SIZE,
        duration: this.CACHE_DURATION / (60 * 60 * 1000), // hours
        hitRate: this.hitCount / (this.hitCount + this.missCount) || 0
      };
    },
    
    hitCount: 0,
    missCount: 0
  };

  console.log(`[Cache] Enhanced inventory cache initialized with ${data.size} items`);
  return window.inventoryCache;
}

// ------------------- Function: fetchItemInventoryWithTimeout -------------------
// Enhanced fetch function with timeout and better error handling
async function fetchItemInventoryWithTimeout(itemName, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    console.log(`[Inventory] 📡 Fetching inventory for: ${itemName} (timeout: ${timeout}ms)`);
    
    const response = await fetch('/api/inventory/item', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ itemName }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`[Inventory] ✅ Received ${data.length} inventory entries for: ${itemName}`);
    
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    
    throw error;
  }
}

// ------------------- Function: createInventoryHTML -------------------
// Creates HTML for inventory display
function createInventoryHTML(itemName, data) {
  let inventoryHTML = `
    <div class="character-inventory-section">
      <div class="character-inventory-title">Characters that have ${itemName}</div>
  `;

  if (!data || data.length === 0) {
    inventoryHTML += `
      <div class="character-inventory-empty">
        No characters have this item
      </div>
    `;
  } else {
    // Sort by quantity descending before rendering
    data.sort((a, b) => b.quantity - a.quantity);
    inventoryHTML += `
      <div class="character-inventory-list">
        ${data.map(item => `
          <div class="character-inventory-item">
            <span class="character-inventory-name">${item.characterName}</span>
            <span class="character-inventory-quantity">x${item.quantity}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  inventoryHTML += `</div>`;
  return inventoryHTML;
}

// ------------------- Function: fetchItemInventory -------------------
// Enhanced inventory fetching with improved caching and performance
async function fetchItemInventory(itemName) {
  const cache = initializeInventoryCache();
  
  try {
    console.log(`\n==========================================`);
    console.log(`🔍 Fetching inventory for item: ${itemName}`);
    console.log(`==========================================\n`);
    
    // Check cache first
    const cachedHTML = cache.get(itemName);
    if (cachedHTML) {
      cache.hitCount++;
      console.log(`[Cache] ✅ Cache hit for: ${itemName}`);
      return cachedHTML;
    }
    
    cache.missCount++;
    console.log(`[Cache] ❌ Cache miss for: ${itemName}`);
    
    // Fetch data with timeout
    const data = await fetchItemInventoryWithTimeout(itemName, 12000);
    
    // Create HTML
    const inventoryHTML = createInventoryHTML(itemName, data);
    
    // Cache the result
    cache.set(itemName, inventoryHTML);
    console.log(`[Cache] 💾 Cached inventory data for: ${itemName}`);
    
    console.log('✅ Inventory section created successfully');
    return inventoryHTML;
  } catch (error) {
    console.error('❌ Error fetching inventory:', error);
    
    // Return error HTML
    return `
      <div class="character-inventory-section">
        <div class="character-inventory-title">Characters that have ${itemName}</div>
        <div class="character-inventory-empty">
          <i class="fas fa-exclamation-triangle"></i> Error loading inventory data
          <br><small>${error.message}</small>
        </div>
      </div>
    `;
  }
}

// ------------------- Function: preloadVisibleItemInventories -------------------
// Preloads inventory data for items currently visible on screen
async function preloadVisibleItemInventories() {
  if (!window.allItems || !window.inventoryCache) return;
  
  // Check if preloading is disabled due to too many timeouts
  if (window.preloadDisabled) {
    console.log('[Preload] Preloading disabled due to previous timeouts');
    return;
  }
  
  const cache = window.inventoryCache;
  const visibleItems = window.allItems.slice(0, 12); // Reduced from 24 to 12 items
  const itemsToPreload = visibleItems.filter(item => !cache.has(item.itemName));
  
  if (itemsToPreload.length === 0) {
    console.log('[Preload] No items need preloading');
    return;
  }
  
  console.log(`[Preload] Preloading ${itemsToPreload.length} item inventories...`);
  
  // Track timeout count
  let timeoutCount = 0;
  const maxTimeouts = 3;
  
  // More conservative batch loading with longer delays
  const batchSize = 3; // Reduced from 5 to 3
  for (let i = 0; i < itemsToPreload.length; i += batchSize) {
    const batch = itemsToPreload.slice(i, i + batchSize);
    
    // Process batch sequentially instead of concurrently to reduce server load
    for (const item of batch) {
      try {
        await fetchItemInventory(item.itemName);
        console.log(`[Preload] ✅ Preloaded: ${item.itemName}`);
      } catch (error) {
        console.warn(`[Preload] ⚠️ Failed to preload: ${item.itemName}`, error);
        timeoutCount++;
        
        // Disable preloading if too many timeouts
        if (timeoutCount >= maxTimeouts) {
          console.warn(`[Preload] Too many timeouts (${timeoutCount}), disabling preloading`);
          window.preloadDisabled = true;
          return;
        }
        // Continue with next item even if one fails
      }
      
      // Small delay between individual items
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Longer delay between batches
    if (i + batchSize < itemsToPreload.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('[Preload] Preloading complete');
}

// ============================================================================
// ------------------- Filtering: Dropdown and Search -------------------
// Applies filters to item list based on UI selection
// ============================================================================

// Helper function to split comma-separated values and handle arrays
const splitValues = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    // Flatten and split any comma-separated strings inside the array
    return value.flatMap(v => splitValues(v));
  }
  if (typeof value === 'string') {
    // Split comma-separated, trim, and filter out empty
    return value.split(',').map(v => v.trim()).filter(v => v);
  }
  return [];
};

// Fetch all items for filter dropdowns and cache them
async function fetchAllItemsForFilters() {
  if (window.allItemsForFilters) return window.allItemsForFilters;
  try {
    const response = await fetch('/api/models/item?all=true');
    if (!response.ok) throw new Error('Failed to fetch all items for filters');
    const { data } = await response.json();
    window.allItemsForFilters = data;
    return data;
  } catch (err) {
    console.error('[Filter Debug] Failed to fetch all items for filters, using current page only:', err);
    // Fallback: use current page items if available
    return window.allItems || [];
  }
}

// ------------------- Function: populateFilterOptions -------------------
// Populates dropdowns for category, type, subtype, jobs, and locations based on unique values
async function populateFilterOptions(items) {
  // Always load from JSON file first
  await loadFilterOptionsFromJSON();
  
  // If we have items, we could also populate from live data, but for now we'll just use the JSON
  if (items?.length) {
    console.log(`[Filter Debug] Items available (${items.length}), but using JSON file for filter options`);
  }
}

// ------------------- Function: loadFilterOptionsFromJSON -------------------
// Loads filter options from the JSON file as a fallback
async function loadFilterOptionsFromJSON() {
  try {
    console.log('📄 Loading filter options from JSON file...');
    const response = await fetch('/js/itemFilterOptions.json');
    if (!response.ok) {
      console.warn('⚠️ Could not load filter options from JSON file');
      return;
    }
    
    const filterOptions = await response.json();
    console.log('✅ Loaded filter options from JSON:', filterOptions);
    
    populateSelect('filter-category', filterOptions.categories || []);
    populateSelect('filter-type', filterOptions.types || []);
    populateSelect('filter-subtype', filterOptions.subtypes || []);
    populateSelect('filter-jobs', filterOptions.jobs || []);
    populateSelect('filter-locations', filterOptions.locations || []);
    populateSelect('filter-sources', filterOptions.sources || []);
    
    console.log('✅ Filter options populated from JSON file');
  } catch (error) {
    console.error('❌ Error loading filter options from JSON:', error);
  }
}

// ------------------- Function: populateSelect -------------------
// Helper to populate a <select> element with new options
function populateSelect(id, values) {
  const select = document.getElementById(id);
  if (!select) return;

  select.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());

  const formatted = values
    .map(v => capitalize(v.toString().toLowerCase()))
    .sort();

  formatted.forEach(val => {
    const option = document.createElement('option');
    option.value = val.toLowerCase();
    option.textContent = val;
    select.appendChild(option);
  });
}

// ------------------- Function: setupItemFilters -------------------
// Adds listeners to filter UI and re-renders items on change
async function setupItemFilters(items) {
  console.log('Setting up item filters...');

  window.allItems = items;

  if (window.itemFiltersInitialized) {
    console.log('Filters already initialized, skipping setup');
    window.filterItems();
    return;
  }

  // Show the filters container
  const filtersContainer = document.querySelector('.item-filters');
  if (filtersContainer) {
    filtersContainer.style.display = 'flex';
  }

  const searchInput = document.getElementById('item-search-input');
  const categorySelect = document.getElementById('filter-category');
  const typeSelect = document.getElementById('filter-type');
  const subtypeSelect = document.getElementById('filter-subtype');
  const jobsSelect = document.getElementById('filter-jobs');
  const locationsSelect = document.getElementById('filter-locations');
  const sourcesSelect = document.getElementById('filter-sources');
  const sortSelect = document.getElementById('sort-by');
  const itemsPerPageSelect = document.getElementById('items-per-page');
  const clearFiltersBtn = document.getElementById('clear-filters');

  const missing = [searchInput, categorySelect, typeSelect, subtypeSelect, jobsSelect, locationsSelect, sourcesSelect, sortSelect, itemsPerPageSelect, clearFiltersBtn].some(el => !el);
  if (missing) {
    if (!window.filterSetupRetried) {
      console.warn('Retrying filter setup once...');
      window.filterSetupRetried = true;
      requestAnimationFrame(() => setupItemFilters(items));
    } else {
      console.error('❌ Failed to initialize item filters. Please refresh.');
    }
    return;
  }

  window.filterSetupRetried = false;

  // Populate filter options with available values
  await populateFilterOptions(items);

  // Restore filter state if it exists
  const savedFilterState = window.savedFilterState || {};
  if (savedFilterState.searchTerm) searchInput.value = savedFilterState.searchTerm;
  if (savedFilterState.categoryFilter) categorySelect.value = savedFilterState.categoryFilter;
  if (savedFilterState.typeFilter) typeSelect.value = savedFilterState.typeFilter;
  if (savedFilterState.subtypeFilter) subtypeSelect.value = savedFilterState.subtypeFilter;
  if (savedFilterState.jobsFilter) jobsSelect.value = savedFilterState.jobsFilter;
  if (savedFilterState.locationsFilter) locationsSelect.value = savedFilterState.locationsFilter;
  if (savedFilterState.sourcesFilter) sourcesSelect.value = savedFilterState.sourcesFilter;
  if (savedFilterState.sortBy) sortSelect.value = savedFilterState.sortBy;

  // ------------------- Function: filterItems -------------------
  // Main filtering function that handles both server-side and client-side filtering
  window.filterItems = async function (page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value.toLowerCase();
    const typeFilter = typeSelect.value.toLowerCase();
    const subtypeFilter = subtypeSelect.value.toLowerCase();
    const jobsFilter = jobsSelect.value.toLowerCase();
    const locationsFilter = locationsSelect.value.toLowerCase();
    const sourcesFilter = sourcesSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const itemsPerPage = itemsPerPageSelect.value;

    console.log('🔍 filterItems called:', {
      page,
      searchTerm,
      categoryFilter,
      typeFilter,
      subtypeFilter,
      jobsFilter,
      locationsFilter,
      sourcesFilter,
      sortBy,
      itemsPerPage
    });

    // Save current filter state
    window.savedFilterState = {
      searchTerm: searchInput.value,
      categoryFilter,
      typeFilter,
      subtypeFilter,
      jobsFilter,
      locationsFilter,
      sourcesFilter,
      sortBy,
      itemsPerPage
    };

    // Check if any filters are active
    const hasActiveFilters = searchTerm || 
      categoryFilter !== 'all' || 
      typeFilter !== 'all' || 
      subtypeFilter !== 'all' || 
      jobsFilter !== 'all' || 
      locationsFilter !== 'all' || 
      sourcesFilter !== 'all';

    console.log('🔍 Filter analysis:', {
      hasActiveFilters,
      itemsPerPage,
      willUseServerSide: hasActiveFilters || itemsPerPage !== 'all'
    });

    // Always use server-side filtering when filters are active OR when items per page is not 'all'
    // This ensures we have all the data needed for proper pagination
    if (hasActiveFilters || itemsPerPage !== 'all') {
      // When filters are active or pagination is needed, always fetch all items and filter client-side
      console.log('🔍 Using server-side filtering (filterItemsWithAllData)');
      await filterItemsWithAllData(page);
    } else {
      console.log('🔍 Using client-side filtering (filterItemsClientSide)');
      filterItemsClientSide(page);
    }
  };

  // ------------------- Function: filterItemsWithAllData -------------------
  // Fetches all items from database and applies client-side filtering
  async function filterItemsWithAllData(page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value.toLowerCase();
    const typeFilter = typeSelect.value.toLowerCase();
    const subtypeFilter = subtypeSelect.value.toLowerCase();
    const jobsFilter = jobsSelect.value.toLowerCase();
    const locationsFilter = locationsSelect.value.toLowerCase();
    const sourcesFilter = sourcesSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const itemsPerPage = itemsPerPageSelect.value === 'all' ? 999999 : parseInt(itemsPerPageSelect.value);

    console.log('🔍 filterItemsWithAllData called:', {
      page,
      itemsPerPage,
      itemsPerPageSelectValue: itemsPerPageSelect.value
    });

    // Show loading state
    const resultsInfo = document.querySelector('.item-results-info p');
    if (resultsInfo) {
      resultsInfo.textContent = 'Loading filtered items...';
    }

    try {
      // Always fetch ALL items from the database
      const response = await fetch('/api/models/item?all=true');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const { data: allItems } = await response.json();

      console.log('🔍 Fetched items from database:', allItems.length);

      // Apply filtering and sorting to ALL items
      const filteredAndSorted = applyFiltersAndSort(allItems);

      console.log('🔍 After filtering and sorting:', filteredAndSorted.length);

      // Apply pagination
      const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedItems = filteredAndSorted.slice(startIndex, endIndex);

      console.log('🔍 Pagination details:', {
        totalPages,
        startIndex,
        endIndex,
        paginatedItemsLength: paginatedItems.length,
        itemsPerPage
      });

      // Update global items for this filtered view
      window.allItems = filteredAndSorted;

      // Update results info
      if (resultsInfo) {
        if (itemsPerPageSelect.value === 'all') {
          resultsInfo.textContent = `Showing all ${filteredAndSorted.length} filtered items`;
        } else {
          resultsInfo.textContent = `Showing ${paginatedItems.length} of ${filteredAndSorted.length} filtered items (Page ${page} of ${totalPages})`;
        }
      }

      // Render the paginated filtered items
      renderItemCards(paginatedItems, page);

      // Update pagination for filtered results
      if (itemsPerPageSelect.value !== 'all' && filteredAndSorted.length > itemsPerPage) {
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

      // Ensure pagination is created after a short delay to avoid conflicts
      setTimeout(() => {
        const contentDiv = document.getElementById('model-details-data');
        if (contentDiv && !contentDiv.querySelector('.pagination')) {
          console.log('🔄 Recreating filtered pagination due to timing conflict');
          if (itemsPerPageSelect.value !== 'all' && filteredAndSorted.length > itemsPerPage) {
            updateFilteredPagination(page, totalPages, filteredAndSorted.length);
          }
        }
      }, 100);

    } catch (error) {
      console.error('❌ Error fetching all items for filtering:', error);
      // Fallback to client-side filtering on current items
      console.log('🔄 Falling back to client-side filtering on current page...');
      filterItemsClientSide(page);
    }
  }

  // ------------------- Function: filterItemsClientSide -------------------
  // Client-side filtering for when no server-side filtering is needed
  function filterItemsClientSide(page = 1) {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value.toLowerCase();
    const typeFilter = typeSelect.value.toLowerCase();
    const subtypeFilter = subtypeSelect.value.toLowerCase();
    const jobsFilter = jobsSelect.value.toLowerCase();
    const locationsFilter = locationsSelect.value.toLowerCase();
    const sourcesFilter = sourcesSelect.value.toLowerCase();
    const sortBy = sortSelect.value;
    const itemsPerPage = itemsPerPageSelect.value === 'all' ? window.allItems.length : parseInt(itemsPerPageSelect.value);

    console.log('🔍 filterItemsClientSide called:', {
      page,
      itemsPerPage,
      itemsPerPageSelectValue: itemsPerPageSelect.value
    });

    const filtered = window.allItems.filter(item => {
      const matchesSearch = !searchTerm ||
        item.itemName?.toLowerCase().includes(searchTerm) ||
        splitValues(item.category).some(cat => cat.toLowerCase().includes(searchTerm)) ||
        splitValues(item.type).some(type => type.toLowerCase().includes(searchTerm)) ||
        splitValues(item.subtype).some(subtype => subtype.toLowerCase().includes(searchTerm)) ||
        splitValues(item.obtainTags || item.obtain).some(source => source.toLowerCase().includes(searchTerm)) ||
        splitValues(item.allJobsTags || item.allJobs).some(job => job.toLowerCase().includes(searchTerm)) ||
        splitValues(item.locationsTags || item.locations).some(location => location.toLowerCase().includes(searchTerm));

      const itemCategories = splitValues(item.category);
      const matchesCategory = categoryFilter === 'all' || 
        itemCategories.some(cat => cat.toLowerCase() === categoryFilter);
      
      const itemTypes = splitValues(item.type);
      const matchesType = typeFilter === 'all' || 
        itemTypes.some(type => type.toLowerCase() === typeFilter);
      
      const itemSubtypes = splitValues(item.subtype);
      const matchesSubtype = subtypeFilter === 'all' || 
        itemSubtypes.some(subtype => subtype.toLowerCase() === subtypeFilter);
      
      const jobsTags = item.allJobsTags?.length ? item.allJobsTags : item.allJobs;
      const itemJobs = splitValues(jobsTags);
      const matchesJobs = jobsFilter === 'all' || 
        itemJobs.some(job => job.toLowerCase() === jobsFilter);
      
      const locationsTags = item.locationsTags?.length ? item.locationsTags : item.locations;
      const itemLocations = splitValues(locationsTags);
      const matchesLocations = locationsFilter === 'all' || 
        itemLocations.some(location => location.toLowerCase() === locationsFilter);

      const sourcesTags = item.obtainTags?.length ? item.obtainTags : item.obtain;
      const itemSources = splitValues(sourcesTags);
      const matchesSources = sourcesFilter === 'all' || 
        itemSources.some(source => source.toLowerCase() === sourcesFilter);

      return matchesSearch && matchesCategory && matchesType && matchesSubtype && matchesJobs && matchesLocations && matchesSources;
    });

    const [field, direction] = sortBy.split('-');
    const isAsc = direction === 'asc';

    const sorted = [...filtered].sort((a, b) => {
      let valA, valB;
      
      switch (field) {
        case 'name':
          valA = a.itemName ?? '';
          valB = b.itemName ?? '';
          break;
        case 'price':
          valA = a.buyPrice ?? 0;
          valB = b.buyPrice ?? 0;
          break;
        default:
          valA = a[field] ?? '';
          valB = b[field] ?? '';
      }
      
      return isAsc
        ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
        : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
    });

    console.log('🔍 After filtering and sorting:', sorted.length);

    // Apply pagination
    const totalPages = Math.ceil(sorted.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = sorted.slice(startIndex, endIndex);

    console.log('🔍 Pagination details:', {
      totalPages,
      startIndex,
      endIndex,
      paginatedItemsLength: paginatedItems.length,
      itemsPerPage
    });

    // Update results info
    const resultsInfo = document.querySelector('.item-results-info p');
    if (resultsInfo) {
      if (itemsPerPageSelect.value === 'all') {
        resultsInfo.textContent = `Showing all ${sorted.length} of ${window.allItems.length} items`;
      } else {
        resultsInfo.textContent = `Showing ${paginatedItems.length} of ${sorted.length} items (Page ${page} of ${totalPages})`;
      }
    }

    // Render the paginated items
    renderItemCards(paginatedItems, page);

    // Update pagination
    if (itemsPerPageSelect.value !== 'all' && sorted.length > itemsPerPage) {
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

  // ------------------- Function: applyFiltersAndSort -------------------
  // Unified function to apply filters and sorting to items
  function applyFiltersAndSort(items) {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value.toLowerCase();
    const typeFilter = typeSelect.value.toLowerCase();
    const subtypeFilter = subtypeSelect.value.toLowerCase();
    const jobsFilter = jobsSelect.value.toLowerCase();
    const locationsFilter = locationsSelect.value.toLowerCase();
    const sourcesFilter = sourcesSelect.value.toLowerCase();
    const sortBy = sortSelect.value;

    // Apply filters
    const filtered = items.filter(item => {
      const matchesSearch = !searchTerm ||
        item.itemName?.toLowerCase().includes(searchTerm) ||
        splitValues(item.category).some(cat => cat.toLowerCase().includes(searchTerm)) ||
        splitValues(item.type).some(type => type.toLowerCase().includes(searchTerm)) ||
        splitValues(item.subtype).some(subtype => subtype.toLowerCase().includes(searchTerm)) ||
        splitValues(item.obtainTags || item.obtain).some(source => source.toLowerCase().includes(searchTerm)) ||
        splitValues(item.allJobsTags || item.allJobs).some(job => job.toLowerCase().includes(searchTerm)) ||
        splitValues(item.locationsTags || item.locations).some(location => location.toLowerCase().includes(searchTerm));

      const itemCategories = splitValues(item.category);
      const matchesCategory = categoryFilter === 'all' || 
        itemCategories.some(cat => cat.toLowerCase() === categoryFilter);
      
      const itemTypes = splitValues(item.type);
      const matchesType = typeFilter === 'all' || 
        itemTypes.some(type => type.toLowerCase() === typeFilter);
      
      const itemSubtypes = splitValues(item.subtype);
      const matchesSubtype = subtypeFilter === 'all' || 
        itemSubtypes.some(subtype => subtype.toLowerCase() === subtypeFilter);
      
      const jobsTags = item.allJobsTags?.length ? item.allJobsTags : item.allJobs;
      const itemJobs = splitValues(jobsTags);
      const matchesJobs = jobsFilter === 'all' || 
        itemJobs.some(job => job.toLowerCase() === jobsFilter);
      
      const locationsTags = item.locationsTags?.length ? item.locationsTags : item.locations;
      const itemLocations = splitValues(locationsTags);
      const matchesLocations = locationsFilter === 'all' || 
        itemLocations.some(location => location.toLowerCase() === locationsFilter);

      const sourcesTags = item.obtainTags?.length ? item.obtainTags : item.obtain;
      const itemSources = splitValues(sourcesTags);
      const matchesSources = sourcesFilter === 'all' || 
        itemSources.some(source => source.toLowerCase() === sourcesFilter);

      return matchesSearch && matchesCategory && matchesType && matchesSubtype && matchesJobs && matchesLocations && matchesSources;
    });

    // Apply sorting
    const [field, direction] = sortBy.split('-');
    const isAsc = direction === 'asc';

    return [...filtered].sort((a, b) => {
      let valA, valB;
      
      switch (field) {
        case 'name':
          valA = a.itemName ?? '';
          valB = b.itemName ?? '';
          break;
        case 'price':
          valA = a.buyPrice ?? 0;
          valB = b.buyPrice ?? 0;
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

  // ------------------- Function: updateFilteredPagination -------------------
  // Creates pagination for filtered results
  function updateFilteredPagination(currentPage, totalPages, totalItems) {
    const contentDiv = document.getElementById('model-details-data');
    if (!contentDiv) {
      console.error('❌ Content div not found');
      return;
    }

    // Remove ALL existing pagination (both main and filtered)
    const existingPagination = contentDiv.querySelector('.pagination');
    if (existingPagination) {
      existingPagination.remove();
    }

    // Only show pagination if there are multiple pages
    if (totalPages > 1) {
      console.log('📄 Setting up pagination for filtered results:', { currentPage, totalPages, totalItems });
      
      const handlePageChange = async (pageNum) => {
        console.log(`🔄 Filtered page change requested to page ${pageNum}`);
        // Call filterItems with the new page number
        window.filterItems(pageNum);
      };

      // Create pagination manually since we can't import dynamically
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
      console.log('✅ Filtered pagination created successfully');
    }
  }

  // Add event listeners
  searchInput.addEventListener('input', () => window.filterItems(1));
  categorySelect.addEventListener('change', () => window.filterItems(1));
  typeSelect.addEventListener('change', () => window.filterItems(1));
  subtypeSelect.addEventListener('change', () => window.filterItems(1));
  jobsSelect.addEventListener('change', () => window.filterItems(1));
  locationsSelect.addEventListener('change', () => window.filterItems(1));
  sourcesSelect.addEventListener('change', () => window.filterItems(1));
  sortSelect.addEventListener('change', () => window.filterItems(1));
  itemsPerPageSelect.addEventListener('change', () => window.filterItems(1));

  clearFiltersBtn.addEventListener('click', async () => {
    searchInput.value = '';
    categorySelect.value = 'all';
    typeSelect.value = 'all';
    subtypeSelect.value = 'all';
    jobsSelect.value = 'all';
    locationsSelect.value = 'all';
    sourcesSelect.value = 'all';
    sortSelect.value = 'name-asc';
    itemsPerPageSelect.value = '12';
    
    // Clear saved filter state
    window.savedFilterState = {};
    
    // Reload the original page data
    console.log('🔄 Clearing filters, reloading original page data...');
    try {
      const response = await fetch('/api/models/item?page=1');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const { data, pagination } = await response.json();
      
      // Update global items with original page data
      window.allItems = data;
      
      // Update results info
      const resultsInfo = document.querySelector('.item-results-info p');
      if (resultsInfo) {
        resultsInfo.textContent = `Showing ${data.length} of ${pagination.total} items`;
      }
      
      // Re-render with original data
      renderItemCards(data, 1);
      
      // Remove any filtered pagination
      const contentDiv = document.getElementById('model-details-data');
      if (contentDiv) {
        const existingPagination = contentDiv.querySelector('.pagination');
        if (existingPagination) {
          existingPagination.remove();
        }
      }
      
      // Re-create normal pagination
      if (pagination.pages > 1) {
        const handlePageChange = async (pageNum) => {
          console.log(`🔄 Normal page change requested to page ${pageNum}`);
          try {
            const { data: pageData, pagination: pagePagination } = await fetch(`/api/models/item?page=${pageNum}`).then(r => r.json());
            window.allItems = pageData;
            
            // Update results info
            const resultsInfo = document.querySelector('.item-results-info p');
            if (resultsInfo) {
              resultsInfo.textContent = `Showing ${pageData.length} of ${pagePagination.total} items (sorted alphabetically)`;
            }
            
            renderItemCards(pageData, pageNum);
            
            // Update pagination
            const contentDiv = document.getElementById('model-details-data');
            if (contentDiv) {
              const existingPagination = contentDiv.querySelector('.pagination');
              if (existingPagination) {
                existingPagination.remove();
              }
              createNormalPagination(pagePagination.page, pagePagination.pages, handlePageChange);
            }
          } catch (error) {
            console.error('❌ Error loading page:', error);
          }
        };
        
        createNormalPagination(pagination.page, pagination.pages, handlePageChange);
      }
      
    } catch (error) {
      console.error('❌ Error reloading original data:', error);
      // Fallback to client-side filtering
      window.filterItems(1);
    }
  });

  // ------------------- Function: createNormalPagination -------------------
  // Creates normal pagination for unfiltered results
  function createNormalPagination(currentPage, totalPages, handlePageChange) {
    const contentDiv = document.getElementById('model-details-data');
    if (!contentDiv) return;

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
    console.log('✅ Normal pagination created successfully');
  }

  window.itemFiltersInitialized = true;
  console.log('✅ Filters initialized');
  window.filterItems();
}

// ============================================================================
// ------------------- Page Initialization -------------------
// Sets up the filters and item grid on first load
// ============================================================================

// ------------------- Function: initializeItemPage -------------------
// Initializes the item page with filters, pagination, and card rendering
function initializeItemPage(data, page = 1, contentDiv) {
  // Store items globally for filtering
  window.allItems = data;

  // Initialize enhanced inventory cache
  initializeInventoryCache();

  // Create filters container if it doesn't exist
  let filtersContainer = document.querySelector('.item-filters');
  if (!filtersContainer) {
    filtersContainer = document.createElement('div');
    filtersContainer.className = 'item-filters';
    filtersContainer.innerHTML = `
      <div class="search-filter-bar">
        <div class="search-filter-control search-input">
          <input type="text" id="item-search-input" placeholder="Search items...">
        </div>
        <div class="search-filter-control">
          <select id="filter-category">
            <option value="all">All Categories</option>
          </select>
        </div>
        <div class="search-filter-control">
          <select id="filter-type">
            <option value="all">All Types</option>
          </select>
        </div>
        <div class="search-filter-control">
          <select id="filter-subtype">
            <option value="all">All Subtypes</option>
          </select>
        </div>
        <div class="search-filter-control">
          <select id="filter-jobs">
            <option value="all">All Jobs</option>
          </select>
        </div>
        <div class="search-filter-control">
          <select id="filter-locations">
            <option value="all">All Locations</option>
          </select>
        </div>
        <div class="search-filter-control">
          <select id="filter-sources">
            <option value="all">All Sources</option>
          </select>
        </div>
        <div class="search-filter-control">
          <select id="sort-by">
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="price-desc">Price (High-Low)</option>
            <option value="price-asc">Price (Low-High)</option>
          </select>
        </div>
        <div class="search-filter-control">
          <select id="items-per-page">
            <option value="12">12 per page</option>
            <option value="24">24 per page</option>
            <option value="36">36 per page</option>
            <option value="48">48 per page</option>
            <option value="all">All items</option>
          </select>
        </div>
        <button id="clear-filters" class="clear-filters-btn">Clear Filters</button>
      </div>
    `;
    contentDiv.insertBefore(filtersContainer, contentDiv.firstChild);
  }

  // Create item container if it doesn't exist
  let container = document.getElementById('items-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'items-container';
    container.className = 'item-details-grid';
    contentDiv.appendChild(container);
  }

  // Add results info section
  let resultsInfo = document.querySelector('.item-results-info');
  if (!resultsInfo) {
    resultsInfo = document.createElement('div');
    resultsInfo.className = 'item-results-info';
    resultsInfo.innerHTML = '<p>Loading items...</p>';
    contentDiv.insertBefore(resultsInfo, container);
  }

  // Add cache status indicator
  let cacheStatus = document.querySelector('.cache-status');
  if (!cacheStatus) {
    cacheStatus = document.createElement('div');
    cacheStatus.className = 'cache-status';
    cacheStatus.style.cssText = `
      display: inline-block;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 5px;
      font-size: 12px;
      margin-left: 10px;
      cursor: pointer;
      transition: opacity 0.3s;
    `;
    cacheStatus.innerHTML = '<i class="fas fa-database"></i> Cache: Loading...';
    cacheStatus.title = 'Click to see cache statistics';
    
    // Find the header and add cache status
    const header = document.querySelector('.model-details-header');
    if (header) {
      header.appendChild(cacheStatus);
    } else {
      // Fallback to body if header not found
      cacheStatus.style.position = 'fixed';
      cacheStatus.style.bottom = '20px';
      cacheStatus.style.right = '20px';
      cacheStatus.style.zIndex = '1000';
      document.body.appendChild(cacheStatus);
    }
    
    // Add click handler to show cache stats
    cacheStatus.addEventListener('click', () => {
      const stats = window.TinglebotCache?.getStats();
      if (stats) {
        const preloadStatus = window.preloadDisabled ? 'Disabled' : 'Enabled';
        alert(`Cache Statistics:\n\nSize: ${stats.size}/${stats.maxSize} items\nDuration: ${stats.duration} hours\nHit Rate: ${(stats.hitRate * 100).toFixed(1)}%\nPreloading: ${preloadStatus}`);
      }
    });
    
    // Update cache status periodically
    setInterval(() => {
      const stats = window.TinglebotCache?.getStats();
      if (stats) {
        const hitRate = (stats.hitRate * 100).toFixed(1);
        const preloadIcon = window.preloadDisabled ? '🚫' : '⚡';
        cacheStatus.innerHTML = `${preloadIcon} Cache: ${stats.size}/${stats.maxSize} (${hitRate}% hit)`;
      }
    }, 5000);
  }

  // Add manual preload button
  let preloadButton = document.querySelector('.manual-preload-btn');
  if (!preloadButton) {
    preloadButton = document.createElement('button');
    preloadButton.className = 'manual-preload-btn';
    preloadButton.style.cssText = `
      display: inline-block;
      background: rgba(0, 123, 255, 0.8);
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 5px;
      font-size: 11px;
      margin-left: 10px;
      cursor: pointer;
      transition: all 0.3s;
    `;
    preloadButton.innerHTML = '<i class="fas fa-download"></i> Preload';
    preloadButton.title = 'Click to manually preload visible items';
    
    // Find the header and add preload button
    const header = document.querySelector('.model-details-header');
    if (header) {
      header.appendChild(preloadButton);
    } else {
      // Fallback to body if header not found
      preloadButton.style.position = 'fixed';
      preloadButton.style.bottom = '60px';
      preloadButton.style.right = '20px';
      preloadButton.style.zIndex = '1000';
      document.body.appendChild(preloadButton);
    }
    
    // Add click handler for manual preloading
    preloadButton.addEventListener('click', async () => {
      if (window.preloadDisabled) {
        alert('Preloading is currently disabled due to timeouts. Try again later.');
        return;
      }
      
      preloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
      preloadButton.disabled = true;
      
      try {
        await preloadVisibleItemInventories();
        preloadButton.innerHTML = '<i class="fas fa-check"></i> Done!';
        setTimeout(() => {
          preloadButton.innerHTML = '<i class="fas fa-download"></i> Preload';
          preloadButton.disabled = false;
        }, 2000);
      } catch (error) {
        console.error('[Manual Preload] Error:', error);
        preloadButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
        setTimeout(() => {
          preloadButton.innerHTML = '<i class="fas fa-download"></i> Preload';
          preloadButton.disabled = false;
        }, 2000);
      }
    });
  }

  // Always use all items for filter dropdowns
  fetchAllItemsForFilters().then(async allItemsForFilters => {
    await populateFilterOptions(allItemsForFilters);
    // Only initialize filters if they haven't been initialized yet
    if (!window.itemFiltersInitialized) {
      await setupItemFilters(data);
    } else {
      // If filters are already initialized, apply current filter state
      window.filterItems();
    }
    
    // Start preloading inventory data for visible items after a short delay
    setTimeout(() => {
      preloadVisibleItemInventories();
    }, 2000);
  });

  // Update results info
  if (resultsInfo) {
    resultsInfo.innerHTML = `<p>Showing ${data.length} items (sorted alphabetically)</p>`;
  }
}

// ============================================================================
// ------------------- Global Cache Management -------------------
// Utilities accessible from browser console for cache debugging and management
// ============================================================================

// Make cache management available globally for debugging
window.TinglebotCache = {
  // Get cache statistics
  getStats() {
    const cache = window.inventoryCache;
    if (!cache) return { error: 'Cache not initialized' };
    return cache.getStats();
  },
  
  // Clear the entire cache
  clear() {
    const cache = window.inventoryCache;
    if (!cache) return { error: 'Cache not initialized' };
    cache.clear();
    return { success: 'Cache cleared' };
  },
  
  // Get cache size
  getSize() {
    const cache = window.inventoryCache;
    if (!cache) return { error: 'Cache not initialized' };
    return { size: cache.data.size, maxSize: cache.MAX_CACHE_SIZE };
  },
  
  // List all cached items
  listItems() {
    const cache = window.inventoryCache;
    if (!cache) return { error: 'Cache not initialized' };
    return Array.from(cache.data.keys());
  },
  
  // Check if specific item is cached
  hasItem(itemName) {
    const cache = window.inventoryCache;
    if (!cache) return { error: 'Cache not initialized' };
    return cache.has(itemName);
  },
  
  // Remove specific item from cache
  removeItem(itemName) {
    const cache = window.inventoryCache;
    if (!cache) return { error: 'Cache not initialized' };
    cache.data.delete(itemName);
    cache.timestamps.delete(itemName);
    cache.persistToStorage();
    return { success: `Removed ${itemName} from cache` };
  },
  
  // Preload items manually
  async preloadItems(itemNames) {
    if (!Array.isArray(itemNames)) {
      return { error: 'Please provide an array of item names' };
    }
    
    console.log(`[Manual Preload] Starting preload of ${itemNames.length} items...`);
    const results = [];
    
    for (const itemName of itemNames) {
      try {
        await fetchItemInventory(itemName);
        results.push({ item: itemName, status: 'success' });
      } catch (error) {
        results.push({ item: itemName, status: 'error', error: error.message });
      }
    }
    
    console.log('[Manual Preload] Complete:', results);
    return results;
  },
  
  // Enable preloading
  enablePreloading() {
    window.preloadDisabled = false;
    console.log('[Cache] Preloading enabled');
    return { success: 'Preloading enabled' };
  },
  
  // Disable preloading
  disablePreloading() {
    window.preloadDisabled = true;
    console.log('[Cache] Preloading disabled');
    return { success: 'Preloading disabled' };
  },
  
  // Get preloading status
  getPreloadStatus() {
    return { 
      disabled: window.preloadDisabled || false,
      status: window.preloadDisabled ? 'Disabled' : 'Enabled'
    };
  },
  
  // Force preload visible items
  async forcePreload() {
    console.log('[Cache] Force preloading visible items...');
    window.preloadDisabled = false; // Temporarily enable
    await preloadVisibleItemInventories();
    return { success: 'Force preload completed' };
  }
};

console.log('🔧 TinglebotCache utilities available. Use TinglebotCache.getStats() to see cache information.');

// ============================================================================
// ------------------- Exports -------------------
// Public API for item rendering module
// ============================================================================
export {
  renderItemCards,
  populateFilterOptions,
  setupItemFilters,
  initializeItemPage,
  renderLocationTags,
  renderItemTypeIcon,
  fetchItemInventory,
  initializeInventoryCache,
  preloadVisibleItemInventories,
  LOCATION_COLORS
};

// ------------------- Function: getCategoryClass -------------------
// Returns CSS class for item category
function getCategoryClass(category) {
  const categoryMap = {
    'weapon': 'category-weapon',
    'shield': 'category-shield',
    'armor': 'category-armor',
    'consumable': 'category-consumable',
    'material': 'category-material',
    'tool': 'category-tool',
    'misc': 'category-misc'
  };
  return categoryMap[category.toLowerCase()] || 'category-misc';
}

// ------------------- Function: getTypeClass -------------------
// Returns CSS class for item type
function getTypeClass(type) {
  const typeMap = {
    'weapon': 'type-weapon',
    'shield': 'type-shield',
    'armor': 'type-armor',
    'consumable': 'type-consumable',
    'material': 'type-material',
    'tool': 'type-tool',
    'misc': 'type-misc'
  };
  return typeMap[type.toLowerCase()] || 'type-misc';
}

// ------------------- Constant: LOCATION_COLORS -------------------
// Location name to class name mapping for location tag rendering
const LOCATION_COLORS = {
  'eldin': 'location-eldin',
  'lanayru': 'location-lanayru',
  'faron': 'location-faron',
  'central hyrule': 'location-central-hyrule',
  'hebra': 'location-hebra',
  'gerudo': 'location-gerudo',
  'leaf-dew way': 'location-leafdew',
  'leaf dew way': 'location-leafdew',
  'path of scarlet leaves': 'location-scarletleaves'
}; 