
const SIDEBAR_TOGGLE = document.getElementById('sidebar-toggle');
const SIDEBAR = document.querySelector('.sidebar');
const MAIN_WRAPPER = document.querySelector('.main-wrapper');
const MODEL_DETAILS_PAGE = document.getElementById('model-details-page');
const BACK_BUTTON = document.querySelector('.back-button');
const USER_MENU = document.querySelector('.user-menu');
const USER_AVATAR = document.querySelector('.user-avatar');
const USERNAME = document.querySelector('.username');

// Add these variables at the top of the file with other constants
let villageChart = null;
let raceChart = null;
let jobChart = null;


// Add cache object at the top level
const inventoryCache = {
    data: new Map(),
    timestamp: new Map(),
    CACHE_DURATION: 30 * 60 * 1000, // 30 minutes in milliseconds
    
    set(key, value) {
        this.data.set(key, value);
        this.timestamp.set(key, Date.now());
    },
    
    get(key) {
        const timestamp = this.timestamp.get(key);
        if (!timestamp) return null;
        
        if (Date.now() - timestamp > this.CACHE_DURATION) {
            this.data.delete(key);
            this.timestamp.delete(key);
            return null;
        }
        
        return this.data.get(key);
    }
};


// ------------------- Function: DOMContentLoaded -------------------
// Initializes the dashboard by checking auth, setting up events, and loading initial data

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupEventListeners();
    loadModelCounts();
    setupSidebarNavigation();
    showSection('dashboard-section');
});


// ------------------- Function: checkAuth -------------------
// Verifies user authentication status and updates UI accordingly

async function checkAuth() {
    try {
        const response = await fetch('/api/user');
        if (!response.ok) {
            // Not authenticated, show default avatar/username
            setDefaultUserInfo();
            return;
        }
        const text = await response.text();
        if (!text) {
            setDefaultUserInfo();
            return;
        }
        const user = JSON.parse(text);
        updateUserInfo(user);
    } catch (error) {
        console.error('Auth check failed:', error);
        setDefaultUserInfo();
    }
}

// ------------------- Function: setupEventListeners -------------------
// Sets up all event listeners for navigation and UI interactions

function setupEventListeners() {
    // Sidebar toggle
    SIDEBAR_TOGGLE.addEventListener('click', () => {
        const isCollapsed = SIDEBAR.classList.toggle('collapsed');
        MAIN_WRAPPER.classList.toggle('sidebar-collapsed');
        
        // Store the state in localStorage
        localStorage.setItem('sidebarCollapsed', isCollapsed);
        
        // Update the toggle button icon
        SIDEBAR_TOGGLE.innerHTML = isCollapsed ? 
            '<i class="fas fa-chevron-right"></i>' : 
            '<i class="fas fa-bars"></i>';
    });

    // Restore sidebar state on page load
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        SIDEBAR.classList.add('collapsed');
        MAIN_WRAPPER.classList.add('sidebar-collapsed');
        SIDEBAR_TOGGLE.innerHTML = '<i class="fas fa-chevron-right"></i>';
    }

    // Navigation links
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
            link.parentElement.classList.add('active');
            // Update breadcrumb
            document.querySelector('.breadcrumb').textContent = link.querySelector('span').textContent.trim();
        });
    });

    // Back button
    if (BACK_BUTTON) {
        BACK_BUTTON.addEventListener('click', hideModelDetails);
    }

    // Logout handler
    if (USER_MENU) {
        USER_MENU.addEventListener('click', async () => {
            try {
                const response = await fetch('/auth/logout');
                if (response.ok) {
                    window.location.href = '/login';
                }
            } catch (error) {
                console.error('Logout failed:', error);
            }
        });
    }

    // Setup model cards
    setupModelCards();
}

// ------------------- Function: showModal -------------------
// Displays a modal dialog by ID

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}

// ------------------- Function: validateForm -------------------
// Validates form data and returns any validation errors

function validateForm(formData) {
    const errors = {};
    // Add form validation logic here
    return errors;
}


// ------------------- Function: getActivityIcon -------------------
// Returns the appropriate FontAwesome icon for an activity type

function getActivityIcon(type) {
    const icons = {
        command: 'fa-terminal',
        join: 'fa-user-plus',
        leave: 'fa-user-minus',
        error: 'fa-exclamation-circle',
        default: 'fa-info-circle'
    };
    return icons[type] || icons.default;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// Converts a height in centimeters to feet and inches
function convertCmToFeetInches(heightInCm) {
    const totalInches = heightInCm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}' ${inches}"`;
}

// Gets specific stat value from gear item
function getGearStat(gear, statName) {
    if (!gear || !gear.stats) return '0';
    
    // Check if the gear has the specific stat we're looking for
    let statValue = '0';
    
    // Check if stats is a Map object or a regular object (from MongoDB)
    if (typeof gear.stats.get === 'function') {
        // It's a proper Map
        statValue = gear.stats.get(statName) || gear.stats.get('modifierHearts') || '0';
    } else {
        // It's a plain object
        statValue = gear.stats[statName] || gear.stats['modifierHearts'] || '0';
    }
    
    // Convert to string if it's a number
    return statValue.toString();
}

// ------------------- Function: logError -------------------
// Logs errors with context for debugging and monitoring

function logError(error, context = '') {
    console.error(`[${context}]`, error);
    // Add error reporting service integration here
}

// ------------------- Function: hideModelDetails -------------------
// Hides the model details view and returns to the main view
function hideModelDetails() {
    const modelDetails = document.querySelector('.model-details');
    const mainContent = document.querySelector('.main-content');
    if (modelDetails && mainContent) {
        modelDetails.style.display = 'none';
        mainContent.style.display = '';
    }
}

// --- Stats Navigation and Rendering ---
function showSection(sectionId) {
    document.querySelectorAll('.main-content > section').forEach(sec => sec.style.display = 'none');
    const section = document.getElementById(sectionId);
    if (section) section.style.display = '';
}

function setupSidebarNavigation() {
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            const hash = link.getAttribute('href');
            if (hash === '#stats') {
                e.preventDefault();
                showSection('stats-section');
                loadStatsPage();
            } else if (hash === '#dashboard') {
                e.preventDefault();
                showSection('dashboard-section');
            } else if (hash === '#inventory') {
                e.preventDefault();
                showSection('inventory-section');
                loadInventory();
            }
            // Add more navigation as needed
        });
    });
}







// Formats character icon URL to ensure it's valid for display
function formatCharacterIconUrl(iconUrl) {
    if (!iconUrl) {
        return DEFAULT_ICON;
    }
    
    // If it's a Google Cloud Storage URL, proxy it through our backend
    if (iconUrl.includes('storage.googleapis.com/tinglebot/')) {
        // Extract the filename from the URL
        const filename = iconUrl.split('/').pop();
        // Return the proxied URL
        return `/api/images/${filename}`;
    }
    
    // For other URLs, return as is
    return iconUrl;
}

