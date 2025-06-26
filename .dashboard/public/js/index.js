/* ============================================================================
   main.js
   Purpose: Entry point for dashboard UI. Initializes modules, loads data,
   and handles model card click events, layout switching, and loaders.
============================================================================ */

// ============================================================================
// ------------------- Module Imports & Exports -------------------
// Imports core modules and re-exports for shared access
// ============================================================================
import * as inventory from './inventory.js';
import * as items from './items.js';
import * as characters from './characters.js';
import * as stats from './stats.js';
import * as error from './error.js';
import { createPagination, setupBackToTopButton, scrollToTop } from './ui.js';

// Import specific functions from characters module
const { renderCharacterCards } = characters;

export {
  inventory,
  items,
  characters,
  stats,
  error
};

// ============================================================================
// ------------------- Initialization -------------------
// Sets up UI listeners and initializes dashboard on load
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('🚀 DOM Content Loaded - Starting initialization...');
    
    // Check if back-to-top button exists
    const backToTopButton = document.getElementById('backToTop');
    console.log('🔍 Back-to-top button check:', {
      exists: !!backToTopButton,
      element: backToTopButton,
      id: backToTopButton?.id,
      className: backToTopButton?.className
    });
    
    setupSidebarNavigation();
    console.log('🔝 Calling setupBackToTopButton from index.js...');
    setupBackToTopButton();
    setupModelCards();
    console.log('✅ Initialization complete');
  } catch (err) {
    error.logError(err, 'Initialization');
  }
});

