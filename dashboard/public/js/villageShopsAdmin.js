// ============================================================================
// Village Shops Admin Management
// Handles CRUD operations for village shop items in the admin area
// ============================================================================

class VillageShopsAdmin {
  constructor() {
    console.log('VillageShopsAdmin constructor called'); // Debug log
    
    this.currentPage = 1;
    this.totalPages = 1;
    this.currentFilters = {
      search: '',
      category: ''
    };
    this.editingItem = null;
    this.availableItems = [];
    this.selectedSuggestionIndex = -1;
    this.initialDataRequested = false;
    
    this.initializeEventListeners();
    this.maybeAutoLoadSectionData();
    
    console.log('VillageShopsAdmin initialized'); // Debug log
  }

  initializeEventListeners() {
    // Navigation buttons
    document.getElementById('village-shops-manager-btn')?.addEventListener('click', () => {
      this.showVillageShopsManagement();
    });

    document.getElementById('back-to-admin-from-shops-btn')?.addEventListener('click', () => {
      this.hideVillageShopsManagement();
    });

    // Search and filter controls
    document.getElementById('shops-search-btn')?.addEventListener('click', () => {
      this.handleSearch();
    });

    document.getElementById('shops-search-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleSearch();
      }
    });

    document.getElementById('shops-category-filter')?.addEventListener('change', () => {
      this.handleFilterChange();
    });

    // Add new item button
    document.getElementById('add-shop-item-btn')?.addEventListener('click', () => {
      this.showEditModal();
    });

    // Pagination
    document.getElementById('shops-prev-page-btn')?.addEventListener('click', () => {
      this.previousPage();
    });

    document.getElementById('shops-next-page-btn')?.addEventListener('click', () => {
      this.nextPage();
    });

    // Modal controls
    document.getElementById('shop-modal-close-btn')?.addEventListener('click', () => {
      this.hideEditModal();
    });

    document.getElementById('shop-modal-cancel-btn')?.addEventListener('click', () => {
      this.hideEditModal();
    });

    document.getElementById('shop-modal-save-btn')?.addEventListener('click', () => {
      this.saveShopItem();
    });

    document.getElementById('shop-modal-delete-btn')?.addEventListener('click', () => {
      this.deleteShopItem();
    });

    // Close modal on outside click
    document.getElementById('shop-item-edit-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'shop-item-edit-modal') {
        this.hideEditModal();
      }
    });

    // Item name search functionality
    document.getElementById('shop-item-name')?.addEventListener('input', (e) => {
      this.handleItemSearch(e.target.value);
    });

    document.getElementById('shop-item-name')?.addEventListener('keydown', (e) => {
      this.handleSearchKeydown(e);
    });

    document.getElementById('shop-item-name')?.addEventListener('blur', () => {
      // Delay hiding suggestions to allow for clicks
      setTimeout(() => this.hideSuggestions(), 200);
    });
  }

  maybeAutoLoadSectionData() {
    const adminSection = document.getElementById('village-shops-management-section');
    if (adminSection && adminSection.style.display !== 'none') {
      this.requestInitialData();
      this.loadVillageShops();
    }
  }

  requestInitialData() {
    if (this.initialDataRequested) {
      return;
    }

    this.initialDataRequested = true;
    this.loadAvailableItems();
  }

  attachVillageShopsEventListeners() {
    // Add new item button
    const addBtn = document.getElementById('add-shop-item-btn');
    if (addBtn) {
      // Remove existing listener to avoid duplicates
      addBtn.replaceWith(addBtn.cloneNode(true));
      const newAddBtn = document.getElementById('add-shop-item-btn');
      newAddBtn.addEventListener('click', () => {
        console.log('Add shop item button clicked'); // Debug log
        this.showEditModal();
      });
    } else {
      console.error('Add shop item button not found');
    }

    // Search functionality
    const searchInput = document.getElementById('shops-search-input');
    if (searchInput) {
      searchInput.replaceWith(searchInput.cloneNode(true));
      const newSearchInput = document.getElementById('shops-search-input');
      newSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleSearch();
        }
      });
    }

    // Search button
    const searchBtn = document.getElementById('shops-search-btn');
    if (searchBtn) {
      searchBtn.replaceWith(searchBtn.cloneNode(true));
      const newSearchBtn = document.getElementById('shops-search-btn');
      newSearchBtn.addEventListener('click', () => {
        this.handleSearch();
      });
    }

    // Category filter
    const categoryFilter = document.getElementById('shops-category-filter');
    if (categoryFilter) {
      categoryFilter.replaceWith(categoryFilter.cloneNode(true));
      const newCategoryFilter = document.getElementById('shops-category-filter');
      newCategoryFilter.addEventListener('change', () => {
        this.handleFilterChange();
      });
    }

    // Item name search functionality
    const itemNameInput = document.getElementById('shop-item-name');
    if (itemNameInput) {
      console.log('Attaching item search event listeners'); // Debug log
      itemNameInput.addEventListener('input', (e) => {
        console.log('Input event fired:', e.target.value); // Debug log
        this.handleItemSearch(e.target.value);
      });

      itemNameInput.addEventListener('keydown', (e) => {
        this.handleSearchKeydown(e);
      });

      itemNameInput.addEventListener('blur', () => {
        // Delay hiding suggestions to allow for clicks
        setTimeout(() => this.hideSuggestions(), 200);
      });
    } else {
      console.error('shop-item-name input not found when attaching listeners');
    }
  }

  showVillageShopsManagement() {
    // Hide admin tools grid
    document.querySelector('.admin-tools-grid').style.display = 'none';
    // Show village shops management section
    document.getElementById('village-shops-management-section').style.display = 'block';
    
    // Re-attach event listeners to ensure they work (in case elements weren't available before)
    this.attachVillageShopsEventListeners();
    
    // Load data only when the section is actually opened
    this.requestInitialData();
    this.loadVillageShops();
  }

  hideVillageShopsManagement() {
    // Show admin tools grid
    document.querySelector('.admin-tools-grid').style.display = 'grid';
    // Hide village shops management section
    document.getElementById('village-shops-management-section').style.display = 'none';
  }

  async loadVillageShops() {
    try {
      // Check authentication before making admin API calls
      const authResponse = await fetch('/api/user', {
        credentials: 'include'
      });
      
      if (!authResponse.ok) {
        throw new Error('Authentication required');
      }
      
      const authData = await authResponse.json();
      
      if (!authData.isAuthenticated || !authData.isAdmin) {
        console.info('VillageShopsAdmin: user missing admin privileges, skipping village shop load.');
        return;
      }
      
      this.showLoading();
      
      const params = new URLSearchParams({
        page: this.currentPage,
        limit: 20,
        search: this.currentFilters.search,
        category: this.currentFilters.category
      });

      const response = await fetch(`/api/admin/village-shops?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.renderVillageShopsTable(data.items);
      this.updatePagination(data.pagination);
      
    } catch (error) {
      console.error('Error loading village shops:', error);
      this.showError('Failed to load village shop items');
    }
  }

  renderVillageShopsTable(items) {
    const thead = document.getElementById('village-shops-table-head');
    const tbody = document.getElementById('village-shops-table-body');
    const emptyState = document.getElementById('shops-empty-state');
    const container = document.getElementById('village-shops-container');

    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
      tbody.innerHTML = this.createEmptyStateRow();
      emptyState.style.display = 'block';
      container.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    container.style.display = 'block';

    // Create header row
    const displayFields = this.getDisplayFields(items[0]);
    thead.appendChild(this.createHeaderRow(displayFields));

    // Create data rows
    items.forEach((item, index) => {
      tbody.appendChild(this.createDataRow(item, displayFields, index));
    });
  }

  getDisplayFields(item) {
    // Priority fields for village shops
    const priorityFields = ['itemName', 'category', 'buyPrice', 'sellPrice', 'stock'];
    const allFields = Object.keys(item).filter(field => field !== '_id' && field !== '__v');
    const displayFields = [];
    
    priorityFields.forEach(field => {
      if (allFields.includes(field)) displayFields.push(field);
    });
    
    allFields.forEach(field => {
      if (!displayFields.includes(field) && displayFields.length < 6) {
        displayFields.push(field);
      }
    });
    
    return displayFields;
  }

  createHeaderRow(displayFields) {
    const headerRow = document.createElement('tr');
    
    const actionsHeader = document.createElement('th');
    actionsHeader.textContent = 'Actions';
    actionsHeader.style.width = '80px';
    headerRow.appendChild(actionsHeader);
    
    displayFields.forEach(field => {
      const th = document.createElement('th');
      th.textContent = this.getFieldDisplayName(field);
      headerRow.appendChild(th);
    });
    
    return headerRow;
  }

  createDataRow(item, displayFields, index) {
    const row = document.createElement('tr');
    row.setAttribute('data-record-id', item._id);
    
    if (index % 2 === 0) row.classList.add('even-row');
    
    row.appendChild(this.createActionsCell(item));
    
    displayFields.forEach(field => {
      row.appendChild(this.createDataCell(field, item[field], item));
    });
    
    return row;
  }

  createActionsCell(item) {
    const td = document.createElement('td');
    td.style.whiteSpace = 'nowrap';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit-btn';
    editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    editBtn.title = `Edit ${item.itemName || 'shop item'}`;
    editBtn.onclick = () => this.editShopItem(item._id);
    
    td.appendChild(editBtn);
    return td;
  }

  createDataCell(field, value, item = null) {
    const td = document.createElement('td');
    td.setAttribute('data-field', field);
    
    if (typeof value === 'number') {
      td.setAttribute('data-type', 'number');
    } else if (typeof value === 'boolean') {
      td.setAttribute('data-type', 'boolean');
    }
    
    // Special handling for itemName with emoji
    if (field === 'itemName' && item && item.emoji) {
      td.innerHTML = `<div class="item-info"><span class="item-name">${value}</span><span class="item-emoji">${item.emoji}</span></div>`;
    } else {
      td.innerHTML = this.formatCellValue(field, value);
    }
    
    return td;
  }

  formatCellValue(field, value) {
    if (value === null || value === undefined) {
      return '<span style="color: rgba(203, 182, 135, 0.4); font-style: italic;">—</span>';
    }
    
    // Special formatting for village shops fields
    if (field === 'itemName') {
      // For itemName, we need to get the emoji from the full item object
      // This will be handled in the createDataCell method
      return `<div class="item-info"><span class="item-name">${value}</span></div>`;
    }
    
    if (field === 'category') {
      const category = Array.isArray(value) ? value[0] : value;
      return `<span class="category-badge">${category}</span>`;
    }
    
    if (field === 'buyPrice' || field === 'sellPrice') {
      return `<span style="font-variant-numeric: tabular-nums; color: #cbb687; font-weight: 600;">${value.toLocaleString()}</span>`;
    }
    
    if (field === 'stock') {
      const stockClass = value > 10 ? 'high' : value > 0 ? 'medium' : 'low';
      return `<span class="stock-amount ${stockClass}">${value}</span>`;
    }
    
    if (typeof value === 'object') {
      const jsonStr = JSON.stringify(value);
      const displayStr = jsonStr.length > 40 ? jsonStr.substring(0, 40) + '...' : jsonStr;
      return `<span style="font-family: 'Courier New', monospace; font-size: 0.85rem; color: rgba(203, 182, 135, 0.8);">${displayStr}</span>`;
    }
    
    if (typeof value === 'boolean') {
      const color = value ? '#49D59C' : '#dc3545';
      const icon = value ? '✓' : '✗';
      return `<span style="color: ${color}; font-weight: bold; font-size: 1.1rem;">${icon}</span>`;
    }
    
    if (typeof value === 'number') {
      return `<span style="font-variant-numeric: tabular-nums; color: #cbb687; font-weight: 600;">${value.toLocaleString()}</span>`;
    }
    
    const stringValue = String(value);
    const displayStr = stringValue.length > 50 ? stringValue.substring(0, 50) + '...' : stringValue;
    const title = stringValue.length > 50 ? stringValue : '';
    return `<span title="${title}">${displayStr}</span>`;
  }

  getFieldDisplayName(field) {
    const displayNames = {
      'itemName': 'Item Name',
      'category': 'Category',
      'buyPrice': 'Buy Price',
      'sellPrice': 'Sell Price',
      'stock': 'Stock',
      'itemRarity': 'Rarity',
      'emoji': 'Emoji',
      'createdAt': 'Created',
      'updatedAt': 'Updated'
    };
    return displayNames[field] || field.charAt(0).toUpperCase() + field.slice(1);
  }

  createEmptyStateRow() {
    return `
      <tr>
        <td colspan="7" class="loading-cell">
          <i class="fas fa-store"></i>
          <span>No village shop items found</span>
        </td>
      </tr>
    `;
  }

  getVillageFromItem(item) {
    // This is a simplified approach - you might want to add a village field to the schema
    const name = item.itemName.toLowerCase();
    if (name.includes('inariko')) return 'Inariko';
    if (name.includes('rudania')) return 'Rudania';
    if (name.includes('vhintl')) return 'Vhintl';
    return 'Unknown';
  }

  updatePagination(pagination) {
    this.currentPage = pagination.page;
    this.totalPages = pagination.pages;

    const prevBtn = document.getElementById('shops-prev-page-btn');
    const nextBtn = document.getElementById('shops-next-page-btn');
    const info = document.getElementById('shops-pagination-info');

    prevBtn.disabled = this.currentPage <= 1;
    nextBtn.disabled = this.currentPage >= this.totalPages;
    info.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
  }

  handleSearch() {
    const searchInput = document.getElementById('shops-search-input');
    this.currentFilters.search = searchInput.value;
    this.currentPage = 1;
    this.loadVillageShops();
  }

  handleFilterChange() {
    const categoryFilter = document.getElementById('shops-category-filter');
    
    this.currentFilters.category = categoryFilter.value;
    this.currentPage = 1;
    this.loadVillageShops();
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadVillageShops();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadVillageShops();
    }
  }

  showEditModal(item = null) {
    console.log('showEditModal called with item:', item); // Debug log
    
    this.editingItem = item;
    const modal = document.getElementById('shop-item-edit-modal');
    const title = document.getElementById('shop-modal-title');
    const deleteBtn = document.getElementById('shop-modal-delete-btn');

    if (!modal) {
      console.error('Modal not found: shop-item-edit-modal');
      return;
    }

    if (item) {
      title.textContent = 'Edit Shop Item';
      deleteBtn.style.display = 'inline-block';
      this.populateForm(item);
    } else {
      title.textContent = 'Add Shop Item';
      deleteBtn.style.display = 'none';
      this.clearForm();
    }

    console.log('Showing modal'); // Debug log
    modal.style.display = 'flex';
    modal.classList.add('show');
  }

  hideEditModal() {
    const modal = document.getElementById('shop-item-edit-modal');
    modal.classList.remove('show');
    modal.style.display = 'none';
    this.editingItem = null;
  }

  populateForm(item) {
    document.getElementById('shop-item-name').value = item.itemName || '';
    document.getElementById('shop-item-stock').value = item.stock || 0;
  }

  clearForm() {
    document.getElementById('shop-item-form').reset();
    this.hideSuggestions();
  }

  async saveShopItem() {
    try {
      // Check authentication before making admin API calls
      const authResponse = await fetch('/api/user', {
        credentials: 'include'
      });
      
      if (!authResponse.ok) {
        throw new Error('Authentication required');
      }
      
      const authData = await authResponse.json();
      
      if (!authData.isAuthenticated || !authData.isAdmin) {
        this.showError('Admin access required. Please log in with admin privileges.');
        return;
      }
      
      const formData = new FormData(document.getElementById('shop-item-form'));
      const data = Object.fromEntries(formData.entries());

      // Validate required fields
      if (!data.itemName || !data.itemName.trim()) {
        throw new Error('Item name is required');
      }

      if (!data.stock || parseInt(data.stock) < 0) {
        throw new Error('Stock must be a valid number (0 or greater)');
      }

      // Convert numeric fields
      data.stock = parseInt(data.stock) || 0;

      const url = this.editingItem 
        ? `/api/admin/village-shops/${this.editingItem._id}`
        : '/api/admin/village-shops';
      
      const method = this.editingItem ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save shop item');
      }

      const result = await response.json();
      console.log('Shop item saved:', result);
      
      this.hideEditModal();
      this.loadVillageShops();
      this.showSuccess(this.editingItem ? 'Shop item updated successfully!' : 'Shop item created successfully!');
      
    } catch (error) {
      console.error('Error saving shop item:', error);
      this.showError('Failed to save shop item: ' + error.message);
    }
  }

  async editShopItem(itemId) {
    try {
      // Check authentication before making admin API calls
      const authResponse = await fetch('/api/user', {
        credentials: 'include'
      });
      
      if (!authResponse.ok) {
        throw new Error('Authentication required');
      }
      
      const authData = await authResponse.json();
      
      if (!authData.isAuthenticated || !authData.isAdmin) {
        this.showError('Admin access required. Please log in with admin privileges.');
        return;
      }
      
      const response = await fetch(`/api/admin/village-shops/${itemId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch shop item');
      }

      const item = await response.json();
      this.showEditModal(item);
      
    } catch (error) {
      console.error('Error fetching shop item:', error);
      this.showError('Failed to load shop item details');
    }
  }

  confirmDeleteShopItem(itemId, itemName) {
    if (confirm(`Are you sure you want to delete "${itemName}"? This action cannot be undone.`)) {
      this.deleteShopItem(itemId);
    }
  }

  async deleteShopItem(itemId = null) {
    try {
      // Check authentication before making admin API calls
      const authResponse = await fetch('/api/user', {
        credentials: 'include'
      });
      
      if (!authResponse.ok) {
        throw new Error('Authentication required');
      }
      
      const authData = await authResponse.json();
      
      if (!authData.isAuthenticated || !authData.isAdmin) {
        this.showError('Admin access required. Please log in with admin privileges.');
        return;
      }
      
      const id = itemId || this.editingItem._id;
      
      const response = await fetch(`/api/admin/village-shops/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete shop item');
      }

      console.log('Shop item deleted');
      
      if (this.editingItem) {
        this.hideEditModal();
      }
      
      this.loadVillageShops();
      this.showSuccess('Shop item deleted successfully!');
      
    } catch (error) {
      console.error('Error deleting shop item:', error);
      this.showError('Failed to delete shop item: ' + error.message);
    }
  }

  showLoading() {
    const tbody = document.getElementById('village-shops-table-body');
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="loading-cell">
          <div class="loading-spinner"></div>
          <span>Loading village shop items...</span>
        </td>
      </tr>
    `;
  }

  async loadAvailableItems() {
    try {
      console.log('Loading available items from API...'); // Debug log
      const response = await fetch('/api/items', {
        credentials: 'include'
      });

      console.log('API response status:', response.status); // Debug log

      if (!response.ok) {
        throw new Error(`Failed to load items: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('API response data structure:', typeof data, Array.isArray(data)); // Debug log
      
      // The /api/items endpoint returns an array directly
      this.availableItems = Array.isArray(data) ? data : [];
      console.log(`Loaded ${this.availableItems.length} available items`);
      
      // Log first few items to check structure
      if (this.availableItems.length > 0) {
        console.log('First item structure:', this.availableItems[0]);
      }
    } catch (error) {
      console.error('Error loading available items:', error);
      this.availableItems = [];
    }
  }

  handleItemSearch(query) {
    console.log('handleItemSearch called with query:', query); // Debug log
    console.log('Available items count:', this.availableItems.length); // Debug log
    
    if (!query || query.length < 2) {
      this.hideSuggestions();
      return;
    }

    const filteredItems = this.availableItems.filter(item => 
      item.itemName && item.itemName.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10); // Limit to 10 suggestions

    console.log('Filtered items:', filteredItems.length); // Debug log
    this.showSuggestions(filteredItems);
  }

  showSuggestions(items) {
    const suggestionsContainer = document.getElementById('item-suggestions');
    
    if (items.length === 0) {
      this.hideSuggestions();
      return;
    }

    suggestionsContainer.innerHTML = items.map((item, index) => `
      <div class="suggestion-item" data-index="${index}" data-item-name="${item.itemName}">
        <span class="suggestion-item-name">${item.itemName}</span>
      </div>
    `).join('');

    // Add click listeners to suggestions
    suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectItem(item.dataset.itemName);
      });
    });

    suggestionsContainer.style.display = 'block';
    this.selectedSuggestionIndex = -1;
  }

  hideSuggestions() {
    const suggestionsContainer = document.getElementById('item-suggestions');
    suggestionsContainer.style.display = 'none';
    this.selectedSuggestionIndex = -1;
  }

  handleSearchKeydown(e) {
    const suggestionsContainer = document.getElementById('item-suggestions');
    const suggestions = suggestionsContainer.querySelectorAll('.suggestion-item');
    
    if (suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, suggestions.length - 1);
        this.updateSuggestionSelection(suggestions);
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, -1);
        this.updateSuggestionSelection(suggestions);
        break;
      
      case 'Enter':
        e.preventDefault();
        if (this.selectedSuggestionIndex >= 0) {
          const selectedItem = suggestions[this.selectedSuggestionIndex];
          this.selectItem(selectedItem.dataset.itemName);
        }
        break;
      
      case 'Escape':
        this.hideSuggestions();
        break;
    }
  }

  updateSuggestionSelection(suggestions) {
    suggestions.forEach((item, index) => {
      if (index === this.selectedSuggestionIndex) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }

  selectItem(itemName) {
    document.getElementById('shop-item-name').value = itemName;
    this.hideSuggestions();
    // Focus on stock input for convenience
    document.getElementById('shop-item-stock').focus();
  }

  showError(message) {
    // You can implement a toast notification system here
    alert('Error: ' + message);
  }

  showSuccess(message) {
    // You can implement a toast notification system here
    alert('Success: ' + message);
  }
}

// Initialize the village shops admin when the page loads (admin-only)
let villageShopsAdmin;
document.addEventListener('DOMContentLoaded', async () => {
  const adminSection = document.getElementById('village-shops-management-section');
  const adminButton = document.getElementById('village-shops-manager-btn');
  const hasAdminUI = Boolean(adminSection || adminButton);

  if (!hasAdminUI) {
    // Nothing to initialize on this page
    return;
  }

  try {
    const response = await fetch('/api/user', { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to verify user status (${response.status})`);
    }

    const userData = await response.json();
    if (!userData?.isAuthenticated || !userData?.isAdmin) {
      console.info('VillageShopsAdmin: user is not an authenticated admin, skipping initialization.');

      if (adminButton) {
        adminButton.addEventListener('click', () => {
          alert('Admin access required. Please log in with admin privileges.');
        }, { once: true });
      }
      return;
    }
  } catch (error) {
    console.warn('VillageShopsAdmin: unable to verify admin status, skipping initialization.', error);
    return;
  }

  villageShopsAdmin = new VillageShopsAdmin();
  
  // Add global test function for debugging
  window.testAddShopItem = () => {
    console.log('Testing add shop item...');
    if (villageShopsAdmin) {
      villageShopsAdmin.showEditModal();
    } else {
      console.error('villageShopsAdmin not initialized');
    }
  };
});