// Setup server-side pagination
async function setupServerPagination(modelName, pagination) {
    const paginationContainer = document.getElementById('character-pagination');
    if (!paginationContainer) return;
    
    let paginationHTML = '';
    const currentPage = pagination.page;
    const totalPages = pagination.pages;
    
    // Previous button
    paginationHTML += `
        <button class="pagination-button ${currentPage === 1 ? 'disabled' : ''}" 
                ${currentPage === 1 ? 'disabled' : ''} 
                data-page="${currentPage - 1}" data-action="server-page">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    // Page buttons
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // First page button if not visible
    if (startPage > 1) {
        paginationHTML += `
            <button class="pagination-button" data-page="1" data-action="server-page">1</button>
            ${startPage > 2 ? '<span class="pagination-ellipsis">...</span>' : ''}
        `;
    }
    
    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="pagination-button ${i === currentPage ? 'active' : ''}" 
                    data-page="${i}" data-action="server-page">${i}</button>
        `;
    }
    
    // Last page button if not visible
    if (endPage < totalPages) {
        paginationHTML += `
            ${endPage < totalPages - 1 ? '<span class="pagination-ellipsis">...</span>' : ''}
            <button class="pagination-button" data-page="${totalPages}" data-action="server-page">${totalPages}</button>
        `;
    }
    
    // Next button
    paginationHTML += `
        <button class="pagination-button ${currentPage === totalPages ? 'disabled' : ''}" 
                ${currentPage === totalPages ? 'disabled' : ''} 
                data-page="${currentPage + 1}" data-action="server-page">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    paginationContainer.innerHTML = paginationHTML;
    
    // Add event listeners to pagination buttons
    document.querySelectorAll('.pagination-button[data-action="server-page"]').forEach(button => {
        if (!button.disabled) {
            button.addEventListener('click', async () => {
                const page = parseInt(button.dataset.page);
                
                // Show loading spinner
                document.getElementById('character-grid').innerHTML = `
                    <div class="character-loading">
                        <i class="fas fa-spinner"></i> Loading page ${page}...
                    </div>
                `;
                
                try {
                    // Fetch the new page
                    const response = await fetch(`/api/models/${modelName}?page=${page}&limit=${pagination.limit}`);
                    const result = await response.json();
                    
                    // Update the data display
                    const data = result.data;
                    renderCharacterCards(data);
                    
                    // Update pagination
                    setupServerPagination(modelName, result.pagination);
                    
                    // Update results info
                    const resultsInfo = document.querySelector('.character-results-info p');
                    if (resultsInfo) {
                        resultsInfo.textContent = `Showing ${data.length} of ${result.pagination.total} characters (page ${page})`;
                    }
                    
                    // Scroll to top of character grid
                    document.getElementById('character-grid').scrollIntoView({ behavior: 'smooth' });
                } catch (error) {
                    console.error('Error loading page:', error);
                    document.getElementById('character-grid').innerHTML = `
                        <div class="character-loading error">
                            <i class="fas fa-exclamation-circle"></i> Error loading characters. Please try again.
                        </div>
                    `;
                }
            });
        }
    });
}

// ------------------- Function: getVillageCrestUrl -------------------
// Returns the URL of the village crest for a given village
function getVillageCrestUrl(village) {
    const villageCrests = {
        'rudania': 'https://static.wixstatic.com/media/7573f4_ffb523e41dbb43c183283a5afbbc74e1~mv2.png',
        'inariko': 'https://static.wixstatic.com/media/7573f4_066600957d904b1dbce10912d698f5a2~mv2.png',
        'vhintl': 'https://static.wixstatic.com/media/7573f4_15ac377e0dd643309853fc77250a86a1~mv2.png'
    };
    return villageCrests[village.toLowerCase()] || '';
}

// ------------------- Function: formatPrettyDate -------------------
// Formats a date as 'Month Day, Year' with ordinal (e.g., May 3rd, 2025)
function formatPrettyDate(date) {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d)) return '—';
    const day = d.getDate();
    const month = d.toLocaleString('default', { month: 'long' });
    const year = d.getFullYear();
    // Ordinal suffix
    const j = day % 10, k = day % 100;
    let suffix = 'th';
    if (j === 1 && k !== 11) suffix = 'st';
    else if (j === 2 && k !== 12) suffix = 'nd';
    else if (j === 3 && k !== 13) suffix = 'rd';
    return `${month} ${day}${suffix}, ${year}`;
}






// ------------------- Function: setupBackToTopButton -------------------
// Sets up the back to top button
function setupBackToTopButton() {
    const backToTopBtn = document.getElementById('back-to-top');
    if (!backToTopBtn) {
        console.error('Back to top button not found!');
        return;
    }

    console.log('Setting up back to top button...');
    
    // Force the button to be visible initially
    backToTopBtn.style.display = 'block';
    backToTopBtn.style.opacity = '1';
    backToTopBtn.style.zIndex = '99999';

    // Handle scroll events for both main page and model details page
    window.addEventListener('scroll', () => {
        const modelDetailsPage = document.getElementById('model-details-page');
        const scrollContainer = modelDetailsPage && modelDetailsPage.style.display === 'flex' 
            ? modelDetailsPage 
            : window;

        // Always show the button when scrolling
        backToTopBtn.style.display = 'block';
        console.log('Scroll detected, button should be visible');
    });

    backToTopBtn.addEventListener('click', () => {
        console.log('Back to top button clicked');
        const modelDetailsPage = document.getElementById('model-details-page');
        if (modelDetailsPage && modelDetailsPage.style.display === 'flex') {
            // Scroll the model details content to top
            const modelDetailsContent = modelDetailsPage.querySelector('.model-details-content');
            if (modelDetailsContent) {
                modelDetailsContent.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } else {
            // Scroll main page to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // Also show the button when model details page is shown
    const modelDetailsPage = document.getElementById('model-details-page');
    if (modelDetailsPage) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'style') {
                    if (modelDetailsPage.style.display === 'flex') {
                        console.log('Model details page shown, button should be visible');
                        backToTopBtn.style.display = 'block';
                    }
                }
            });
        });
        observer.observe(modelDetailsPage, { attributes: true });
    }
}

// ------------------- Function: setupBackToTopButton -------------------
// Sets up the back to top button
setupBackToTopButton();
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, setting up back to top button...');
    setupBackToTopButton();
});

// ------------------- Function: fetchItemInventory -------------------
// Fetches inventory data for a given item name
async function fetchItemInventory(itemName) {
    try {
        console.log(`\n==========================================`);
        console.log(`🔍 Fetching inventory for item: ${itemName}`);
        console.log(`==========================================\n`);
        
        const response = await fetch('/api/inventory/item', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ itemName })
        });
        
        console.log(`📡 Response status: ${response.status}`);
        
        if (!response.ok) {
            console.error(`❌ Response not OK: ${response.status} ${response.statusText}`);
            throw new Error(`Failed to fetch inventory data: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`✅ Received inventory data:`, data);
        
        // Create inventory section HTML string
        let inventoryHTML = `
            <div class="character-inventory-section">
                <div class="character-inventory-title">Characters that have ${itemName}</div>
        `;

        if (data.length === 0) {
            console.log('📭 No inventory data found');
            inventoryHTML += `
                <div class="character-inventory-empty">
                    No characters have this item
                </div>
            `;
        } else {
            // Sort by quantity descending before rendering
            data.sort((a, b) => b.quantity - a.quantity);
            console.log(`📦 Creating inventory list with ${data.length} items`);
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
        console.log('✅ Inventory section created successfully');
        return inventoryHTML;
    } catch (error) {
        console.error('❌ Error fetching inventory:', error);
        return `
            <div class="character-inventory-section">
                <div class="character-inventory-title">Characters that have ${itemName}</div>
                <div class="character-inventory-empty">Error loading inventory data</div>
            </div>
        `;
    }
}




// ------------------- Function: populateSelect -------------------
// Populates a select element with options
function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Clear existing options except the first one
    while (select.options.length > 1) {
        select.remove(1);
    }

    // Add new options
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option.charAt(0).toUpperCase() + option.slice(1);
        select.appendChild(optionElement);
    });
}

