// ============================================================================
// Blank Model Page Template - Modern, Consistent Format
// Template for creating new model pages with modern UI patterns
// ============================================================================

// No longer using createSearchFilterBar - using separate search and filter bars

// ------------------- State Management -------------------
let blankData = [];
let filteredData = [];
let currentPage = 1;
let itemsPerPage = 12;
let filters = {
  search: '',
  category: 'all',
  status: 'all',
  sortBy: 'name-asc'
};

// ------------------- Dummy Data Generator -------------------
/**
 * Generates dummy data for the blank template with varied card styles
 * Includes examples of all model card types: character, item, monster, pet, village
 * @param {number} count - Number of dummy items to generate
 * @returns {Array} Array of dummy data objects with different card types
 */
function generateDummyData(count = 50) {
  const categories = ['Technology', 'Science', 'Art', 'Sports', 'Food', 'Travel', 'Music', 'Nature'];
  const statuses = ['Active', 'Pending', 'Completed', 'Archived'];
  const cardTypes = ['standard', 'minimal', 'detailed', 'compact', 'featured'];
  const modelTypes = ['character', 'item', 'monster', 'pet', 'mount', 'vending', 'vendingShop', 'starterGear', 'village', 'villageShop', 'relic', 'quest', 'helpWantedQuest', 'inventory', 'blank'];
  
  // Standard names
  const standardNames = [
    'Alpha Project', 'Beta System', 'Gamma Module', 'Delta Component',
    'Epsilon Framework', 'Zeta Application', 'Eta Service', 'Theta Platform'
  ];
  
  // Minimal names (shorter)
  const minimalNames = [
    'Task A', 'Task B', 'Task C', 'Task D',
    'Item 1', 'Item 2', 'Item 3', 'Item 4'
  ];
  
  // Detailed names (longer, descriptive)
  const detailedNames = [
    'Advanced Machine Learning Framework',
    'Real-time Data Processing System',
    'Cloud-based Collaboration Platform',
    'Enterprise Resource Planning Suite',
    'Customer Relationship Management Tool',
    'Business Intelligence Dashboard',
    'Automated Testing Framework',
    'Content Management System'
  ];
  
  // Compact names
  const compactNames = [
    'A1', 'B2', 'C3', 'D4',
    'E5', 'F6', 'G7', 'H8'
  ];
  
  // Featured names (premium)
  const featuredNames = [
    '⭐ Premium Suite', '⭐ Enterprise Pro', '⭐ Ultimate Package',
    '⭐ Professional Edition', '⭐ Master Collection', '⭐ Elite System'
  ];
  
  const descriptions = [
    'A modern solution for complex problems',
    'Innovative approach to traditional challenges',
    'State-of-the-art technology implementation',
    'User-friendly interface with advanced features',
    'Scalable architecture for growing needs',
    'Robust system with high performance',
    'Elegant design with powerful functionality',
    'Comprehensive solution for various use cases'
  ];

  const icons = [
    'fa-cube', 'fa-star', 'fa-gem', 'fa-rocket',
    'fa-lightbulb', 'fa-fire', 'fa-bolt', 'fa-magic',
    'fa-crown', 'fa-shield-alt', 'fa-sword', 'fa-wand-magic'
  ];

  // Model-specific name arrays
  const characterNames = ['Link', 'Zelda', 'Ganondorf', 'Impa', 'Paya', 'Sidon', 'Mipha', 'Revali'];
  const itemNames = ['Master Sword', 'Hylian Shield', 'Bomb Arrow', 'Hearty Meal', 'Elixir', 'Ancient Core'];
  const monsterNames = ['Bokoblin', 'Lizalfos', 'Moblin', 'Lynel', 'Guardian', 'Hinox'];
  const petNames = ['Wolf Companion', 'Horse', 'Chuchu', 'Fire Chuchu', 'Ice Chuchu', 'Electric Chuchu'];
  const mountNames = ['Royal Horse', 'Epona', 'Giant Horse', 'Stalhorse', 'Bokoblin Horse', 'Zelda\'s Horse'];
  const vendingNames = ['Vending Stock Item', 'Vendor Item', 'Shop Stock', 'Merchant Goods'];
  const vendingShopNames = ['Beedle\'s Shop', 'Traveling Merchant', 'Vendor Stall', 'Market Stand'];
  const starterGearNames = ['Starter Sword', 'Basic Shield', 'Traveler\'s Clothes', 'Adventurer\'s Pack'];
  const villageNames = ['Hateno Village', 'Kakariko Village', 'Zora\'s Domain', 'Goron City', 'Rito Village'];
  const villageShopNames = ['Hateno General Store', 'Kakariko Shop', 'Zora Market', 'Goron Shop'];
  const relicNames = ['Ancient Relic', 'Sacred Artifact', 'Divine Fragment', 'Legendary Piece'];
  const questNames = ['Rescue Mission', 'Exploration Quest', 'Defeat the Monster', 'Gather Materials'];
  const helpWantedQuestNames = ['Help Wanted: Delivery', 'Help Wanted: Guard Duty', 'Help Wanted: Gathering'];
  const inventoryNames = ['Character Inventory', 'Storage Inventory', 'Item Collection'];
  
  return Array.from({ length: count }, (_, i) => {
    const modelType = modelTypes[i % modelTypes.length];
    // Only generate generic fields for blank template cards
    const cardType = modelType === 'blank' ? cardTypes[i % cardTypes.length] : null;
    const category = modelType === 'blank' ? categories[Math.floor(Math.random() * categories.length)] : null;
    const status = modelType === 'blank' ? statuses[Math.floor(Math.random() * statuses.length)] : null;
    const description = modelType === 'blank' ? descriptions[Math.floor(Math.random() * descriptions.length)] : null;
    const icon = modelType === 'blank' ? icons[Math.floor(Math.random() * icons.length)] : null;
    
    // Choose name based on model type
    let name;
    switch(modelType) {
      case 'character':
        name = characterNames[i % characterNames.length] + (i > characterNames.length ? ` ${Math.floor(i / characterNames.length) + 1}` : '');
        break;
      case 'item':
        name = itemNames[i % itemNames.length] + (i > itemNames.length ? ` ${Math.floor(i / itemNames.length) + 1}` : '');
        break;
      case 'monster':
        name = monsterNames[i % monsterNames.length] + (i > monsterNames.length ? ` ${Math.floor(i / monsterNames.length) + 1}` : '');
        break;
      case 'pet':
        name = petNames[i % petNames.length] + (i > petNames.length ? ` ${Math.floor(i / petNames.length) + 1}` : '');
        break;
      case 'mount':
        name = mountNames[i % mountNames.length] + (i > mountNames.length ? ` ${Math.floor(i / mountNames.length) + 1}` : '');
        break;
      case 'vending':
        name = vendingNames[i % vendingNames.length] + (i > vendingNames.length ? ` ${Math.floor(i / vendingNames.length) + 1}` : '');
        break;
      case 'vendingShop':
        name = vendingShopNames[i % vendingShopNames.length] + (i > vendingShopNames.length ? ` ${Math.floor(i / vendingShopNames.length) + 1}` : '');
        break;
      case 'starterGear':
        name = starterGearNames[i % starterGearNames.length] + (i > starterGearNames.length ? ` ${Math.floor(i / starterGearNames.length) + 1}` : '');
        break;
      case 'village':
        name = villageNames[i % villageNames.length];
        break;
      case 'villageShop':
        name = villageShopNames[i % villageShopNames.length] + (i > villageShopNames.length ? ` ${Math.floor(i / villageShopNames.length) + 1}` : '');
        break;
      case 'relic':
        name = relicNames[i % relicNames.length] + (i > relicNames.length ? ` ${Math.floor(i / relicNames.length) + 1}` : '');
        break;
      case 'quest':
        name = questNames[i % questNames.length] + (i > questNames.length ? ` ${Math.floor(i / questNames.length) + 1}` : '');
        break;
      case 'helpWantedQuest':
        name = helpWantedQuestNames[i % helpWantedQuestNames.length] + (i > helpWantedQuestNames.length ? ` ${Math.floor(i / helpWantedQuestNames.length) + 1}` : '');
        break;
      case 'inventory':
        name = inventoryNames[i % inventoryNames.length] + (i > inventoryNames.length ? ` ${Math.floor(i / inventoryNames.length) + 1}` : '');
        break;
      default:
        // Only use cardType-based naming for blank template
        if (cardType) {
          switch(cardType) {
            case 'minimal':
              name = minimalNames[i % minimalNames.length];
              break;
            case 'detailed':
              name = detailedNames[i % detailedNames.length];
              break;
            case 'compact':
              name = compactNames[i % compactNames.length];
              break;
            case 'featured':
              name = featuredNames[i % featuredNames.length];
              break;
            default:
              name = standardNames[i % standardNames.length] + ` ${i + 1}`;
          }
        } else {
          name = standardNames[i % standardNames.length] + ` ${i + 1}`;
        }
    }
    
    // Base data structure - only include generic fields for blank template cards
    const baseData = {
      id: `BLK-${String(i + 1).padStart(4, '0')}`,
      name: name,
      modelType: modelType
    };
    
    // Only add generic fields for blank template cards
    if (modelType === 'blank') {
      baseData.description = cardType === 'compact' ? '' : `${description} (Item #${i + 1})`;
      baseData.category = category;
      baseData.status = status;
      baseData.priority = Math.floor(Math.random() * 5) + 1;
      baseData.score = Math.floor(Math.random() * 100);
      baseData.createdDate = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      baseData.updatedDate = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      baseData.tags = cardType === 'compact' ? [] : [category.toLowerCase(), status.toLowerCase(), `tag${i % 3 + 1}`];
      baseData.metadata = {
        author: `User ${String(Math.floor(Math.random() * 100)).padStart(3, '0')}`,
        version: `${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 10)}`,
        views: Math.floor(Math.random() * 10000),
        likes: Math.floor(Math.random() * 500)
      };
      baseData.cardType = cardType;
      baseData.icon = icon;
    }
    
    // Add model-type-specific data
    if (modelType === 'character') {
      baseData.job = ['Knight', 'Mage', 'Archer', 'Merchant', 'Scholar'][Math.floor(Math.random() * 5)];
      baseData.race = ['Hylian', 'Zora', 'Goron', 'Rito', 'Gerudo'][Math.floor(Math.random() * 5)];
      baseData.level = Math.floor(Math.random() * 50) + 1;
    } else if (modelType === 'item') {
      baseData.itemType = ['Weapon', 'Armor', 'Material', 'Food', 'Tool'][Math.floor(Math.random() * 5)];
      baseData.rarity = Math.floor(Math.random() * 5) + 1;
      baseData.price = Math.floor(Math.random() * 1000);
    } else if (modelType === 'monster') {
      baseData.tier = Math.floor(Math.random() * 5) + 1;
      baseData.hearts = Math.floor(Math.random() * 20) + 1;
      baseData.damage = Math.floor(Math.random() * 50) + 1;
      baseData.species = ['Bokoblin', 'Lizalfos', 'Moblin', 'Lynel'][Math.floor(Math.random() * 4)];
    } else if (modelType === 'pet') {
      baseData.species = ['Chuchu', 'Wolf', 'Horse', 'Bird'][Math.floor(Math.random() * 4)];
      baseData.petType = ['Forager', 'Hunter', 'Guardian', 'Explorer'][Math.floor(Math.random() * 4)];
      baseData.level = Math.floor(Math.random() * 30) + 1;
      baseData.ownerName = characterNames[Math.floor(Math.random() * characterNames.length)];
    } else if (modelType === 'mount') {
      baseData.mountType = ['Horse', 'Stalhorse', 'Bokoblin Horse', 'Giant Horse'][Math.floor(Math.random() * 4)];
      baseData.speed = Math.floor(Math.random() * 5) + 1;
      baseData.stamina = Math.floor(Math.random() * 5) + 1;
      baseData.ownerName = characterNames[Math.floor(Math.random() * characterNames.length)];
    } else if (modelType === 'vending') {
      baseData.characterName = characterNames[Math.floor(Math.random() * characterNames.length)];
      baseData.stock = Math.floor(Math.random() * 100) + 1;
      baseData.price = Math.floor(Math.random() * 1000);
    } else if (modelType === 'vendingShop') {
      baseData.characterName = characterNames[Math.floor(Math.random() * characterNames.length)];
      baseData.itemCount = Math.floor(Math.random() * 50) + 1;
      baseData.shopType = ['General', 'Weapons', 'Armor', 'Materials'][Math.floor(Math.random() * 4)];
    } else if (modelType === 'starterGear') {
      baseData.itemType = ['Weapon', 'Armor', 'Tool'][Math.floor(Math.random() * 3)];
      baseData.rarity = 1;
      baseData.price = 0;
    } else if (modelType === 'village') {
      baseData.population = Math.floor(Math.random() * 500) + 50;
      baseData.region = ['Central Hyrule', 'Lanayru', 'Eldin', 'Faron', 'Hebra'][Math.floor(Math.random() * 5)];
    } else if (modelType === 'villageShop') {
      baseData.villageName = villageNames[Math.floor(Math.random() * villageNames.length)];
      baseData.shopType = ['General Store', 'Weapon Shop', 'Armor Shop', 'Material Shop'][Math.floor(Math.random() * 4)];
      baseData.itemCount = Math.floor(Math.random() * 30) + 1;
    } else if (modelType === 'relic') {
      baseData.relicType = ['Ancient', 'Sacred', 'Divine', 'Legendary'][Math.floor(Math.random() * 4)];
      baseData.power = Math.floor(Math.random() * 100) + 1;
      baseData.rarity = Math.floor(Math.random() * 5) + 1;
    } else if (modelType === 'quest') {
      baseData.questType = ['Main', 'Side', 'Exploration', 'Combat'][Math.floor(Math.random() * 4)];
      baseData.status = ['Active', 'Completed', 'Available'][Math.floor(Math.random() * 3)];
      baseData.reward = Math.floor(Math.random() * 1000);
      baseData.location = ['Hyrule Field', 'Death Mountain', 'Zora\'s Domain'][Math.floor(Math.random() * 3)];
    } else if (modelType === 'helpWantedQuest') {
      baseData.questType = 'Help Wanted';
      baseData.status = ['Open', 'In Progress', 'Completed'][Math.floor(Math.random() * 3)];
      baseData.reward = Math.floor(Math.random() * 500);
      baseData.participants = Math.floor(Math.random() * 5);
    } else if (modelType === 'inventory') {
      baseData.characterName = characterNames[Math.floor(Math.random() * characterNames.length)];
      baseData.itemCount = Math.floor(Math.random() * 100) + 1;
      baseData.totalValue = Math.floor(Math.random() * 10000);
    }
    
    // Add type-specific data only for blank template cards
    if (modelType === 'blank') {
      if (cardType === 'detailed') {
        baseData.metadata.description = 'Extended information about this item';
        baseData.metadata.requirements = ['Requirement 1', 'Requirement 2', 'Requirement 3'];
        baseData.metadata.dependencies = ['Dep A', 'Dep B'];
      } else if (cardType === 'featured') {
        baseData.metadata.premium = true;
        baseData.metadata.badge = 'Premium';
        baseData.score = Math.floor(Math.random() * 50) + 50; // Higher scores
      } else if (cardType === 'minimal') {
        baseData.description = '';
        baseData.tags = [];
      }
    }
    
    return baseData;
  });
}

