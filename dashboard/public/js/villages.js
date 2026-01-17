// ============================================================================
// villages.js — Village Component for Tinglebot Dashboard
// Purpose: Fetches and displays village status and levels for all villages
// ============================================================================

// Village data cache
let villageCache = {
  data: null,
  timestamp: 0,
  CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
};

// Item data cache for material images
let itemCache = {
  data: null,
  itemImageMap: null,
  timestamp: 0,
  CACHE_DURATION: 10 * 60 * 1000 // 10 minutes
};

// Village crest images
const villageCrests = {
  'Rudania': '/images/banners/Rudania1.png',
  'Inariko': '/images/banners/Inariko1.png',
  'Vhintl': '/images/banners/Vhintl1.png'
};

// Helper: Get random banner for a village
function getRandomBanner(village) {
  const banners = {
    Rudania: [
      '/images/banners/Rudania1.png',
      '/images/banners/Rudania2.png',
      '/images/banners/Rudania3.png'
    ],
    Inariko: [
      '/images/banners/Inariko1.png',
      '/images/banners/Inariko2.png',
      '/images/banners/Inariko3.png'
    ],
    Vhintl: [
      '/images/banners/Vhintl1.png',
      '/images/banners/Vhintl2.png',
      '/images/banners/Vhintl3.png'
    ]
  };
  const arr = banners[village];
  if (!arr) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper: Get emoji icon image for a village
function getVillageEmojiIcon(villageName) {
  const emojiIcons = {
    'Rudania': '/images/icons/[RotW] village crest_rudania_.png',
    'Inariko': '/images/icons/[RotW] village crest_inariko_.png',
    'Vhintl': '/images/icons/[RotW] village crest_vhintl_.png'
  };
  return emojiIcons[villageName] || null;
}

// ------------------- Function: formatItemImageUrl -------------------
// Formats and returns item image URL
function formatItemImageUrl(image) {
  if (!image || image === 'No Image') return '/images/ankleicon.png';
  
  // If it's a GCS URL, route it through our proxy to avoid CORS issues
  if (image.startsWith('https://storage.googleapis.com/tinglebot/')) {
    const path = image.replace('https://storage.googleapis.com/tinglebot/', '');
    return `/api/images/${path}`;
  }
  
  return image;
}

// ------------------- Function: fetchItemsForImages -------------------
// Fetches all items and creates a lookup map for material images
async function fetchItemsForImages() {
  const now = Date.now();
  
  // Check if cache is valid
  if (itemCache.itemImageMap && (now - itemCache.timestamp) < itemCache.CACHE_DURATION) {
    return itemCache.itemImageMap;
  }
  
  try {
    const response = await fetch('/api/models/item?all=true');
    if (!response.ok) {
      console.warn('[villages.js] Failed to fetch items for material images');
      return itemCache.itemImageMap || {};
    }
    
    const { data } = await response.json();
    itemCache.data = data;
    
    // Create lookup map: itemName -> image
    itemCache.itemImageMap = {};
    data.forEach(item => {
      if (item.itemName && item.image) {
        itemCache.itemImageMap[item.itemName] = item.image;
      }
    });
    
    itemCache.timestamp = now;
    return itemCache.itemImageMap;
  } catch (error) {
    console.error('[villages.js] Error fetching items for material images:', error);
    return itemCache.itemImageMap || {};
  }
}

// ------------------- Function: getMaterialImage -------------------
// Gets the image URL for a material by name
async function getMaterialImage(materialName) {
  const itemImageMap = await fetchItemsForImages();
  const image = itemImageMap[materialName];
  return formatItemImageUrl(image);
}

// ============================================================================
// Village Data Functions
// ============================================================================

/**
 * Fetches village status data from the API
 */
async function fetchVillageStatus() {
  try {
    const response = await fetch('/api/villages/status');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Update cache
    villageCache.data = data;
    villageCache.timestamp = Date.now();
    
    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Gets cached village data or fetches new data if cache is expired
 */
async function getVillageStatus() {
  const now = Date.now();
  
  // Check if cache is valid
  if (villageCache.data && (now - villageCache.timestamp) < villageCache.CACHE_DURATION) {
    return villageCache.data;
  }
  
  // Fetch fresh data
  return await fetchVillageStatus();
}

// ============================================================================
// Village Display Functions
// ============================================================================

/**
 * Formats a progress bar for display
 */
function formatProgressBar(current, max, length = 10) {
  if (max <= 0) return '▱'.repeat(length);
  
  const filled = Math.round((current / max) * length);
  const empty = Math.max(0, length - filled);
  return '▰'.repeat(filled) + '▱'.repeat(empty);
}

/**
 * Gets status color and icon based on village status
 */
function getStatusInfo(status) {
  switch (status) {
    case 'max':
      return { icon: '🌟', text: 'Max Level', color: '#ffd700' };
    case 'damaged':
      return { icon: '⚠️', text: 'Damaged', color: '#ff6b6b' };
    case 'upgradable':
      return { icon: '📈', text: 'Upgradable', color: '#51cf66' };
    default:
      return { icon: '❓', text: 'Unknown', color: '#868e96' };
  }
}

/**
 * Creates a village card for display
 */
function createVillageCard(villageData) {
  if (!villageData) {
    return `
      <div class="village-card village-card-unknown">
        <div class="village-card-content">
          <div class="village-no-data">
            <i class="fas fa-home"></i>
            <p>No village data available</p>
          </div>
        </div>
      </div>
    `;
  }

  const { name, level, health, maxHealth, status, tokenProgress, currentTokens, vendingTier, vendingTierText, vendingDiscount, color } = villageData;
  
  const statusInfo = getStatusInfo(status);
  const healthPercentage = Math.round((health / maxHealth) * 100);
  
  // Determine if village is at max level
  const isMaxLevel = level >= 3;
  const nextLevel = level + 1;
  
  // Calculate token progress - ensure tokenProgress exists and has required properties
  const safeTokenProgress = tokenProgress || { current: 0, required: 0, percentage: 0 };
  // Use currentTokens if available, otherwise fall back to tokenProgress.current
  const tokenCurrent = currentTokens !== undefined && currentTokens !== null ? Number(currentTokens) : (safeTokenProgress.current || 0);
  const tokenRequired = safeTokenProgress.required || 0;
  const tokenPercentage = isMaxLevel ? 100 : (tokenRequired > 0 ? Math.round((tokenCurrent / tokenRequired) * 100) : 0);
  
  // Format vending discount text
  const discountText = vendingDiscount > 0 ? ` (-${vendingDiscount}% cost)` : '';
  
  // Set CSS variable for village color
  const villageColorVar = `--village-color: ${color};`;
  
  return `
    <div class="village-card village-card-${name.toLowerCase()}" style="${villageColorVar}">
      <div class="village-card-header new-header-layout" style="background-image: url('${villageCrests[name]}');">
        <div class="village-header-overlay">
          <div class="village-header-content">
            <h3 class="village-name">${name}</h3>
            <div class="village-level-badge-header">
              <i class="fas fa-star"></i>
              <span>Level ${level}/3</span>
            </div>
          </div>
        </div>
      </div>
      <div class="village-card-content">
        <div class="village-details">
          <div class="village-detail-item">
            <div class="village-detail-label">
              <i class="fas fa-heart"></i>
              <span>Health</span>
            </div>
            <div class="village-detail-value">
              <div class="village-health-display">
                <div class="village-progress-bar">
                  <div class="village-progress-fill" style="width: ${healthPercentage}%; --progress-color: ${color}; background: linear-gradient(90deg, ${color}, rgba(255, 255, 255, 0.3));"></div>
                </div>
                <span class="village-progress-text">${health}/${maxHealth} (${healthPercentage}%)</span>
              </div>
            </div>
          </div>
          
          <div class="village-detail-item">
            <div class="village-detail-label">
              <i class="fas fa-info-circle"></i>
              <span>Status</span>
            </div>
            <div class="village-detail-value" style="color: ${statusInfo.color};">
              <span class="village-status-icon">${statusInfo.icon}</span>
              <span class="village-status-text">${statusInfo.text}</span>
            </div>
          </div>
          
          <div class="village-detail-item">
            <div class="village-detail-label">
              <i class="fas fa-coins"></i>
              <span>Tokens</span>
            </div>
            <div class="village-detail-value">
              <div class="village-token-progress">
                <div class="village-progress-bar">
                  <div class="village-progress-fill" style="width: ${tokenPercentage}%; --progress-color: ${color}; background: linear-gradient(90deg, ${color}, rgba(255, 255, 255, 0.3));"></div>
                </div>
                <span class="village-progress-text">${isMaxLevel ? `${tokenCurrent.toLocaleString()} tokens` : `${tokenCurrent.toLocaleString()}/${tokenRequired.toLocaleString()} until level ${nextLevel} (${tokenPercentage}%)`}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders the village section on the dashboard
 */
async function renderVillageSection() {
  try {
    const villageContainer = document.getElementById('village-section');
    if (!villageContainer) {
      return;
    }

    // Show loading state
    villageContainer.innerHTML = `
      <div class="village-loading">
        <div class="loading-spinner"></div>
        <p>Loading village data...</p>
      </div>
    `;

    // Fetch village data
    const villageData = await getVillageStatus();
    
    // Create village cards
    const villages = ['Rudania', 'Inariko', 'Vhintl'];
    const villageCards = villages.map(village => 
      createVillageCard(villageData.villages[village])
    ).join('');

    // Render the village section
    villageContainer.innerHTML = `
      <div class="village-header">
        <div class="village-header-info">
          <h2>Village Levels</h2>
        </div>
      </div>
      <div class="village-grid">
        ${villageCards}
      </div>
    `;

  } catch (error) {
    console.error('[villages.js]: ❌ Error rendering village section:', error);
    
    const villageContainer = document.getElementById('village-section');
    if (villageContainer) {
      villageContainer.innerHTML = `
        <div class="village-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load village data</p>
        </div>
      `;
    }
  }
}

// ============================================================================
// Event Listeners and Initialization
// ============================================================================

/**
 * Initializes the village component
 */
function initVillages() {
  // Render village section when dashboard is shown
  document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the dashboard section
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && dashboardSection.style.display !== 'none') {
      renderVillageSection();
    }
  });
}

// Initialize when module loads
initVillages();

// ============================================================================
// Village Model Page Functions
// ============================================================================

/**
 * Initializes the village model page with detailed information
 * @param {Array} data - Array of village data from API
 * @param {number} page - Current page number
 * @param {HTMLElement} contentDiv - Container element for content
 */
export async function initializeVillagePage(data, page, contentDiv) {
  if (!contentDiv) {
    console.error('[villages.js]: Content div not found');
    return;
  }

  try {
    // Clear content
    contentDiv.innerHTML = '';

    if (!data || data.length === 0) {
      contentDiv.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>No village data available</p>
        </div>
      `;
      return;
    }

    // Create container for village cards
    const villagesContainer = document.createElement('div');
    villagesContainer.className = 'villages-model-container';

    // Process each village
    for (const village of data) {
      const villageCard = await createVillageModelCard(village);
      villagesContainer.insertAdjacentHTML('beforeend', villageCard);
    }

    contentDiv.appendChild(villagesContainer);
  } catch (error) {
    console.error('[villages.js]: Error initializing village page:', error);
    contentDiv.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error loading village data: ${error.message}</p>
      </div>
    `;
  }
}

/**
 * Creates a detailed village card for the model page
 * @param {Object} village - Village data object
 * @returns {string} HTML string for village card
 */
async function createVillageModelCard(village) {
  if (!village) {
    return `
      <div class="village-model-card">
        <div class="village-model-card-content">
          <div class="village-no-data">
            <i class="fas fa-home"></i>
            <p>No village data available</p>
          </div>
        </div>
      </div>
    `;
  }

  const {
    name,
    region,
    level,
    health,
    status,
    color,
    emoji,
    levelHealth,
    tokenRequirements,
    currentTokens,
    vendingTier,
    vendingDiscount,
    materialRequirements,
    materials: donatedMaterials,
    contributors
  } = village;

  // Debug logging for token data
  console.log(`[villages.js] createVillageModelCard: Village "${name}"`);
  console.log(`[villages.js]   - Level: ${level}`);
  console.log(`[villages.js]   - raw currentTokens (from API):`, currentTokens);
  console.log(`[villages.js]   - typeof currentTokens:`, typeof currentTokens);
  console.log(`[villages.js]   - tokenRequirements:`, tokenRequirements);

  const statusInfo = getStatusInfo(status);
  const maxHealth = levelHealth?.[level] || levelHealth?.[level.toString()] || 100;
  const healthPercentage = Math.round((health / maxHealth) * 100);
  const bannerImg = getRandomBanner(name);
  const emojiIconImg = getVillageEmojiIcon(name);

  // Determine next level info
  const nextLevel = level + 1;
  const isMaxLevel = level >= 3;
  const requiredTokens = isMaxLevel ? 0 : (tokenRequirements?.[nextLevel] || tokenRequirements?.[nextLevel.toString()] || 0);
  
  // Ensure currentTokens is always a number
  const processedCurrentTokens = (currentTokens !== undefined && currentTokens !== null) 
    ? Number(currentTokens) 
    : 0;
  console.log(`[villages.js]   - processed currentTokens:`, processedCurrentTokens);
  console.log(`[villages.js]   - requiredTokens for level ${nextLevel}:`, requiredTokens);
  
  const tokenProgressPercentage = requiredTokens > 0 ? Math.round((processedCurrentTokens / requiredTokens) * 100) : 100;
  console.log(`[villages.js]   - tokenProgressPercentage:`, tokenProgressPercentage);

  // Format vending tier text
  let vendingTierText = 'Basic stock only';
  if (vendingTier === 3) {
    vendingTierText = 'Rare stock unlocked';
  } else if (vendingTier === 2) {
    vendingTierText = 'Mid-tier stock unlocked';
  }
  const discountText = vendingDiscount > 0 ? ` (-${vendingDiscount}% cost)` : '';

  // Process material requirements
  let materialsHTML = '';
  if (materialRequirements) {
    const materialsList = Object.entries(materialRequirements);
    
    // Group materials by level requirement
    const level2Materials = [];
    const level3Materials = [];
    const level3OnlyMaterials = [];

    materialsList.forEach(([materialName, materialData]) => {
      const req = materialData.required || {};
      const hasLevel2 = req[2] !== undefined;
      const hasLevel3 = req[3] !== undefined;

      // Extract donated count - materials can be stored as objects { current: X } or as numbers
      let donatedCount = 0;
      const materialEntry = donatedMaterials?.[materialName];
      if (typeof materialEntry === 'number') {
        donatedCount = materialEntry;
      } else if (materialEntry && typeof materialEntry === 'object') {
        // Handle objects with 'current' or 'donated' property
        donatedCount = materialEntry.current || materialEntry.donated || materialEntry.quantity || 0;
      }
      
      // Determine required amount based on current level
      let requiredForCurrentLevel = 0;
      if (!isMaxLevel && hasLevel2 && nextLevel === 2) {
        requiredForCurrentLevel = req[2];
      } else if (!isMaxLevel && hasLevel3 && nextLevel === 3) {
        requiredForCurrentLevel = req[3];
      } else if (isMaxLevel) {
        requiredForCurrentLevel = req[3] || req[2] || 0;
      }
      
      const progressPercentage = requiredForCurrentLevel > 0 
        ? Math.min(100, Math.round((donatedCount / requiredForCurrentLevel) * 100))
        : 0;

      if (hasLevel2 && hasLevel3) {
        // Material needed for both levels
        level2Materials.push({ 
          name: materialName, 
          level2: req[2], 
          level3: req[3], 
          donated: donatedCount,
          required: requiredForCurrentLevel,
          progress: progressPercentage
        });
      } else if (hasLevel3 && !hasLevel2) {
        // Level 3 only
        level3OnlyMaterials.push({ 
          name: materialName, 
          level3: req[3], 
          donated: donatedCount,
          required: requiredForCurrentLevel,
          progress: progressPercentage
        });
      }
    });

    // Render materials
    materialsHTML = `
      <div class="village-materials-section">
        <h3 class="village-materials-title">
          <i class="fas fa-box"></i> Donatable Materials
        </h3>
        <div class="village-materials-content">
          ${level2Materials.length > 0 ? `
            <div class="materials-group">
              <h4 class="materials-group-title">Materials for Level 2 & 3</h4>
              <div class="materials-list">
                ${(await Promise.all(level2Materials.map(async (mat) => {
                  const materialImage = await getMaterialImage(mat.name);
                  const requiredText = isMaxLevel 
                    ? `Level 3: ${mat.level3.toLocaleString()}`
                    : nextLevel === 2 
                      ? `Level 2: ${mat.level2.toLocaleString()}`
                      : `Level 2: ${mat.level2.toLocaleString()} | Level 3: ${mat.level3.toLocaleString()}`;
                  return `
                  <div class="material-item">
                    ${materialImage ? `<img src="${materialImage}" alt="${mat.name} icon" class="material-icon" />` : ''}
                    <div class="material-content">
                      <span class="material-name">${mat.name}</span>
                      <div class="material-info">
                        <span class="material-requirements">${requiredText}</span>
                        ${mat.required > 0 ? `
                          <div class="material-progress-wrapper">
                            <div class="material-progress-bar">
                              <div class="material-progress-fill" style="width: ${mat.progress}%; background-color: ${color};"></div>
                            </div>
                            <span class="material-progress-text">${mat.donated.toLocaleString()}/${mat.required.toLocaleString()} (${mat.progress}%)</span>
                          </div>
                        ` : mat.donated > 0 ? `<span class="material-donated">Donated: ${mat.donated.toLocaleString()}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `;
                }))).join('')}
              </div>
            </div>
          ` : ''}
          ${level3OnlyMaterials.length > 0 ? `
            <div class="materials-group">
              <h4 class="materials-group-title">Level 3 Only Materials</h4>
              <div class="materials-list">
                ${(await Promise.all(level3OnlyMaterials.map(async (mat) => {
                  const materialImage = await getMaterialImage(mat.name);
                  return `
                  <div class="material-item material-item-rare">
                    ${materialImage ? `<img src="${materialImage}" alt="${mat.name} icon" class="material-icon" />` : ''}
                    <div class="material-content">
                      <span class="material-name">${mat.name}</span>
                      <div class="material-info">
                        <span class="material-requirements">Level 3: ${mat.level3.toLocaleString()}</span>
                        ${mat.required > 0 ? `
                          <div class="material-progress-wrapper">
                            <div class="material-progress-bar">
                              <div class="material-progress-fill" style="width: ${mat.progress}%; background-color: ${color};"></div>
                            </div>
                            <span class="material-progress-text">${mat.donated.toLocaleString()}/${mat.required.toLocaleString()} (${mat.progress}%)</span>
                          </div>
                        ` : mat.donated > 0 ? `<span class="material-donated">Donated: ${mat.donated.toLocaleString()}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `;
                }))).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Process contributors for back of card
  let contributorsHTML = '';
  
  // Debug: Log contributors data structure
  console.log(`[villages.js] Processing contributors for ${name}:`, contributors);
  console.log(`[villages.js] Contributors type:`, typeof contributors);
  console.log(`[villages.js] Contributors keys:`, contributors ? Object.keys(contributors) : 'null');
  
  if (contributors && typeof contributors === 'object' && Object.keys(contributors).length > 0) {
    const contributorList = [];
    
    // Process contributors - structure: { "CharacterName": { items: { "MaterialName": quantity }, tokens: 0 } }
    Object.entries(contributors).forEach(([characterName, contribData]) => {
      try {
        if (!contribData || typeof contribData !== 'object') {
          return;
        }
        
        // Contributors are stored as { items: { materialName: quantity }, tokens: 0 }
        const itemsDonated = contribData.items || {};
        const tokensDonated = contribData.tokens || 0;
        
        // Build material entries list
        const materialEntries = [];
        
        // Add material donations
        Object.entries(itemsDonated).forEach(([matName, qty]) => {
          const quantity = typeof qty === 'number' ? qty : 0;
          if (quantity > 0) {
            materialEntries.push(`${matName}: ${quantity}`);
          }
        });
        
        // Add token donations if any
        if (tokensDonated > 0) {
          materialEntries.push(`Tokens: ${tokensDonated.toLocaleString()}`);
        }
        
        if (materialEntries.length > 0) {
          contributorList.push({ 
            name: characterName, 
            materials: materialEntries.join(', ')
          });
        }
      } catch (error) {
        console.error(`[villages.js] Error processing contributor ${characterName}:`, error);
      }
    });
    
    if (contributorList.length > 0) {
      contributorsHTML = `
        <div class="village-contributors-section">
          <h3 class="village-contributors-title">
            <i class="fas fa-users"></i> Contributors
          </h3>
          <div class="village-contributors-list">
            ${contributorList.map(contrib => `
              <div class="village-contributor-item">
                <span class="contributor-name">${contrib.name}</span>
                <span class="contributor-materials">${contrib.materials}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }
  
  // If no contributors, show a message
  if (!contributorsHTML) {
    contributorsHTML = '<p class="no-contributors">No contributions recorded yet.</p>';
  }

  return `
    <div class="model-details-item village-model-card village-model-card-${name.toLowerCase()}" onclick="this.classList.toggle('flipped')" style="--village-color: ${color};">
      <div class="village-card-front">
        ${bannerImg ? `<img src="${bannerImg}" class="village-model-header-banner" alt="${name} banner" />` : ''}
        <div class="village-model-card-header">
          <div class="village-model-header-content">
            <div class="village-model-name-section">
              ${emojiIconImg ? `<img src="${emojiIconImg}" class="village-model-emoji-img" alt="${name} emoji" />` : emoji ? `<span class="village-model-emoji">${emoji}</span>` : ''}
              <h2 class="village-model-name">${name}</h2>
              <span class="village-model-region">${region}</span>
            </div>
            <div class="village-model-level-badge">
              <i class="fas fa-star"></i>
              <span>Level ${level}/3</span>
            </div>
          </div>
        </div>
        <div class="village-model-card-content">
        <div class="village-model-stats">
          <div class="village-model-stat-item">
            <div class="village-model-stat-label">
              <i class="fas fa-heart"></i>
              <span>Health</span>
            </div>
            <div class="village-model-stat-value">
              <div class="village-progress-wrapper">
                <div class="village-progress-bar">
                  <div class="village-progress-fill" style="width: ${healthPercentage}%; background-color: ${color};"></div>
                </div>
                <span class="village-progress-text">${health}/${maxHealth} (${healthPercentage}%)</span>
              </div>
            </div>
          </div>

          <div class="village-model-stat-item">
            <div class="village-model-stat-label">
              <i class="fas fa-info-circle"></i>
              <span>Status</span>
            </div>
            <div class="village-model-stat-value" style="color: ${statusInfo.color};">
              <span class="village-status-icon">${statusInfo.icon}</span>
              <span class="village-status-text">${statusInfo.text}</span>
            </div>
          </div>

          ${!isMaxLevel ? `
            <div class="village-model-stat-item">
              <div class="village-model-stat-label">
                <i class="fas fa-coins"></i>
                <span>Tokens for Level ${nextLevel}</span>
              </div>
              <div class="village-model-stat-value">
                <div class="village-progress-wrapper">
                  <div class="village-progress-bar">
                    <div class="village-progress-fill" style="width: ${tokenProgressPercentage}%; background-color: ${color};"></div>
                  </div>
                  <span class="village-progress-text">${processedCurrentTokens.toLocaleString()}/${requiredTokens.toLocaleString()} (${tokenProgressPercentage}%)</span>
                </div>
              </div>
            </div>
          ` : ''}
          
          ${isMaxLevel ? `
            <div class="village-model-stat-item">
              <div class="village-model-stat-label">
                <i class="fas fa-coins"></i>
                <span>Stored Tokens</span>
              </div>
              <div class="village-model-stat-value">
                <span class="village-token-amount">${processedCurrentTokens.toLocaleString()} tokens</span>
              </div>
            </div>
          ` : ''}

          <div class="village-model-stat-item">
            <div class="village-model-stat-label">
              <i class="fas fa-store"></i>
              <span>Vending Tier</span>
            </div>
            <div class="village-model-stat-value">
              <span class="vending-tier-text">${vendingTierText}${discountText}</span>
            </div>
          </div>
        </div>

        ${materialsHTML}
        </div>
      </div>
      <div class="village-card-back">
        <div class="village-card-back-header">
          <h3 class="village-card-back-title">
            ${emojiIconImg ? `<img src="${emojiIconImg}" class="village-back-emoji-img" alt="${name} emoji" />` : ''}
            <span>${name} Contributors</span>
          </h3>
        </div>
        <div class="village-card-back-content">
          ${contributorsHTML || '<p class="no-contributors">No contributions recorded yet.</p>'}
        </div>
      </div>
    </div>
  `;
}

// Export for global access if needed
window.renderVillageSection = renderVillageSection;
