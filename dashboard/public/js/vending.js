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

// ------------------- Function: convertDiscordEmojiToImage -------------------
// Converts Discord emoji format <:name:id> to image URL
function convertDiscordEmojiToImage(emoji) {
  if (!emoji) return null;
  
  // If it's already a URL, return it
  if (emoji.startsWith('http')) {
    return emoji;
  }
  
  // If it's a Discord emoji format <:name:id>
  const match = emoji.match(/<:(?:a:)?(\w+):(\d+)>/);
  if (match) {
    const emojiId = match[2];
    const isAnimated = emoji.startsWith('<a:');
    const extension = isAnimated ? 'gif' : 'png';
    return `https://cdn.discordapp.com/emojis/${emojiId}.${extension}`;
  }
  
  // If it's a regular emoji, return null (will use fallback)
  return null;
}

// ------------------- Function: fetchAvailableMonths -------------------
// Fetches all available months from the server
async function fetchAvailableMonths() {
  try {
    const response = await fetch('/api/vending/months');
    if (response.ok) {
      const data = await response.json();
      return data.months || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching available months:', error);
    return [];
  }
}

// ------------------- Function: fetchStockByMonth -------------------
// Fetches stock data for a specific month/year
async function fetchStockByMonth(month, year) {
  try {
    const response = await fetch(`/api/models/vending?month=${month}&year=${year}`);
    if (response.ok) {
      const data = await response.json();
      return data.data || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching stock by month:', error);
    return [];
  }
}

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

    // Fetch available months for the selector
    const availableMonths = await fetchAvailableMonths();

    // Scroll to top
    scrollToTop();

    // Create main container
    const container = document.createElement('div');
    container.className = 'vending-stock-container';

    // Add header with month info and selector
    const header = document.createElement('div');
    header.className = 'vending-stock-header';
    
    const headerContent = document.createElement('div');
    headerContent.className = 'header-content';
    headerContent.innerHTML = `
      <h2>
        <i class="fas fa-store"></i> Vending Stock
      </h2>
      <p>
        ${stockData.year ? `${new Date(stockData.year, (stockData.month || 1) - 1).toLocaleString('default', { month: 'long' })} ${stockData.year}` : `Month ${stockData.month || 'Unknown'}`} • Last Updated: ${stockData.createdAt ? new Date(stockData.createdAt).toLocaleDateString() : 'N/A'}
      </p>
    `;
    
    // Add month selector if there are multiple months available
    if (availableMonths.length > 1) {
      const monthSelector = document.createElement('div');
      monthSelector.className = 'month-selector';
      
      const label = document.createElement('label');
      label.textContent = 'View Month:';
      label.setAttribute('for', 'month-select');
      
      const select = document.createElement('select');
      select.id = 'month-select';
      
      // Add options for each available month
      availableMonths.forEach(monthData => {
        const option = document.createElement('option');
        const monthName = new Date(monthData.year, monthData.month - 1).toLocaleString('default', { month: 'long' });
        option.value = `${monthData.month}-${monthData.year}`;
        option.textContent = `${monthName} ${monthData.year}`;
        if (monthData.month === stockData.month && monthData.year === stockData.year) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      
      // Add change handler
      select.addEventListener('change', async (e) => {
        const [month, year] = e.target.value.split('-').map(Number);
        const newData = await fetchStockByMonth(month, year);
        if (newData.length > 0) {
          await renderVendingStock(newData[0], container, availableMonths);
        }
      });
      
      monthSelector.appendChild(label);
      monthSelector.appendChild(select);
      header.appendChild(headerContent);
      header.appendChild(monthSelector);
    } else {
      header.appendChild(headerContent);
    }
    
    container.appendChild(header);

    // Render the stock
    await renderVendingStock(stockData, container, availableMonths);

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

// ------------------- Function: renderVendingStock -------------------
// Renders the vending stock data
async function renderVendingStock(stockData, container, availableMonths) {
  // Remove existing stock sections (keep header)
  const existingSections = container.querySelectorAll('.vending-village-section, .vending-limited-section');
  existingSections.forEach(section => section.remove());

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
}

// ------------------- Function: renderVillageSection -------------------
// Renders a village's stock section
function renderVillageSection(villageName, items) {
  const section = document.createElement('div');
  section.className = 'vending-village-section';
  
  // Add village-specific class for styling
  const villageClass = villageName.toLowerCase();
  section.classList.add(villageClass);

  // Village header
  const header = document.createElement('div');
  header.className = 'vending-village-header';
  header.innerHTML = `
    <h3>
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

  const groupHeader = document.createElement('h4');
  groupHeader.textContent = `${typeName} Items`;
  group.appendChild(groupHeader);

  // Create grid for items
  const grid = document.createElement('div');
  grid.className = 'vending-items-grid';

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

  // Convert emoji to image URL
  let imageUrl = null;
  let emojiHtml = '';
  
  if (item.emoji) {
    imageUrl = convertDiscordEmojiToImage(item.emoji);
    
    if (imageUrl) {
      emojiHtml = `<img src="${imageUrl}" alt="${item.itemName || 'Item'}" class="item-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />`;
    } else if (!item.emoji.startsWith('<:')) {
      // Regular emoji
      emojiHtml = `<span class="item-emoji" style="display: none;">${item.emoji}</span>`;
    }
  }
  
  // Fallback emoji if image fails
  const fallbackEmoji = `<span class="item-emoji" style="display: ${imageUrl ? 'none' : 'inline'};">📦</span>`;

  card.innerHTML = `
    <div class="item-header">
      ${emojiHtml}
      ${fallbackEmoji}
      <h5>
        ${item.itemName || 'Unknown Item'}
      </h5>
    </div>
    <div class="item-info">
      <span class="item-points">
        <i class="fas fa-coins"></i> ${item.points || 0} points
      </span>
    </div>
    <div class="item-type">
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

  const header = document.createElement('div');
  header.innerHTML = `
    <h3>
      <i class="fas fa-star"></i> Limited Items
    </h3>
    <p>
      These items have limited stock available
    </p>
  `;
  section.appendChild(header);

  // Create grid for limited items
  const grid = document.createElement('div');
  grid.className = 'vending-limited-grid';

  items.forEach(item => {
    const card = renderStockItem(item);
    
    // Add stock indicator
    const stockIndicator = document.createElement('div');
    stockIndicator.className = `stock-indicator ${item.stock > 0 ? 'in-stock' : 'out-of-stock'}`;
    stockIndicator.innerHTML = `
      <span>
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
