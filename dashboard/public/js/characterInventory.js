// ============================================================================
// characterInventory.js — Character Inventory Component
// Purpose: Displays detailed per-character inventory with all items and acquisition history
// ============================================================================

import { createSearchFilterBar } from './ui.js';

// ------------------- Global State -------------------
let characterName = null;
let characterData = null;
let inventoryData = null;
let historyData = null;
let currentFilters = {
  inventory: {
    search: '',
    category: 'all',
    type: 'all',
    owned: 'all' // all, owned, not-owned
  },
  history: {
    search: '',
    obtain: 'all',
    location: 'all',
    startDate: '',
    endDate: ''
  }
};

// ------------------- Navigation Setup -------------------
function setupNavigation() {
  const sidebar = document.querySelector('.sidebar');
  const sidebarToggle = document.querySelector('.sidebar-toggle');

  // Setup sidebar toggle
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    });
  }

  // Handle sidebar navigation links
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a:not(.nav-dropdown-toggle)');
  
  sidebarLinks.forEach(link => {
    const sectionId = link.getAttribute('data-section');
    const href = link.getAttribute('href');
    
    // Handle links with data-section (dashboard sections)
    if (sectionId) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Close sidebar on mobile
        if (window.innerWidth <= 768 && sidebar) {
          sidebar.classList.remove('active');
          document.body.style.overflow = '';
        }
        
        // Navigate to main page with hash
        if (sectionId === 'dashboard-section') {
          window.location.href = '/';
        } else {
          window.location.href = `/#${sectionId}`;
        }
      });
    }
    // Handle external links like /map, /inventories - let them work normally
    else if (href && (href.startsWith('/') || href.startsWith('http'))) {
      // Close sidebar on mobile when navigating
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('active')) {
          sidebar.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    }
  });

  // Handle dropdown toggles
  const dropdownToggles = document.querySelectorAll('.nav-dropdown-toggle');
  dropdownToggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const dropdown = toggle.closest('.nav-dropdown');
      if (dropdown) {
        const isActive = dropdown.classList.contains('active');
        
        // Close all dropdowns
        document.querySelectorAll('.nav-dropdown').forEach(item => {
          item.classList.remove('active');
          const itemToggle = item.querySelector('.nav-dropdown-toggle');
          if (itemToggle) {
            itemToggle.setAttribute('aria-expanded', 'false');
          }
        });
        
        // Toggle current dropdown
        if (!isActive) {
          dropdown.classList.add('active');
          toggle.setAttribute('aria-expanded', 'true');
        }
      }
    });
  });

  // Close sidebar when clicking outside (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('active')) {
      if (!sidebar.contains(e.target) && !sidebarToggle?.contains(e.target)) {
        sidebar.classList.remove('active');
        document.body.style.overflow = '';
      }
    }
  });

  // Close sidebar on window resize (when switching to desktop)
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && sidebar) {
      sidebar.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}

// ------------------- Initialization -------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Setup navigation first
  setupNavigation();

  // Get character name from URL params
  const urlParams = new URLSearchParams(window.location.search);
  characterName = urlParams.get('character') || decodeURIComponent(window.location.pathname.split('/').pop() || '');
  
  if (!characterName) {
    showError('Character name is required');
    return;
  }

  // Update breadcrumb
  const breadcrumb = document.getElementById('character-breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = characterName;
  }

  // Setup tabs
  setupTabs();

  // Load data
  await Promise.all([
    loadCharacterData(),
    loadInventoryData(),
    loadHistoryData()
  ]);

  // Render initial views
  renderInventoryView();
  renderHistoryView();
});