// ------------------- Function: initializeCustomSelects -------------------
// Initializes custom select dropdowns
function initializeCustomSelects() {
    const selects = document.querySelectorAll('.search-filter-control select');
    
    selects.forEach(select => {
        const selectControl = select.parentElement;



// ------------------- Function: setDefaultUserInfo -------------------
// Sets default avatar and username for unauthenticated users
function setDefaultUserInfo() {
    if (USER_AVATAR) {
        USER_AVATAR.src = '/images/ankleicon.png';
        USER_AVATAR.alt = 'User Avatar';
    }
    if (USERNAME) {
        USERNAME.textContent = 'Guest';
    }
}


// ------------------- Function: renderInventoryItems -------------------
// Renders inventory items with pagination
function renderInventoryItems(inventories) {
    const modelDetailsData = document.getElementById('model-details-data');
    
    // Create inventory grid
    const inventoryGrid = document.createElement('div');
    inventoryGrid.id = 'inventory-grid';
    inventoryGrid.className = 'inventory-details-grid';
    
    // Add inventory cards
    inventories.forEach(inventory => {
        const card = document.createElement('div');
        card.className = 'inventory-item';
        card.innerHTML = `
            <div class="inventory-header">
                <h3>${inventory.characterName}</h3>
                <span class="item-quantity">${inventory.quantity}</span>
            </div>
            <div class="inventory-content">
                <div class="item-info">
                    <h4>${inventory.itemName}</h4>
                    <span class="item-category">${inventory.category || 'No Category'}</span>
                    <span class="item-type">${inventory.type || 'No Type'}</span>
                </div>
            </div>
        `;
        inventoryGrid.appendChild(card);
    });
    
    // Clear and update the content
    modelDetailsData.innerHTML = '';
    modelDetailsData.appendChild(inventoryGrid);
}

// ------------------- Function: renderInventoryItems -------------------
// Renders inventory items with pagination
function renderInventoryItems(inventories, page = 1) {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;

    if (!Array.isArray(inventories)) {
        grid.innerHTML = `
            <div class="inventory-loading error">
                <i class="fas fa-exclamation-circle"></i>
                <p>Invalid inventory data format</p>
            </div>
        `;
        return;
    }

    console.log('[script.js]: Rendering inventory items, total items:', inventories.length);

    // Group items by characterName (from backend), fallback to characterId?.name, then 'Unknown Character'
    const characterInventories = inventories.reduce((acc, item) => {
        const characterName = item.characterName || item?.characterId?.name || 'Unknown Character';
        if (!acc[characterName]) {
            acc[characterName] = {
                characterName,
                items: [],
                totalItems: 0,
                categories: new Set(),
                types: new Set(),
                expanded: false // for UI state
            };
        }
        acc[characterName].items.push(item);
        acc[characterName].totalItems += item.quantity || 0;
        if (item.category) acc[characterName].categories.add(item.category);
        if (item.type) acc[characterName].types.add(item.type);
        return acc;
    }, {});

    // Convert to array and sort by character name
    const characterCards = Object.values(characterInventories)
        .sort((a, b) => a.characterName.localeCompare(b.characterName));

    console.log('[script.js]: Grouped into character cards:', characterCards.length);

    const itemsPerPage = 6; // Reduced to show fewer, larger cards
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = characterCards.slice(startIndex, endIndex);

    if (pageItems.length === 0) {
        grid.innerHTML = `
            <div class="inventory-loading">
                <i class="fas fa-box-open"></i>
                <p>No inventory items found</p>
            </div>
        `;
        return;
    }

    // Render only collapsed cards initially
    grid.innerHTML = pageItems.map((character, idx) => `
        <div class="character-inventory-card" data-character="${encodeURIComponent(character.characterName)}" data-idx="${idx}">
            <div class="character-inventory-header">
                <h3>${character.characterName}</h3>
                <span class="total-items">${character.totalItems} items</span>
            </div>
            <div class="character-inventory-content collapsed">
                <div class="inventory-stats">
                    <div class="stat">
                        <i class="fas fa-box"></i>
                        <span>${character.items.length} unique items</span>
                    </div>
                    <div class="stat">
                        <i class="fas fa-tags"></i>
                        <span>${character.categories.size} categories</span>
                    </div>
                    <div class="stat">
                        <i class="fas fa-layer-group"></i>
                        <span>${character.types.size} types</span>
                    </div>
                </div>
                <div class="inventory-items" style="display:none;"></div>
            </div>
        </div>
    `).join('');

    // Add click listeners for expansion
    pageItems.forEach((character, idx) => {
        const card = grid.querySelector(`.character-inventory-card[data-idx="${idx}"]`);
        if (!card) return;
        const content = card.querySelector('.character-inventory-content');
        const itemsContainer = card.querySelector('.inventory-items');
        
        card.addEventListener('click', function (e) {
            // Prevent multiple expansions
            if (!content.classList.contains('collapsed')) return;
            
            console.log(`[script.js]: Expanding card for ${character.characterName}`);
            console.log(`[script.js]: Found ${character.items.length} items for this character`);
            
            content.classList.remove('collapsed');
            itemsContainer.style.display = '';
            itemsContainer.innerHTML = `<div class="inventory-loading"><i class="fas fa-spinner fa-spin"></i> Loading data...</div>`;
            
            // Use setTimeout to simulate loading state, but use the already-loaded data
            setTimeout(() => {
                console.log(`[script.js]: Rendering items for ${character.characterName}`);
                itemsContainer.innerHTML = character.items.map(item => `
                    <div class="inventory-item">
                        <div class="item-header">
                            <h4>${item.itemName || 'Unknown Item'}</h4>
                            <span class="item-quantity">x${item.quantity || 0}</span>
                        </div>
                        <div class="item-details">
                            ${item.category ? `<span class="item-category">${item.category}</span>` : ''}
                            ${item.type ? `<span class="item-type">${item.type}</span>` : ''}
                        </div>
                    </div>
                `).join('') + (character.items.length > 5 ? `
                    <div class="more-items">
                        <i class="fas fa-ellipsis-h"></i>
                        <span>${character.items.length - 5} more items</span>
                    </div>
                ` : '');
            }, 300); // Reduced to 300ms for better UX
        });
    });
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

// ------------------- Function: renderMarkdownLinks -------------------
// Renders Markdown-style [text](url) as HTML links
function renderMarkdownLinks(text) {
    if (!text) return '';
    // Replace [text](url) with <a href="url" target="_blank">text</a>
    return text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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

// ------------------- Function: renderItemCards -------------------
// Renders item cards with pagination
function renderItemCards(items, page = 1) {
    console.log('=== TEST LOG ===');
    console.log('renderItemCards called with items:', items.length);
    
    const itemsPerPage = 12;
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const itemsToShow = items.slice(startIndex, endIndex);
    
    console.log('Items to show:', itemsToShow.length);
    
    const grid = document.getElementById('item-grid');
    if (!grid) return;
    if (!items || items.length === 0) {
        grid.innerHTML = '<div class="character-loading">No items found</div>';
        return;
    }
    
    grid.innerHTML = itemsToShow.map(item => {
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
        // --- Stats logic variables ---
        const isCraftable = Array.isArray(item.craftingMaterial) && item.craftingMaterial.length > 0;
        const isArmor = (item.category && (Array.isArray(item.category) ? item.category.includes('Armor') : item.category === 'Armor'));
        const isWeapon = (item.category && (Array.isArray(item.category) ? item.category.includes('Weapon') : item.category === 'Weapon'));
        const isRecipe = (item.category && (Array.isArray(item.category) ? item.category.includes('Recipe') : item.category === 'Recipe'));
        // --- Modern Card Layout ---
        return `
        <div class="model-details-item item-card modern-item-card" data-item-name="${item.itemName}" onclick="this.classList.toggle('flipped')">
            <div class="item-header-row modern-item-header">
                <div class="item-image-card">
                    <img src="${item.image && item.image !== 'No Image' ? item.image : '/images/ankleicon.png'}" alt="${item.itemName}" class="item-image modern-item-image">
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
                    <div class="item-detail-row modern-item-detail-row"><strong>Buy:</strong> <span>${item.buyPrice ?? 0}</span> <strong style="margin-left:1.2em;">Sell:</strong> <span>${item.sellPrice ?? 0}</span></div>
                </div>
            </div>
            <div class="item-section modern-item-section">
                <div class="item-section-label modern-item-section-label"><i class="fas fa-route"></i> Sources</div>
                <div class="item-tag-list modern-item-tag-list">${obtainTags && obtainTags.filter(Boolean).length ? renderTags(obtainTags) : '<span class="item-tag">None</span>'}</div>
            </div>
            <div class="item-section modern-item-section">
                <div class="item-section-label modern-item-section-label"><i class="fas fa-map-marker-alt"></i> Locations</div>
                <div class="item-tag-list modern-item-tag-list">${locationsTags && locationsTags.filter(Boolean).length ? renderLocationTags(locationsTags) : '<span class="item-tag">None</span>'}</div>
            </div>
            <div class="item-section modern-item-section">
                <div class="item-section-label modern-item-section-label"><i class="fas fa-user"></i> Jobs</div>
                <div class="item-tag-list modern-item-tag-list">${jobsTags && jobsTags.filter(Boolean).length ? renderTags(jobsTags) : '<span class="item-tag">None</span>'}</div>
            </div>
            <div class="item-section modern-item-section">
                <div class="item-section-label modern-item-section-label"><i class="fas fa-tools"></i> Crafting Materials</div>
                <div class="item-crafting-list modern-item-crafting-list">
                    ${craftingMaterials ? craftingMaterials : '<div class="item-crafting-row"><span class="item-tag">Not Craftable</span></div>'}
                </div>
            </div>
            <div class="item-section modern-item-section">
                <div class="item-section-label modern-item-section-label"><i class="fas fa-cloud-sun"></i> Special Weather</div>
                <div class="item-tag-list modern-item-tag-list">${weatherTags ? weatherTags : '<span class="item-tag">None</span>'}</div>
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
    
    updateItemPagination(items, page);

    // Only modify the inventory loading section
    itemsToShow.forEach(item => {
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
            
            // Check cache first
            const cachedData = inventoryCache.get(item.itemName);
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
                // Cache the result
                inventoryCache.set(item.itemName, inventoryHTML);
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
}

// ------------------- Function: renderActivityList -------------------
// Renders the activity feed with formatted timestamps and icons
function renderActivityList(activities) {
    const container = document.querySelector('.activity-list');
    if (!container) return;

    container.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon">
                <i class="fas ${getActivityIcon(activity.type)}"></i>
            </div>
            <div class="activity-content">
                <p class="activity-text">${activity.text}</p>
                <span class="activity-time">${formatTime(activity.timestamp)}</span>
            </div>
        </div>
    `).join('');
}
// ------------------- Function: renderCharacterCards -------------------
// Renders character cards with pagination and stat bars for a dashboard
function renderCharacterCards(characters, page = 1) {
    const grid = document.getElementById('character-grid');
    if (!grid) return;

    // ------------------- No Characters Found -------------------
    // Display a message if no characters exist
    if (!characters || characters.length === 0) {
        grid.innerHTML = '<div class="character-loading">No characters found</div>';
        document.getElementById('character-pagination').innerHTML = '';
        return;
    }

    // ------------------- Pagination Setup -------------------
    // Determines which characters to show based on current page
    const charactersPerPage = 20;
    const totalPages = Math.ceil(characters.length / charactersPerPage);
    const startIndex = (page - 1) * charactersPerPage;
    const endIndex = Math.min(startIndex + charactersPerPage, characters.length);
    const charactersToShow = characters.slice(startIndex, endIndex);

    // ------------------- Update Pagination UI -------------------
    updatePagination(page, totalPages, characters);

    // ------------------- Render Character Cards -------------------
    grid.innerHTML = charactersToShow.map(character => {

        // ------------------- Character Status Setup -------------------
        // Handles status badge and visual card styling for KO/Blighted
        let statusClass = '';
        let statusText = '';
        let cardStatusClass = '';

        if (character.blighted) {
            statusClass = 'status-blighted';
            statusText = 'Blighted';
            cardStatusClass = 'blighted';
        } else if (character.ko) {
            statusClass = 'status-ko';
            statusText = 'KO\'d';
            cardStatusClass = 'ko';
        }

        // ------------------- Stat Percentage Calculation -------------------
        // Used to render bar fill for hearts, stamina, attack, and defense
        const heartPercent = character.currentHearts / character.maxHearts * 100;
        const staminaPercent = character.currentStamina / character.maxStamina * 100;
        const attackPercent = Math.min((character.attack / 10) * 100, 100);   // Max attack = 10
        const defensePercent = Math.min((character.defense / 15) * 100, 100); // Max defense = 15

        // ------------------- Return Character Card HTML -------------------
        return `
            <div class="character-card ${cardStatusClass}">
                <div class="character-header">

                    ${character.homeVillage ? `
                        <div class="village-crest">
                            <img 
                                src="${getVillageCrestUrl(character.homeVillage)}" 
                                alt="${character.homeVillage} Crest"
                                class="village-crest-img"
                            >
                        </div>
                    ` : ''}

                    <div class="character-avatar-container">
                        <img 
                            src="${formatCharacterIconUrl(character.icon)}" 
                            alt="${character.name}" 
                            class="character-avatar" 
                            onload="console.log('Image loaded successfully:', this.src)" 
                            onerror="console.error('Failed to load image:', this.src); this.src=DEFAULT_ICON;"
                            crossorigin="anonymous"
                        >
                    </div>

                    <div class="character-title">
                        <h3 class="character-name">${character.name}</h3>
                        <div class="character-race-job-row">
                            ${(character.race ? character.race.charAt(0).toUpperCase() + character.race.slice(1) : '')}
                            ${character.race && character.job ? ' &bull; ' : ''}
                            ${(character.job ? character.job.charAt(0).toUpperCase() + character.job.slice(1) : '')}
                        </div>

                        ${statusText ? `
                        <div class="character-status">
                            <span class="character-status-icon ${statusClass}"></span>
                            <span class="character-status-text">${statusText}</span>
                        </div>
                        ` : ''}

                        <div class="character-links">
                            ${character.appLink ? `
                                <a href="${character.appLink}" target="_blank" class="character-link">
                                    <i class="fas fa-external-link-alt"></i> Character Sheet
                                </a>
                            ` : ''}
                            ${character.inventory ? `
                                <a href="${character.inventory}" target="_blank" class="character-link">
                                    <i class="fas fa-backpack"></i> Inventory
                                </a>
                            ` : ''}
                            ${character.shopLink ? `
                                <a href="${character.shopLink}" target="_blank" class="character-link">
                                    <i class="fas fa-store"></i> Shop
                                </a>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div class="character-content">

                    // ------------------- Stat Bars -------------------
                    <div class="character-stat-row">
                        <div class="stat-label">HEARTS</div>
                        <div class="stat-value">${character.currentHearts}/${character.maxHearts}</div>
                        <div class="stat-bar-container">
                            <div class="stat-bar heart-bar" style="width: ${heartPercent}%"></div>
                        </div>
                    </div>

                    <div class="character-stat-row">
                        <div class="stat-label">STAMINA</div>
                        <div class="stat-value">${character.currentStamina}/${character.maxStamina}</div>
                        <div class="stat-bar-container">
                            <div class="stat-bar stamina-bar" style="width: ${staminaPercent}%"></div>
                        </div>
                    </div>

                    <div class="character-stat-row">
                        <div class="stat-label">ATTACK</div>
                        <div class="stat-value">${character.attack || 0}</div>
                        <div class="stat-bar-container">
                            <div class="stat-bar attack-bar" style="width: ${attackPercent}%"></div>
                        </div>
                    </div>

                    <div class="character-stat-row">
                        <div class="stat-label">DEFENSE</div>
                        <div class="stat-value">${character.defense || 0}</div>
                        <div class="stat-bar-container">
                            <div class="stat-bar defense-bar" style="width: ${defensePercent}%"></div>
                        </div>
                    </div>

                    // ------------------- Basic Info Section -------------------
                    <div class="character-section">
                        <h4 class="character-section-title">Basic Info</h4>
                        <div class="character-detail-list">
                            <div class="character-detail">
                                <div class="character-detail-label">Home Village</div>
                                <div class="character-detail-value">${character.homeVillage ? character.homeVillage.charAt(0).toUpperCase() + character.homeVillage.slice(1) : 'Unknown'}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Current Village</div>
                                <div class="character-detail-value">${character.currentVillage ? character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1) : (character.homeVillage ? character.homeVillage.charAt(0).toUpperCase() + character.homeVillage.slice(1) : 'Unknown')}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Pronouns</div>
                                <div class="character-detail-value">${character.pronouns ? renderMarkdownLinks(character.pronouns.charAt(0).toUpperCase() + character.pronouns.slice(1)) : 'Not specified'}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Birthday</div>
                                <div class="character-detail-value">${character.birthday || 'Not specified'}</div>
                            </div>
                            ${character.age ? `
                            <div class="character-detail">
                                <div class="character-detail-label">Age</div>
                                <div class="character-detail-value">${character.age}</div>
                            </div>` : ''}
                            ${character.height ? `
                            <div class="character-detail">
                                <div class="character-detail-label">Height</div>
                                <div class="character-detail-value">${character.height} cm | ${convertCmToFeetInches(character.height)}</div>
                            </div>` : ''}
                            <div class="character-detail">
                                <div class="character-detail-label">Spirit Orbs</div>
                                <div class="character-detail-value">${character.spiritOrbs || 0}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Job Changed</div>
                                <div class="character-detail-value">${formatPrettyDate(character.jobDateChanged)}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Last Stamina Usage</div>
                                <div class="character-detail-value">${formatPrettyDate(character.lastStaminaUsage)}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Blighted</div>
                                <div class="character-detail-value">${character.blighted ? 'Yes' : 'No'}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Blight Stage</div>
                                <div class="character-detail-value">${character.blightStage ?? 0}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Debuff</div>
                                <div class="character-detail-value">
                                    ${(character.debuff && character.debuff.active) ? 
                                        `Debuffed${character.debuff.endDate ? ' | Ends ' + (new Date(character.debuff.endDate)).toLocaleDateString() : ''}` : 
                                        'Not Debuffed'}
                                </div>
                            </div>
                        </div>
                    </div>

                    // ------------------- Gear Section -------------------
                    <div class="character-section">
                        <h4 class="character-section-title">Gear</h4>
                        <div class="character-detail-list">
                            <div class="character-detail">
                                <div class="character-detail-label">Weapon</div>
                                <div class="character-detail-value">${character.gearWeapon?.name ? `${character.gearWeapon.name} | ${getGearStat(character.gearWeapon, 'modifierHearts')}` : 'None'}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Shield</div>
                                <div class="character-detail-value">${character.gearShield?.name ? `${character.gearShield.name} | ${getGearStat(character.gearShield, 'modifierHearts')}` : 'None'}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Head</div>
                                <div class="character-detail-value">${character.gearArmor?.head?.name ? `${character.gearArmor.head.name} | ${getGearStat(character.gearArmor.head, 'modifierHearts')}` : 'None'}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Chest</div>
                                <div class="character-detail-value">${character.gearArmor?.chest?.name ? `${character.gearArmor.chest.name} | ${getGearStat(character.gearArmor.chest, 'modifierHearts')}` : 'None'}</div>
                            </div>
                            <div class="character-detail">
                                <div class="character-detail-label">Legs</div>
                                <div class="character-detail-value">${character.gearArmor?.legs?.name ? `${character.gearArmor.legs.name} | ${getGearStat(character.gearArmor.legs, 'modifierHearts')}` : 'None'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ------------------- Function: populateInventoryFilterOptions -------------------
// Populates inventory filters with unique characters, categories, and types
function populateInventoryFilterOptions(inventories) {
    if (!Array.isArray(inventories)) {
        console.error('populateInventoryFilterOptions: inventories is not an array');
        return;
    }

    const characters = [...new Set(inventories.map(inv => inv?.characterId?.name).filter(Boolean))].sort();
    const categories = [...new Set(inventories.map(inv => inv?.category).filter(Boolean))].sort();
    const types = [...new Set(inventories.map(inv => inv?.type).filter(Boolean))].sort();

    populateSelect('filter-character', ['all', ...characters]);
    populateSelect('filter-category', ['all', ...categories]);
    populateSelect('filter-type', ['all', ...types]);
}


// ------------------- Function: setupInventoryFilters -------------------
// Sets up inventory filter inputs, search, sort, and clear handling
function setupInventoryFilters(inventories) {
    const searchInput = document.getElementById('inventory-search-input');
    const characterFilter = document.getElementById('filter-character');
    const categoryFilter = document.getElementById('filter-category');
    const typeFilter = document.getElementById('filter-type');
    const sortSelect = document.getElementById('sort-inventory-by');
    const clearButton = document.getElementById('clear-inventory-filters');

    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const selectedCharacter = characterFilter.value;
        const selectedCategory = categoryFilter.value;
        const selectedType = typeFilter.value;
        const sortBy = sortSelect.value;

        let filtered = inventories.filter(inventory => {
            const matchesSearch = inventory.itemName.toLowerCase().includes(searchTerm) ||
                                  (inventory.characterId?.name || '').toLowerCase().includes(searchTerm);
            const matchesCharacter = selectedCharacter === 'all' || inventory.characterId?.name === selectedCharacter;
            const matchesCategory = selectedCategory === 'all' || inventory.category === selectedCategory;
            const matchesType = selectedType === 'all' || inventory.type === selectedType;

            return matchesSearch && matchesCharacter && matchesCategory && matchesType;
        });

        // Sorting
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'character-asc': return (a.characterId?.name || '').localeCompare(b.characterId?.name || '');
                case 'character-desc': return (b.characterId?.name || '').localeCompare(a.characterId?.name || '');
                case 'item-asc': return a.itemName.localeCompare(b.itemName);
                case 'item-desc': return b.itemName.localeCompare(a.itemName);
                case 'quantity-asc': return a.quantity - b.quantity;
                case 'quantity-desc': return b.quantity - a.quantity;
                default: return 0;
            }
        });

        renderInventoryItems(filtered);
        updateInventoryPagination(filtered, 1);
    }

    searchInput.addEventListener('input', applyFilters);
    characterFilter.addEventListener('change', applyFilters);
    categoryFilter.addEventListener('change', applyFilters);
    typeFilter.addEventListener('change', applyFilters);
    sortSelect.addEventListener('change', applyFilters);

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        characterFilter.value = 'all';
        categoryFilter.value = 'all';
        typeFilter.value = 'all';
        sortSelect.value = 'character-asc';
        applyFilters();
    });
}


// ------------------- Function: populateItemFilterOptions -------------------
// Populates all item filter dropdowns using distinct values from items
function populateItemFilterOptions(items) {
    if (!items || items.length === 0) return;

    const categorySet = new Set();
    const typeSet = new Set();
    const locationSet = new Set();
    const jobSet = new Set();
    const sourceSet = new Set();

    items.forEach(i => {
        if (i.category) {
            Array.isArray(i.category) ? i.category.forEach(c => categorySet.add(c)) : categorySet.add(i.category);
        }

        if (i.recipeTag && i.recipeTag.some(tag => tag !== '#Not Craftable')) {
            categorySet.add('Recipe');
        }

        (i.type || []).forEach(t => typeSet.add(t.toLowerCase()));

        (i.locationsTags || i.locations || []).forEach(l => {
            l.split(/(?=[A-Z])/).forEach(part => {
                if (part.trim()) locationSet.add(part.trim());
            });
        });

        (i.allJobsTags || i.jobs || []).forEach(j => {
            if (j && j.trim()) jobSet.add(j.trim());
        });

        const itemSources = i.obtainTags || i.obtain || [];
        (Array.isArray(itemSources) ? itemSources : [itemSources]).forEach(s => {
            if (s && s.trim()) sourceSet.add(s.trim());
        });
    });

    const categories = Array.from(categorySet).sort();
    const types = Array.from(typeSet).map(t => t.charAt(0).toUpperCase() + t.slice(1)).sort();
    const locationOptions = Array.from(locationSet).sort();
    const jobOptions = Array.from(jobSet).sort();
    const sourceOptions = Array.from(sourceSet).sort();

    const populateSelect = (selectId, options) => {
        const select = document.getElementById(selectId);
        if (select) {
            select.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.toLowerCase();
                option.textContent = opt;
                select.appendChild(option);
            });
        }
    };

    populateSelect('filter-category', categories);
    populateSelect('filter-type', types);
    populateSelect('filter-location', locationOptions);
    populateSelect('filter-job', jobOptions);
    populateSelect('filter-source', sourceOptions);
}


// ------------------- Function: setupItemFilters -------------------
// Sets up item search, filtering, sorting, and clear/reset behavior
function setupItemFilters(items) {
    const searchInput = document.getElementById('item-search-input');
    const catSelect = document.getElementById('filter-category');
    const typeSelect = document.getElementById('filter-type');
    const locationSelect = document.getElementById('filter-location');
    const jobSelect = document.getElementById('filter-job');
    const sourceSelect = document.getElementById('filter-source');
    const sortSelect = document.getElementById('sort-item-by');
    const clearBtn = document.getElementById('clear-item-filters');

    if (!searchInput || !catSelect || !typeSelect || !locationSelect || !jobSelect || !sourceSelect || !sortSelect || !clearBtn) return;

    window.filterItems = function() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const catFilter = catSelect.value;
        const typeFilter = typeSelect.value;
        const locationFilter = locationSelect.value;
        const jobFilter = jobSelect.value;
        const sourceFilter = sourceSelect.value;
        const sortBy = sortSelect.value;

        const filtered = items.filter(item => {
            const matchesSearch = searchTerm === '' || item.itemName?.toLowerCase().includes(searchTerm);
            const matchesCat = catFilter === 'all' ||
                (catFilter === 'recipe' ?
                    (item.recipeTag && item.recipeTag.some(tag => tag !== '#Not Craftable')) :
                    (item.category && (Array.isArray(item.category)
                        ? item.category.some(c => c.toLowerCase() === catFilter)
                        : item.category.toLowerCase() === catFilter)));

            const matchesType = typeFilter === 'all' || (item.type && item.type.some(t => t.toLowerCase() === typeFilter));
            const matchesLocation = locationFilter === 'all' || (item.locationsTags || item.locations || []).some(l => l.toLowerCase().includes(locationFilter));
            const matchesJob = jobFilter === 'all' || (item.allJobsTags || item.jobs || []).some(j => j.toLowerCase().includes(jobFilter));
            const matchesSource = sourceFilter === 'all' || (Array.isArray(item.obtainTags || item.obtain) ? item.obtainTags || item.obtain : [item.obtain]).some(src => src && src.toLowerCase().includes(sourceFilter));

            return matchesSearch && matchesCat && matchesType && matchesLocation && matchesJob && matchesSource;
        });

        const [field, dir] = sortBy.split('-');
        const asc = dir === 'asc';
        const sorted = [...filtered].sort((a, b) => {
            const valA = field === 'name' ? a.itemName :
                         field === 'buy' ? (a.buyPrice ?? 0) :
                         field === 'sell' ? (a.sellPrice ?? 0) :
                         field === 'type' ? a.type?.[0] || '' :
                         field === 'category' ? a.category?.[0] || '' : '';
            const valB = field === 'name' ? b.itemName :
                         field === 'buy' ? (b.buyPrice ?? 0) :
                         field === 'sell' ? (b.sellPrice ?? 0) :
                         field === 'type' ? b.type?.[0] || '' :
                         field === 'category' ? b.category?.[0] || '' : '';
            return asc
                ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
                : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
        });

        const resultsInfo = document.querySelector('.item-results-info p');
        if (resultsInfo) {
            resultsInfo.textContent = `Showing ${Math.min(20, sorted.length)} of ${sorted.length} items (page 1)`;
        }

        renderItemCards(sorted, 1);
        updateItemPagination(sorted, 1);
    };

    searchInput.addEventListener('input', filterItems);
    catSelect.addEventListener('change', filterItems);
    typeSelect.addEventListener('change', filterItems);
    locationSelect.addEventListener('change', filterItems);
    jobSelect.addEventListener('change', filterItems);
    sourceSelect.addEventListener('change', filterItems);
    sortSelect.addEventListener('change', filterItems);

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        catSelect.value = 'all';
        typeSelect.value = 'all';
        locationSelect.value = 'all';
        jobSelect.value = 'all';
        sourceSelect.value = 'all';
        sortSelect.value = 'name-asc';
        renderItemCards(items, 1);
        updateItemPagination(items, 1);
        const resultsInfo = document.querySelector('.item-results-info p');
        if (resultsInfo) {
            resultsInfo.textContent = `Showing 1-${Math.min(20, items.length)} of ${items.length} items (page 1)`;
        }
    });
}