// ------------------- API Layer (Dummy) -------------------
/**
 * Simulates fetching blank data from API
 * @returns {Promise<Array>} Dummy data
 */
async function fetchBlankData() {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  // Generate enough data to show examples of all model types (15 types * 2 examples each = 30 minimum)
  // Using 75 to ensure good variety and multiple examples of each type
  return generateDummyData(75);
}

// ------------------- Filter Utilities -------------------
/**
 * Applies filters to blank data
 * @param {Array} data - Data to filter
 * @returns {Array} Filtered data
 */
function applyFilters(data) {
  let filtered = [...data];

  // Search filter
  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    filtered = filtered.filter(item => 
      item.name.toLowerCase().includes(searchTerm) ||
      (item.description && item.description.toLowerCase().includes(searchTerm)) ||
      item.id.toLowerCase().includes(searchTerm) ||
      (item.tags && Array.isArray(item.tags) && item.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
    );
  }

  // Category filter
  if (filters.category !== 'all') {
    filtered = filtered.filter(item => item.category && item.category === filters.category);
  }

  // Status filter
  if (filters.status !== 'all') {
    filtered = filtered.filter(item => item.status && item.status === filters.status);
  }

  // Sort
  filtered = applySorting(filtered, filters.sortBy);

  return filtered;
}

/**
 * Applies sorting to data
 * @param {Array} data - Data to sort
 * @param {string} sortBy - Sort field and direction (e.g., 'name-asc')
 * @returns {Array} Sorted data
 */
function applySorting(data, sortBy) {
  const [field, direction] = sortBy.split('-');
  const isAsc = direction === 'asc';

  return [...data].sort((a, b) => {
    let valA, valB;
    
    switch (field) {
      case 'name':
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        break;
      case 'category':
        valA = (a.category || '').toLowerCase();
        valB = (b.category || '').toLowerCase();
        break;
      case 'status':
        valA = (a.status || '').toLowerCase();
        valB = (b.status || '').toLowerCase();
        break;
      case 'score':
        valA = a.score || 0;
        valB = b.score || 0;
        break;
      case 'priority':
        valA = a.priority || 0;
        valB = b.priority || 0;
        break;
      case 'date':
        valA = new Date(a.createdDate || 0).getTime();
        valB = new Date(b.createdDate || 0).getTime();
        break;
      default:
        valA = a[field] || '';
        valB = b[field] || '';
    }
    
    if (typeof valA === 'string') {
      return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return isAsc ? valA - valB : valB - valA;
    }
  });
}

/**
 * Gets unique categories from data
 * @param {Array} data - Data array
 * @returns {Array} Sorted list of unique categories
 */
function getUniqueCategories(data) {
  const categories = new Set();
  data.forEach(item => {
    if (item.category && typeof item.category === 'string' && item.category.trim()) {
      categories.add(item.category.trim());
    }
  });
  return Array.from(categories).sort();
}

/**
 * Gets unique statuses from data
 * @param {Array} data - Data array
 * @returns {Array} Sorted list of unique statuses
 */
function getUniqueStatuses(data) {
  const statuses = new Set();
  data.forEach(item => {
    if (item.status && typeof item.status === 'string' && item.status.trim()) {
      statuses.add(item.status.trim());
    }
  });
  return Array.from(statuses).sort();
}

// ------------------- Render Layer -------------------
/**
 * Renders skeleton loading cards
 * @param {HTMLElement} container - Container element
 * @param {number} count - Number of skeleton cards to render
 */
function renderSkeletonCards(container, count = 12) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="blank-card skeleton">
      <div class="blank-card-header">
        <div class="skeleton-shimmer skeleton-avatar"></div>
        <div class="skeleton-shimmer skeleton-title"></div>
      </div>
      <div class="blank-card-body">
        <div class="skeleton-shimmer skeleton-text"></div>
        <div class="skeleton-shimmer skeleton-text short"></div>
      </div>
      <div class="blank-card-footer">
        <div class="skeleton-shimmer skeleton-badge"></div>
        <div class="skeleton-shimmer skeleton-badge"></div>
        <div class="skeleton-shimmer skeleton-badge"></div>
      </div>
    </div>
  `).join('');
}

/**
 * Renders blank cards grid
 * @param {Array} items - Items to render
 * @param {HTMLElement} container - Container element
 */
function renderBlankGrid(items, container) {
  if (items.length === 0) {
    container.innerHTML = `
      <div class="blank-empty-state">
        <i class="fas fa-inbox"></i>
        <h3>No items found</h3>
        <p>Try adjusting your search or filters</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => renderBlankCard(item)).join('');
}

