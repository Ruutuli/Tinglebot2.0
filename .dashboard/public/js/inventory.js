// Inventory related functions

function renderInventoryItems(inventories, page = 1) {
    const itemsPerPage = 12;
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = inventories.slice(startIndex, endIndex);
    
    const container = document.getElementById('inventory-container');
    if (!container) return;
    
    container.innerHTML = paginatedItems.map(item => `
        <div class="inventory-item">
            <img src="${item.icon}" alt="${item.name}">
            <h3>${item.name}</h3>
            <p>Quantity: ${item.quantity}</p>
        </div>
    `).join('');
    
    updateInventoryPagination(inventories, page);
}

function populateInventoryFilterOptions(inventories) {
    // Get unique values for each filter
    const characters = [...new Set(inventories.map(inv => inv.characterName).filter(Boolean))].sort();
    const categories = [...new Set(inventories.map(inv => inv.category).filter(Boolean))].sort();
    const types = [...new Set(inventories.map(inv => inv.type).filter(Boolean))].sort();

    // Populate character filter
    const charSelect = document.getElementById('inventory-character-filter');
    if (charSelect) {
        charSelect.innerHTML = '<option value="all">All Characters</option>' +
            characters.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    // Populate category filter
    const catSelect = document.getElementById('inventory-category-filter');
    if (catSelect) {
        catSelect.innerHTML = '<option value="all">All Categories</option>' +
            categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    // Populate type filter
    const typeSelect = document.getElementById('inventory-type-filter');
    if (typeSelect) {
        typeSelect.innerHTML = '<option value="all">All Types</option>' +
            types.map(t => `<option value="${t}">${t}</option>`).join('');
    }
}

function setupInventoryFilters(inventories) {
    const searchInput = document.getElementById('inventory-search');
    const charSelect = document.getElementById('inventory-character-filter');
    const catSelect = document.getElementById('inventory-category-filter');
    const typeSelect = document.getElementById('inventory-type-filter');
    const sortSelect = document.getElementById('inventory-sort');
    const clearBtn = document.getElementById('inventory-clear-filters');

    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const charFilter = charSelect.value;
        const catFilter = catSelect.value;
        const typeFilter = typeSelect.value;
        const sortBy = sortSelect.value;

        let filtered = inventories.filter(inv => {
            const matchesSearch = searchTerm === '' ||
                inv.itemName?.toLowerCase().includes(searchTerm) ||
                inv.characterName?.toLowerCase().includes(searchTerm);
            const matchesChar = charFilter === 'all' || inv.characterName === charFilter;
            const matchesCat = catFilter === 'all' || inv.category === catFilter;
            const matchesType = typeFilter === 'all' || inv.type === typeFilter;
            return matchesSearch && matchesChar && matchesCat && matchesType;
        });

        // Sorting
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'character-asc': return (a.characterName || '').localeCompare(b.characterName || '');
                case 'character-desc': return (b.characterName || '').localeCompare(a.characterName || '');
                case 'item-asc': return (a.itemName || '').localeCompare(b.itemName || '');
                case 'item-desc': return (b.itemName || '').localeCompare(a.itemName || '');
                case 'quantity-asc': return (a.quantity || 0) - (b.quantity || 0);
                case 'quantity-desc': return (b.quantity || 0) - (a.quantity || 0);
                default: return 0;
            }
        });

        renderInventoryItems(filtered, 1);
        updateInventoryPagination(filtered, 1);
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (charSelect) charSelect.addEventListener('change', applyFilters);
    if (catSelect) catSelect.addEventListener('change', applyFilters);
    if (typeSelect) typeSelect.addEventListener('change', applyFilters);
    if (sortSelect) sortSelect.addEventListener('change', applyFilters);
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            charSelect.value = 'all';
            catSelect.value = 'all';
            typeSelect.value = 'all';
            sortSelect.value = 'character-asc';
            applyFilters();
        });
    }
}

function updateInventoryPagination(inventories, currentPage) {
    const itemsPerPage = 12;
    const totalPages = Math.ceil(inventories.length / itemsPerPage);
    const pagination = document.getElementById('inventory-pagination');
    
    if (!pagination) return;
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <button class="pagination-btn" 
                ${currentPage === 1 ? 'disabled' : ''}
                onclick="renderInventoryItems(${JSON.stringify(inventories)}, ${currentPage - 1})">
            Previous
        </button>
    `;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `
            <button class="pagination-btn ${i === currentPage ? 'active' : ''}"
                    onclick="renderInventoryItems(${JSON.stringify(inventories)}, ${i})">
                ${i}
            </button>
        `;
    }
    
    // Next button
    paginationHTML += `
        <button class="pagination-btn"
                ${currentPage === totalPages ? 'disabled' : ''}
                onclick="renderInventoryItems(${JSON.stringify(inventories)}, ${currentPage + 1})">
            Next
        </button>
    `;
    
    pagination.innerHTML = paginationHTML;
}

export {
    renderInventoryItems,
    populateInventoryFilterOptions,
    setupInventoryFilters,
    updateInventoryPagination
}; 