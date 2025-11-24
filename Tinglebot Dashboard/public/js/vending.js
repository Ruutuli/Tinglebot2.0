/* ====================================================================== */
/* Vending Stock Rendering Module                                        */
/* Handles vending stock display with village-based organization         */
/* ====================================================================== */

import { scrollToTop } from './ui.js';
import { capitalize } from './utils.js';

// ============================================================================
// ------------------- Rendering: Vending Stock Display -------------------
// Displays vending stock organized by village
// ============================================================================

// ------------------- Function: initializeVendingPage -------------------
// Initializes the vending stock page with data
async function initializeVendingPage(data, page, contentDiv) {
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
          <p>No vending stock data available</p>
          <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">
            Vending stock is updated monthly
          </p>
        </div>
      `;
      return;
    }

    // Get the stock data (should be single item in array)
    const stockData = data[0];

    // Scroll to top
    scrollToTop();

    // Create main container
    const container = document.createElement('div');
    container.className = 'vending-stock-container';
    container.style.padding = '2rem';

    // Add header with month info
    const header = document.createElement('div');
    header.className = 'vending-stock-header';
    header.style.marginBottom = '2rem';
    header.innerHTML = `
      <h2 style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-primary);">
        <i class="fas fa-store"></i> Vending Stock
      </h2>
      <p style="font-size: 1rem; color: var(--text-secondary);">
        ${stockData.year ? `${new Date(stockData.year, (stockData.month || 1) - 1).toLocaleString('default', { month: 'long' })} ${stockData.year}` : `Month ${stockData.month || 'Unknown'}`} • Last Updated: ${stockData.createdAt ? new Date(stockData.createdAt).toLocaleDateString() : 'N/A'}
      </p>
    `;
    container.appendChild(header);

    // Render village stock sections
    if (stockData.stockList) {
      const villages = ['Rudania', 'Inariko', 'Vhintl'];
      
      // Handle both Map and plain object formats
      const stockListObj = stockData.stockList instanceof Map 
        ? Object.fromEntries(stockData.stockList) 
        : stockData.stockList;
      
      villages.forEach(village => {
        const villageStock = stockListObj[village];
        if (villageStock && Array.isArray(villageStock) && villageStock.length > 0) {
          container.appendChild(renderVillageSection(village, villageStock));
        }
      });
    }

    // Render limited items section
    if (stockData.limitedItems && Array.isArray(stockData.limitedItems) && stockData.limitedItems.length > 0) {
      container.appendChild(renderLimitedItemsSection(stockData.limitedItems));
    }

    contentDiv.appendChild(container);

  } catch (error) {
    console.error('❌ Error initializing vending page:', error);
    if (contentDiv) {
      contentDiv.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>Failed to initialize vending stock page</p>
          <button class="retry-button" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }
}

// ------------------- Function: renderVillageSection -------------------
// Renders a village's stock section
function renderVillageSection(villageName, items) {
  const section = document.createElement('div');
  section.className = 'vending-village-section';
  section.style.marginBottom = '2.5rem';

  // Village header
  const header = document.createElement('div');
  header.className = 'vending-village-header';
  header.style.padding = '1rem';
  header.style.backgroundColor = 'var(--bg-secondary)';
  header.style.borderRadius = '8px';
  header.style.marginBottom = '1rem';
  header.innerHTML = `
    <h3 style="font-size: 1.5rem; margin: 0; color: var(--text-primary);">
      ${villageName}
    </h3>
  `;
  section.appendChild(header);

  // Group items by vending type
  const merchantItems = items.filter(item => item.vendingType === 'Merchant');
  const shopkeeperItems = items.filter(item => item.vendingType === 'Shopkeeper');

  // Render Merchant items
  if (merchantItems.length > 0) {
    section.appendChild(renderItemGroup('Merchant', merchantItems));
  }

  // Render Shopkeeper items
  if (shopkeeperItems.length > 0) {
    section.appendChild(renderItemGroup('Shopkeeper', shopkeeperItems));
  }

  return section;
}

// ------------------- Function: renderItemGroup -------------------
// Renders a group of items by vending type
function renderItemGroup(typeName, items) {
  const group = document.createElement('div');
  group.className = 'vending-item-group';
  group.style.marginBottom = '1.5rem';

  const groupHeader = document.createElement('div');
  groupHeader.style.marginBottom = '1rem';
  groupHeader.innerHTML = `
    <h4 style="font-size: 1.2rem; color: var(--accent-color); margin: 0;">
      ${typeName} Items
    </h4>
  `;
  group.appendChild(groupHeader);

  // Create grid for items
  const grid = document.createElement('div');
  grid.className = 'vending-items-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
  grid.style.gap = '1rem';

  items.forEach(item => {
    grid.appendChild(renderStockItem(item));
  });

  group.appendChild(grid);
  return group;
}

// ------------------- Function: renderStockItem -------------------
// Renders an individual stock item card
function renderStockItem(item) {
  const card = document.createElement('div');
  card.className = 'vending-item-card';
  card.style.padding = '1rem';
  card.style.backgroundColor = 'var(--bg-secondary)';
  card.style.borderRadius = '8px';
  card.style.border = '1px solid var(--border-color)';
  card.style.transition = 'transform 0.2s, box-shadow 0.2s';

  // Hover effects
  card.addEventListener('mouseenter', () => {
    card.style.transform = 'translateY(-2px)';
    card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = 'translateY(0)';
    card.style.boxShadow = 'none';
  });

  // Item emoji/icon
  let emojiHtml = '';
  if (item.emoji) {
    if (item.emoji.startsWith('http')) {
      emojiHtml = `<img src="${item.emoji}" alt="${item.itemName}" style="width: 32px; height: 32px; margin-right: 0.5rem; vertical-align: middle;">`;
    } else if (!item.emoji.startsWith('<:')) {
      emojiHtml = `<span style="font-size: 1.5rem; margin-right: 0.5rem;">${item.emoji}</span>`;
    } else {
      // Discord emoji format - extract the emoji if possible or use placeholder
      emojiHtml = `<span style="font-size: 1.5rem; margin-right: 0.5rem;">📦</span>`;
    }
  }

  // Item rarity color
  const rarityColors = {
    1: '#9d9d9d', // Common
    2: '#ffffff', // Uncommon
    3: '#1eff00', // Rare
    4: '#0070dd', // Epic
    5: '#a335ee', // Legendary
    6: '#ff8000', // Artifact
    7: '#e6cc80', // Heirloom
    8: '#00ccff', // Mythic
    9: '#ff69b4', // Unique
    10: '#ff0000' // Special
  };

  const rarityColor = rarityColors[item.itemRarity] || '#9d9d9d';

  card.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 0.75rem;">
      ${emojiHtml}
      <h5 style="font-size: 1.1rem; margin: 0; color: var(--text-primary); flex: 1;">
        ${item.itemName || 'Unknown Item'}
      </h5>
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
      <span style="color: var(--text-secondary); font-size: 0.9rem;">
        <i class="fas fa-coins"></i> ${item.points || 0} points
      </span>
      <span style="padding: 0.25rem 0.5rem; background-color: ${rarityColor}20; color: ${rarityColor}; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">
        Rarity ${item.itemRarity || 1}
      </span>
    </div>
    <div style="color: var(--text-secondary); font-size: 0.85rem;">
      <i class="fas fa-tag"></i> ${item.vendingType || 'Unknown'}
    </div>
  `;

  return card;
}