/**
 * Renders a single blank card with flip functionality and various UI examples
 * @param {Object} item - Item data
 * @returns {string} HTML for blank card
 */
function renderBlankCard(item) {
  const modelType = item.modelType || 'blank';
  
  // Render based on model type first
  switch(modelType) {
    case 'character':
      return renderCharacterCard(item);
    case 'item':
      return renderItemCard(item);
    case 'monster':
      return renderMonsterCard(item);
    case 'pet':
      return renderPetCard(item);
    case 'mount':
      return renderMountCard(item);
    case 'vending':
      return renderVendingCard(item);
    case 'vendingShop':
      return renderVendingShopCard(item);
    case 'starterGear':
      return renderStarterGearCard(item);
    case 'village':
      return renderVillageCard(item);
    case 'villageShop':
      return renderVillageShopCard(item);
    case 'relic':
      return renderRelicCard(item);
    case 'quest':
      return renderQuestCard(item);
    case 'helpWantedQuest':
      return renderHelpWantedQuestCard(item);
    case 'inventory':
      return renderInventoryCard(item);
    default:
      // Fall back to card type for blank cards
      const cardType = item.cardType || 'standard';
      switch(cardType) {
        case 'minimal':
          return renderMinimalCard(item);
        case 'detailed':
          return renderDetailedCard(item);
        case 'compact':
          return renderCompactCard(item);
        case 'featured':
          return renderFeaturedCard(item);
        default:
          return renderStandardCard(item);
      }
  }
}

/**
 * Renders a character card example
 */
function renderCharacterCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Character');
  const jobEscaped = escapeHtml(item.job || 'Adventurer');
  const raceEscaped = escapeHtml(item.race || 'Hylian');
  const level = item.level || 1;
  
  return `
    <div class="character-card" data-character="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}">
      <div class="character-header">
        <div class="character-avatar-container">
          <i class="fas fa-user-circle" style="font-size: 3rem; color: var(--botw-blue); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"></i>
        </div>
        <div class="character-title">
          <div class="character-name-row">
            <h3 class="character-name">${nameEscaped}</h3>
          </div>
          <div class="character-race-job-row">
            ${raceEscaped} &bull; ${jobEscaped}
          </div>
          <div class="character-owner">
            <i class="fab fa-discord"></i>
            <span class="character-owner-name">@Example Owner</span>
          </div>
        </div>
      </div>
      <div class="character-content">
        <div class="character-section">
          <h4 class="character-section-title">Basic Info</h4>
          <div class="character-detail-list">
            <div class="character-detail-item">
              <span class="detail-label">Level:</span>
              <span class="detail-value">${level}</span>
            </div>
            <div class="character-detail-item">
              <span class="detail-label">ID:</span>
              <span class="detail-value">${item.id}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders an item card example
 */
function renderItemCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Item');
  const itemTypeEscaped = escapeHtml(item.itemType || 'Misc');
  const rarity = item.rarity || 1;
  const price = item.price || 0;
  
  const typeColors = {
    'Weapon': '#B99F65',
    'Armor': '#1F5D50',
    'Material': '#0169A0',
    'Food': '#FF9800',
    'Tool': '#888888'
  };
  const typeColor = typeColors[item.itemType] || '#888888';
  
  return `
    <div class="model-details-item item-card modern-item-card" data-item-name="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}" onclick="this.classList.toggle('flipped')">
      <div class="flip-indicator" title="Click to flip card">
        <i class="fas fa-sync-alt"></i>
      </div>
      <div class="item-card-front">
        <div class="item-header-row modern-item-header">
          <div class="item-image-card">
            <i class="fas ${item.icon || 'fa-cube'}" style="font-size: 3rem; color: ${typeColor};"></i>
          </div>
          <div class="item-header-info modern-item-header-info">
            <div class="item-name-row">
              <span class="item-name-big">${nameEscaped}</span>
            </div>
            <div class="item-type-bar" style="background: ${typeColor};">
              <i class="fas fa-tag"></i>
              <span class="item-type-bar-label">${itemTypeEscaped}</span>
            </div>
            <div class="item-slot-row">
              <span class="item-slot-label">Rarity: ${rarity}</span>
            </div>
          </div>
        </div>
        <div class="item-section modern-item-details">
          <div class="item-section-label modern-item-section-label"><i class="fas fa-info-circle"></i> Details</div>
          <div class="item-detail-list modern-item-detail-list">
            <div class="item-detail-row modern-item-detail-row">
              <strong>Buy:</strong> <span>${price}</span>
              <strong style="margin-left: 1.2em;">Sell:</strong> <span>${Math.floor(price * 0.5)}</span>
            </div>
            <div class="item-detail-row modern-item-detail-row">
              <strong>Rarity:</strong> <span>${rarity}/5</span>
            </div>
          </div>
        </div>
      </div>
      <div class="item-card-back">
        <div class="item-section">
          <div class="item-section-label modern-item-section-label"><i class="fas fa-info-circle"></i> Additional Info</div>
          <div class="item-detail-list modern-item-detail-list">
            <div class="item-detail-row modern-item-detail-row">
              <strong>ID:</strong> <span>${item.id}</span>
            </div>
            ${item.category ? `
            <div class="item-detail-row modern-item-detail-row">
              <strong>Category:</strong> <span>${escapeHtml(item.category)}</span>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a monster card example
 */
function renderMonsterCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Monster');
  const speciesEscaped = escapeHtml(item.species || 'Creature');
  const tier = item.tier || 1;
  const hearts = item.hearts || 1;
  const damage = item.damage || 1;
  
  return `
    <div class="model-details-item monster-card modern-monster-card" data-monster-name="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}" onclick="this.classList.toggle('flipped')">
      <div class="flip-indicator" title="Click to flip card">
        <i class="fas fa-sync-alt"></i>
      </div>
      <div class="monster-card-front">
        <div class="monster-header">
          <div class="monster-image">
            <i class="fas fa-dragon" style="font-size: 3rem; color: #ff4444;"></i>
          </div>
          <div class="monster-title">
            <div class="monster-name">${nameEscaped}</div>
            <div class="monster-species">${speciesEscaped}</div>
            <div class="monster-type">Tier ${tier}</div>
          </div>
        </div>
        <div class="monster-stats">
          <div class="stat-row">
            <span class="stat-label">Tier:</span>
            <span class="stat-value tier-${tier}">${tier}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Hearts:</span>
            <span class="stat-value">${hearts}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Damage:</span>
            <span class="stat-value">${damage}</span>
          </div>
        </div>
      </div>
      <div class="monster-card-back">
        <div class="monster-loot-section">
          <div class="monster-loot-title">Loot dropped by ${nameEscaped}</div>
          <div class="monster-loot-empty">
            <i class="fas fa-box"></i> Example loot items would appear here
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a pet card example
 */
function renderPetCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Pet');
  const speciesEscaped = escapeHtml(item.species || 'Creature');
  const petTypeEscaped = escapeHtml(item.petType || 'Companion');
  const ownerEscaped = escapeHtml(item.ownerName || 'No Owner');
  const level = item.level || 1;
  
  return `
    <div class="model-details-item pet-card modern-pet-card" data-pet-name="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}">
      <div class="pet-header-row modern-pet-header">
        <div class="pet-image-card">
          <div class="pet-image modern-pet-image" style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #4a9eff, #2196f3); display: flex; align-items: center; justify-content: center; border: 3px solid var(--glass-border);">
            <i class="fas fa-paw" style="font-size: 2rem; color: white;"></i>
          </div>
        </div>
        <div class="pet-header-info modern-pet-header-info">
          <div class="pet-name-row">
            <span class="pet-name-big">${nameEscaped}</span>
            <span class="pet-status-badge active">Active</span>
          </div>
          <div class="pet-type-bar">
            <i class="fas fa-paw"></i>
            <span class="pet-type-bar-label">${speciesEscaped} - ${petTypeEscaped}</span>
          </div>
          <div class="pet-owner-row">
            <span class="pet-owner-label">Owner: ${ownerEscaped}</span>
          </div>
        </div>
      </div>
      <div class="pet-section modern-pet-details">
        <div class="pet-section-label modern-pet-section-label"><i class="fas fa-info-circle"></i> Details</div>
        <div class="pet-detail-list modern-pet-detail-list">
          <div class="pet-detail-row modern-pet-detail-row">
            <strong>Level:</strong> <span>${level}</span>
          </div>
          <div class="pet-detail-row modern-pet-detail-row">
            <strong>ID:</strong> <span>${item.id}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a village card example
 */
function renderVillageCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Village');
  const regionEscaped = escapeHtml(item.region || 'Hyrule');
  const population = item.population || 100;
  
  return `
    <div class="model-details-item village-model-card" onclick="this.classList.toggle('flipped')" style="--village-color: #4a9eff;">
      <div class="flip-indicator" title="Click to flip card">
        <i class="fas fa-sync-alt"></i>
      </div>
      <div class="village-card-front">
        <div class="village-header">
          <div class="village-icon">
            <i class="fas fa-home" style="font-size: 3rem;"></i>
          </div>
          <div class="village-title">
            <h3 class="village-name">${nameEscaped}</h3>
            <div class="village-region">${regionEscaped}</div>
          </div>
        </div>
        <div class="village-stats">
          <div class="village-model-stat-item">
            <span class="stat-label">Population:</span>
            <span class="stat-value">${population}</span>
          </div>
          <div class="village-model-stat-item">
            <span class="stat-label">ID:</span>
            <span class="stat-value">${item.id}</span>
          </div>
        </div>
      </div>
      <div class="village-card-back">
        <div class="village-details">
          <h4>Village Information</h4>
          <p>Additional details about ${nameEscaped} would appear here.</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a mount card example
 */
function renderMountCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Mount');
  const mountTypeEscaped = escapeHtml(item.mountType || 'Horse');
  const ownerEscaped = escapeHtml(item.ownerName || 'No Owner');
  const speed = item.speed || 1;
  const stamina = item.stamina || 1;
  
  return `
    <div class="model-details-item mount-card" data-mount="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}">
      <div class="mount-header">
        <div class="mount-image">
          <i class="fas fa-horse" style="font-size: 3rem; color: #8B4513;"></i>
        </div>
        <div class="mount-info">
          <h3 class="mount-name">${nameEscaped}</h3>
          <div class="mount-type">${mountTypeEscaped}</div>
          <div class="mount-owner">Owner: ${ownerEscaped}</div>
        </div>
      </div>
      <div class="mount-stats">
        <div class="stat-item">
          <span class="stat-label">Speed:</span>
          <span class="stat-value">${speed}/5</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Stamina:</span>
          <span class="stat-value">${stamina}/5</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a vending stock card example
 */
function renderVendingCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Item');
  const characterEscaped = escapeHtml(item.characterName || 'Unknown Vendor');
  const stock = item.stock || 0;
  const price = item.price || 0;
  
  return `
    <div class="model-details-item vending-card modern-item-card" data-item-name="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}">
      <div class="item-header-row modern-item-header">
        <div class="item-image-card">
          <i class="fas fa-shopping-cart" style="font-size: 3rem; color: #4a9eff;"></i>
        </div>
        <div class="item-header-info modern-item-header-info">
          <div class="item-name-row">
            <span class="item-name-big">${nameEscaped}</span>
          </div>
          <div class="item-type-bar" style="background: #4a9eff;">
            <i class="fas fa-store"></i>
            <span class="item-type-bar-label">Vending Stock</span>
          </div>
          <div class="item-detail-row">
            <strong>Vendor:</strong> <span>${characterEscaped}</span>
          </div>
        </div>
      </div>
      <div class="item-section modern-item-details">
        <div class="item-section-label modern-item-section-label"><i class="fas fa-info-circle"></i> Details</div>
        <div class="item-detail-list modern-item-detail-list">
          <div class="item-detail-row modern-item-detail-row">
            <strong>Stock:</strong> <span>${stock}</span>
            <strong style="margin-left: 1em;">Price:</strong> <span>${price}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a vending shop card example
 */
function renderVendingShopCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Shop');
  const characterEscaped = escapeHtml(item.characterName || 'Unknown Vendor');
  const shopTypeEscaped = escapeHtml(item.shopType || 'General');
  const itemCount = item.itemCount || 0;
  
  return `
    <div class="model-details-item vending-shop-card" data-shop="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}">
      <div class="shop-header">
        <div class="shop-icon">
          <i class="fas fa-store" style="font-size: 3rem; color: #ff9800;"></i>
        </div>
        <div class="shop-info">
          <h3 class="shop-name">${nameEscaped}</h3>
          <div class="shop-vendor">Vendor: ${characterEscaped}</div>
          <div class="shop-type">Type: ${shopTypeEscaped}</div>
        </div>
      </div>
      <div class="shop-stats">
        <div class="stat-item">
          <span class="stat-label">Items:</span>
          <span class="stat-value">${itemCount}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a starter gear card example
 */
function renderStarterGearCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Gear');
  const itemTypeEscaped = escapeHtml(item.itemType || 'Tool');
  
  return `
    <div class="model-details-item item-card modern-item-card starter-gear-card" data-item-name="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}">
      <div class="item-header-row modern-item-header">
        <div class="item-image-card">
          <i class="fas fa-gift" style="font-size: 3rem; color: #4caf50;"></i>
        </div>
        <div class="item-header-info modern-item-header-info">
          <div class="item-name-row">
            <span class="item-name-big">${nameEscaped}</span>
            <span class="starter-badge" style="background: #4caf50; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">STARTER</span>
          </div>
          <div class="item-type-bar" style="background: #4caf50;">
            <i class="fas fa-tag"></i>
            <span class="item-type-bar-label">${itemTypeEscaped}</span>
          </div>
        </div>
      </div>
      <div class="item-section modern-item-details">
        <div class="item-section-label modern-item-section-label"><i class="fas fa-info-circle"></i> Starter Gear</div>
        <div class="item-detail-list modern-item-detail-list">
          <div class="item-detail-row modern-item-detail-row">
            <strong>Type:</strong> <span>${itemTypeEscaped}</span>
            <strong style="margin-left: 1em;">Price:</strong> <span>Free</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a village shop card example
 */
function renderVillageShopCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Shop');
  const villageEscaped = escapeHtml(item.villageName || 'Unknown Village');
  const shopTypeEscaped = escapeHtml(item.shopType || 'General Store');
  const itemCount = item.itemCount || 0;
  
  return `
    <div class="model-details-item village-shop-card modern-item-card" data-shop="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}">
      <div class="item-header-row modern-item-header">
        <div class="item-image-card">
          <i class="fas fa-store-alt" style="font-size: 3rem; color: #9c27b0;"></i>
        </div>
        <div class="item-header-info modern-item-header-info">
          <div class="item-name-row">
            <span class="item-name-big">${nameEscaped}</span>
          </div>
          <div class="item-type-bar" style="background: #9c27b0;">
            <i class="fas fa-map-marker-alt"></i>
            <span class="item-type-bar-label">${shopTypeEscaped}</span>
          </div>
          <div class="item-detail-row">
            <strong>Village:</strong> <span>${villageEscaped}</span>
          </div>
        </div>
      </div>
      <div class="item-section modern-item-details">
        <div class="item-section-label modern-item-section-label"><i class="fas fa-info-circle"></i> Details</div>
        <div class="item-detail-list modern-item-detail-list">
          <div class="item-detail-row modern-item-detail-row">
            <strong>Items Available:</strong> <span>${itemCount}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a relic card example
 */
function renderRelicCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Relic');
  const relicTypeEscaped = escapeHtml(item.relicType || 'Ancient');
  const power = item.power || 1;
  const rarity = item.rarity || 1;
  
  return `
    <div class="model-details-item relic-card item-card" data-relic="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}" onclick="this.classList.toggle('flipped')">
      <div class="flip-indicator" title="Click to flip card">
        <i class="fas fa-sync-alt"></i>
      </div>
      <div class="relic-card-front item-card-front">
        <div class="relic-header">
          <div class="relic-icon">
            <i class="fas fa-gem" style="font-size: 3rem; color: #ffd700;"></i>
          </div>
          <div class="relic-info">
            <h3 class="relic-name">${nameEscaped}</h3>
            <div class="relic-type">${relicTypeEscaped} Relic</div>
          </div>
        </div>
        <div class="relic-stats">
          <div class="stat-item">
            <span class="stat-label">Power:</span>
            <span class="stat-value">${power}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Rarity:</span>
            <span class="stat-value">${rarity}/5</span>
          </div>
        </div>
      </div>
      <div class="relic-card-back item-card-back">
        <div class="relic-details">
          <h4>Relic Information</h4>
          <p>Additional details about ${nameEscaped} would appear here.</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a quest card example
 */
function renderQuestCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Quest');
  const questTypeEscaped = escapeHtml(item.questType || 'Main');
  const statusEscaped = escapeHtml(item.status || 'Active');
  const locationEscaped = escapeHtml(item.location || 'Hyrule Field');
  const reward = item.reward || 0;
  
  const statusClass = statusEscaped.toLowerCase().replace(/\s+/g, '-');
  
  return `
    <div class="quest-card" data-quest-id="${item.id}" onclick="this.classList.toggle('flipped')">
      <div class="flip-indicator" title="Click to flip card">
        <i class="fas fa-sync-alt"></i>
      </div>
      <div class="quest-card-inner">
        <div class="quest-card-front">
          <div class="quest-header">
            <div class="quest-title-row">
              <h3 class="quest-title">${nameEscaped}</h3>
              <div class="quest-status-badge ${statusClass}">
                <i class="fas fa-${statusEscaped === 'Completed' ? 'check-circle' : 'circle'}"></i>
                <span>${statusEscaped}</span>
              </div>
            </div>
            <div class="quest-type-badge">
              <i class="fas fa-${questTypeEscaped === 'Main' ? 'star' : 'map'}"></i>
              <span>${questTypeEscaped} Quest</span>
            </div>
          </div>
          <div class="quest-description">
            <p>Example quest description for ${nameEscaped}</p>
          </div>
          <div class="quest-details">
            <div class="quest-detail-row">
              <span class="quest-detail-label">📍 Location:</span>
              <span class="quest-detail-value">${locationEscaped}</span>
            </div>
            <div class="quest-detail-row">
              <span class="quest-detail-label">💰 Reward:</span>
              <span class="quest-detail-value">${reward}</span>
            </div>
          </div>
        </div>
        <div class="quest-card-back">
          <div class="quest-back-content">
            <h4>Quest Details</h4>
            <p>Additional quest information would appear here.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a help wanted quest card example
 */
function renderHelpWantedQuestCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Help Wanted Quest');
  const statusEscaped = escapeHtml(item.status || 'Open');
  const reward = item.reward || 0;
  const participants = item.participants || 0;
  
  return `
    <div class="quest-card help-wanted-quest" data-quest-id="${item.id}" onclick="this.classList.toggle('flipped')">
      <div class="flip-indicator" title="Click to flip card">
        <i class="fas fa-sync-alt"></i>
      </div>
      <div class="quest-card-inner">
        <div class="quest-card-front">
          <div class="quest-header">
            <div class="quest-title-row">
              <h3 class="quest-title">${nameEscaped}</h3>
              <div class="quest-status-badge ${statusEscaped.toLowerCase().replace(/\s+/g, '-')}">
                <i class="fas fa-${statusEscaped === 'Completed' ? 'check-circle' : 'clock'}"></i>
                <span>${statusEscaped}</span>
              </div>
            </div>
            <div class="quest-type-badge help-wanted">
              <i class="fas fa-hand-paper"></i>
              <span>Help Wanted</span>
            </div>
          </div>
          <div class="quest-description">
            <p>Help wanted quest description for ${nameEscaped}</p>
          </div>
          <div class="quest-details">
            <div class="quest-detail-row">
              <span class="quest-detail-label">👥 Participants:</span>
              <span class="quest-detail-value">${participants}</span>
            </div>
            <div class="quest-detail-row">
              <span class="quest-detail-label">💰 Reward:</span>
              <span class="quest-detail-value">${reward}</span>
            </div>
          </div>
        </div>
        <div class="quest-card-back">
          <div class="quest-back-content">
            <h4>Help Wanted Details</h4>
            <p>Additional help wanted quest information would appear here.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders an inventory card example
 */
function renderInventoryCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown Inventory');
  const characterEscaped = escapeHtml(item.characterName || 'Unknown Character');
  const itemCount = item.itemCount || 0;
  const totalValue = item.totalValue || 0;
  
  return `
    <div class="model-details-item inventory-card" data-inventory="${nameEscaped.toLowerCase().replace(/\s+/g, '-')}">
      <div class="inventory-header">
        <div class="inventory-icon">
          <i class="fas fa-boxes" style="font-size: 3rem; color: #2196f3;"></i>
        </div>
        <div class="inventory-info">
          <h3 class="inventory-name">${nameEscaped}</h3>
          <div class="inventory-character">Character: ${characterEscaped}</div>
        </div>
      </div>
      <div class="inventory-stats">
        <div class="stat-item">
          <span class="stat-label">Items:</span>
          <span class="stat-value">${itemCount}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total Value:</span>
          <span class="stat-value">${totalValue}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a standard card with full features
 */
function renderStandardCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown');
  const descEscaped = escapeHtml(item.description || 'No description');
  const categoryEscaped = escapeHtml(item.category || '');
  const statusEscaped = escapeHtml(item.status || '');

  const statusColors = {
    'Active': '#4caf50',
    'Pending': '#ff9800',
    'Completed': '#2196f3',
    'Archived': '#9e9e9e'
  };
  const statusColor = statusColors[item.status] || '#9e9e9e';

  const priorityStars = '★'.repeat(item.priority || 0) + '☆'.repeat(5 - (item.priority || 0));

  const typeBarColors = {
    'Technology': '#00a3da',
    'Science': '#9c27b0',
    'Art': '#f44336',
    'Sports': '#4caf50',
    'Food': '#ff9800',
    'Travel': '#03a9f4',
    'Music': '#e91e63',
    'Nature': '#8bc34a'
  };
  const typeBarColor = typeBarColors[item.category] || '#00a3da';

  const relatedItems = Array.from({ length: Math.floor(Math.random() * 5) + 3 }, (_, i) => ({
    name: `Related Item ${i + 1}`,
    quantity: Math.floor(Math.random() * 50) + 1
  }));

  return `
    <div class="model-details-item blank-card item-card blank-card-standard" data-id="${item.id}" onclick="this.classList.toggle('flipped')">
      <div class="blank-card-front item-card-front">
        <div class="blank-card-header">
          <div class="blank-card-image-card">
            <i class="fas ${item.icon || 'fa-cube'} blank-card-image-icon"></i>
          </div>
          <div class="blank-card-title-group">
            <div class="blank-card-name-row">
              <h3 class="blank-card-title item-name-big">${nameEscaped}</h3>
            </div>
            <div class="blank-card-type-bar" style="background: ${typeBarColor};">
              <i class="fas fa-tag"></i>
              <span class="blank-card-type-bar-label">${categoryEscaped}</span>
            </div>
            <div class="blank-card-slot-row">
              <span class="blank-card-slot-label">${statusEscaped}</span>
              <span class="blank-card-id">${item.id}</span>
            </div>
          </div>
        </div>
        
        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-info-circle"></i> Details
          </div>
          <div class="blank-card-detail-list">
            <div class="blank-card-detail-row">
              <strong>Priority:</strong> <span>${priorityStars}</span>
              <strong style="margin-left:1.2em;">Score:</strong> <span>${item.score || 0}</span>
            </div>
            <div class="blank-card-detail-row">
              <strong>Created:</strong> <span>${formatDate(item.createdDate)}</span>
            </div>
            <div class="blank-card-detail-row">
              <strong>Updated:</strong> <span>${formatDate(item.updatedDate)}</span>
            </div>
          </div>
        </div>

        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-chart-bar"></i> Stats
          </div>
          <div class="blank-card-stats-row">
            <span class="blank-card-stat-pill">
              <i class="fas fa-eye"></i>
              <span class="blank-stat-label">Views:</span>
              <span class="blank-stat-value">${item.metadata.views}</span>
            </span>
            <span class="blank-card-stat-pill">
              <i class="fas fa-heart"></i>
              <span class="blank-stat-label">Likes:</span>
              <span class="blank-stat-value">${item.metadata.likes}</span>
            </span>
            <span class="blank-card-stat-pill">
              <i class="fas fa-code-branch"></i>
              <span class="blank-stat-label">Version:</span>
              <span class="blank-stat-value">${item.metadata.version}</span>
            </span>
          </div>
        </div>

        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-user"></i> Author
          </div>
          <div class="blank-card-tag-list">
            <span class="blank-card-tag">${item.metadata.author}</span>
          </div>
        </div>

        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-tags"></i> Tags
          </div>
          <div class="blank-card-tag-list">
            ${item.tags && item.tags.length > 0 
              ? item.tags.map(tag => `<span class="blank-card-tag item-tag">${escapeHtml(tag)}</span>`).join('')
              : '<span class="blank-card-tag">None</span>'}
          </div>
        </div>
      </div>

      <div class="blank-card-back item-card-back" id="blank-${item.id.replace(/[^a-zA-Z0-9]/g, '-')}-back">
        <div class="blank-card-back-header">
          <h3 class="blank-card-back-title">Additional Information</h3>
          <p class="blank-card-back-subtitle">Click card to flip back</p>
        </div>
        <div class="blank-card-back-content">
          <div class="blank-card-section">
            <div class="blank-card-section-label">
              <i class="fas fa-link"></i> Related Items
            </div>
            <div class="blank-card-related-list">
              ${relatedItems.map(related => `
                <div class="blank-card-related-row">
                  <span class="blank-card-related-qty">${related.quantity} ×</span>
                  <span class="blank-card-tag">${related.name}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="blank-card-section">
            <div class="blank-card-section-label">
              <i class="fas fa-calendar-alt"></i> Timeline
            </div>
            <div class="blank-card-timeline">
              <div class="blank-card-timeline-item">
                <i class="fas fa-check-circle"></i>
                <span>Created on ${formatDate(item.createdDate)}</span>
              </div>
              <div class="blank-card-timeline-item">
                <i class="fas fa-edit"></i>
                <span>Last updated on ${formatDate(item.updatedDate)}</span>
              </div>
              <div class="blank-card-timeline-item">
                <i class="fas fa-chart-line"></i>
                <span>Current score: ${item.score || 0} points</span>
              </div>
            </div>
          </div>

          <div class="blank-card-section">
            <div class="blank-card-section-label">
              <i class="fas fa-info"></i> Metadata
            </div>
            <div class="blank-card-meta-grid">
              <div class="blank-card-meta-item">
                <strong>ID:</strong> ${item.id}
              </div>
              <div class="blank-card-meta-item">
                <strong>Category:</strong> ${categoryEscaped}
              </div>
              <div class="blank-card-meta-item">
                <strong>Status:</strong> ${statusEscaped}
              </div>
              <div class="blank-card-meta-item">
                <strong>Priority:</strong> ${item.priority}/5
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a minimal card with simplified layout
 */
function renderMinimalCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown');
  const categoryEscaped = escapeHtml(item.category || '');
  const statusEscaped = escapeHtml(item.status || '');

  const typeBarColors = {
    'Technology': '#00a3da',
    'Science': '#9c27b0',
    'Art': '#f44336',
    'Sports': '#4caf50',
    'Food': '#ff9800',
    'Travel': '#03a9f4',
    'Music': '#e91e63',
    'Nature': '#8bc34a'
  };
  const typeBarColor = typeBarColors[item.category] || '#00a3da';

  return `
    <div class="model-details-item blank-card item-card blank-card-minimal" data-id="${item.id}" onclick="this.classList.toggle('flipped')">
      <div class="blank-card-front item-card-front">
        <div class="blank-card-header">
          <div class="blank-card-image-card">
            <i class="fas ${item.icon || 'fa-circle'} blank-card-image-icon"></i>
          </div>
          <div class="blank-card-title-group">
            <h3 class="blank-card-title item-name-big">${nameEscaped}</h3>
            <div class="blank-card-type-bar" style="background: ${typeBarColor};">
              <span class="blank-card-type-bar-label">${categoryEscaped}</span>
            </div>
          </div>
        </div>
        <div class="blank-card-section">
          <div class="blank-card-stats-row">
            <span class="blank-card-stat-pill">
              <i class="fas fa-star"></i>
              <span class="blank-stat-value">${item.score || 0}</span>
            </span>
            <span class="blank-card-stat-pill">
              <i class="fas fa-flag"></i>
              <span class="blank-stat-value">${statusEscaped}</span>
            </span>
          </div>
        </div>
      </div>
      <div class="blank-card-back item-card-back" id="blank-${item.id.replace(/[^a-zA-Z0-9]/g, '-')}-back">
        <div class="blank-card-back-header">
          <h3 class="blank-card-back-title">${nameEscaped}</h3>
        </div>
        <div class="blank-card-back-content">
          <div class="blank-card-section">
            <div class="blank-card-meta-grid">
              <div class="blank-card-meta-item"><strong>ID:</strong> ${item.id}</div>
              <div class="blank-card-meta-item"><strong>Category:</strong> ${categoryEscaped}</div>
              <div class="blank-card-meta-item"><strong>Status:</strong> ${statusEscaped}</div>
              <div class="blank-card-meta-item"><strong>Score:</strong> ${item.score || 0}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a detailed card with extended information
 */
function renderDetailedCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown');
  const descEscaped = escapeHtml(item.description || 'No description');
  const categoryEscaped = escapeHtml(item.category || '');
  const statusEscaped = escapeHtml(item.status || '');

  const typeBarColors = {
    'Technology': '#00a3da',
    'Science': '#9c27b0',
    'Art': '#f44336',
    'Sports': '#4caf50',
    'Food': '#ff9800',
    'Travel': '#03a9f4',
    'Music': '#e91e63',
    'Nature': '#8bc34a'
  };
  const typeBarColor = typeBarColors[item.category] || '#00a3da';

  const priorityStars = '★'.repeat(item.priority || 0) + '☆'.repeat(5 - (item.priority || 0));

  return `
    <div class="model-details-item blank-card item-card blank-card-detailed" data-id="${item.id}" onclick="this.classList.toggle('flipped')">
      <div class="blank-card-front item-card-front">
        <div class="blank-card-header">
          <div class="blank-card-image-card">
            <i class="fas ${item.icon || 'fa-info-circle'} blank-card-image-icon"></i>
          </div>
          <div class="blank-card-title-group">
            <div class="blank-card-name-row">
              <h3 class="blank-card-title item-name-big">${nameEscaped}</h3>
            </div>
            <div class="blank-card-type-bar" style="background: ${typeBarColor};">
              <i class="fas fa-tag"></i>
              <span class="blank-card-type-bar-label">${categoryEscaped}</span>
            </div>
            <div class="blank-card-slot-row">
              <span class="blank-card-slot-label">${statusEscaped}</span>
              <span class="blank-card-id">${item.id}</span>
            </div>
          </div>
        </div>
        
        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-align-left"></i> Description
          </div>
          <p style="color: rgba(255,255,255,0.7); margin: 0.5rem 0;">${descEscaped}</p>
        </div>

        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-info-circle"></i> Details
          </div>
          <div class="blank-card-detail-list">
            <div class="blank-card-detail-row">
              <strong>Priority:</strong> <span>${priorityStars}</span>
            </div>
            <div class="blank-card-detail-row">
              <strong>Score:</strong> <span>${item.score || 0}</span>
            </div>
            <div class="blank-card-detail-row">
              <strong>Created:</strong> <span>${formatDate(item.createdDate)}</span>
            </div>
            <div class="blank-card-detail-row">
              <strong>Updated:</strong> <span>${formatDate(item.updatedDate)}</span>
            </div>
          </div>
        </div>

        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-chart-bar"></i> Statistics
          </div>
          <div class="blank-card-stats-row">
            <span class="blank-card-stat-pill">
              <i class="fas fa-eye"></i>
              <span class="blank-stat-label">Views:</span>
              <span class="blank-stat-value">${item.metadata.views}</span>
            </span>
            <span class="blank-card-stat-pill">
              <i class="fas fa-heart"></i>
              <span class="blank-stat-label">Likes:</span>
              <span class="blank-stat-value">${item.metadata.likes}</span>
            </span>
            <span class="blank-card-stat-pill">
              <i class="fas fa-code-branch"></i>
              <span class="blank-stat-label">Version:</span>
              <span class="blank-stat-value">${item.metadata.version}</span>
            </span>
            <span class="blank-card-stat-pill">
              <i class="fas fa-user"></i>
              <span class="blank-stat-label">Author:</span>
              <span class="blank-stat-value">${item.metadata.author}</span>
            </span>
          </div>
        </div>

        ${item.tags && item.tags.length > 0 ? `
        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-tags"></i> Tags
          </div>
          <div class="blank-card-tag-list">
            ${item.tags.map(tag => `<span class="blank-card-tag item-tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <div class="blank-card-back item-card-back" id="blank-${item.id.replace(/[^a-zA-Z0-9]/g, '-')}-back">
        <div class="blank-card-back-header">
          <h3 class="blank-card-back-title">Extended Information</h3>
        </div>
        <div class="blank-card-back-content">
          ${item.metadata.requirements ? `
          <div class="blank-card-section">
            <div class="blank-card-section-label">
              <i class="fas fa-list-check"></i> Requirements
            </div>
            <div class="blank-card-tag-list">
              ${item.metadata.requirements.map(req => `<span class="blank-card-tag">${escapeHtml(req)}</span>`).join('')}
            </div>
          </div>
          ` : ''}
          ${item.metadata.dependencies ? `
          <div class="blank-card-section">
            <div class="blank-card-section-label">
              <i class="fas fa-link"></i> Dependencies
            </div>
            <div class="blank-card-tag-list">
              ${item.metadata.dependencies.map(dep => `<span class="blank-card-tag">${escapeHtml(dep)}</span>`).join('')}
            </div>
          </div>
          ` : ''}
          <div class="blank-card-section">
            <div class="blank-card-section-label">
              <i class="fas fa-calendar-alt"></i> Timeline
            </div>
            <div class="blank-card-timeline">
              <div class="blank-card-timeline-item">
                <i class="fas fa-check-circle"></i>
                <span>Created on ${formatDate(item.createdDate)}</span>
              </div>
              <div class="blank-card-timeline-item">
                <i class="fas fa-edit"></i>
                <span>Last updated on ${formatDate(item.updatedDate)}</span>
              </div>
            </div>
          </div>
          <div class="blank-card-section">
            <div class="blank-card-meta-grid">
              <div class="blank-card-meta-item"><strong>ID:</strong> ${item.id}</div>
              <div class="blank-card-meta-item"><strong>Category:</strong> ${categoryEscaped}</div>
              <div class="blank-card-meta-item"><strong>Status:</strong> ${statusEscaped}</div>
              <div class="blank-card-meta-item"><strong>Priority:</strong> ${item.priority}/5</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a compact card with minimal information
 */
function renderCompactCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown');
  const categoryEscaped = escapeHtml(item.category || '');

  const typeBarColors = {
    'Technology': '#00a3da',
    'Science': '#9c27b0',
    'Art': '#f44336',
    'Sports': '#4caf50',
    'Food': '#ff9800',
    'Travel': '#03a9f4',
    'Music': '#e91e63',
    'Nature': '#8bc34a'
  };
  const typeBarColor = typeBarColors[item.category] || '#00a3da';

  return `
    <div class="model-details-item blank-card item-card blank-card-compact" data-id="${item.id}" onclick="this.classList.toggle('flipped')">
      <div class="blank-card-front item-card-front">
        <div class="blank-card-header" style="flex-direction: row; align-items: center; gap: 1rem;">
          <div class="blank-card-image-card" style="width: 48px; height: 48px;">
            <i class="fas ${item.icon || 'fa-square'} blank-card-image-icon"></i>
          </div>
          <div style="flex: 1;">
            <h3 class="blank-card-title" style="font-size: 1rem; margin: 0;">${nameEscaped}</h3>
            <div class="blank-card-type-bar" style="background: ${typeBarColor}; margin-top: 0.5rem; padding: 0.25rem 0.5rem;">
              <span class="blank-card-type-bar-label" style="font-size: 0.75rem;">${categoryEscaped}</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.2rem; font-weight: bold; color: #4facfe;">${item.score || 0}</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">${item.id}</div>
          </div>
        </div>
      </div>
      <div class="blank-card-back item-card-back" id="blank-${item.id.replace(/[^a-zA-Z0-9]/g, '-')}-back">
        <div class="blank-card-back-header">
          <h3 class="blank-card-back-title" style="font-size: 1rem;">${nameEscaped}</h3>
        </div>
        <div class="blank-card-back-content">
          <div class="blank-card-meta-grid">
            <div class="blank-card-meta-item"><strong>ID:</strong> ${item.id}</div>
            <div class="blank-card-meta-item"><strong>Category:</strong> ${categoryEscaped}</div>
            <div class="blank-card-meta-item"><strong>Score:</strong> ${item.score || 0}</div>
            <div class="blank-card-meta-item"><strong>Priority:</strong> ${item.priority}/5</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a featured/premium card with special styling
 */
function renderFeaturedCard(item) {
  const nameEscaped = escapeHtml(item.name || 'Unknown');
  const descEscaped = escapeHtml(item.description || 'No description');
  const categoryEscaped = escapeHtml(item.category || '');
  const statusEscaped = escapeHtml(item.status || '');

  const typeBarColors = {
    'Technology': '#00a3da',
    'Science': '#9c27b0',
    'Art': '#f44336',
    'Sports': '#4caf50',
    'Food': '#ff9800',
    'Travel': '#03a9f4',
    'Music': '#e91e63',
    'Nature': '#8bc34a'
  };
  const typeBarColor = typeBarColors[item.category] || '#00a3da';

  const priorityStars = '★'.repeat(item.priority || 0) + '☆'.repeat(5 - (item.priority || 0));

  return `
    <div class="model-details-item blank-card item-card blank-card-featured" data-id="${item.id}" onclick="this.classList.toggle('flipped')">
      <div class="blank-card-front item-card-front">
        <div style="position: absolute; top: 0.5rem; right: 0.5rem; background: linear-gradient(135deg, #ffd700, #ffed4e); color: #000; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: bold; z-index: 10;">
          ⭐ PREMIUM
        </div>
        <div class="blank-card-header">
          <div class="blank-card-image-card" style="background: linear-gradient(135deg, #ffd700, #ffed4e);">
            <i class="fas ${item.icon || 'fa-crown'} blank-card-image-icon" style="color: #000;"></i>
          </div>
          <div class="blank-card-title-group">
            <div class="blank-card-name-row">
              <h3 class="blank-card-title item-name-big">${nameEscaped}</h3>
            </div>
            <div class="blank-card-type-bar" style="background: ${typeBarColor};">
              <i class="fas fa-tag"></i>
              <span class="blank-card-type-bar-label">${categoryEscaped}</span>
            </div>
            <div class="blank-card-slot-row">
              <span class="blank-card-slot-label">${statusEscaped}</span>
              <span class="blank-card-id">${item.id}</span>
            </div>
          </div>
        </div>
        
        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-star"></i> Premium Features
          </div>
          <div class="blank-card-detail-list">
            <div class="blank-card-detail-row">
              <strong>Priority:</strong> <span style="color: #ffd700;">${priorityStars}</span>
            </div>
            <div class="blank-card-detail-row">
              <strong>Score:</strong> <span style="color: #ffd700; font-weight: bold;">${item.score || 0}</span>
            </div>
          </div>
        </div>

        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-chart-bar"></i> Premium Stats
          </div>
          <div class="blank-card-stats-row">
            <span class="blank-card-stat-pill" style="background: rgba(255, 215, 0, 0.2); border-color: rgba(255, 215, 0, 0.4);">
              <i class="fas fa-eye"></i>
              <span class="blank-stat-label">Views:</span>
              <span class="blank-stat-value">${item.metadata.views}</span>
            </span>
            <span class="blank-card-stat-pill" style="background: rgba(255, 215, 0, 0.2); border-color: rgba(255, 215, 0, 0.4);">
              <i class="fas fa-heart"></i>
              <span class="blank-stat-label">Likes:</span>
              <span class="blank-stat-value">${item.metadata.likes}</span>
            </span>
            <span class="blank-card-stat-pill" style="background: rgba(255, 215, 0, 0.2); border-color: rgba(255, 215, 0, 0.4);">
              <i class="fas fa-crown"></i>
              <span class="blank-stat-label">Premium</span>
            </span>
          </div>
        </div>

        ${item.tags && item.tags.length > 0 ? `
        <div class="blank-card-section">
          <div class="blank-card-section-label">
            <i class="fas fa-tags"></i> Tags
          </div>
          <div class="blank-card-tag-list">
            ${item.tags.map(tag => `<span class="blank-card-tag item-tag" style="background: rgba(255, 215, 0, 0.2);">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <div class="blank-card-back item-card-back" id="blank-${item.id.replace(/[^a-zA-Z0-9]/g, '-')}-back">
        <div class="blank-card-back-header">
          <h3 class="blank-card-back-title">⭐ Premium Details</h3>
        </div>
        <div class="blank-card-back-content">
          <div class="blank-card-section">
            <div class="blank-card-section-label">
              <i class="fas fa-info-circle"></i> Premium Information
            </div>
            <p style="color: rgba(255,255,255,0.8); margin: 0.5rem 0;">${descEscaped}</p>
          </div>
          <div class="blank-card-section">
            <div class="blank-card-meta-grid">
              <div class="blank-card-meta-item"><strong>ID:</strong> ${item.id}</div>
              <div class="blank-card-meta-item"><strong>Category:</strong> ${categoryEscaped}</div>
              <div class="blank-card-meta-item"><strong>Status:</strong> ${statusEscaped}</div>
              <div class="blank-card-meta-item"><strong>Priority:</strong> ${item.priority}/5</div>
              <div class="blank-card-meta-item"><strong>Score:</strong> ${item.score || 0}</div>
              <div class="blank-card-meta-item"><strong>Author:</strong> ${item.metadata.author}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Gets color for category badge
 * @param {string} category - Category name
 * @returns {string} Color hex code
 */
function getCategoryColor(category) {
  const colors = {
    'Technology': 'rgba(79, 172, 254, 0.2)',
    'Science': 'rgba(156, 39, 176, 0.2)',
    'Art': 'rgba(244, 67, 54, 0.2)',
    'Sports': 'rgba(76, 175, 80, 0.2)',
    'Food': 'rgba(255, 152, 0, 0.2)',
    'Travel': 'rgba(3, 169, 244, 0.2)',
    'Music': 'rgba(233, 30, 99, 0.2)',
    'Nature': 'rgba(139, 195, 74, 0.2)'
  };
  return colors[category] || 'rgba(158, 158, 158, 0.2)';
}

/**
 * Formats date string to readable format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Renders pagination controls
 * @param {HTMLElement} container - Container element
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 */
function renderPagination(container, currentPage, totalPages) {
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const createButton = (label, pageNum, isActive = false, icon = null) => {
    const button = document.createElement('button');
    button.className = `pagination-button ${isActive ? 'active' : ''}`;
    button.textContent = icon ? '' : label;
    if (icon) {
      button.innerHTML = `<i class="fas fa-chevron-${icon}"></i>`;
    }
    button.title = `Page ${pageNum}`;
    button.onclick = () => handlePageChange(pageNum);
    return button;
  };

  const createEllipsis = (minPage, maxPage, totalPages) => {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'pagination-ellipsis';
    ellipsis.textContent = '...';
    ellipsis.title = `Click to jump to a page (${minPage}-${maxPage})`;
    ellipsis.style.cursor = 'pointer';
    ellipsis.onclick = () => {
      showPageJumpModal(minPage, maxPage, totalPages);
    };
    return ellipsis;
  };

  const paginationDiv = document.createElement('div');
  paginationDiv.className = 'pagination';

  // Previous button
  if (currentPage > 1) {
    paginationDiv.appendChild(createButton('Previous', currentPage - 1, false, 'left'));
  }

  // Page numbers
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    paginationDiv.appendChild(createButton('1', 1));
    if (startPage > 2) {
      const ellipsis = createEllipsis(2, startPage - 1, totalPages);
      paginationDiv.appendChild(ellipsis);
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    paginationDiv.appendChild(createButton(i.toString(), i, i === currentPage));
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const ellipsis = createEllipsis(endPage + 1, totalPages - 1, totalPages);
      paginationDiv.appendChild(ellipsis);
    }
    paginationDiv.appendChild(createButton(totalPages.toString(), totalPages));
  }

  // Next button
  if (currentPage < totalPages) {
    paginationDiv.appendChild(createButton('Next', currentPage + 1, false, 'right'));
  }

  container.innerHTML = '';
  container.appendChild(paginationDiv);
}

/**
 * Renders results info
 * @param {HTMLElement} container - Container element
 * @param {number} currentCount - Current items shown
 * @param {number} totalCount - Total items available
 */
function renderResultsInfo(container, currentCount, totalCount) {
  if (!container) return;
  
  let message = '';
  if (currentCount === totalCount) {
    message = `Showing ${currentCount} item${currentCount !== 1 ? 's' : ''}`;
  } else {
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(start + itemsPerPage - 1, totalCount);
    message = `Showing ${start}-${end} of ${totalCount} item${totalCount !== 1 ? 's' : ''}`;
  }
  
  container.textContent = message;
}

// ------------------- Event Handlers -------------------
/**
 * Handles page change
 * @param {number} page - Page number to navigate to
 */
function handlePageChange(page) {
  currentPage = page;
  render();
  // Scroll to top of content
  const contentDiv = document.getElementById('model-details-data');
  if (contentDiv) {
    contentDiv.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * Shows the page jump modal
 * @param {number} minPage - Minimum page number
 * @param {number} maxPage - Maximum page number
 * @param {number} totalPages - Total number of pages
 */
function showPageJumpModal(minPage, maxPage, totalPages) {
  // Remove existing modal if any
  const existingModal = document.getElementById('blank-page-jump-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const pageRange = minPage === maxPage ? `Page ${minPage}` : `Pages ${minPage}-${maxPage}`;
  
  const overlay = document.createElement('div');
  overlay.className = 'blank-page-jump-modal-overlay';
  overlay.id = 'blank-page-jump-modal';
  
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
      <label class="blank-page-jump-modal-label" for="page-jump-input">
        Enter a page number (${pageRange}):
      </label>
      <input 
        type="number" 
        id="page-jump-input" 
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
      <div class="blank-page-jump-modal-error" id="page-jump-error"></div>
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
  
  const input = modal.querySelector('#page-jump-input');
  const errorMsg = modal.querySelector('#page-jump-error');
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
    handlePageChange(pageNum);
  };
  
  const hidePageJumpModal = () => {
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.remove();
    }, 300);
  };
  
  // Event listeners
  submitBtn.onclick = validateAndSubmit;
  cancelBtn.onclick = hidePageJumpModal;
  closeBtn.onclick = hidePageJumpModal;
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      hidePageJumpModal();
    }
  };
  
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validateAndSubmit();
    } else if (e.key === 'Escape') {
      hidePageJumpModal();
    }
  };
  
  // Focus input
  input.select();
}

/**
 * Handles filter changes and re-renders
 */
function handleFilterChange() {
  currentPage = 1;
  render();
}

/**
 * Sets up filter event listeners
 */
function setupFilters() {
  const searchInput = document.getElementById('blank-search');
  const categoryFilter = document.getElementById('blank-category-filter');
  const statusFilter = document.getElementById('blank-status-filter');
  const sortSelect = document.getElementById('blank-sort');
  const itemsPerPageSelect = document.getElementById('blank-items-per-page');
  const clearBtn = document.getElementById('blank-clear-filters');

  // Search with debouncing
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filters.search = e.target.value;
        handleFilterChange();
      }, 300);
    });
  }

  // Category filter
  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      filters.category = e.target.value;
      handleFilterChange();
    });
  }

  // Status filter
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      filters.status = e.target.value;
      handleFilterChange();
    });
  }

  // Sort
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      filters.sortBy = e.target.value;
      handleFilterChange();
    });
  }

  // Items per page
  if (itemsPerPageSelect) {
    itemsPerPageSelect.addEventListener('change', (e) => {
      itemsPerPage = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
      currentPage = 1;
      render();
    });
  }

  // Clear filters
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filters = { search: '', category: 'all', status: 'all', sortBy: 'name-asc' };
      if (searchInput) searchInput.value = '';
      if (categoryFilter) categoryFilter.value = 'all';
      if (statusFilter) statusFilter.value = 'all';
      if (sortSelect) sortSelect.value = 'name-asc';
      if (itemsPerPageSelect) itemsPerPageSelect.value = '12';
      itemsPerPage = 12;
      currentPage = 1;
      render();
    });
  }
}

// ------------------- Main Render Function -------------------
/**
 * Main render function - updates all UI elements
 */
function render() {
  const contentDiv = document.getElementById('model-details-data');
  if (!contentDiv) return;

  const gridContainer = document.getElementById('blank-grid');
  const paginationContainer = document.getElementById('blank-pagination');
  const resultsInfo = document.querySelector('.blank-results-info');

  // Apply filters
  filteredData = applyFilters(blankData);

  // Paginate
  const effectiveItemsPerPage = itemsPerPage === 'all' 
    ? filteredData.length 
    : itemsPerPage;
  const totalPages = effectiveItemsPerPage === 0 
    ? 1 
    : Math.ceil(filteredData.length / effectiveItemsPerPage);
  const startIndex = (currentPage - 1) * effectiveItemsPerPage;
  const endIndex = startIndex + effectiveItemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  // Render
  if (gridContainer) {
    renderBlankGrid(paginatedData, gridContainer);
  }
  
  if (paginationContainer) {
    renderPagination(paginationContainer, currentPage, totalPages);
  }

  if (resultsInfo) {
    renderResultsInfo(resultsInfo, paginatedData.length, filteredData.length);
  }
}

// ------------------- Initialization -------------------
/**
 * Creates a separate search bar
 * @returns {Object} Search bar wrapper and input element
 */
function createSearchBar() {
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'blank-search-wrapper';
  
  const searchBar = document.createElement('div');
  searchBar.className = 'blank-search-bar';
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'blank-search';
  searchInput.className = 'blank-search-input';
  searchInput.placeholder = 'Search items by name or description...';
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.setAttribute('aria-label', 'Search items');
  
  const searchIcon = document.createElement('i');
  searchIcon.className = 'fas fa-search blank-search-icon';
  searchIcon.setAttribute('aria-hidden', 'true');
  
  searchBar.appendChild(searchIcon);
  searchBar.appendChild(searchInput);
  searchWrapper.appendChild(searchBar);
  
  return { wrapper: searchWrapper, input: searchInput };
}

/**
 * Creates a separate filter bar
 * @param {Array} data - Data for populating filter options
 * @returns {Object} Filter bar wrapper and elements
 */
function createFilterBar(data) {
  const categories = getUniqueCategories(data);
  const statuses = getUniqueStatuses(data);
  
  const filterWrapper = document.createElement('div');
  filterWrapper.className = 'blank-filter-wrapper';
  
  const filterBar = document.createElement('div');
  filterBar.className = 'blank-filter-bar';
  
  // Category Filter
  const categoryControl = document.createElement('div');
  categoryControl.className = 'blank-filter-control';
  const categoryLabel = document.createElement('label');
  categoryLabel.className = 'blank-filter-label';
  categoryLabel.innerHTML = '<i class="fas fa-tag"></i> Category';
  categoryLabel.setAttribute('for', 'blank-category-filter');
  const categorySelect = document.createElement('select');
  categorySelect.id = 'blank-category-filter';
  categorySelect.className = 'blank-filter-select';
  categorySelect.innerHTML = `
    <option value="all" selected>All Categories</option>
    ${categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('')}
  `;
  categoryControl.appendChild(categoryLabel);
  categoryControl.appendChild(categorySelect);
  filterBar.appendChild(categoryControl);
  
  // Status Filter
  const statusControl = document.createElement('div');
  statusControl.className = 'blank-filter-control';
  const statusLabel = document.createElement('label');
  statusLabel.className = 'blank-filter-label';
  statusLabel.innerHTML = '<i class="fas fa-flag"></i> Status';
  statusLabel.setAttribute('for', 'blank-status-filter');
  const statusSelect = document.createElement('select');
  statusSelect.id = 'blank-status-filter';
  statusSelect.className = 'blank-filter-select';
  statusSelect.innerHTML = `
    <option value="all" selected>All Statuses</option>
    ${statuses.map(status => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('')}
  `;
  statusControl.appendChild(statusLabel);
  statusControl.appendChild(statusSelect);
  filterBar.appendChild(statusControl);
  
  // Sort Filter
  const sortControl = document.createElement('div');
  sortControl.className = 'blank-filter-control';
  const sortLabel = document.createElement('label');
  sortLabel.className = 'blank-filter-label';
  sortLabel.innerHTML = '<i class="fas fa-sort"></i> Sort By';
  sortLabel.setAttribute('for', 'blank-sort');
  const sortSelect = document.createElement('select');
  sortSelect.id = 'blank-sort';
  sortSelect.className = 'blank-filter-select';
  sortSelect.innerHTML = `
    <option value="name-asc" selected>Name (A-Z)</option>
    <option value="name-desc">Name (Z-A)</option>
    <option value="category-asc">Category (A-Z)</option>
    <option value="status-asc">Status (A-Z)</option>
    <option value="score-desc">Score (High-Low)</option>
    <option value="priority-desc">Priority (High-Low)</option>
    <option value="date-desc">Date (Newest)</option>
    <option value="date-asc">Date (Oldest)</option>
  `;
  sortControl.appendChild(sortLabel);
  sortControl.appendChild(sortSelect);
  filterBar.appendChild(sortControl);
  
  // Items Per Page
  const itemsPerPageControl = document.createElement('div');
  itemsPerPageControl.className = 'blank-filter-control';
  const itemsPerPageLabel = document.createElement('label');
  itemsPerPageLabel.className = 'blank-filter-label';
  itemsPerPageLabel.innerHTML = '<i class="fas fa-list"></i> Per Page';
  itemsPerPageLabel.setAttribute('for', 'blank-items-per-page');
  const itemsPerPageSelect = document.createElement('select');
  itemsPerPageSelect.id = 'blank-items-per-page';
  itemsPerPageSelect.className = 'blank-filter-select';
  itemsPerPageSelect.innerHTML = `
    <option value="12" selected>12 per page</option>
    <option value="24">24 per page</option>
    <option value="36">36 per page</option>
    <option value="48">48 per page</option>
    <option value="all">All items</option>
  `;
  itemsPerPageControl.appendChild(itemsPerPageLabel);
  itemsPerPageControl.appendChild(itemsPerPageSelect);
  filterBar.appendChild(itemsPerPageControl);
  
  // Clear Filters Button
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.id = 'blank-clear-filters';
  clearButton.className = 'blank-clear-filters-btn';
  clearButton.innerHTML = '<i class="fas fa-times"></i> Clear Filters';
  filterBar.appendChild(clearButton);
  
  filterWrapper.appendChild(filterBar);
  
  return {
    wrapper: filterWrapper,
    elements: {
      category: categorySelect,
      status: statusSelect,
      sort: sortSelect,
      itemsPerPage: itemsPerPageSelect,
      clear: clearButton
    }
  };
}

/**
 * Initializes the blank page
 * @param {Array} data - Legacy data parameter (optional, will use dummy data if not provided)
 * @param {number} page - Starting page number
 * @param {HTMLElement} contentDiv - Content container element
 */
async function initializeBlankPage(data, page = 1, contentDiv) {
  const targetContent = contentDiv || document.getElementById('model-details-data');
  if (!targetContent) {
    console.error('❌ Content div not found');
    return;
  }

  // Show loading state
  targetContent.innerHTML = `
    <div class="blank-loading-overlay">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading blank template data...</p>
    </div>
  `;

  try {
    // Fetch data (use provided data or generate dummy data)
    if (data && Array.isArray(data) && data.length > 0) {
      blankData = data;
    } else {
      blankData = await fetchBlankData();
    }
    currentPage = page || 1;

    // Build structure
    targetContent.innerHTML = `
      <div class="blank-filters-wrapper"></div>
      <div class="blank-results-info"></div>
      <div class="blank-grid-container">
        <div id="blank-grid" class="blank-grid"></div>
      </div>
      <div id="blank-pagination" class="blank-pagination"></div>
    `;

    // Create and insert search bar and filter bar separately
    const filtersWrapper = targetContent.querySelector('.blank-filters-wrapper');
    const { wrapper: searchWrapper } = createSearchBar();
    const { wrapper: filterWrapper } = createFilterBar(blankData);
    filtersWrapper.appendChild(searchWrapper);
    filtersWrapper.appendChild(filterWrapper);

    // Show skeleton cards while data loads
    const gridContainer = document.getElementById('blank-grid');
    if (gridContainer) {
      renderSkeletonCards(gridContainer);
    }

    // Setup filters and render
    setupFilters();
    
    // Small delay to show skeleton briefly, then render
    setTimeout(() => {
      render();
    }, 100);

  } catch (error) {
    console.error('❌ Error initializing blank page:', error);
    targetContent.innerHTML = `
      <div class="blank-error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error loading blank template data</h3>
        <p>${error.message}</p>
        <button class="retry-button" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

// ------------------- Utility Functions -------------------
/**
 * Escapes HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ------------------- Exports -------------------
export {
  initializeBlankPage
};
