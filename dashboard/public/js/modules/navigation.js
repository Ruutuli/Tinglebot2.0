// ============================================================================
// ------------------- Navigation Module -------------------
// Handles sidebar navigation and page navigation
// ============================================================================

import { scrollToTop } from '../ui.js';

// ------------------- Function: setupSidebarNavigation -------------------
// Sets up sidebar navigation handlers
export function setupSidebarNavigation() {
  const sidebar = document.querySelector('.sidebar');
  const sidebarToggle = document.querySelector('.sidebar-toggle');
  const sidebarOverlay = document.querySelector('.sidebar-overlay');
  const sidebarClose = document.querySelector('.sidebar-close');

  if (!sidebar || !sidebarToggle) return;

  // Toggle sidebar
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
    if (sidebarOverlay) {
      sidebarOverlay.classList.toggle('active');
    }
    document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
  });

  // Close sidebar when clicking overlay
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  // Close sidebar button
  if (sidebarClose) {
    sidebarClose.addEventListener('click', () => {
      sidebar.classList.remove('active');
      if (sidebarOverlay) {
        sidebarOverlay.classList.remove('active');
      }
      document.body.style.overflow = '';
    });
  }

  // Close sidebar on window resize (mobile)
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      sidebar.classList.remove('active', 'mobile-open', 'mobile-closing');
      if (sidebarOverlay) {
        sidebarOverlay.classList.remove('active');
      }
      document.body.style.overflow = '';
    }
  });
}

// ------------------- Function: navigateToModel -------------------
// Navigates to a model view
export function navigateToModel(modelName) {
  const hash = `#${modelName}`;
  window.history.pushState({ model: modelName }, '', hash);
  
  // Clear sidebar active states when viewing a model
  clearActiveNavState();
  
  // Update breadcrumb to show model name
  const modelDisplayName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
  updateBreadcrumb(modelDisplayName);
  
  // Reinitialize blupee system when viewing a model
  if (window.reinitializeBlupee) {
    window.reinitializeBlupee();
  }
  
  // Scroll to top when viewing a model
  scrollToTop();
}

// ------------------- Function: navigateToDashboard -------------------
// Navigates back to dashboard
export function navigateToDashboard() {
  window.history.pushState({ section: 'dashboard-section' }, '', '/');
  
  // Update active state to dashboard
  updateActiveNavState('dashboard-section');
  
  // Update breadcrumb
  updateBreadcrumb('Dashboard');
  
  // Reinitialize blupee system when going back
  if (window.reinitializeBlupee) {
    window.reinitializeBlupee();
  }
  
  // Scroll to top when going back to dashboard
  scrollToTop();
}

// ------------------- Function: resetFilterState -------------------
// Resets filter state when switching between models
export function resetFilterState(modelName) {
  if (window.itemFiltersInitialized) {
    window.itemFiltersInitialized = false;
    window.allItems = null;
    window.savedFilterState = {};
  }
  if (window.characterFiltersInitialized) {
    window.characterFiltersInitialized = false;
    window.allCharacters = null;
  }
  if (window.questFiltersInitialized) {
    window.questFiltersInitialized = false;
    window.allQuests = null;
  }
}

// ------------------- Function: updateActiveNavState -------------------
// Centralized function to update sidebar active states
export function updateActiveNavState(sectionId) {
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    
    if (listItem) {
      if (linkSection === sectionId) {
        listItem.classList.add('active');
        
        // If link is inside a dropdown, open that dropdown
        const dropdown = listItem.closest('.nav-dropdown');
        if (dropdown) {
          // Close all other dropdowns
          document.querySelectorAll('.nav-dropdown').forEach(item => {
            if (item !== dropdown) {
              item.classList.remove('active');
              const toggle = item.querySelector('.nav-dropdown-toggle');
              if (toggle) {
                toggle.setAttribute('aria-expanded', 'false');
              }
            }
          });
          
          // Open the parent dropdown
          dropdown.classList.add('active');
          const toggle = dropdown.querySelector('.nav-dropdown-toggle');
          if (toggle) {
            toggle.setAttribute('aria-expanded', 'true');
          }
        }
      } else {
        listItem.classList.remove('active');
      }
    }
  });
}

// ------------------- Function: updateBreadcrumb -------------------
// Centralized breadcrumb update function
export function updateBreadcrumb(text) {
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = text;
  }
}

// ------------------- Function: clearActiveNavState -------------------
// Clear all active states (for model views)
export function clearActiveNavState() {
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const listItem = link.closest('li');
    if (listItem) {
      listItem.classList.remove('active');
    }
  });
  
  // Close all dropdowns
  document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
    dropdown.classList.remove('active');
    const toggle = dropdown.querySelector('.nav-dropdown-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}