// ------------------- Function: populateFilterOptions -------------------
// Populates job and race dropdowns based on provided characters
function populateFilterOptions(characters) {
    if (!characters || characters.length === 0) return;

    const jobMap = new Map();
    characters.forEach(c => {
        if (c.job) {
            const lower = c.job.toLowerCase();
            if (!jobMap.has(lower)) jobMap.set(lower, c.job);
        }
    });
    const jobs = Array.from(jobMap.values()).map(j => j.charAt(0).toUpperCase() + j.slice(1).toLowerCase()).sort();

    const raceSet = new Set();
    characters.forEach(c => {
        if (c.race) raceSet.add(c.race.toLowerCase());
    });
    const races = Array.from(raceSet).map(r => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()).sort();

    const jobSelect = document.getElementById('filter-job');
    if (jobSelect) {
        jobSelect.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());
        jobs.forEach(job => {
            const option = document.createElement('option');
            option.value = job.toLowerCase();
            option.textContent = job;
            jobSelect.appendChild(option);
        });
    }

    const raceSelect = document.getElementById('filter-race');
    if (raceSelect) {
        raceSelect.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());
        races.forEach(race => {
            const option = document.createElement('option');
            option.value = race.toLowerCase();
            option.textContent = race;
            raceSelect.appendChild(option);
        });
    }

    initializeCustomSelects();
}