// ------------------- Function: setupModelCards -------------------
// Attaches click handlers to each model card and loads model data
function setupModelCards() {
  const modelCards = document.querySelectorAll('.model-card');
  console.log('🔍 Setting up model cards:', modelCards.length);

  modelCards.forEach(card => {
    const modelName = card.getAttribute('data-model');
    console.log('🎯 Setting up card:', modelName);
    
    card.addEventListener('click', async (event) => {
      event.preventDefault(); // Prevent default button behavior
      console.log('🖱️ Model card clicked:', modelName);

      // Reset filters when switching between models
      if (window.itemFiltersInitialized) {
        console.log('🧹 Resetting item filters for model switch');
        window.itemFiltersInitialized = false;
        window.allItems = null;
        window.savedFilterState = {};
      }
      if (window.characterFiltersInitialized) {
        console.log('🧹 Resetting character filters for model switch');
        window.characterFiltersInitialized = false;
        window.allCharacters = null;
      }

      // Add visual feedback for click
      card.classList.add('clicked');
      setTimeout(() => card.classList.remove('clicked'), 200);

      showLoadingState();
      console.log('⏳ Loading state shown');

      // Declare variables outside try block so they're available in catch
      let dashboardSection, modelDetailsPage, title, contentDiv, backButton;

      try {
        // Hide dashboard, show details view
        dashboardSection = document.getElementById('dashboard-section');
        modelDetailsPage = document.getElementById('model-details-page');
        title = document.getElementById('model-details-title');
        contentDiv = document.getElementById('model-details-data');
        backButton = document.querySelector('.back-button');

        console.log('🔍 Checking required elements:', {
          dashboardSection: !!dashboardSection,
          modelDetailsPage: !!modelDetailsPage,
          title: !!title,
          contentDiv: !!contentDiv,
          backButton: !!backButton
        });

        if (!dashboardSection || !modelDetailsPage || !title || !contentDiv || !backButton) {
          throw new Error('Required DOM elements not found');
        }

        dashboardSection.style.display = 'none';
        modelDetailsPage.style.display = 'block';
        title.textContent = modelName.charAt(0).toUpperCase() + modelName.slice(1);
        contentDiv.innerHTML = '';
        console.log('📱 UI elements updated');

        // Setup back button handler
        backButton.onclick = () => {
          console.log('🔙 Back button clicked');
          modelDetailsPage.style.display = 'none';
          dashboardSection.style.display = 'block';
          // Reset any global state
          if (modelName === 'character') {
            window.characterFiltersInitialized = false;
            window.allCharacters = null;
          } else if (modelName === 'item') {
            window.itemFiltersInitialized = false;
            window.allItems = null;
            window.savedFilterState = {};
          }
        };

        // Ensure back to top button is set up for model pages
        setupBackToTopButton();

        console.log('🌐 Fetching model data:', modelName);
        const response = await fetch(`/api/models/${modelName}`);
        console.log('📥 Response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const { data, pagination } = await response.json();
        console.log('📦 Received data:', { 
          dataLength: data?.length, 
          pagination,
          firstItem: data?.[0] 
        });

        const characterFiltersBar = document.querySelector('.character-filters');
        if (modelName === 'character' && characterFiltersBar) {
          console.log('🎛️ Setting up character filters');
          if (contentDiv.firstChild !== characterFiltersBar) {
            contentDiv.insertBefore(characterFiltersBar, contentDiv.firstChild);
          }
          characterFiltersBar.style.display = 'flex';
        } else if (characterFiltersBar) {
          characterFiltersBar.style.display = 'none';
        }

        console.log('🚀 Initializing model:', modelName);
        switch (modelName) {
          case 'character':
            console.log('👥 Initializing character page');
            await characters.initializeCharacterPage(data, pagination.page, contentDiv);
            break;
          case 'item':
            console.log('📦 Initializing item page');
            // Check if item filters are active
            if (window.itemFiltersInitialized && window.savedFilterState) {
              const hasActiveFilters = window.savedFilterState.searchTerm || 
                window.savedFilterState.categoryFilter !== 'all' || 
                window.savedFilterState.typeFilter !== 'all' || 
                window.savedFilterState.subtypeFilter !== 'all' || 
                window.savedFilterState.jobsFilter !== 'all' || 
                window.savedFilterState.locationsFilter !== 'all';
              
              if (hasActiveFilters) {
                console.log('🔍 Filters active - skipping normal pagination for items');
                // Don't apply normal pagination when filters are active
                // Let the filtered pagination handle it
                return; // Skip pagination update
              }
            }
            await items.initializeItemPage(data, pagination.page, contentDiv);
            break;
          case 'inventory':
            console.log('🎒 Initializing inventory page');
            await inventory.renderInventoryItems(data, pagination.page);
            break;
          default:
            console.error(`Unknown model type: ${modelName}`);
            contentDiv.innerHTML = `
              <div class="error-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Unknown model type: ${modelName}</p>
              </div>
            `;
        }

        if (pagination?.pages > 1) {
          // For items, check if filters are active and skip pagination if so
          if (modelName === 'item' && window.itemFiltersInitialized && window.savedFilterState) {
            const hasActiveFilters = window.savedFilterState.searchTerm || 
              window.savedFilterState.categoryFilter !== 'all' || 
              window.savedFilterState.typeFilter !== 'all' || 
              window.savedFilterState.subtypeFilter !== 'all' || 
              window.savedFilterState.jobsFilter !== 'all' || 
              window.savedFilterState.locationsFilter !== 'all';
            
            if (hasActiveFilters) {
              console.log('🔍 Filters active - skipping initial pagination setup for items');
              // Don't create normal pagination when filters are active
              // Let the filtered pagination handle it
              return;
            }
          }

          console.log('📄 Setting up pagination');
          const handlePageChange = async (pageNum) => {
            console.log(`🔄 Page change requested to page ${pageNum}`);
            showLoadingState();
            try {
              console.log(`📄 Loading page ${pageNum}`);
              const { data, pagination } = await loadModelData(modelName, pageNum);
              console.log(`📦 Received page ${pageNum} data:`, { 
                dataLength: data?.length, 
                pagination,
                firstItem: data?.[0] 
              });

              switch (modelName) {
                case 'character':
                  console.log('🎯 About to render characters:', {
                    dataLength: data?.length,
                    page: pagination.page,
                    firstCharacter: data?.[0]?.name
                  });
                  try {
                    // For characters, we need to handle pagination differently
                    // since they have their own filtering system
                    if (!window.characterFiltersInitialized) {
                      // If filters aren't initialized, use the main pagination
                      await characters.renderCharacterCards(data, pagination.page);
                      console.log('✅ Characters rendered successfully');
                    } else {
                      // If filters are initialized, let the character module handle pagination
                      console.log('🔍 Character filters active - letting character module handle pagination');
                      return;
                    }
                  } catch (err) {
                    console.error('❌ Error rendering characters:', err);
                    error.logError(err, 'Rendering Characters');
                  }
                  break;
                case 'item':
                  // Check if item filters are active
                  if (window.itemFiltersInitialized && window.savedFilterState) {
                    const hasActiveFilters = window.savedFilterState.searchTerm || 
                      window.savedFilterState.categoryFilter !== 'all' || 
                      window.savedFilterState.typeFilter !== 'all' || 
                      window.savedFilterState.subtypeFilter !== 'all' || 
                      window.savedFilterState.jobsFilter !== 'all' || 
                      window.savedFilterState.locationsFilter !== 'all';
                    
                    if (hasActiveFilters) {
                      console.log('🔍 Filters active - skipping pagination for items');
                      // Don't apply normal pagination when filters are active
                      // Let the filtered pagination handle it
                      return;
                    }
                  }
                  await items.renderItemCards(data, pagination.page);
                  break;
                case 'inventory':
                  await inventory.renderInventoryItems(data, pagination.page);
                  break;
                default:
                  console.error(`Unknown model type: ${modelName}`);
              }
            } catch (err) {
              console.error('❌ Error loading page data:', err);
              error.logError(err, 'Loading Page Data');
            } finally {
              hideLoadingState();
            }
          };

          // Fix the createPagination call to use correct parameter format
          const paginationDiv = createPagination({ page: pagination.page, pages: pagination.pages }, handlePageChange);
          
          // For characters, we need to create a pagination container if it doesn't exist
          if (modelName === 'character') {
            let paginationContainer = document.getElementById('character-pagination');
            if (!paginationContainer) {
              paginationContainer = document.createElement('div');
              paginationContainer.id = 'character-pagination';
              contentDiv.appendChild(paginationContainer);
            }
            paginationContainer.innerHTML = '';
            paginationContainer.appendChild(paginationDiv);
          } else {
            contentDiv.appendChild(paginationDiv);
          }
        }

      } catch (err) {
        console.error('❌ Error loading model data:', err);
        error.logError(err, 'Loading Model Data');
        if (contentDiv) {
          handleModelDataError(modelName, contentDiv);
        }
      } finally {
        hideLoadingState();
        console.log('✅ Loading complete');
      }
    });
  });
}

// ------------------- Function: loadModelData -------------------
// Fetches paginated model data by type
async function loadModelData(modelName, page = 1) {
  const response = await fetch(`/api/models/${modelName}?page=${page}`);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json();
}

// ------------------- Function: handleModelDataError -------------------
// Handles model data loading errors with retry functionality
function handleModelDataError(modelName, contentDiv) {
  contentDiv.innerHTML = `
    <div class="error-state">
      <i class="fas fa-exclamation-circle"></i>
      <p>Failed to load ${modelName} data</p>
      <button class="retry-button">Retry</button>
    </div>
  `;

  // Add event listener to retry button
  const retryButton = contentDiv.querySelector('.retry-button');
  if (retryButton) {
    retryButton.addEventListener('click', async () => {
      showLoadingState();
      try {
        const { data, pagination } = await loadModelData(modelName);
        switch (modelName) {
          case 'character':
            await characters.initializeCharacterPage(data, pagination.page, contentDiv);
            break;
          case 'item':
            items.initializeItemPage(data, pagination.page, contentDiv);
            break;
          case 'inventory':
            inventory.renderInventoryItems(data, pagination.page);
            break;
          default:
            console.error(`Unknown model type: ${modelName}`);
            contentDiv.innerHTML = `
              <div class="error-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Unknown model type: ${modelName}</p>
              </div>
            `;
        }
      } catch (err) {
        error.logError(err, 'Loading Model Data');
        handleModelDataError(modelName, contentDiv);
      } finally {
        hideLoadingState();
      }
    });
  }
}

// ------------------- Function: loadDashboardData -------------------
// Loads all dashboard data (inventory, items, stats) concurrently
async function loadDashboardData() {
  showLoadingState();
  try {
    await Promise.all([
      loadInventoryData(),
      loadItemsData(),
      loadStatsData()
    ]);
  } catch (err) {
    error.logError(err, 'Loading Dashboard Data');
  } finally {
    hideLoadingState();
  }
}

// ------------------- Function: loadInventoryData -------------------
// Loads and renders inventory data
async function loadInventoryData() {
  try {
    const response = await fetch('/api/inventory');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    inventory.setupInventoryFilters(data);
    inventory.renderInventoryItems(data);
  } catch (err) {
    error.logError(err, 'Loading Inventory');
  }
}

// ------------------- Function: loadItemsData -------------------
// Loads and renders item data
async function loadItemsData() {
  try {
    const response = await fetch('/api/items');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    items.setupItemFilters(data);
    items.renderItemCards(data);
  } catch (err) {
    error.logError(err, 'Loading Items');
  }
}

// ------------------- Function: loadStatsData -------------------
// Loads and renders statistics data
async function loadStatsData() {
  try {
    // Note: Activity list functionality removed as it's not implemented in the UI
    // The stats section focuses on character statistics charts instead
    console.log('📊 Stats data loading skipped - using character stats instead');
  } catch (err) {
    error.logError(err, 'Loading Stats');
  }
}

// ============================================================================
// ------------------- Section Navigation -------------------
// Switches between sections using nav links
// ============================================================================
function showSection(sectionId) {
  const sections = document.querySelectorAll('.section');
  sections.forEach(section => {
    section.style.display = section.id === sectionId ? 'block' : 'none';
  });
}

// ============================================================================
// ------------------- Navigation Setup -------------------
// Handles all sidebar navigation including dashboard and stats
// ============================================================================
function setupSidebarNavigation() {
  console.log('📊 Setting up sidebar navigation...');
  
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  console.log('🔍 Found sidebar links:', sidebarLinks.length);
  
  sidebarLinks.forEach(link => {
    const sectionId = link.getAttribute('data-section');
    console.log('🔗 Setting up link:', sectionId);
    
    link.addEventListener('click', e => {
      e.preventDefault();
      console.log('🖱️ Sidebar link clicked:', sectionId);
      
      // Update URL
      const newUrl = sectionId === 'dashboard-section' ? '/' : `#${sectionId}`;
      window.history.pushState({ section: sectionId }, '', newUrl);
      
      // Handle different sections
      if (sectionId === 'stats-section') {
        showStatsSection();
      } else if (sectionId === 'dashboard-section') {
        showDashboardSection();
      } else {
        // For other sections, use the existing showSection function
        showSection(sectionId);
      }
    });
  });
  
  // Handle browser back/forward buttons
  window.addEventListener('popstate', (event) => {
    const section = event.state?.section || 'dashboard-section';
    console.log('🔄 Browser navigation to:', section);
    
    if (section === 'stats-section') {
      showStatsSection();
    } else if (section === 'dashboard-section') {
      showDashboardSection();
    } else {
      showSection(section);
    }
  });
  
  // Handle initial URL on page load
  const hash = window.location.hash;
  if (hash) {
    const sectionId = hash.substring(1);
    console.log('📍 Initial URL hash:', sectionId);
    
    if (sectionId === 'stats-section') {
      showStatsSection();
    } else if (sectionId === 'dashboard-section') {
      showDashboardSection();
    } else {
      showSection(sectionId);
    }
  }
}

// ============================================================================
// ------------------- Loading Indicator -------------------
// Controls global loader visibility
// ============================================================================
function showLoadingState() {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'block';
}

function hideLoadingState() {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'none';
}

// ============================================================================
// ------------------- UI Utilities -------------------
// Miscellaneous formatters and asset helpers
// ============================================================================
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function formatPrettyDate(date) {
  if (!date) return 'Never';
  return new Date(date).toLocaleString();
}

function formatCharacterIconUrl(iconUrl) {
  if (!iconUrl) return '';
  return iconUrl.startsWith('http') ? iconUrl : `/images/characters/${iconUrl}`;
}

function renderMarkdownLinks(text) {
  if (!text) return '';
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}

function renderItemTypeIcon(imageType) {
  const typeIcons = {
    'weapon': 'fa-sword',
    'shield': 'fa-shield',
    'armor': 'fa-helmet',
    'item': 'fa-box'
  };
  return typeIcons[imageType] || 'fa-box';
}

// ============================================================================
// ------------------- Modal Controls -------------------
// Shows or hides modals and panels
// ============================================================================
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'block';
}