// ------------------- Tab Management -------------------
function setupTabs() {
  const tabs = document.querySelectorAll('.char-inv-tab-button');
  const contents = document.querySelectorAll('.char-inv-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      // Update active states
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const targetContent = document.getElementById(`content-${targetTab}`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// ------------------- Data Loading -------------------
async function loadCharacterData() {
  try {
    const response = await fetch(`/api/inventory/character/${encodeURIComponent(characterName)}/detailed`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    characterData = data;

    // Update header
    updateCharacterHeader(data);
  } catch (error) {
    console.error('Error loading character data:', error);
    showError('Failed to load character data');
  }
}

async function loadInventoryData() {
  try {
    const response = await fetch(`/api/inventory/character/${encodeURIComponent(characterName)}/detailed`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    inventoryData = data.inventory || [];
    
    // Hide loading state
    const loading = document.getElementById('inventory-loading');
    if (loading) loading.style.display = 'none';
  } catch (error) {
    console.error('Error loading inventory data:', error);
    showError('Failed to load inventory data');
  }
}

async function loadHistoryData() {
  try {
    const response = await fetch(`/api/inventory/character/${encodeURIComponent(characterName)}/logs`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    historyData = data.logs || [];
    
    // Hide loading state
    const loading = document.getElementById('history-loading');
    if (loading) loading.style.display = 'none';
  } catch (error) {
    console.error('Error loading history data:', error);
    // Don't show error if logs endpoint doesn't exist, just continue
  }
}

// ------------------- Header Update -------------------
function updateCharacterHeader(data) {
  const iconEl = document.getElementById('character-icon');
  const nameEl = document.getElementById('character-name');
  const uniqueItemsEl = document.getElementById('stat-unique-items');
  const totalItemsEl = document.getElementById('stat-total-items');

  if (iconEl && data.icon) {
    iconEl.src = data.icon.startsWith('http') ? data.icon : `/api/images/${data.icon.replace('https://storage.googleapis.com/tinglebot/', '')}`;
  }
  if (nameEl) nameEl.textContent = data.characterName || characterName;
  if (uniqueItemsEl) uniqueItemsEl.textContent = data.uniqueItems || 0;
  if (totalItemsEl) totalItemsEl.textContent = data.totalItems || 0;
}

// ------------------- Inventory View -------------------
function renderInventoryView() {
  if (!inventoryData) return;

  const container = document.getElementById('inventory-grid-container');
  if (!container) return;

  // Debug: Log sample items to see category structure
  if (inventoryData.length > 0) {
    console.log('Sample inventory items:', inventoryData.slice(0, 5).map(item => ({
      name: item.itemName,
      category: item.category,
      type: item.type,
      subtype: item.subtype,
      categoryGear: item.categoryGear
    })));
  }

  // Get unique categories and types for filters
  const extractedCategories = [...new Set(inventoryData.flatMap(item => {
    if (Array.isArray(item.category)) return item.category;
    if (typeof item.category === 'string' && item.category.includes(',')) {
      return item.category.split(',').map(s => s.trim());
    }
    return [item.category || 'Unknown'];
  }))].filter(Boolean);

  // Required categories that should always be available
  const requiredCategories = [
    'Weapon',
    'Armor',
    'Ancient Parts',
    'Creature',
    'Fish',
    'Fruit',
    'Meat',
    'Monster',
    'Mushroom',
    'Natural',
    'Ore',
    'Plant',
    'Special',
    'Recipe'
  ];

  // Merge extracted categories with required categories and sort
  const categories = [...new Set([...requiredCategories, ...extractedCategories])].sort();

  const types = [...new Set(inventoryData.flatMap(item => {
    if (Array.isArray(item.type)) return item.type;
    if (typeof item.type === 'string' && item.type.includes(',')) {
      return item.type.split(',').map(s => s.trim());
    }
    return [item.type || 'Unknown'];
  }))].filter(Boolean).sort();

  // Setup filters
  setupInventoryFilters(categories, types);

  // Filter and render items
  const filteredItems = filterInventoryItems(inventoryData);

  // Group by category
  const itemsByCategory = groupItemsByCategory(filteredItems);

  // Render grid
  container.innerHTML = renderInventoryGrid(itemsByCategory);
  
  // Setup lazy loading for images after render
  setupLazyImageLoading();
  
  // Setup collapsible sections
  setupCollapsibleSections();
  
  // Setup item click handlers
  setupItemClickHandlers();
}

function setupInventoryFilters(categories, types) {
  const filtersContainer = document.getElementById('inventory-filters');
  if (!filtersContainer) return;

  const { bar: filterBar } = createSearchFilterBar({
    layout: 'compact',
    filters: [
      {
        type: 'input',
        id: 'inventory-search',
        placeholder: 'Search items...',
        attributes: { autocomplete: 'off' },
        width: 'double'
      },
      {
        type: 'select',
        id: 'inventory-category',
        options: [
          { value: 'all', label: 'All Categories', selected: true },
          ...categories.map(cat => ({ value: cat, label: cat }))
        ]
      },
      {
        type: 'select',
        id: 'inventory-type',
        options: [
          { value: 'all', label: 'All Types', selected: true },
          ...types.map(type => ({ value: type, label: type }))
        ]
      },
      {
        type: 'select',
        id: 'inventory-owned',
        options: [
          { value: 'all', label: 'All Items', selected: true },
          { value: 'owned', label: 'Owned Only' },
          { value: 'not-owned', label: 'Not Owned Only' }
        ]
      }
    ],
    buttons: [
      {
        id: 'inventory-clear-filters',
        label: 'Clear Filters',
        className: 'clear-filters-btn'
      }
    ]
  });

  // Store current filter values before replacing the container
  const currentSearchValue = currentFilters.inventory.search || '';
  const currentCategoryValue = currentFilters.inventory.category || 'all';
  const currentTypeValue = currentFilters.inventory.type || 'all';
  const currentOwnedValue = currentFilters.inventory.owned || 'all';

  filtersContainer.innerHTML = '';
  filtersContainer.appendChild(filterBar);

  // Attach event listeners and restore values
  const searchInput = document.getElementById('inventory-search');
  const categorySelect = document.getElementById('inventory-category');
  const typeSelect = document.getElementById('inventory-type');
  const ownedSelect = document.getElementById('inventory-owned');
  const clearBtn = document.getElementById('inventory-clear-filters');

  if (searchInput) {
    // Restore search value
    searchInput.value = currentSearchValue;
    searchInput.addEventListener('input', (e) => {
      const cursorPosition = e.target.selectionStart;
      currentFilters.inventory.search = e.target.value;
      renderInventoryView();
      // Restore focus and cursor position after DOM updates
      setTimeout(() => {
        const restoredInput = document.getElementById('inventory-search');
        if (restoredInput) {
          restoredInput.focus();
          // Only restore cursor position if it's within the new value length
          const newLength = restoredInput.value.length;
          const safePosition = Math.min(cursorPosition, newLength);
          restoredInput.setSelectionRange(safePosition, safePosition);
        }
      }, 0);
    });
  }
  if (categorySelect) {
    // Restore category value
    categorySelect.value = currentCategoryValue;
    categorySelect.addEventListener('change', (e) => {
      currentFilters.inventory.category = e.target.value;
      renderInventoryView();
    });
  }
  if (typeSelect) {
    // Restore type value
    typeSelect.value = currentTypeValue;
    typeSelect.addEventListener('change', (e) => {
      currentFilters.inventory.type = e.target.value;
      renderInventoryView();
    });
  }
  if (ownedSelect) {
    // Restore owned value
    ownedSelect.value = currentOwnedValue;
    ownedSelect.addEventListener('change', (e) => {
      currentFilters.inventory.owned = e.target.value;
      renderInventoryView();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      currentFilters.inventory = { search: '', category: 'all', type: 'all', owned: 'all' };
      if (searchInput) searchInput.value = '';
      if (categorySelect) categorySelect.value = 'all';
      if (typeSelect) typeSelect.value = 'all';
      if (ownedSelect) ownedSelect.value = 'all';
      renderInventoryView();
    });
  }
}

function filterInventoryItems(items) {
  const filters = currentFilters.inventory;

  return items.filter(item => {
    // Search filter
    if (filters.search && !item.itemName.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }

    // Category filter
    if (filters.category !== 'all') {
      const itemCategories = Array.isArray(item.category) 
        ? item.category 
        : (typeof item.category === 'string' && item.category.includes(','))
          ? item.category.split(',').map(s => s.trim())
          : [item.category || 'Unknown'];
      if (!itemCategories.includes(filters.category)) {
        return false;
      }
    }

    // Type filter
    if (filters.type !== 'all') {
      const itemTypes = Array.isArray(item.type)
        ? item.type
        : (typeof item.type === 'string' && item.type.includes(','))
          ? item.type.split(',').map(s => s.trim())
          : [item.type || 'Unknown'];
      if (!itemTypes.includes(filters.type)) {
        return false;
      }
    }

    // Owned filter
    if (filters.owned === 'owned' && !item.owned) {
      return false;
    }
    if (filters.owned === 'not-owned' && item.owned) {
      return false;
    }

    return true;
  });
}

function groupItemsByCategory(items) {
  const grouped = {};

  items.forEach(item => {
    // Get categories from multiple possible sources
    let categories = [];
    
    // First, try item.category (can be array or string)
    if (Array.isArray(item.category) && item.category.length > 0) {
      categories = item.category.filter(Boolean);
    } else if (typeof item.category === 'string' && item.category.trim()) {
      if (item.category.includes(',')) {
        categories = item.category.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        categories = [item.category.trim()];
      }
    }
    
    // If still no categories, try categoryGear (for weapons/armor)
    if (categories.length === 0 && item.categoryGear) {
      if (typeof item.categoryGear === 'string' && item.categoryGear.trim()) {
        categories = [item.categoryGear.trim()];
      }
    }
    
    // If still no categories, try category from type or subtype
    if (categories.length === 0) {
      // Check if type or subtype contains category-like information
      const typeArray = Array.isArray(item.type) ? item.type : (item.type ? [item.type] : []);
      const subtypeArray = Array.isArray(item.subtype) ? item.subtype : (item.subtype ? [item.subtype] : []);
      const allTypeValues = [...typeArray, ...subtypeArray].map(v => String(v).toLowerCase()).join(' ');
      
      // Map common types/subtypes to categories (check multiple keywords per category)
      // Note: 'material' keyword removed - items should go to specific categories instead
      const typeCategoryMap = [
        { keywords: ['weapon', 'sword', 'bow', 'arrow'], category: 'Weapon' },
        { keywords: ['armor', 'helmet', 'shield', 'attire'], category: 'Armor' },
        { keywords: ['food', 'cooking', 'meal'], category: 'Food' },
        { keywords: ['creature', 'critter', 'animal'], category: 'Creature' },
        { keywords: ['fish'], category: 'Fish' },
        { keywords: ['ore', 'mineral'], category: 'Ore' },
        { keywords: ['plant', 'herb', 'vegetable'], category: 'Plant' },
        { keywords: ['mushroom', 'fungi'], category: 'Mushroom' },
        { keywords: ['fruit', 'apple'], category: 'Fruit' },
        { keywords: ['meat'], category: 'Meat' },
        { keywords: ['monster', 'part'], category: 'Monster' },
        { keywords: ['natural', 'nature', 'ingredient'], category: 'Natural' },
        { keywords: ['recipe', 'cooking'], category: 'Recipe' },
        { keywords: ['ancient'], category: 'Ancient Parts' },
        { keywords: ['special'], category: 'Special' }
      ];
      
      for (const { keywords, category } of typeCategoryMap) {
        if (keywords.some(keyword => allTypeValues.includes(keyword))) {
          categories = [category];
          break;
        }
      }
    }
    
    // If categories contain 'Material', try to replace it with a more specific category
    if (categories.includes('Material')) {
      // Check type/subtype to determine more specific category
      const typeArray = Array.isArray(item.type) ? item.type : (item.type ? [item.type] : []);
      const subtypeArray = Array.isArray(item.subtype) ? item.subtype : (item.subtype ? [item.subtype] : []);
      const allTypeValues = [...typeArray, ...subtypeArray].map(v => String(v).toLowerCase()).join(' ');
      
      // Try to find a more specific category
      const materialCategoryMap = [
        { keywords: ['ancient'], category: 'Ancient Parts' },
        { keywords: ['special'], category: 'Special' },
        { keywords: ['fruit', 'apple'], category: 'Fruit' },
        { keywords: ['meat'], category: 'Meat' },
        { keywords: ['fish'], category: 'Fish' },
        { keywords: ['mushroom', 'fungi'], category: 'Mushroom' },
        { keywords: ['ore', 'mineral'], category: 'Ore' },
        { keywords: ['monster', 'part'], category: 'Monster' },
        { keywords: ['plant', 'herb', 'vegetable'], category: 'Plant' },
        { keywords: ['natural', 'nature', 'ingredient'], category: 'Natural' },
        { keywords: ['creature', 'critter', 'animal'], category: 'Creature' }
      ];
      
      let replaced = false;
      for (const { keywords, category } of materialCategoryMap) {
        if (keywords.some(keyword => allTypeValues.includes(keyword))) {
          categories = categories.filter(c => c !== 'Material');
          categories.push(category);
          replaced = true;
          break;
        }
      }
      
      // If still Material and couldn't determine specific category, use Natural as default
      if (!replaced && categories.includes('Material')) {
        categories = categories.filter(c => c !== 'Material');
        categories.push('Natural');
      }
    }

    // If still no categories, assign to Unknown
    if (categories.length === 0) {
      categories = ['Unknown'];
    }

    categories.forEach(cat => {
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(item);
    });
  });

  // Sort items within each category by name
  Object.keys(grouped).forEach(cat => {
    grouped[cat].sort((a, b) => a.itemName.localeCompare(b.itemName));
  });

  return grouped;
}

function renderInventoryGrid(itemsByCategory) {
  // Define the specific category order (Material removed - items should be in specific categories)
  const categoryOrder = [
    'Weapon',
    'Armor',
    'Ancient Parts',
    'Creature',
    'Fish',
    'Fruit',
    'Meat',
    'Monster',
    'Mushroom',
    'Natural',
    'Ore',
    'Plant',
    'Special',
    'Recipe',
    'Food',
    'Arrow',
    'Unknown'
  ];

  // Required categories that should always appear in navigation
  const requiredCategories = [
    'Weapon',
    'Armor',
    'Ancient Parts',
    'Creature',
    'Fish',
    'Fruit',
    'Meat',
    'Monster',
    'Mushroom',
    'Natural',
    'Ore',
    'Plant',
    'Special',
    'Recipe'
  ];

  // Get categories with items in the specified order, then add any missing categories
  const orderedCategories = categoryOrder.filter(cat => itemsByCategory[cat] && itemsByCategory[cat].length > 0);
  const remainingCategories = Object.keys(itemsByCategory)
    .filter(cat => !categoryOrder.includes(cat))
    .sort();
  const categoriesWithItems = [...orderedCategories, ...remainingCategories];
  
  // For navigation: always include all required categories
  const navCategories = [...new Set([...requiredCategories, ...categoriesWithItems])].filter(cat => {
    // Keep required categories and any other categories that have items
    return requiredCategories.includes(cat) || categoriesWithItems.includes(cat);
  }).sort((a, b) => {
    // Sort by required category order first, then alphabetically
    const aIndex = requiredCategories.indexOf(a);
    const bIndex = requiredCategories.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
  
  if (categoriesWithItems.length === 0 && navCategories.length === 0) {
    return '<div class="char-inv-empty-state"><p>No items match the current filters.</p></div>';
  }

  // Get category icon based on category name
  const getCategoryIcon = (category) => {
    const iconMap = {
      'Ore': 'https://storage.googleapis.com/tinglebot/Graphics/ore_white.png',
      'Mushroom': 'https://storage.googleapis.com/tinglebot/Graphics/fungi_white.png',
      'Natural': 'https://storage.googleapis.com/tinglebot/Graphics/ingredients_white.png',
      'Meat': 'https://storage.googleapis.com/tinglebot/Graphics/meat_white.png',
      'Monster': 'https://storage.googleapis.com/tinglebot/Graphics/monster_part_white.png',
      'Fruit': 'https://storage.googleapis.com/tinglebot/Graphics/apple_white.png',
      'Fish': 'https://storage.googleapis.com/tinglebot/Graphics/fish_white.png',
      'Creature': 'https://storage.googleapis.com/tinglebot/Graphics/critter_white.png',
      'Ancient Parts': 'https://storage.googleapis.com/tinglebot/Graphics/ancient_part_white.png',
      'Armor': 'https://storage.googleapis.com/tinglebot/Graphics/attire_white.png',
      'Weapon': 'https://storage.googleapis.com/tinglebot/Graphics/weapon_white.png',
      'Special': 'https://storage.googleapis.com/tinglebot/Graphics/special_white.png',
      'Plant': 'https://storage.googleapis.com/tinglebot/Graphics/plant_white.png',
      'Recipe': 'https://storage.googleapis.com/tinglebot/Graphics/cooking_white.png',
      'Material': 'fa-cube',
      'Food': 'fa-utensils',
      'Arrow': 'fa-arrow-right'
    };
    
    for (const [key, icon] of Object.entries(iconMap)) {
      if (category.toLowerCase().includes(key.toLowerCase())) {
        return icon;
      }
    }
    return 'fa-box';
  };

  // Render category navigation - always show all required categories
  const categoryNav = `
    <div class="char-inv-category-nav">
      <div class="char-inv-category-nav-title">Jump to Category</div>
      <div class="char-inv-category-nav-links">
        ${navCategories.map(category => {
          const categorySlug = category.toLowerCase().replace(/\s+/g, '-');
          const href = `#category-${categorySlug}`;
          return `<a href="${href}" class="char-inv-category-nav-link" data-category="${categorySlug}">${category}</a>`;
        }).join('')}
      </div>
    </div>
  `;

  // Render categories - show all required categories (even if empty)
  const categorySections = navCategories.map(category => {
    const items = itemsByCategory[category] || [];
    const categoryIcon = getCategoryIcon(category);
    const itemCount = items.length;
    const ownedCount = items.filter(item => item.owned).length;
    const categorySlug = category.toLowerCase().replace(/\s+/g, '-');
    const isImageIcon = categoryIcon.startsWith('https://');
    const iconHtml = isImageIcon 
      ? `<img src="${categoryIcon}" alt="${category}" class="char-inv-category-icon-image" />`
      : `<i class="fas ${categoryIcon}"></i>`;
    
    return `
      <div class="char-inv-category-section collapsed" id="category-${categorySlug}" data-category="${category}">
        <div class="char-inv-category-header">
          <i class="fas fa-chevron-down char-inv-category-toggle"></i>
          ${iconHtml}
          <h3 class="char-inv-category-title">${category}</h3>
          <span class="char-inv-category-count">${ownedCount} / ${itemCount}</span>
        </div>
        <div class="char-inv-category-items-container">
          <div class="char-inv-items-grid">
            ${items.map(item => renderInventoryItemCard(item)).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return categoryNav + categorySections;
}

function renderInventoryItemCard(item) {
  const imageUrl = formatItemImageUrl(item.image || item.emoji);
  const quantityDisplay = item.owned ? `Qty: ${item.quantity}` : 'Not Owned';
  const itemClass = item.owned ? 'owned' : 'not-owned';
  const qtyClass = item.owned ? 'has-quantity' : 'no-quantity';
  const itemNameEscaped = item.itemName.replace(/"/g, '&quot;');

  return `
    <div class="char-inv-item-card ${itemClass}" data-item="${itemNameEscaped}" title="${itemNameEscaped}">
      <div class="char-inv-item-info">
        <div class="char-inv-item-icon loading">
          <img 
            data-src="${imageUrl}" 
            alt="${itemNameEscaped}" 
            loading="lazy"
            onerror="this.onerror=null; this.src='/images/ankleicon.png'; this.classList.add('loaded'); this.parentElement.classList.remove('loading');" />
        </div>
        <div class="char-inv-item-details">
          <h3 class="char-inv-item-name">${item.itemName}</h3>
          <p class="char-inv-item-quantity ${qtyClass}">${quantityDisplay}</p>
        </div>
      </div>
    </div>
  `;
}

function formatItemImageUrl(image) {
  if (!image || image === 'No Image') return '/images/ankleicon.png';
  
  if (image.startsWith('https://storage.googleapis.com/tinglebot/')) {
    const path = image.replace('https://storage.googleapis.com/tinglebot/', '');
    return `/api/images/${path}`;
  }
  
  return image;
}

// ------------------- Collapsible Sections -------------------
function setupCollapsibleSections() {
  const categoryHeaders = document.querySelectorAll('.char-inv-category-header');
  
  categoryHeaders.forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't collapse if clicking on count or icon
      if (e.target.classList.contains('char-inv-category-count') || e.target.classList.contains('fa-chevron-down')) {
        return;
      }
      
      const section = header.closest('.char-inv-category-section');
      if (section) {
        section.classList.toggle('collapsed');
      }
    });
  });

  // Setup category navigation links
  const navLinks = document.querySelectorAll('.char-inv-category-nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const categorySlug = link.getAttribute('data-category');
      const targetSection = document.getElementById(`category-${categorySlug}`);
      
      if (targetSection) {
        // Expand section if collapsed
        targetSection.classList.remove('collapsed');
        
        // Smooth scroll to section
        targetSection.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    });
  });
}

// ------------------- Item Click Handlers -------------------
function setupItemClickHandlers() {
  const itemCards = document.querySelectorAll('.char-inv-item-card');
  
  itemCards.forEach(card => {
    card.addEventListener('click', async (e) => {
      // Get item name from data attribute and decode any HTML entities
      const itemNameAttr = card.getAttribute('data-item');
      if (itemNameAttr) {
        // Decode HTML entities (like &quot; -> ")
        const itemName = itemNameAttr.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        await showItemLog(itemName);
      }
    });
  });
}

async function showItemLog(itemName) {
  // Create or get modal
  let modal = document.getElementById('item-log-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'item-log-modal';
    modal.className = 'char-inv-log-modal';
    document.body.appendChild(modal);
  }

  // Show loading state
  modal.innerHTML = `
    <div class="char-inv-log-modal-content">
      <div style="text-align: center; padding: 3rem;">
        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--character-inventory-accent); margin-bottom: 1rem;"></i>
        <p>Loading inventory log...</p>
      </div>
    </div>
  `;
  modal.classList.add('active');

  try {
    // Fetch item log data
    const url = `/api/inventory/character/${encodeURIComponent(characterName)}/logs?item=${encodeURIComponent(itemName)}`;
    console.log('[Item Log] Fetching logs for item:', itemName, 'URL:', url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    const logs = data.logs || [];

    // Find item details from inventory data
    const item = inventoryData?.find(i => i.itemName === itemName);
    const imageUrl = item ? formatItemImageUrl(item.image || item.emoji) : '/images/ankleicon.png';

    // Render modal content
    modal.innerHTML = `
      <div class="char-inv-log-modal-content">
        <div class="char-inv-log-header">
          <div class="char-inv-item-icon">
            <img src="${imageUrl}" alt="${itemName}" onerror="this.src='/images/ankleicon.png'; this.style.opacity='1';" style="opacity: 1;" />
          </div>
          <div class="char-inv-log-header-info">
            <h2>${itemName}</h2>
          </div>
          <button class="char-inv-log-close" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="char-inv-log-body">
          ${logs.length === 0 
            ? '<p style="text-align: center; padding: 2rem; color: var(--character-inventory-text-muted);">No inventory log entries found for this item.</p>'
            : `
              <table class="char-inv-log-table">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Quantity</th>
                    <th>Action</th>
                    <th>Method</th>
                    <th>Location</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  ${logs.map(log => renderLogRow(log)).join('')}
                </tbody>
              </table>
            `
          }
        </div>
      </div>
    `;

    // Setup close button
    const closeBtn = modal.querySelector('.char-inv-log-close');
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        modal.classList.remove('active');
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

  } catch (error) {
    console.error('Error loading item log:', error);
    modal.innerHTML = `
      <div class="char-inv-log-modal-content">
        <div class="char-inv-log-header">
          <h2>Error</h2>
          <button class="char-inv-log-close" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="char-inv-log-body">
          <p style="text-align: center; padding: 2rem; color: var(--error-color, #ff6b6b);">
            Failed to load inventory log: ${error.message}
          </p>
        </div>
      </div>
    `;
    
    const closeBtn = modal.querySelector('.char-inv-log-close');
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }
}

function renderLogRow(log) {
  const dateTime = new Date(log.dateTime);
  const formattedDate = dateTime.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const quantity = parseInt(log.quantity) || 0;
  const quantityClass = quantity > 0 ? 'char-inv-log-positive' : 'char-inv-log-negative';
  const quantityDisplay = quantity > 0 ? `+${quantity}` : `${quantity}`;
  const actionDisplay = quantity > 0 ? 'Obtained' : 'Removed';

  const linkHtml = log.link 
    ? `<a href="${log.link}" target="_blank" rel="noopener noreferrer" class="char-inv-history-link"><i class="fas fa-external-link-alt"></i></a>`
    : '-';

  return `
    <tr>
      <td>${formattedDate}</td>
      <td class="${quantityClass}">${quantityDisplay}</td>
      <td>${actionDisplay}</td>
      <td>${log.obtain || '-'}</td>
      <td>${log.location || '-'}</td>
      <td style="text-align: center;">${linkHtml}</td>
    </tr>
  `;
}

// ------------------- Lazy Image Loading -------------------
function setupLazyImageLoading() {
  const images = document.querySelectorAll('.char-inv-item-icon img[data-src]');
  
  if (!('IntersectionObserver' in window)) {
    // Fallback for browsers without IntersectionObserver
    images.forEach(img => {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.classList.add('loaded');
        img.parentElement.classList.remove('loading');
      }
    });
    return;
  }

  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const iconContainer = img.parentElement;
        
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          
          img.onload = () => {
            img.classList.add('loaded');
            iconContainer.classList.remove('loading');
          };
          
          img.onerror = () => {
            img.src = '/images/ankleicon.png';
            img.classList.add('loaded');
            iconContainer.classList.remove('loading');
          };
        }
        
        observer.unobserve(img);
      }
    });
  }, {
    rootMargin: '50px' // Start loading images 50px before they come into view
  });

  images.forEach(img => {
    imageObserver.observe(img);
  });
}