// ------------------- Function: setupCharacterFilters -------------------
// Sets up character search, filters, sorting, and reset behavior
function setupCharacterFilters(characters) {
    const searchInput = document.getElementById('character-search-input');
    const jobSelect = document.getElementById('filter-job');
    const raceSelect = document.getElementById('filter-race');
    const villageSelect = document.getElementById('filter-village');
    const sortSelect = document.getElementById('sort-by');
    const clearFiltersBtn = document.getElementById('clear-filters');

    if (!searchInput || !jobSelect || !raceSelect || !villageSelect || !sortSelect || !clearFiltersBtn) return;

    window.filterCharacters = function() {
        const searchTerm = searchInput.value.toLowerCase();
        const jobFilter = jobSelect.value;
        const raceFilter = raceSelect.value;
        const villageFilter = villageSelect.value;
        const sortBy = sortSelect.value;

        const filteredCharacters = characters.filter(character => {
            const matchesSearch = searchTerm === '' ||
                character.name?.toLowerCase().includes(searchTerm) ||
                character.race?.toLowerCase().includes(searchTerm) ||
                character.job?.toLowerCase().includes(searchTerm);

            const matchesJob = jobFilter === 'all' || character.job?.toLowerCase() === jobFilter;
            const matchesRace = raceFilter === 'all' || character.race?.toLowerCase() === raceFilter;
            const matchesVillage = villageFilter === 'all' || character.homeVillage?.toLowerCase() === villageFilter;

            return matchesSearch && matchesJob && matchesRace && matchesVillage;
        });

        const sortedCharacters = [...filteredCharacters].sort((a, b) => {
            const [field, direction] = sortBy.split('-');
            const isAsc = direction === 'asc';
            const valA = a[field] ?? '';
            const valB = b[field] ?? '';

            return isAsc
                ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
                : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
        });

        const resultsInfo = document.querySelector('.character-results-info p');
        if (resultsInfo) {
            resultsInfo.textContent = `Showing ${sortedCharacters.length} of ${characters.length} characters`;
        }

        renderCharacterCards(sortedCharacters, 1);
    };

    searchInput.addEventListener('input', filterCharacters);
    jobSelect.addEventListener('change', filterCharacters);
    raceSelect.addEventListener('change', filterCharacters);
    villageSelect.addEventListener('change', filterCharacters);
    sortSelect.addEventListener('change', filterCharacters);

    clearFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        jobSelect.value = 'all';
        raceSelect.value = 'all';
        villageSelect.value = 'all';
        sortSelect.value = 'name-asc';
        renderCharacterCards(characters, 1);
    });
}


