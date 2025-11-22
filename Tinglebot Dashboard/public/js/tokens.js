// ============================================================================
// 💰 Tokens Section JavaScript
// Handles token transaction tracking and display
// ============================================================================

let currentUser = null;
let isAuthenticated = false;
let currentFilter = 'all'; // 'all', 'earned', 'spent'
let currentPage = 1;
const pageSize = 50;

// ------------------- Initialize Auth Context -------------------
async function setTokensContext() {
  const module = await import('./auth.js');
  // Refresh auth status to ensure it's up to date
  if (module.checkUserAuthStatus) {
    await module.checkUserAuthStatus();
  }
  currentUser = module.currentUser;
  isAuthenticated = module.isAuthenticated;
}

// Try to set context at module load, but we'll refresh it when section loads
await setTokensContext().catch(err => {
  console.warn('[tokens.js]: ⚠️ Could not set auth context at module load, will retry when section loads');
});

console.log('[tokens.js] ✅ Tokens module loaded');

// ============================================================================
// ------------------- Section: Tokens Page Initialization -------------------
// ============================================================================

// ------------------- Function: loadTokensSection -------------------
// Main function to load the tokens section
export async function loadTokensSection() {
  try {
    console.log('[tokens.js]: 🔄 Loading tokens section...');
    
    // Refresh auth context when section loads (in case it wasn't ready at module load)
    await setTokensContext();
    
    if (!isAuthenticated || !currentUser) {
      console.error('[tokens.js]: ❌ User not authenticated after refresh');
      console.error('[tokens.js]: Auth state:', { isAuthenticated, currentUser: !!currentUser });
      
      // Show error message to user
      const transactionsList = document.getElementById('tokens-transactions-list');
      if (transactionsList) {
        transactionsList.innerHTML = `
          <div style="text-align: center; padding: 3rem; color: var(--error-color);">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <p>Please log in to view your token transactions.</p>
            <a href="/login" style="color: var(--primary-color); text-decoration: underline;">Go to Login</a>
          </div>
        `;
      }
      return;
    }

    console.log('[tokens.js]: ✅ User authenticated:', currentUser?.discordId);

    const loadingEl = document.getElementById('tokens-transactions-loading');
    const transactionsList = document.getElementById('tokens-transactions-list');
    
    console.log('[tokens.js]: 🔍 DOM elements:', {
      loadingEl: !!loadingEl,
      transactionsList: !!transactionsList
    });
    
    if (loadingEl) {
      loadingEl.style.display = 'flex';
    }

    // Load token summary
    console.log('[tokens.js]: 📊 Loading token summary...');
    await loadTokenSummary();

    // Load token transactions
    console.log('[tokens.js]: 📋 Loading token transactions...');
    await loadTokenTransactions();

    // Setup event listeners
    setupTokensEventListeners();

    console.log('[tokens.js]: ✅ Tokens section loaded successfully');
  } catch (error) {
    console.error('[tokens.js]: ❌ Error loading tokens section:', error);
    console.error('[tokens.js]: ❌ Error stack:', error.stack);
    const loadingEl = document.getElementById('tokens-transactions-loading');
    if (loadingEl) {
      loadingEl.innerHTML = `<p style="color: var(--error-color);">Error loading token transactions: ${error.message || 'Unknown error'}</p>`;
      loadingEl.style.display = 'block';
    }
  }
}

// ============================================================================
// ------------------- Section: Token Summary -------------------
// ============================================================================