// ------------------- History View -------------------
function renderHistoryView() {
  if (!historyData) return;

  const container = document.getElementById('history-table-container');
  if (!container) return;

  // Setup filters
  setupHistoryFilters();

  // Filter and render logs
  const filteredLogs = filterHistoryLogs(historyData);
  
  // Render table
  container.innerHTML = renderHistoryTable(filteredLogs);
}

function setupHistoryFilters() {
  const filtersContainer = document.getElementById('history-filters');
  if (!filtersContainer) return;

  // Get unique values for filters
  const obtainMethods = [...new Set(historyData.map(log => log.obtain).filter(Boolean))].sort();
  const locations = [...new Set(historyData.map(log => log.location).filter(Boolean))].sort();

  const { bar: filterBar } = createSearchFilterBar({
    layout: 'compact',
    filters: [
      {
        type: 'input',
        id: 'history-search',
        placeholder: 'Search items...',
        attributes: { autocomplete: 'off' },
        width: 'double'
      },
      {
        type: 'select',
        id: 'history-obtain',
        options: [
          { value: 'all', label: 'All Methods', selected: true },
          ...obtainMethods.map(method => ({ value: method, label: method }))
        ]
      },
      {
        type: 'select',
        id: 'history-location',
        options: [
          { value: 'all', label: 'All Locations', selected: true },
          ...locations.map(loc => ({ value: loc, label: loc }))
        ]
      },
      {
        type: 'input',
        id: 'history-start-date',
        placeholder: 'Start Date (YYYY-MM-DD)',
        attributes: { type: 'date' }
      },
      {
        type: 'input',
        id: 'history-end-date',
        placeholder: 'End Date (YYYY-MM-DD)',
        attributes: { type: 'date' }
      }
    ],
    buttons: [
      {
        id: 'history-clear-filters',
        label: 'Clear Filters',
        className: 'clear-filters-btn'
      }
    ]
  });

  filtersContainer.innerHTML = '';
  filtersContainer.appendChild(filterBar);

  // Attach event listeners
  const searchInput = document.getElementById('history-search');
  const obtainSelect = document.getElementById('history-obtain');
  const locationSelect = document.getElementById('history-location');
  const startDateInput = document.getElementById('history-start-date');
  const endDateInput = document.getElementById('history-end-date');
  const clearBtn = document.getElementById('history-clear-filters');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilters.history.search = e.target.value;
      renderHistoryView();
    });
  }
  if (obtainSelect) {
    obtainSelect.addEventListener('change', (e) => {
      currentFilters.history.obtain = e.target.value;
      renderHistoryView();
    });
  }
  if (locationSelect) {
    locationSelect.addEventListener('change', (e) => {
      currentFilters.history.location = e.target.value;
      renderHistoryView();
    });
  }
  if (startDateInput) {
    startDateInput.addEventListener('change', (e) => {
      currentFilters.history.startDate = e.target.value;
      renderHistoryView();
    });
  }
  if (endDateInput) {
    endDateInput.addEventListener('change', (e) => {
      currentFilters.history.endDate = e.target.value;
      renderHistoryView();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      currentFilters.history = { search: '', obtain: 'all', location: 'all', startDate: '', endDate: '' };
      if (searchInput) searchInput.value = '';
      if (obtainSelect) obtainSelect.value = 'all';
      if (locationSelect) locationSelect.value = 'all';
      if (startDateInput) startDateInput.value = '';
      if (endDateInput) endDateInput.value = '';
      renderHistoryView();
    });
  }
}