// ------------------- Function: updatePagination -------------------
// Updates character pagination controls and renders current page
function updatePagination(currentPage, totalPages, characters) {
    const paginationContainer = document.getElementById('character-pagination');
    if (!paginationContainer) return;

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '';

    // Previous button
    paginationHTML += `
        <button class="pagination-button ${currentPage === 1 ? 'disabled' : ''}" 
                ${currentPage === 1 ? 'disabled' : ''} 
                data-page="${currentPage - 1}">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    // Page buttons
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        paginationHTML += `
            <button class="pagination-button" data-page="1">1</button>
            ${startPage > 2 ? '<span class="pagination-ellipsis">...</span>' : ''}
        `;
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="pagination-button ${i === currentPage ? 'active' : ''}" 
                    data-page="${i}">${i}</button>
        `;
    }

    if (endPage < totalPages) {
        paginationHTML += `
            ${endPage < totalPages - 1 ? '<span class="pagination-ellipsis">...</span>' : ''}
            <button class="pagination-button" data-page="${totalPages}">${totalPages}</button>
        `;
    }

    // Next button
    paginationHTML += `
        <button class="pagination-button ${currentPage === totalPages ? 'disabled' : ''}" 
                ${currentPage === totalPages ? 'disabled' : ''} 
                data-page="${currentPage + 1}">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    paginationContainer.innerHTML = paginationHTML;

    // Attach click handlers
    document.querySelectorAll('.pagination-button').forEach(button => {
        if (!button.disabled) {
            button.addEventListener('click', () => {
                const page = parseInt(button.dataset.page);
                renderCharacterCards(characters, page);
            });
        }
    });
}


// ------------------- Function: updateItemPagination -------------------
// Updates item pagination controls and renders current page
function updateItemPagination(items, currentPage) {
    const itemsPerPage = 20;
    const totalPages = Math.ceil(items.length / itemsPerPage);
    const paginationContainer = document.getElementById('item-pagination');
    if (!paginationContainer) return;

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '';

    // Previous button
    paginationHTML += `
        <button class="pagination-button ${currentPage === 1 ? 'disabled' : ''}" 
                ${currentPage === 1 ? 'disabled' : ''} 
                data-page="${currentPage - 1}">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        paginationHTML += `
            <button class="pagination-button" data-page="1">1</button>
            ${startPage > 2 ? '<span class="pagination-ellipsis">...</span>' : ''}
        `;
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="pagination-button ${i === currentPage ? 'active' : ''}" 
                    data-page="${i}">${i}</button>
        `;
    }

    if (endPage < totalPages) {
        paginationHTML += `
            ${endPage < totalPages - 1 ? '<span class="pagination-ellipsis">...</span>' : ''}
            <button class="pagination-button" data-page="${totalPages}">${totalPages}</button>
        `;
    }

    // Next button
    paginationHTML += `
        <button class="pagination-button ${currentPage === totalPages ? 'disabled' : ''}" 
                ${currentPage === totalPages ? 'disabled' : ''} 
                data-page="${currentPage + 1}">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    paginationContainer.innerHTML = paginationHTML;

    // Attach click handlers
    paginationContainer.querySelectorAll('.pagination-button').forEach(button => {
        if (!button.disabled && !button.classList.contains('active')) {
            button.addEventListener('click', () => {
                const page = parseInt(button.dataset.page);
                renderItemCards(items, page);
                updateItemPagination(items, page);

                // Update results info
                const resultsInfo = document.querySelector('.item-results-info p');
                if (resultsInfo) {
                    const start = (page - 1) * itemsPerPage + 1;
                    const end = Math.min(page * itemsPerPage, items.length);
                    resultsInfo.textContent = `Showing ${start}-${end} of ${items.length} items (page ${page})`;
                }

                document.getElementById('item-grid').scrollIntoView({ behavior: 'smooth' });
            });
        }
    });

    // Initial results info update
    const resultsInfo = document.querySelector('.item-results-info p');
    if (resultsInfo) {
        const start = (currentPage - 1) * itemsPerPage + 1;
        const end = Math.min(currentPage * itemsPerPage, items.length);
        resultsInfo.textContent = `Showing ${start}-${end} of ${items.length} items (page ${currentPage})`;
    }
}