function hideModelDetails() {
  const modelDetails = document.querySelector('.model-details');
  const mainContent = document.querySelector('.main-content');
  if (modelDetails && mainContent) {
    modelDetails.style.display = 'none';
    mainContent.style.display = '';
  }
}

// ============================================================================
// ------------------- Stats Navigation -------------------
// Handles stats page navigation specifically
// ============================================================================
function showStatsSection() {
  console.log('📊 Showing stats section...');
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the stats section
  const statsSection = document.getElementById('stats-section');
  if (statsSection) {
    statsSection.style.display = 'block';
    console.log('✅ Stats section displayed');
    
    // Initialize stats page
    import('./stats.js').then(statsModule => {
      statsModule.initStatsPage();
    }).catch(err => {
      console.error('❌ Error loading stats module:', err);
    });
  } else {
    console.error('❌ Stats section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'stats-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Stats';
  }
}

function showDashboardSection() {
  console.log('🏠 Showing dashboard section...');
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the dashboard section
  const dashboardSection = document.getElementById('dashboard-section');
  if (dashboardSection) {
    dashboardSection.style.display = 'block';
    console.log('✅ Dashboard section displayed');
    
    // Debug: Check if dashboard content is visible
    const welcomeBox = dashboardSection.querySelector('.dashboard-welcome-box');
    const modelGrid = dashboardSection.querySelector('.model-grid');
    const linksSection = dashboardSection.querySelector('.dashboard-links-section');
    
    console.log('🔍 Dashboard content check:', {
      welcomeBox: !!welcomeBox,
      welcomeBoxDisplay: welcomeBox?.style.display,
      modelGrid: !!modelGrid,
      modelGridDisplay: modelGrid?.style.display,
      linksSection: !!linksSection,
      linksSectionDisplay: linksSection?.style.display,
      dashboardSectionDisplay: dashboardSection.style.display
    });
    
    // Fix: Explicitly make dashboard content visible
    if (welcomeBox) welcomeBox.style.display = 'block';
    if (modelGrid) modelGrid.style.display = 'grid';
    if (linksSection) linksSection.style.display = 'flex';
    
    console.log('🔧 Fixed dashboard content visibility');
    
    // Check for any loading states that might be hiding content
    const loader = document.getElementById('loader');
    const loadingStates = document.querySelectorAll('.loading-state');
    console.log('🔍 Loading states check:', {
      loader: !!loader,
      loaderDisplay: loader?.style.display,
      loadingStatesCount: loadingStates.length,
      loadingStatesDisplay: Array.from(loadingStates).map(el => el.style.display)
    });
    
    // The dashboard content (welcome message, links, model cards) is already in the HTML
    // No need to load data dynamically for the main dashboard view
  } else {
    console.error('❌ Dashboard section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'dashboard-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Dashboard';
  }
}

// ============================================================================
// ------------------- Exports -------------------
// Shared helpers and UI controls
// ============================================================================
export {
  showModal,
  hideModelDetails,
  showSection,
  setupSidebarNavigation,
  showLoadingState,
  hideLoadingState,
  formatTime,
  formatPrettyDate,
  formatCharacterIconUrl,
  renderMarkdownLinks,
  renderItemTypeIcon,
  loadModelData
};