function filterHistoryLogs(logs) {
  const filters = currentFilters.history;

  return logs.filter(log => {
    // Search filter
    if (filters.search && !log.itemName.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }

    // Obtain method filter
    if (filters.obtain !== 'all' && log.obtain !== filters.obtain) {
      return false;
    }

    // Location filter
    if (filters.location !== 'all' && log.location !== filters.location) {
      return false;
    }

    // Date range filter
    if (filters.startDate || filters.endDate) {
      const logDate = new Date(log.dateTime);
      if (filters.startDate && logDate < new Date(filters.startDate)) {
        return false;
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999); // Include full end date
        if (logDate > endDate) {
          return false;
        }
      }
    }

    return true;
  });
}

function renderHistoryTable(logs) {
  if (logs.length === 0) {
    return '<div class="char-inv-empty-state"><p>No acquisition history matches the current filters.</p></div>';
  }

  return `
    <div class="char-inv-history-table-wrapper">
      <table class="char-inv-history-table">
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Quantity</th>
            <th>Category</th>
            <th>Type</th>
            <th>Obtained</th>
            <th>Location</th>
            <th>Date/Time</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(log => renderHistoryRow(log)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderHistoryRow(log) {
  const dateTime = new Date(log.dateTime);
  const formattedDate = dateTime.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const linkHtml = log.link 
    ? `<a href="${log.link}" target="_blank" rel="noopener noreferrer" class="char-inv-history-link"><i class="fas fa-external-link-alt"></i></a>`
    : '-';

  return `
    <tr>
      <td>${log.itemName}</td>
      <td>${log.quantity}</td>
      <td>${log.category || '-'}</td>
      <td>${log.type || '-'}</td>
      <td>${log.obtain || '-'}</td>
      <td>${log.location || '-'}</td>
      <td>${formattedDate}</td>
      <td class="char-inv-link-cell">${linkHtml}</td>
    </tr>
  `;
}

// ------------------- Error Handling -------------------
function showError(message) {
  const container = document.querySelector('.char-inv-main');
  if (container) {
    container.innerHTML = `
      <div class="char-inv-error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h2>Error</h2>
        <p>${message}</p>
      </div>
    `;
  }
}