// ------------------- Function: updateInventoryPagination -------------------
// Updates inventory pagination controls and renders current page
function updateInventoryPagination(inventories, currentPage) {
    const paginationContainer = document.getElementById('inventory-pagination');
    if (!paginationContainer) return;

    const itemsPerPage = 12;
    const totalPages = Math.ceil(inventories.length / itemsPerPage);

    let paginationHTML = '';

    // Previous button
    paginationHTML += `
        <button class="pagination-button ${currentPage === 1 ? 'disabled' : ''}" 
                ${currentPage === 1 ? 'disabled' : ''} 
                data-page="${currentPage - 1}">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button class="pagination-button ${i === currentPage ? 'active' : ''}" 
                        data-page="${i}">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += '<span class="pagination-ellipsis">...</span>';
        }
    }

    // Next button
    paginationHTML += `
        <button class="pagination-button ${currentPage === totalPages ? 'disabled' : ''}" 
                ${currentPage === totalPages ? 'disabled' : ''} 
                data-page="${currentPage + 1}">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    paginationContainer.innerHTML = paginationHTML;

    paginationContainer.querySelectorAll('.pagination-button:not(.disabled)').forEach(button => {
        button.addEventListener('click', () => {
            const page = parseInt(button.dataset.page);
            renderInventoryItems(inventories, page);
            updateInventoryPagination(inventories, page);
        });
    });
}


// ------------------- Function: updateUserInfo -------------------
// Updates UI elements with authenticated user data
function updateUserInfo(user) {
    if (USER_AVATAR) {
        USER_AVATAR.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
        USER_AVATAR.alt = `${user.username}'s avatar`;
    }
    if (USERNAME) {
        USERNAME.textContent = user.username;
    }
}


// ------------------- Function: loadDashboardData -------------------
// Loads activity feed and bot statistics for dashboard cards
async function loadDashboardData() {
    try {
        const [activities, rootsofthewildData, tinglebotData] = await Promise.all([
            fetch('/api/activities').then(res => res.json()),
            fetch('/api/rootsofthewild/stats').then(res => res.json()),
            fetch('/api/tinglebot/stats').then(res => res.json())
        ]);

        renderActivityList(activities);
        updateRootsOfRootsOfTheWildStats(rootsofthewildData);
        updateTinglebotStats(tinglebotData);
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        // Optionally: display an error UI element
    }
}


