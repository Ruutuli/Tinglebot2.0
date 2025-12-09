// ============================================================================
// ------------------- Dashboard Module -------------------
// Dashboard initialization and setup
// ============================================================================

import { scrollToTop } from '../ui.js';
import * as auth from '../auth.js';
import * as error from '../error.js';

// ------------------- Function: initializeDashboard -------------------
// Initializes the dashboard on page load
export async function initializeDashboard() {
  try {
    // Reset body overflow to ensure scrollbar is visible
    document.body.style.overflow = '';
    document.body.style.overflowY = '';
    document.body.style.overflowX = '';
    
    // Also reset html overflow just in case
    document.documentElement.style.overflow = '';
    document.documentElement.style.overflowY = '';
    document.documentElement.style.overflowX = '';
    
    // Scroll to top on page load
    scrollToTop();
    
    await auth.checkUserAuthStatus();
    
    // Check for login success and refresh suggestion box if needed
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login') === 'success') {
      // Small delay to ensure auth state is fully updated
      setTimeout(() => {
        if (typeof suggestionsModule !== 'undefined' && suggestionsModule.refreshAuthStatus) {
          suggestionsModule.refreshAuthStatus();
        }
      }, 1000);
    }
  } catch (err) {
    error.logError(err, 'Dashboard Initialization');
  }
}

// ------------------- Function: resetSidebarState -------------------
// Resets sidebar to closed state on page load
export function resetSidebarState() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (sidebar) {
    sidebar.classList.remove('mobile-open', 'mobile-closing');
  }
  if (overlay) {
    overlay.classList.remove('active');
  }
  document.body.style.overflow = '';
}

// ------------------- Function: showLoadingState -------------------
// Shows loading state in the content area
export function showLoadingState() {
  const contentDiv = document.getElementById('model-details-data');
  if (contentDiv) {
    contentDiv.innerHTML = `
      <div class="loading-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; min-height: 400px;">
        <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent-color); margin-bottom: 1.5rem;"></i>
        <p style="font-size: 1.1rem; color: var(--text-primary); font-weight: 600;">Loading...</p>
      </div>
    `;
  }
}

// ------------------- Function: hideLoadingState -------------------
// Hides loading state
export function hideLoadingState() {
  const loadingState = document.querySelector('.loading-state');
  if (loadingState) {
    loadingState.remove();
  }
}