// ------------------- Function: loadTokenSummary -------------------
// Loads and displays token summary statistics
async function loadTokenSummary() {
  try {
    const response = await fetch('/api/tokens/summary', {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Failed to load token summary: ${response.statusText}`);
    }

    const summary = await response.json();
    renderTokenSummary(summary);
  } catch (error) {
    console.error('[tokens.js]: ❌ Error loading token summary:', error);
  }
}

// ------------------- Function: renderTokenSummary -------------------
// Renders the token summary cards
function renderTokenSummary(summary) {
  const summaryGrid = document.getElementById('tokens-summary-grid');
  if (!summaryGrid) return;

  const currentBalance = summary.currentBalance || 0;
  const totalEarned = summary.totalEarned || 0;
  const totalSpent = summary.totalSpent || 0;
  const totalTransactions = summary.totalTransactions || 0;

  summaryGrid.innerHTML = `
    <div class="token-summary-card" style="padding: 1.5rem; background: var(--card-bg); border-radius: 0.5rem; border: 1px solid var(--border-color);">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
        <i class="fas fa-wallet" style="font-size: 2rem; color: var(--primary-color);"></i>
        <div>
          <h3 style="margin: 0; color: var(--text-secondary); font-size: 0.9rem; font-weight: 500;">Current Balance</h3>
          <p style="margin: 0; color: var(--text-color); font-size: 1.5rem; font-weight: bold;">${formatNumber(currentBalance)}</p>
        </div>
      </div>
    </div>
    <div class="token-summary-card" style="padding: 1.5rem; background: var(--card-bg); border-radius: 0.5rem; border: 1px solid var(--border-color);">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
        <i class="fas fa-arrow-up" style="font-size: 2rem; color: #10b981;"></i>
        <div>
          <h3 style="margin: 0; color: var(--text-secondary); font-size: 0.9rem; font-weight: 500;">Total Earned</h3>
          <p style="margin: 0; color: var(--text-color); font-size: 1.5rem; font-weight: bold;">${formatNumber(totalEarned)}</p>
        </div>
      </div>
    </div>
    <div class="token-summary-card" style="padding: 1.5rem; background: var(--card-bg); border-radius: 0.5rem; border: 1px solid var(--border-color);">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
        <i class="fas fa-arrow-down" style="font-size: 2rem; color: #ef4444;"></i>
        <div>
          <h3 style="margin: 0; color: var(--text-secondary); font-size: 0.9rem; font-weight: 500;">Total Spent</h3>
          <p style="margin: 0; color: var(--text-color); font-size: 1.5rem; font-weight: bold;">${formatNumber(totalSpent)}</p>
        </div>
      </div>
    </div>
    <div class="token-summary-card" style="padding: 1.5rem; background: var(--card-bg); border-radius: 0.5rem; border: 1px solid var(--border-color);">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
        <i class="fas fa-list" style="font-size: 2rem; color: var(--primary-color);"></i>
        <div>
          <h3 style="margin: 0; color: var(--text-secondary); font-size: 0.9rem; font-weight: 500;">Total Transactions</h3>
          <p style="margin: 0; color: var(--text-color); font-size: 1.5rem; font-weight: bold;">${formatNumber(totalTransactions)}</p>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// ------------------- Section: Token Transactions -------------------
// ============================================================================

// ------------------- Function: loadTokenTransactions -------------------
// Loads token transactions from the API
async function loadTokenTransactions(page = 1, filter = 'all') {
  try {
    currentPage = page;
    currentFilter = filter;

    const loadingEl = document.getElementById('tokens-transactions-loading');
    if (loadingEl) {
      loadingEl.style.display = 'flex';
    }

    const skip = (page - 1) * pageSize;
    let url = `/api/tokens/transactions?limit=${pageSize}&skip=${skip}`;
    if (filter !== 'all') {
      url += `&type=${filter}`;
    }

    console.log('[tokens.js]: 🔍 Fetching transactions from:', url);
    
    const response = await fetch(url, {
      credentials: 'include'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[tokens.js]: ❌ API error:', response.status, errorText);
      throw new Error(`Failed to load transactions: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[tokens.js]: ✅ Received data:', {
      transactionsCount: data.transactions?.length || 0,
      total: data.total || 0,
      success: data.success,
      sources: data.sources,
      sampleTransaction: data.transactions?.[0]
    });
    
    // Hide loading before rendering
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
    
    renderTokenTransactions(data.transactions || [], data.total || 0);
  } catch (error) {
    console.error('[tokens.js]: ❌ Error loading token transactions:', error);
    const loadingEl = document.getElementById('tokens-transactions-loading');
    if (loadingEl) {
      loadingEl.innerHTML = `<p style="color: var(--error-color);">Error loading transactions: ${error.message || 'Unknown error'}</p>`;
      loadingEl.style.display = 'block';
    }
  }
}

// ------------------- Function: renderTokenTransactions -------------------
// Renders the token transactions list
function renderTokenTransactions(transactions, total) {
  console.log('[tokens.js]: 🎨 Rendering transactions:', {
    count: transactions?.length || 0,
    total: total,
    sample: transactions?.[0]
  });
  
  const transactionsList = document.getElementById('tokens-transactions-list');
  if (!transactionsList) {
    console.error('[tokens.js]: ❌ Transaction list element not found!');
    return;
  }

  if (!transactions || transactions.length === 0) {
    console.log('[tokens.js]: ℹ️ No transactions to display');
    transactionsList.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
        <i class="fas fa-coins" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
        <p>No token transactions found.</p>
      </div>
    `;
    return;
  }

  const transactionsHTML = transactions.map(transaction => {
    const isEarned = transaction.type === 'earned';
    const amount = Math.abs(transaction.amount);
    
    // Handle timestamp - might be invalid or missing
    let formattedDate = 'Unknown date';
    try {
      if (transaction.timestamp) {
        const date = new Date(transaction.timestamp);
        if (!isNaN(date.getTime())) {
          formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      }
    } catch (dateError) {
      console.warn('[tokens.js]: ⚠️ Error formatting date:', dateError);
      formattedDate = 'Invalid date';
    }

    const linkHTML = transaction.link
      ? `<a href="${escapeHtml(transaction.link)}" target="_blank" rel="noopener noreferrer" class="token-transaction-link" title="View details">
           <i class="fas fa-external-link-alt"></i>
           <span>View</span>
         </a>`
      : '';

    const typeClass = isEarned ? 'type-earned' : 'type-spent';
    const typeIcon = isEarned ? 'fa-arrow-up' : 'fa-arrow-down';
    
    return `
      <div class="token-transaction-item ${typeClass}">
        <div class="token-transaction-content">
          <div class="token-transaction-header">
            <span class="token-transaction-type-badge ${isEarned ? 'earned' : 'spent'}">
              <i class="fas ${typeIcon}"></i>
              ${isEarned ? 'Earned' : 'Spent'}
            </span>
            ${transaction.category ? `<span class="token-transaction-category">${escapeHtml(transaction.category)}</span>` : ''}
            ${linkHTML}
          </div>
          <p class="token-transaction-description">${escapeHtml(transaction.description || 'No description')}</p>
          <p class="token-transaction-date">
            <i class="fas fa-clock"></i>
            ${formattedDate}
          </p>
        </div>
        <div class="token-transaction-amount">
          <p class="token-transaction-amount-value ${isEarned ? 'earned' : 'spent'}">
            ${isEarned ? '+' : '-'}${formatNumber(amount)}
          </p>
          ${transaction.balanceAfter !== undefined ? `<p class="token-transaction-balance">Balance: ${formatNumber(transaction.balanceAfter)}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');

  transactionsList.innerHTML = transactionsHTML;
  console.log('[tokens.js]: ✅ HTML set in transactions list. Element children:', transactionsList.children.length);
  
  // Verify the HTML was set
  if (transactionsList.innerHTML.trim().length === 0) {
    console.warn('[tokens.js]: ⚠️ Transactions list innerHTML is empty after setting!');
  }

  // Render pagination
  renderPagination(total, pageSize);
}

// ------------------- Function: renderPagination -------------------
// Renders pagination controls
function renderPagination(total, pageSize) {
  const paginationEl = document.getElementById('tokens-pagination');
  if (!paginationEl) return;

  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) {
    paginationEl.style.display = 'none';
    return;
  }

  paginationEl.style.display = 'block';

  let paginationHTML = '<div class="pagination">';

  // Previous button
  paginationHTML += `
    <button 
      class="pagination-button"
      id="tokens-prev-page"
      ${currentPage === 1 ? 'disabled' : ''}
    >
      <i class="fas fa-chevron-left"></i>
      <span>Previous</span>
    </button>
  `;

  // Page numbers
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage < maxVisiblePages - 1) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  if (startPage > 1) {
    paginationHTML += `<button class="pagination-button" onclick="window.tokensModule.loadTokenTransactions(1, '${currentFilter}')">1</button>`;
    if (startPage > 2) {
      paginationHTML += '<span class="pagination-ellipsis">...</span>';
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    paginationHTML += `
      <button 
        class="pagination-button ${i === currentPage ? 'active' : ''}"
        onclick="window.tokensModule.loadTokenTransactions(${i}, '${currentFilter}')"
      >
        ${i}
      </button>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += '<span class="pagination-ellipsis">...</span>';
    }
    paginationHTML += `<button class="pagination-button" onclick="window.tokensModule.loadTokenTransactions(${totalPages}, '${currentFilter}')">${totalPages}</button>`;
  }

  // Next button
  paginationHTML += `
    <button 
      class="pagination-button"
      id="tokens-next-page"
      ${currentPage === totalPages ? 'disabled' : ''}
    >
      <span>Next</span>
      <i class="fas fa-chevron-right"></i>
    </button>
  `;

  paginationHTML += '</div>';

  paginationEl.innerHTML = paginationHTML;

  // Add event listeners
  const prevBtn = document.getElementById('tokens-prev-page');
  const nextBtn = document.getElementById('tokens-next-page');

  if (prevBtn && currentPage > 1) {
    prevBtn.addEventListener('click', () => {
      loadTokenTransactions(currentPage - 1, currentFilter);
    });
  }

  if (nextBtn && currentPage < totalPages) {
    nextBtn.addEventListener('click', () => {
      loadTokenTransactions(currentPage + 1, currentFilter);
    });
  }
}

// ============================================================================
// ------------------- Section: Event Listeners -------------------
// ============================================================================

// ------------------- Function: setupTokensEventListeners -------------------
// Sets up event listeners for the tokens section
function setupTokensEventListeners() {
  // Filter buttons
  const filterAll = document.getElementById('filter-all');
  const filterEarned = document.getElementById('filter-earned');
  const filterSpent = document.getElementById('filter-spent');

  if (filterAll) {
    filterAll.addEventListener('click', () => {
      currentPage = 1;
      loadTokenTransactions(1, 'all');
      updateFilterButtons('all');
    });
  }

  if (filterEarned) {
    filterEarned.addEventListener('click', () => {
      currentPage = 1;
      loadTokenTransactions(1, 'earned');
      updateFilterButtons('earned');
    });
  }

  if (filterSpent) {
    filterSpent.addEventListener('click', () => {
      currentPage = 1;
      loadTokenTransactions(1, 'spent');
      updateFilterButtons('spent');
    });
  }
}

// ------------------- Function: updateFilterButtons -------------------
// Updates the active state of filter buttons
function updateFilterButtons(activeFilter) {
  const filters = {
    'all': document.getElementById('filter-all'),
    'earned': document.getElementById('filter-earned'),
    'spent': document.getElementById('filter-spent')
  };

  Object.entries(filters).forEach(([filter, button]) => {
    if (button) {
      if (filter === activeFilter) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    }
  });
}

// ============================================================================
// ------------------- Section: Utility Functions -------------------
// ============================================================================

// ------------------- Function: formatNumber -------------------
// Formats a number with commas
function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

// ------------------- Function: escapeHtml -------------------
// Escapes HTML to prevent XSS
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// ------------------- Section: Exports -------------------
// ============================================================================

// Export functions for use in other modules
window.tokensModule = {
  loadTokensSection,
  loadTokenTransactions
};

