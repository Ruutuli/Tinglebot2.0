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

// Village crest images
const villageCrests = {
  'Rudania': '/images/icons/[RotW] village crest_rudania_.png',
  'Inariko': '/images/icons/[RotW] village crest_inariko_.png',
  'Vhintl': '/images/icons/[RotW] village crest_vhintl_.png'
};

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

  const { name, level, health, maxHealth, status, tokenProgress, vendingTier, vendingTierText, vendingDiscount, color } = villageData;
  
  const statusInfo = getStatusInfo(status);
  const healthPercentage = Math.round((health / maxHealth) * 100);
  const healthBar = formatProgressBar(health, maxHealth);
  
  // Determine if village is at max level
  const isMaxLevel = level >= 3;
  
  // Format token progress
  const tokenBar = isMaxLevel ? 'Complete' : formatProgressBar(tokenProgress.current, tokenProgress.required);
  const tokenPercentage = isMaxLevel ? 100 : tokenProgress.percentage;
  
  // Format vending discount text
  const discountText = vendingDiscount > 0 ? ` (-${vendingDiscount}% cost)` : '';
  
  // Set CSS variable for village color
  const villageColorVar = `--village-color: ${color};`;
  
  return `
    <div class="village-card village-card-${name.toLowerCase()}" style="${villageColorVar}">
      <div class="village-card-header new-header-layout">
        <div class="village-header-center">
          <img src="${villageCrests[name]}" alt="${name} Crest" class="village-crest-img" />
          <span class="village-name"><strong>${name}</strong></span>
        </div>
      </div>
      <div class="village-card-content">
        <div class="village-main-info">
          <div class="village-level-badge">
            <i class="fas fa-star"></i>
            <span>Level ${level}/3</span>
          </div>
        </div>
        
        <div class="village-details">
          <div class="village-detail-item">
            <div class="village-detail-label">
              <i class="fas fa-heart"></i>
              <span>Health</span>
            </div>
            <div class="village-detail-value">
              <div class="village-health-display">
                <div class="village-health-bar">
                  <span class="health-bar-fill" style="width: ${healthPercentage}%; background-color: ${color};"></span>
                  <span class="health-bar-text">\`${healthBar}\` ${health}/${maxHealth}</span>
                </div>
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
          
          ${!isMaxLevel ? `
            <div class="village-detail-item">
              <div class="village-detail-label">
                <i class="fas fa-coins"></i>
                <span>Token Progress</span>
              </div>
              <div class="village-detail-value">
                <div class="village-token-progress">
                  <span class="token-bar-text">\`${tokenBar}\` ${tokenProgress.current.toLocaleString()}/${tokenProgress.required.toLocaleString()}</span>
                  <span class="token-percentage">${tokenPercentage}%</span>
                </div>
              </div>
            </div>
          ` : ''}
          
          <div class="village-detail-item">
            <div class="village-detail-label">
              <i class="fas fa-store"></i>
              <span>Vending</span>
            </div>
            <div class="village-detail-value">
              <span class="vending-tier-text">${vendingTierText}${discountText}</span>
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

// Export for global access if needed
window.renderVillageSection = renderVillageSection;
