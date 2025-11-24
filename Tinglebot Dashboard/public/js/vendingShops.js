/* ====================================================================== */
/* Vending Shops Rendering Module                                        */
/* Handles display of all vendor vending inventories                     */
/* ====================================================================== */

import { scrollToTop } from './ui.js';
import { createSearchFilterBar } from './ui.js';

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

// ------------------- Function: formatShopImageUrl -------------------
// Formats and returns shop image URL
function formatShopImageUrl(shopImage) {
  if (!shopImage) return null;
  
  // Check for Google Cloud Storage URL first
  if (shopImage.includes('storage.googleapis.com/tinglebot/')) {
    const filename = shopImage.split('/').pop();
    return `/api/images/${filename}`;
  }
  
  // If it's another HTTP URL, return as is
  if (shopImage.startsWith('http')) {
    return shopImage;
  }
  
  // For local filenames/relative paths, serve from static images folder
  return `/images/${shopImage}`;
}

// ============================================================================
// ------------------- Rendering: Vending Shops Display -------------------
// Displays all vendor vending inventories
// ============================================================================

// ------------------- Function: initializeVendingShopsPage -------------------
// Initializes the vending shops page with data
async function initializeVendingShopsPage(data, page, contentDiv) {
  try {
    // Clear the content div first
    if (contentDiv) {
      contentDiv.innerHTML = '';
    }

    // Check if we have data
    if (!data || data.length === 0) {
      contentDiv.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>No vending shops data available</p>
          <p class="error-state-subtitle">
            No vendors have set up their shops yet
          </p>
        </div>
      `;
      return;
    }

    // Scroll to top
    scrollToTop();

    // Create main container
    const container = document.createElement('div');
    container.className = 'vending-shops-container';

    // Create header
    const header = document.createElement('div');
    header.className = 'vending-shops-header';
    header.innerHTML = `
      <h2>
        <i class="fas fa-shopping-cart"></i> Vending Shops
      </h2>
      <p>
        Browse items from all vendor shops
      </p>
    `;
    container.appendChild(header);

    // Create search/filter bar
    const characters = [...new Set(data.map(item => item.characterName))].sort();
    const characterOptions = [
      { value: 'all', label: 'All Vendors', selected: true },
      ...characters.map(char => ({ value: char, label: char }))
    ];
    
    const { bar: filterBar } = createSearchFilterBar({
      layout: 'compact',
      filters: [
        {
          type: 'input',
          id: 'vending-shops-search',
          placeholder: 'Search items or vendors...',
          attributes: { autocomplete: 'off' },
          width: 'double'
        },
        {
          type: 'select',
          id: 'vending-shops-character-filter',
          name: 'character',
          'data-filter': 'character',
          options: characterOptions
        }
      ]
    });
    container.appendChild(filterBar);

    // Create results info
    const resultsInfo = document.createElement('div');
    resultsInfo.className = 'vending-shops-results-info';
    resultsInfo.innerHTML = `
      <p>Showing ${data.length} items</p>
    `;
    container.appendChild(resultsInfo);

    // Group items by character
    const itemsByCharacter = {};
    data.forEach(item => {
      const charName = item.characterName || 'Unknown';
      if (!itemsByCharacter[charName]) {
        itemsByCharacter[charName] = [];
      }
      itemsByCharacter[charName].push(item);
    });

    // Create shops grid
    const shopsGrid = document.createElement('div');
    shopsGrid.className = 'vending-shops-grid';

    // Render each vendor's shop
    Object.keys(itemsByCharacter).sort().forEach(characterName => {
      const items = itemsByCharacter[characterName];
      shopsGrid.appendChild(renderVendorShop(characterName, items));
    });

    container.appendChild(shopsGrid);

    // Add filter functionality
    setupFilters(container, data, shopsGrid, resultsInfo);

    contentDiv.appendChild(container);

  } catch (error) {
    console.error('❌ Error initializing vending shops page:', error);
    if (contentDiv) {
      contentDiv.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>Failed to initialize vending shops page</p>
          <button class="retry-button" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }
}

// ------------------- Function: renderVendorShop -------------------
// Renders a single vendor's shop section
function renderVendorShop(characterName, items) {
  const shopCard = document.createElement('div');
  shopCard.className = 'vendor-shop-card';
  shopCard.setAttribute('data-character', characterName.toLowerCase());

  // Get character icon and shop image from first item (all items from same character have same data)
  const characterIcon = items[0]?.characterIcon || null;
  const shopImage = items[0]?.shopImage || null;
  const iconUrl = formatCharacterIconUrl(characterIcon);
  const shopImageUrl = formatShopImageUrl(shopImage);

  // Create shop banner section
  const shopBanner = document.createElement('div');
  shopBanner.className = 'vendor-shop-banner';
  if (shopImageUrl) {
    // Set background image with proper escaping
    const escapedUrl = shopImageUrl.replace(/'/g, "\\'").replace(/"/g, '\\"');
    shopBanner.style.backgroundImage = `url('${escapedUrl}')`;
    // Add error handling - if image fails to load, CSS gradient will show
    const testImg = new Image();
    testImg.onerror = function() {
      shopBanner.style.backgroundImage = '';
    };
    testImg.src = shopImageUrl;
  }
  shopCard.appendChild(shopBanner);

  const header = document.createElement('div');
  header.className = 'vendor-shop-header';
  
  // Create character icon image with proper error handling
  const iconImg = document.createElement('img');
  iconImg.src = iconUrl;
  iconImg.alt = characterName;
  iconImg.className = 'vendor-character-icon';
  iconImg.onerror = function() {
    this.src = '/images/ankleicon.png';
  };
  
  // Get vendor info from first item
  const vendorType = items[0]?.vendorType || null;
  const currentVillage = items[0]?.currentVillage || null;
  const shopLink = items[0]?.shopLink || null;
  const vendingPoints = items[0]?.vendingPoints || 0;

  const villageDisplay = currentVillage ? currentVillage.charAt(0).toUpperCase() + currentVillage.slice(1) : 'Unknown';
  const vendorTypeDisplay = vendorType ? vendorType.charAt(0).toUpperCase() + vendorType.slice(1) : 'Unknown';

  header.innerHTML = `
    <div class="vendor-shop-header-left">
      <div class="vendor-shop-header-info">
        <h3>
          <i class="fas fa-store"></i> ${characterName}
        </h3>
        <div class="vendor-shop-meta">
          <span class="vendor-meta-item">
            <i class="fas fa-tag"></i> ${vendorTypeDisplay}
          </span>
          <span class="vendor-meta-item">
            <i class="fas fa-map-marker-alt"></i> ${villageDisplay}
          </span>
          <span class="item-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
          ${vendingPoints > 0 ? `
            <span class="vendor-meta-item">
              <i class="fas fa-coins"></i> ${vendingPoints} points
            </span>
          ` : ''}
        </div>
      </div>
    </div>
    ${shopLink ? `
      <div class="vendor-shop-link">
        <a href="${shopLink}" target="_blank" rel="noopener noreferrer" class="shop-link-button">
          <i class="fas fa-external-link-alt"></i> Visit Shop
        </a>
      </div>
    ` : ''}
  `;
  
  // Insert icon before header info
  const headerLeft = header.querySelector('.vendor-shop-header-left');
  headerLeft.insertBefore(iconImg, headerLeft.firstChild);
  
  shopCard.appendChild(header);

  const itemsGrid = document.createElement('div');
  itemsGrid.className = 'vendor-items-grid';

  items.forEach(item => {
    itemsGrid.appendChild(renderVendorItem(item));
  });

  shopCard.appendChild(itemsGrid);
  return shopCard;
}

// ------------------- Function: renderVendorItem -------------------
// Renders a single vendor item card
function renderVendorItem(item) {
  const card = document.createElement('div');
  card.className = 'vendor-item-card';
  card.setAttribute('data-item-name', (item.itemName || '').toLowerCase());
  card.setAttribute('data-character', (item.characterName || '').toLowerCase());

  const itemName = item.itemName || 'Unknown Item';
  const stockQty = item.stockQty || 0;
  const costEach = item.costEach || 0;
  const tokenPrice = item.tokenPrice || 0;
  const slot = item.slot || 'N/A';

  card.innerHTML = `
    <div class="vendor-item-header">
      <h4>${itemName}</h4>
      ${slot !== 'N/A' ? `<span class="item-slot">${slot}</span>` : ''}
    </div>
    <div class="vendor-item-details">
      <div class="item-stock">
        <i class="fas fa-box"></i> Stock: ${stockQty}
      </div>
      <div class="item-pricing">
        ${costEach > 0 ? `
          <div class="price-item">
            <i class="fas fa-coins"></i> ${costEach} points each
          </div>
        ` : ''}
        ${tokenPrice > 0 ? `
          <div class="price-item">
            <i class="fas fa-gem"></i> ${tokenPrice} tokens
          </div>
        ` : ''}
      </div>
    </div>
  `;

  return card;
}

// ------------------- Function: setupFilters -------------------
// Sets up search and filter functionality
function setupFilters(container, allData, shopsGrid, resultsInfo) {
  const searchInput = container.querySelector('#vending-shops-search');
  const characterFilter = container.querySelector('#vending-shops-character-filter');

  const filterItems = () => {
    const searchTerm = (searchInput?.value || '').toLowerCase();
    const selectedCharacter = characterFilter?.value || 'all';

    // Filter data
    let filteredData = allData;
    
    if (searchTerm) {
      filteredData = filteredData.filter(item => 
        (item.itemName || '').toLowerCase().includes(searchTerm) ||
        (item.characterName || '').toLowerCase().includes(searchTerm)
      );
    }

    if (selectedCharacter !== 'all') {
      filteredData = filteredData.filter(item => 
        (item.characterName || '').toLowerCase() === selectedCharacter.toLowerCase()
      );
    }

    // Group by character again
    const itemsByCharacter = {};
    filteredData.forEach(item => {
      const charName = item.characterName || 'Unknown';
      if (!itemsByCharacter[charName]) {
        itemsByCharacter[charName] = [];
      }
      itemsByCharacter[charName].push(item);
    });

    // Clear and re-render
    shopsGrid.innerHTML = '';
    Object.keys(itemsByCharacter).sort().forEach(characterName => {
      const items = itemsByCharacter[characterName];
      shopsGrid.appendChild(renderVendorShop(characterName, items));
    });

    // Update results info
    if (resultsInfo) {
      resultsInfo.querySelector('p').textContent = `Showing ${filteredData.length} item${filteredData.length !== 1 ? 's' : ''}`;
    }
  };

  if (searchInput) {
    searchInput.addEventListener('input', filterItems);
  }

  if (characterFilter) {
    characterFilter.addEventListener('change', filterItems);
  }
}

export {
  initializeVendingShopsPage
};