// ------------------- Function: showLoadingState -------------------
// Shows the loading spinner inside the inventory container
function showLoadingState() {
    const container = document.querySelector('.inventory-container');
    if (!container) return;

    container.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading inventory data...</p>
        </div>
    `;
}

// ------------------- Function: hideLoadingState -------------------
// Hides the inventory loading spinner
function hideLoadingState() {
    const loadingState = document.querySelector('.loading-state');
    if (loadingState) {
        loadingState.remove();
    }
}

// ------------------- Function: loadInventory -------------------
// Loads inventory data stream and renders it when complete
async function loadInventory() {
    const modelDetailsData = document.getElementById('model-details-data');
    const loadingState = document.getElementById('inventory-loading-state');
    const errorState = document.getElementById('inventory-error-state');

    loadingState.style.display = 'flex';
    errorState.style.display = 'none';
    modelDetailsData.innerHTML = '';

    try {
        const response = await fetch('/api/models/inventory');
        const reader = response.body.getReader();
        let result = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            result += chunk;

            try {
                const data = JSON.parse(result);

                if (data.status === 'loading') {
                    if (data.progress !== undefined) {
                        const loadingText = loadingState.querySelector('p');
                        if (loadingText) {
                            loadingText.textContent = `Loading inventory data... ${data.progress}%`;
                        }
                    }
                    continue;
                } else if (data.status === 'complete') {
                    loadingState.style.display = 'none';
                    renderInventoryItems(data.data);
                    break;
                } else if (data.status === 'error') {
                    throw new Error(data.error || 'Failed to load inventory data');
                }
            } catch {
                continue; // Handle partial JSON reads gracefully
            }
        }
    } catch (error) {
        console.error('Error loading inventory:', error);
        loadingState.style.display = 'none';
        errorState.style.display = 'flex';
    }
}

// ------------------- Function: loadItems -------------------
// Loads items, initializes filters, and paginates the display
async function loadItems() {
    try {
        const response = await fetch('/api/models/item');
        const data = await response.json();

        window.allItems = data.data;

        populateItemFilterOptions(window.allItems);
        setupItemFilters(window.allItems);
        renderItemCards(window.allItems.slice(0, 20));
        updateItemPagination(window.allItems, 1);

        const resultsInfo = document.querySelector('.item-results-info p');
        if (resultsInfo) {
            resultsInfo.textContent = `Showing ${Math.min(20, window.allItems.length)} of ${window.allItems.length} items (page 1)`;
        }
    } catch (error) {
        console.error('Error loading items:', error);
    }
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

// ------------------- Function: loadStatsPage -------------------
// Fetches and renders character statistics and distribution charts
async function loadStatsPage() {
    try {
        const res = await fetch('/api/stats/characters');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const data = await res.json();
        if (!data) throw new Error('No data received');

        const totalCard = document.getElementById('stats-total-characters');
        const totalCardHeader = totalCard.closest('.stats-card')?.querySelector('h3');
        if (totalCardHeader) totalCardHeader.textContent = 'Character Stats';
        totalCard.textContent = '';

        const totalCardParent = totalCard.closest('.stats-card');
        if (totalCardParent) {
            let extraStats = totalCardParent.querySelector('.extra-stats');
            if (extraStats) extraStats.remove();

            extraStats = document.createElement('div');
            extraStats.className = 'extra-stats';
            extraStats.style.marginTop = '1.5rem';
            extraStats.innerHTML = `
                <ul style="list-style:none; padding:0; margin:0; color:#ccc; font-size:1.05rem;">
                    <li><strong>Total Characters:</strong> ${data.totalCharacters || 0}</li>
                    <li><strong>KO'd:</strong> ${data.kodCount || 0}</li>
                    <li><strong>Blighted:</strong> ${data.blightedCount || 0}</li>
                    <li><strong>Most Stamina:</strong> ${(data.mostStaminaChar?.names?.join(', ') || '—')} (${data.mostStaminaChar?.value || 0})</li>
                    <li><strong>Most Hearts:</strong> ${(data.mostHeartsChar?.names?.join(', ') || '—')} (${data.mostHeartsChar?.value || 0})</li>
                    <li><strong>Most Spirit Orbs:</strong> ${(data.mostOrbsChar?.names?.join(', ') || '—')} (${data.mostOrbsChar?.value || 0})</li>
                </ul>
                <div style="margin-top:1.2rem;">
                    <strong>Upcoming Birthdays:</strong>
                    <ul style="list-style:none; padding:0; margin:0; color:#ccc;">
                        ${(data.upcomingBirthdays || []).length
                            ? data.upcomingBirthdays.map(b => `<li>${b.name} <span style='color:#aaa;'>(${b.birthday})</span></li>`).join('')
                            : '<li>None in next 30 days</li>'
                        }
                    </ul>
                </div>
                <div style="margin-top:1.2rem;">
                    <strong>Visiting:</strong>
                    <ul style="list-style:none; padding:0; margin:0; color:#ccc;">
                        <li>Inariko: ${data.visitingCounts?.inariko || 0}</li>
                        <li>Rudania: ${data.visitingCounts?.rudania || 0}</li>
                        <li>Vhintl: ${data.visitingCounts?.vhintl || 0}</li>
                    </ul>
                </div>
            `;
            totalCardParent.appendChild(extraStats);
        }

        if (villageChart) villageChart.destroy();
        if (raceChart) raceChart.destroy();
        if (jobChart) jobChart.destroy();

        // --- Chart: Village Distribution ---
        const villageCtx = document.getElementById('villageDistributionChart').getContext('2d');
        const villageData = data.charactersPerVillage || {};
        villageChart = createBarChart(villageCtx, villageData, {
            labelTransform: v => v.charAt(0).toUpperCase() + v.slice(1),
            colors: ['#E57373', '#6A8ED6', '#6FBF73']
        });

        // --- Chart: Race Distribution ---
        const raceCtx = document.getElementById('raceDistributionChart').getContext('2d');
        const raceEntries = Object.entries(data.charactersPerRace || {}).sort((a, b) => a[0].localeCompare(b[0]));
        const raceData = Object.fromEntries(raceEntries);
        raceChart = createBarChart(raceCtx, raceData, {
            colors: [
                '#FF6666', '#FFB347', '#FFEB3B', '#7ED957', '#33D6C3', '#5CAEFF',
                '#8F6BF7', '#F46CBF', '#66D99F', '#FFCC33', '#999999'
            ]
        });

        // --- Chart: Job Distribution ---
        const jobCtx = document.getElementById('jobDistributionChart').getContext('2d');
        const jobEntries = Object.entries(data.charactersPerJob || {})
            .filter(([job, count]) => job && typeof count === 'number' && count > 0)
            .sort((a, b) => a[0].localeCompare(b[0]));
        const jobData = Object.fromEntries(jobEntries);

        if (Object.keys(jobData).length === 0) {
            document.querySelector('#jobDistributionChart').parentElement.innerHTML =
                '<div style="text-align: center; color: #FFFFFF; padding: 20px;">No job data available</div>';
        } else {
            jobChart = createBarChart(jobCtx, jobData, {
                colors: [
                    '#FF6666', '#FFB347', '#FFEB3B', '#7ED957', '#33D6C3',
                    '#5CAEFF', '#8F6BF7', '#F46CBF', '#66D99F', '#FFCC33',
                    '#999999', '#C084F5', '#4EE6A6', '#FFA07A', '#7F8CFF', '#FF7F7F'
                ],
                yMax: 15
            });
        }
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}
        document.getElementById('stats-total-characters').textContent = 'Error';
}