// ------------------- Function: renderLimitedItemsSection -------------------
// Renders the limited items section
function renderLimitedItemsSection(items) {
  const section = document.createElement('div');
  section.className = 'vending-limited-section';
  section.style.marginTop = '3rem';
  section.style.padding = '1.5rem';
  section.style.backgroundColor = 'var(--bg-secondary)';
  section.style.borderRadius = '8px';
  section.style.border = '2px solid var(--accent-color)';

  const header = document.createElement('div');
  header.style.marginBottom = '1.5rem';
  header.innerHTML = `
    <h3 style="font-size: 1.5rem; margin: 0; color: var(--accent-color);">
      <i class="fas fa-star"></i> Limited Items
    </h3>
    <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">
      These items have limited stock available
    </p>
  `;
  section.appendChild(header);

  // Create grid for limited items
  const grid = document.createElement('div');
  grid.className = 'vending-limited-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
  grid.style.gap = '1rem';

  items.forEach(item => {
    const card = renderStockItem(item);
    
    // Add stock indicator
    const stockIndicator = document.createElement('div');
    stockIndicator.style.marginTop = '0.75rem';
    stockIndicator.style.padding = '0.5rem';
    stockIndicator.style.backgroundColor = item.stock > 0 ? 'rgba(255, 165, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)';
    stockIndicator.style.borderRadius = '4px';
    stockIndicator.style.textAlign = 'center';
    stockIndicator.innerHTML = `
      <span style="color: ${item.stock > 0 ? '#ffa500' : '#ff0000'}; font-weight: 600; font-size: 0.9rem;">
        ${item.stock > 0 ? `${item.stock} in stock` : 'Out of stock'}
      </span>
    `;
    card.appendChild(stockIndicator);

    grid.appendChild(card);
  });

  section.appendChild(grid);
  return section;
}

export {
  initializeVendingPage,
  renderVillageSection,
  renderStockItem,
  renderLimitedItemsSection
};

