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
import * as weatherStats from './weatherStats.js';
import * as error from './error.js';
import * as auth from './auth.js';
import * as guilds from './guilds.js';
import * as villageShops from './villageShops.js';
import * as monsters from './monsters.js';
import * as pets from './pets.js';
import * as starterGear from './starterGear.js';
import * as quests from './quests.js';
import { createPagination, setupBackToTopButton, scrollToTop, createSearchFilterBar } from './ui.js';

// Import specific functions from characters module
const { renderCharacterCards } = characters;

// Make weatherStats available globally
window.weatherStats = weatherStats;


export {
  inventory,
  items,
  characters,
  stats,
  weatherStats,
  error,
  auth,
  guilds,
  villageShops,
  monsters,
  pets,
  starterGear,
};

// ============================================================================
// ------------------- Initialization -------------------
// Sets up UI listeners and initializes dashboard on load
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
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
    
    const backToTopButton = document.getElementById('backToTop');
    
    setupSidebarNavigation();
    setupBackToTopButton();
    setupModelCards();
    
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
    error.logError(err, 'Initialization');
  }
});

// Force sidebar to closed state on page load
// (prevents stuck mobile-open or mobile-closing classes)
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (sidebar) {
    sidebar.classList.remove('mobile-open', 'mobile-closing');
  }
  if (overlay) {
    overlay.classList.remove('active');
  }
  document.body.style.overflow = '';
});

// ------------------- Function: setupModelCards -------------------
// Attaches click handlers to each model card and loads model data
function setupModelCards() {
  const modelCards = document.querySelectorAll('.model-card');

  modelCards.forEach(card => {
    const modelName = card.getAttribute('data-model');
    
    card.addEventListener('click', async (event) => {
      event.preventDefault(); // Prevent default button behavior

      // Update URL with hash
      const hash = `#${modelName}`;
      window.history.pushState({ model: modelName }, '', hash);
      
      // Reinitialize blupee system when viewing a model
      if (window.reinitializeBlupee) {
        window.reinitializeBlupee();
      }
      
      // Scroll to top when viewing a model
      scrollToTop();

      // Reset filters when switching between models
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

      // Add visual feedback for click
      card.classList.add('clicked');
      setTimeout(() => card.classList.remove('clicked'), 200);

      showLoadingState();

      // Declare variables outside try block so they're available in catch
      let dashboardSection, modelDetailsPage, title, contentDiv, backButton;

      try {
        // Hide dashboard, show details view
        dashboardSection = document.getElementById('dashboard-section');
        modelDetailsPage = document.getElementById('model-details-page');
        title = document.getElementById('model-details-title');
        contentDiv = document.getElementById('model-details-data');
        backButton = document.querySelector('.back-button');

        if (!dashboardSection || !modelDetailsPage || !title || !contentDiv || !backButton) {
          throw new Error('Required DOM elements not found');
        }

        dashboardSection.style.display = 'none';
        modelDetailsPage.style.display = 'block';
        title.textContent = modelName.charAt(0).toUpperCase() + modelName.slice(1);
        contentDiv.innerHTML = '';

        // Setup back button handler
        backButton.onclick = () => {
          // Update URL to go back to dashboard
          window.history.pushState({ section: 'dashboard-section' }, '', '/');
          
          // Reinitialize blupee system when going back
          if (window.reinitializeBlupee) {
            window.reinitializeBlupee();
          }
          
          // Scroll to top when going back to dashboard
          scrollToTop();
          
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
          } else if (modelName === 'quest') {
            window.questFiltersInitialized = false;
            window.allQuests = null;
          }
        };

        // Ensure back to top button is set up for model pages
        setupBackToTopButton();

        let fetchUrl = `/api/models/${modelName}`;
        if (modelName === 'starterGear') {
          fetchUrl = '/api/models/item?all=true';
        } else if (modelName === 'helpwantedquest') {
          fetchUrl = '/api/models/helpwantedquest?all=true';
        }
   
        const response = await fetch(fetchUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const { data, pagination } = await response.json();

        const characterFiltersBar = document.querySelector('.character-filters');
        if (modelName === 'character' && characterFiltersBar) {
          if (contentDiv.firstChild !== characterFiltersBar) {
            contentDiv.insertBefore(characterFiltersBar, contentDiv.firstChild);
          }
          characterFiltersBar.style.display = 'flex';
        } else if (characterFiltersBar) {
          characterFiltersBar.style.display = 'none';
        }

        const villageShopResultsInfo = document.querySelector('.village-shop-results-info');
        const villageShopSearchFilters = document.querySelector('.village-shop-search-filters');
        
        if (modelName === 'villageShops') {
          if (villageShopResultsInfo) {
            if (contentDiv.firstChild !== villageShopResultsInfo) {
              contentDiv.insertBefore(villageShopResultsInfo, contentDiv.firstChild);
            }
            villageShopResultsInfo.style.display = 'block';
          }
          if (villageShopSearchFilters) {
            if (contentDiv.firstChild !== villageShopSearchFilters) {
              contentDiv.insertBefore(villageShopSearchFilters, contentDiv.firstChild);
            }
            villageShopSearchFilters.style.display = 'block';
          }
        } else {
          if (villageShopResultsInfo) {
            villageShopResultsInfo.style.display = 'none';
          }
          if (villageShopSearchFilters) {
            villageShopSearchFilters.style.display = 'none';
          }
        }
        
        if (modelName === 'villageShops' && !villageShopResultsInfo) {
          console.error('❌ Village shop results info container not found in index.js');
        }

        switch (modelName) {
          case 'character':
            await characters.initializeCharacterPage(data, pagination.page, contentDiv);
            break;
          case 'weather':
            await weatherStats.initializeWeatherStatsPage();
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
                // Don't apply normal pagination when filters are active
                // Let the filtered pagination handle it
                return; // Skip pagination update
              }
            }
            await items.initializeItemPage(data, pagination.page, contentDiv);
            break;
          case 'starterGear':
            title.textContent = 'Starter Gear';
            await starterGear.initializeStarterGearPage(data, pagination.page, contentDiv);
            break;
          case 'monster':
            await monsters.initializeMonsterPage(data, pagination.page, contentDiv);
            break;
          case 'pet':
            await pets.initializePetPage(data, pagination.page, contentDiv);
            break;
          case 'inventory':
            // Inventory uses its own efficient pagination system
            // Skip the main pagination logic entirely
            await inventory.initializeInventoryPage(data, pagination.page, contentDiv);
            break;
          case 'villageShops':
            await villageShops.initializeVillageShopsPage(data, pagination.page, contentDiv);
            break;
          case 'quest':
            await quests.initializeQuestPage(data, pagination.page, contentDiv);
            break;
          case 'helpwantedquest':
            title.textContent = 'Help Wanted Quests';
            // Show loading state while fetching user/character data
            contentDiv.innerHTML = `
              <div class="quest-loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; min-height: 400px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent-color); margin-bottom: 1.5rem;"></i>
                <p style="font-size: 1.1rem; color: var(--text-primary); font-weight: 600;">Loading Help Wanted Quests...</p>
                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">Fetching quest and user data</p>
              </div>
            `;
            // Render async with proper delay to ensure loading shows
            await renderHelpWantedQuests(data, contentDiv);
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
              // Don't create normal pagination when filters are active
              // Let the filtered pagination handle it
              return;
            }
          }

          // Skip pagination for inventory as it uses its own efficient system
          if (modelName === 'inventory') {
            return;
          }

          // Skip pagination for village shops as it uses its own efficient system
          if (modelName === 'villageShops') {
            return;
          }

          // Skip pagination for quests as it uses its own efficient system
          if (modelName === 'quest') {
            return;
          }

          // Skip pagination for help wanted quests as it uses its own efficient system
          if (modelName === 'helpwantedquest') {
            return;
          }

          const handlePageChange = async (pageNum) => {
            showLoadingState();
            try {
              const { data, pagination } = await loadModelData(modelName, pageNum);

              switch (modelName) {
                case 'character':
                  try {
                    // For characters, we need to handle pagination differently
                    // since they have their own filtering system
                    if (!window.characterFiltersInitialized) {
                      // If filters aren't initialized, use the main pagination
                      await characters.renderCharacterCards(data, pagination.page, false);
                    } else {
                      // If filters are initialized, let the character module handle pagination
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
                      // Don't apply normal pagination when filters are active
                      // Let the filtered pagination handle it
                      return;
                    }
                  }
                  await items.renderItemCards(data, pagination.page, pagination.total);
                  break;
                case 'inventory':
                  // Inventory uses its own efficient pagination system
                  // Skip the main pagination handling
                  return;
                case 'monster':
                  // For monsters, we need to update the global data and re-render
                  window.allMonsters = data;
                  await monsters.renderMonsterCards(data, pagination.page, pagination.total);
                  break;
                case 'pet':
                  // For pets, we need to update the global data and re-render
                  window.allPets = data;
                  await pets.renderPetCards(data, pagination.page, pagination.total);
                  break;
                case 'villageShops':
                  // Village shops uses its own efficient pagination system
                  // Skip the main pagination handling
                  return;
                case 'quest':
                  // Quests uses its own efficient pagination system
                  // Skip the main pagination handling
                  return;
                default:
                  console.error(`Unknown model type: ${modelName}`);
              }
              
              // Recreate pagination with updated page number
              const updatedPaginationDiv = createPagination({ page: pagination.page, pages: pagination.pages }, handlePageChange);
              
              // Update pagination in the DOM
              const contentDiv = document.getElementById('model-details-data');
              if (contentDiv) {
                const existingPagination = contentDiv.querySelector('.pagination');
                if (existingPagination) {
                  existingPagination.remove();
                }
                contentDiv.appendChild(updatedPaginationDiv);
              }
              
            } catch (err) {
              console.error('❌ Error loading page data:', err);
              error.logError(err, 'Loading Page Data');
            } finally {
              hideLoadingState();
            }
          };

          // For characters, we need to create a pagination container if it doesn't exist
          if (modelName === 'character') {
            // Fix the createPagination call to use correct parameter format
            const paginationDiv = createPagination({ page: pagination.page, pages: pagination.pages }, handlePageChange);
            let paginationContainer = document.getElementById('character-pagination');
            if (!paginationContainer) {
              paginationContainer = document.createElement('div');
              paginationContainer.id = 'character-pagination';
              contentDiv.appendChild(paginationContainer);
            }
            paginationContainer.innerHTML = '';
            paginationContainer.appendChild(paginationDiv);
          } else if (modelName === 'inventory') {
            // Inventory uses its own efficient pagination system
            // Skip creating main pagination container
          } else if (modelName === 'villageShops') {
            // Village shops uses its own efficient pagination system
            // Skip creating main pagination container
          } else {
            // Fix the createPagination call to use correct parameter format
            const paginationDiv = createPagination({ page: pagination.page, pages: pagination.pages }, handlePageChange);
            contentDiv.appendChild(paginationDiv);
          }
        }

        // Load character of the week
        if (typeof loadCharacterOfWeek === 'function') {
          try {
            loadCharacterOfWeek();
          } catch (error) {
            console.error('❌ Error loading character of the week:', error);
          }
        } else {
        }

      } catch (err) {
        console.error('❌ Error loading model data:', err);
        error.logError(err, 'Loading Model Data');
        if (contentDiv) {
          handleModelDataError(modelName, contentDiv);
        }
      } finally {
        hideLoadingState();
      }
    });
  });
}

// ------------------- Function: loadModelByName -------------------
// Loads a model view by triggering the model card click
async function loadModelByName(modelName) {
  const modelCard = document.querySelector(`.model-card[data-model="${modelName}"]`);
  if (modelCard) {
    modelCard.click();
  } else {
    console.warn(`Model card not found for: ${modelName}`);
  }
}

// ------------------- Function: loadModelData -------------------
// Fetches paginated model data by type
async function loadModelData(modelName, page = 1) {
  // For characters, always load all characters to enable proper filtering and search
  const url = modelName === 'character' 
    ? `/api/models/${modelName}?all=true`
    : `/api/models/${modelName}?page=${page}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const result = await response.json();
  
  return result;
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
            await inventory.initializeInventoryPage(data, pagination.page, contentDiv);
            break;
          case 'monster':
            await monsters.initializeMonsterPage(data, pagination.page, contentDiv);
            break;
          case 'villageShops':
            await villageShops.initializeVillageShopsPage(data, pagination.page, contentDiv);
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
    inventory.renderCharacterCards(data);
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
  } catch (err) {
    error.logError(err, 'Loading Stats');
  }
}

// ============================================================================
// ------------------- Section Navigation -------------------
// Switches between sections using nav links
// ============================================================================
function showSection(sectionId) {
  // Scroll to top when showing a new section
  scrollToTop();
  
  // Hide all main content sections including dashboard
  const mainContent = document.querySelector('.main-content');
  const allSections = mainContent.querySelectorAll('section, #model-details-page');
  
  allSections.forEach(section => {
    if (section.id === sectionId) {
      section.style.display = 'block';
    } else {
      section.style.display = 'none';
    }
  });
}

// ============================================================================
// ------------------- Navigation Setup -------------------
// Handles all sidebar navigation including dashboard and stats
// ============================================================================
function setupSidebarNavigation() {
  
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  
  sidebarLinks.forEach(link => {
    const sectionId = link.getAttribute('data-section');
    
    link.addEventListener('click', e => {
      // Allow external links (like /map) to work normally
      if (!sectionId) {
        // No data-section means it's an external link, don't prevent default
        closeMobileSidebar();
        return;
      }
      
      e.preventDefault();
      
      // Close mobile sidebar if open
      closeMobileSidebar();
      
      // Update URL
      const newUrl = sectionId === 'dashboard-section' ? '/' : `#${sectionId}`;
      window.history.pushState({ section: sectionId }, '', newUrl);
      
      // Reinitialize blupee system when navigating to a new section
      if (window.reinitializeBlupee) {
        window.reinitializeBlupee();
      }
      
      // Scroll to top when navigating to a new section
      scrollToTop();
      
      // Handle different sections
      if (sectionId === 'stats-section') {
        showStatsSection();
      } else if (sectionId === 'dashboard-section') {
        showDashboardSection();
      } else if (sectionId === 'profile-section') {
        showProfileSection();
      } else if (sectionId === 'guilds-section') {
        showGuildSection();
      } else if (sectionId === 'calendar-section') {
        showCalendarSection();
      } else if (sectionId === 'users-section') {
        showUsersSection();
      } else if (sectionId === 'relationships-section') {
        relationshipsModule.showRelationshipsSection();
      } else if (sectionId === 'admin-area-section') {
        showAdminAreaSection();
      } else if (sectionId === 'settings-section') {
        showSettingsSection();
      } else if (sectionId === 'levels-section') {
        showLevelsSection();
      } else if (sectionId === 'suggestion-box-section') {
        showSuggestionBoxSection();
      } else if (sectionId === 'member-lore-section') {
        showMemberLoreSection();
      } else {
        // For other sections, use the existing showSection function
        showSection(sectionId);
      }
    });
  });
  
  // Handle browser back/forward buttons
  window.addEventListener('popstate', (event) => {
    // Scroll to top when using browser navigation
    scrollToTop();
    
    // Check if it's a model or a section
    if (event.state?.model) {
      // It's a model (characters, mounts, etc.)
      loadModelByName(event.state.model);
    } else {
      // It's a section
      const section = event.state?.section || 'dashboard-section';
      const subSection = event.state?.subSection;
      
      if (section === 'stats-section') {
        showStatsSection();
      } else if (section === 'dashboard-section') {
        showDashboardSection();
      } else if (section === 'profile-section') {
        showProfileSection();
      } else if (section === 'guilds-section') {
        showGuildSection();
      } else if (section === 'calendar-section') {
        showCalendarSection();
      } else if (section === 'users-section') {
        showUsersSection();
      } else if (section === 'relationships-section') {
        relationshipsModule.showRelationshipsSection();
      } else if (section === 'weatherstats') {
        // Handle weather statistics page
        if (window.showWeatherStats) {
          window.showWeatherStats();
        }
      } else if (section === 'admin-area-section') {
        showAdminAreaSection();
        // Check if we need to open database editor
        if (subSection === 'database-editor') {
          setTimeout(() => {
            if (window.openDatabaseEditor) {
              window.openDatabaseEditor();
            }
          }, 100);
        }
      } else if (section === 'settings-section') {
        showSettingsSection();
      } else if (section === 'levels-section') {
        showLevelsSection();
      } else if (section === 'suggestion-box-section') {
        showSuggestionBoxSection();
      } else if (section === 'member-lore-section') {
        showMemberLoreSection();
      } else {
        showSection(section);
      }
    }
  });
  
  // Handle initial URL on page load
  const hash = window.location.hash;
  if (hash) {
    const hashValue = hash.substring(1);
    
    // List of known model names
    const modelNames = ['character', 'monster', 'pet', 'mount', 'vending', 'item', 'starterGear', 'village', 'villageShops', 'relic', 'quest', 'inventory'];
    
    // Check for admin area sub-sections
    if (hashValue === 'admin-area-section/database-editor') {
      showAdminAreaSection();
      // Small delay to ensure admin area is loaded before opening database editor
      setTimeout(() => {
        if (window.openDatabaseEditor) {
          window.openDatabaseEditor();
        }
      }, 100);
    }
    // Check if it's a model hash
    else if (modelNames.includes(hashValue)) {
      loadModelByName(hashValue);
    } else if (hashValue === 'stats-section') {
      showStatsSection();
    } else if (hashValue === 'dashboard-section') {
      showDashboardSection();
    } else if (hashValue === 'profile-section') {
      showProfileSection();
    } else if (hashValue === 'guilds-section') {
      showGuildSection();
    } else if (hashValue === 'calendar-section') {
      showCalendarSection();
    } else if (hashValue === 'users-section') {
      showUsersSection();
    } else if (hashValue === 'relationships-section') {
      relationshipsModule.showRelationshipsSection();
    } else if (hashValue === 'admin-area-section') {
      showAdminAreaSection();
    } else if (hashValue === 'settings-section') {
      showSettingsSection();
    } else if (hashValue === 'levels-section') {
      showLevelsSection();
    } else if (hashValue === 'suggestion-box-section') {
      showSuggestionBoxSection();
    } else if (hashValue === 'member-lore-section') {
      showMemberLoreSection();
    } else {
      showSection(hashValue);
    }
  }
  
  // ============================================================================
  // ------------------- Mobile Sidebar Functionality -------------------
  // Handles mobile sidebar toggle and overlay
  // ============================================================================
  setupMobileSidebar();
}

// ============================================================================
// ------------------- Mobile Sidebar Functions -------------------
// Handles mobile sidebar toggle, overlay, and responsive behavior
// ============================================================================

function setupMobileSidebar() {
  
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const mainWrapper = document.querySelector('.main-wrapper');
  
  if (!sidebarToggle || !sidebar) {
    console.warn('⚠️ Sidebar toggle or sidebar not found');
    return;
  }
  
  // Create overlay element for mobile
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);
  
  // Sidebar toggle click handler
  sidebarToggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    
    if (isMobileView()) {
      toggleMobileSidebar();
    } else {
      toggleDesktopSidebar();
    }
  });
  
  // Overlay click handler to close sidebar
  overlay.addEventListener('click', () => {
    closeMobileSidebar();
  });
  
  // Close sidebar on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobileView()) {
      closeMobileSidebar();
    }
  });
  
  // Handle window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      handleWindowResize();
    }, 250);
  });
  
  // Initial setup
  handleWindowResize();
}

function isMobileView() {
  const isMobile = window.innerWidth <= 768;
  return isMobile;
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (!sidebar) {
    console.warn('⚠️ Sidebar not found');
    return;
  }
  
  // Force clean state first - remove any mobile classes
  sidebar.classList.remove('mobile-open', 'mobile-closing');
  
  // Debug: Log the actual sidebar element and its classes after cleanup
  
  // Now check if sidebar should be considered "open" based on transform
  const computedStyle = window.getComputedStyle(sidebar);
  const transform = computedStyle.transform;
  
  // Parse the transform matrix to check if sidebar is visible
  // matrix(a, b, c, d, tx, ty) where tx is the X translation
  // If tx is 0, sidebar is visible (at position 0)
  // If tx is negative (like -280), sidebar is hidden (translated left)
  let isCurrentlyVisible = false;
  
  if (transform === 'none') {
    isCurrentlyVisible = true; // No transform means visible
  } else if (transform.startsWith('matrix(')) {
    const matrixValues = transform.match(/matrix\(([^)]+)\)/);
    if (matrixValues) {
      const values = matrixValues[1].split(',').map(v => parseFloat(v.trim()));
      const tx = values[4]; // X translation (5th value)
      isCurrentlyVisible = tx >= 0; // If translation is 0 or positive, sidebar is visible
    }
  }
  
  
  if (isCurrentlyVisible) {
    closeMobileSidebar();
  } else {
    openMobileSidebar();
  }
}

function openMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (sidebar) {
    // Ensure clean state first
    sidebar.classList.remove('mobile-closing');
    sidebar.classList.add('mobile-open');
  }
  
  if (overlay) {
    overlay.classList.add('active');
  }
  
  // Prevent body scroll when sidebar is open
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (sidebar) {
    // Ensure clean state first
    sidebar.classList.remove('mobile-open');
    sidebar.classList.add('mobile-closing');
    
    // Remove closing class after animation
    setTimeout(() => {
      sidebar.classList.remove('mobile-closing');
    }, 300);
  }
  
  if (overlay) {
    overlay.classList.remove('active');
  }
  
  // Restore body scroll
  document.body.style.overflow = '';
}

function toggleDesktopSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const mainWrapper = document.querySelector('.main-wrapper');
  
  if (sidebar && mainWrapper) {
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
      sidebar.classList.remove('collapsed');
      mainWrapper.classList.remove('sidebar-collapsed');
    } else {
      sidebar.classList.add('collapsed');
      mainWrapper.classList.add('sidebar-collapsed');
    }
  }
}

function handleWindowResize() {
  const sidebar = document.querySelector('.sidebar');
  const mainWrapper = document.querySelector('.main-wrapper');
  const overlay = document.querySelector('.sidebar-overlay');

  // Always reset sidebar and overlay state
  if (sidebar) {
    sidebar.classList.remove('collapsed');
    sidebar.classList.remove('mobile-open');
    sidebar.classList.remove('mobile-closing');
  }
  if (mainWrapper) {
    mainWrapper.classList.remove('sidebar-collapsed');
  }
  if (overlay) {
    overlay.classList.remove('active');
  }
  document.body.style.overflow = '';
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
  // Scroll to top when showing stats section
  scrollToTop();
  
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
  // Scroll to top when showing dashboard section
  scrollToTop();
  
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
    
    // Debug: Check if dashboard content is visible
    const welcomeBox = dashboardSection.querySelector('.dashboard-welcome-box');
    const modelGrid = dashboardSection.querySelector('.model-grid');
    const linksSection = dashboardSection.querySelector('.dashboard-links-section');
    const countdownSection = dashboardSection.querySelector('#countdown-section');
    

    
    // Fix: Explicitly make dashboard content visible
    if (welcomeBox) welcomeBox.style.display = 'block';
    if (modelGrid) modelGrid.style.display = 'grid';
    if (linksSection) linksSection.style.display = 'flex';
    if (countdownSection) countdownSection.style.display = 'block';
    
    // Ensure character of the week section is visible
    const characterOfWeekSection = document.getElementById('character-of-week-section');
    if (characterOfWeekSection) {
      characterOfWeekSection.style.display = 'block';
    }
    
    // Ensure recent quests section is visible
    const recentQuestsSection = document.getElementById('recent-quests-section');
    if (recentQuestsSection) {
      recentQuestsSection.style.display = 'block';
    }
    
    // Check for any loading states that might be hiding content
    const loader = document.getElementById('loader');
    const loadingStates = document.querySelectorAll('.loading-state');
    
    
    // Always destroy and re-create the countdown manager (after content is visible)
    setTimeout(() => {
      if (window.countdownManager && typeof window.countdownManager.destroy === 'function') {
        window.countdownManager.destroy();
      }
      window.countdownManager = new window.CountdownManager();
    }, 0);
    
    // Always clear and reload the weather section
    const weatherSection = document.getElementById('weather-section');
    if (weatherSection) {
      weatherSection.innerHTML = '';
      weatherSection.style.display = 'block';
    }
    // Render weather section
    if (window.renderWeatherSection) {
      window.renderWeatherSection();
    }
    
    // Load character of the week
    if (typeof loadCharacterOfWeek === 'function') {
      try {
        loadCharacterOfWeek();
      } catch (error) {
        console.error('❌ Error loading character of the week:', error);
      }
    } else {
    }
    
    // Load recent quests
    loadRecentQuests();
    
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
// ------------------- Profile Navigation -------------------
// Handles profile page navigation specifically
// ============================================================================
function showProfileSection() {
  // Scroll to top when showing profile section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the profile section
  const profileSection = document.getElementById('profile-section');
  if (profileSection) {
    profileSection.style.display = 'block';
    
    // Initialize profile page
    import('./profile.js?v=20251114').then(profileModule => {
      profileModule.initProfilePage();
    }).catch(err => {
      console.error('❌ Error loading profile module:', err);
    });
  } else {
    console.error('❌ Profile section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'profile-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Profile';
  }
}

// ============================================================================
// ------------------- Guild Navigation -------------------
// Handles guild page navigation specifically
// ============================================================================
function showGuildSection() {
  // Scroll to top when showing guild section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the guild section
  const guildSection = document.getElementById('guilds-section');
  if (guildSection) {
    guildSection.style.display = 'block';
    
    // Initialize guild page
    guilds.showGuildSection();
  } else {
    console.error('❌ Guild section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'guilds-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Guilds';
  }
}

// ============================================================================
// ------------------- Calendar Navigation -------------------
// Handles calendar page navigation specifically
// ============================================================================
function showCalendarSection() {
  // Scroll to top when showing calendar section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the calendar section
  const calendarSection = document.getElementById('calendar-section');
  if (calendarSection) {
    calendarSection.style.display = 'block';
    
    // Initialize calendar page if module is available
    if (window.calendarModule) {
      window.calendarModule.loadCalendarData();
    } else {
    }
  } else {
    console.error('❌ Calendar section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'calendar-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Calendar';
  }
}

// ============================================================================
// ------------------- Users Navigation -------------------
// Handles users page navigation specifically
// ============================================================================
function showUsersSection() {
  // Scroll to top when showing users section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the users section
  const usersSection = document.getElementById('users-section');
  if (usersSection) {
    usersSection.style.display = 'block';
    
    // Initialize users page
    import('./users.js').then(usersModule => {
      // The UserLookup class is already initialized in the module
      // We just need to ensure it's ready
      if (window.userLookup) {
        window.userLookup.initializeSection();
      }
    }).catch(err => {
      console.error('❌ Error loading users module:', err);
    });
  } else {
    console.error('❌ Users section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'users-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Users';
  }
}

// ============================================================================
// ------------------- Settings Navigation -------------------
// Handles settings page navigation specifically
// ============================================================================
function showSettingsSection() {
  // Scroll to top when showing settings section
  scrollToTop();
  
  // Check authentication - redirect to login if not authenticated
  if (!auth.isAuthenticated || !auth.currentUser) {
    window.location.href = '/login';
    return;
  }
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the settings section
  const settingsSection = document.getElementById('settings-section');
  if (settingsSection) {
    settingsSection.style.display = 'block';
    
    // Initialize settings if not already done
    if (window.settingsManager) {
      window.settingsManager.updateUI();
    }
  } else {
    console.error('❌ Settings section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'settings-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Settings';
  }
}

// ============================================================================
// ------------------- Suggestion Box Navigation -------------------
// Handles suggestion box page navigation specifically
// ============================================================================
function showSuggestionBoxSection() {
  // Scroll to top when showing suggestion box section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the suggestion box section
  const suggestionBoxSection = document.getElementById('suggestion-box-section');
  if (suggestionBoxSection) {
    suggestionBoxSection.style.display = 'block';
    
    // Initialize suggestions module if available
    if (window.suggestionsModule && typeof window.suggestionsModule.init === 'function') {
      window.suggestionsModule.init();
    }
  } else {
    console.error('❌ Suggestion box section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'suggestion-box-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Suggestion Box';
  }
}

// ============================================================================
// ------------------- Member Lore Navigation -------------------
// Handles member lore page navigation specifically
// ============================================================================
function showMemberLoreSection() {
  // Scroll to top when showing member lore section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the member lore section
  const memberLoreSection = document.getElementById('member-lore-section');
  if (memberLoreSection) {
    memberLoreSection.style.display = 'block';
    
    // Initialize member lore module if available
    if (window.memberLoreModule && typeof window.memberLoreModule.init === 'function') {
      window.memberLoreModule.init();
    }
  } else {
    console.error('❌ Member lore section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'member-lore-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Member Lore';
  }
}

// ============================================================================
// ------------------- Levels Navigation -------------------
// Handles levels page navigation specifically
// ============================================================================
function showLevelsSection() {
  // Scroll to top when showing levels section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the levels section
  const levelsSection = document.getElementById('levels-section');
  if (levelsSection) {
    levelsSection.style.display = 'block';
    
    // Initialize levels module if available
    if (window.levelsModule && typeof window.levelsModule.init === 'function') {
      window.levelsModule.init();
    }
  } else {
    console.error('❌ Levels section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'levels-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Levels';
  }
}

// ============================================================================
// ------------------- Admin Area Navigation -------------------
// Handles admin area page navigation specifically
// ============================================================================
function showAdminAreaSection() {
  // Scroll to top when showing admin area section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the admin area section
  const adminAreaSection = document.getElementById('admin-area-section');
  if (adminAreaSection) {
    adminAreaSection.style.display = 'block';
    
    // Initialize admin area functionality
    initializeAdminArea();
  } else {
    console.error('❌ Admin area section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'admin-area-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Admin Area';
  }
}

// ============================================================================
// ------------------- Admin Area Initialization -------------------
// Sets up admin area functionality and event handlers
// ============================================================================
function initializeAdminArea() {
  
  // Admin area now contains only the database editor
  // All admin tool buttons have been removed
}

// ============================================================================
// ------------------- User Management Functions (REMOVED) -------------------
// User management section has been removed from admin area
// Database editor is now the only admin tool
// ============================================================================

// ============================================================================
// ------------------- Recent Quests Dashboard Widget -------------------
// Loads and displays recent quests on the main dashboard
// ============================================================================

/**
 * Loads and displays recent quests on the dashboard
 */
async function loadRecentQuests() {
  const container = document.getElementById('recent-quests-container');
  if (!container) return;

  // Update month title
  const monthTitle = document.getElementById('quest-month-title');
  if (monthTitle) {
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
    monthTitle.textContent = `${currentMonth} Quests`;
  }

  try {
    // Fetch the most recent 6 quests
    const response = await fetch('/api/models/quest?limit=6&sort=postedAt&order=desc');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const { data: quests } = await response.json();
    
    if (!quests || quests.length === 0) {
      container.innerHTML = `
        <div class="no-recent-quests">
          <i class="fas fa-inbox"></i>
          <p>No recent quests available</p>
        </div>
      `;
      return;
    }

    // Render quest cards
    container.innerHTML = quests.map(quest => {
      const questTypeClass = getQuestTypeClassForDashboard(quest.questType);
      const questTypeIcon = getQuestTypeIconForDashboard(quest.questType);
      const statusClass = getQuestStatusClassForDashboard(quest.status);
      const statusIcon = getQuestStatusIconForDashboard(quest.status);
      
      // Get village from location if available
      const village = extractVillageFromLocation(quest.location);
      
      // Get participant info
      const participantCount = quest.participants ? Object.keys(quest.participants).length : 0;
      const participantCap = quest.participantCap || '∞';
      
      // Format posted date
      const postedDate = quest.postedAt ? new Date(quest.postedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }) : null;
      
      return `
        <div class="dashboard-quest-card ${questTypeClass}" data-quest-id="${quest.questID}">
          <div class="dashboard-quest-header">
            <div class="dashboard-quest-type ${questTypeClass}">
              <i class="fas ${questTypeIcon}"></i>
              <span>${quest.questType}</span>
            </div>
            <div class="dashboard-quest-status ${statusClass}">
              <i class="fas ${statusIcon}"></i>
            </div>
          </div>
          
          <h3 class="dashboard-quest-title">${quest.title}</h3>
          
          <div class="dashboard-quest-info">
            ${village ? `
              <div class="dashboard-quest-info-item">
                <i class="fas fa-map-marker-alt"></i>
                <span>${village}</span>
              </div>
            ` : ''}
            <div class="dashboard-quest-info-item">
              <i class="fas fa-users"></i>
              <span>${participantCount}/${participantCap} Participants</span>
            </div>
            ${postedDate ? `
              <div class="dashboard-quest-info-item">
                <i class="fas fa-calendar"></i>
                <span>${postedDate}</span>
              </div>
            ` : ''}
          </div>
          
          <button class="dashboard-quest-view-btn" onclick="viewQuestDetails('${quest.questID}')">
            <span>View Details</span>
            <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('❌ Error loading recent quests:', error);
    container.innerHTML = `
      <div class="error-loading-quests">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Failed to load recent quests</p>
      </div>
    `;
  }
}

/**
 * Helper function to get quest type class for dashboard cards
 */
function getQuestTypeClassForDashboard(questType) {
  const typeMap = {
    'Art': 'type-art',
    'Writing': 'type-writing',
    'Interactive': 'type-interactive',
    'RP': 'type-rp',
    'Art / Writing': 'type-art-writing'
  };
  return typeMap[questType] || 'type-unknown';
}

/**
 * Helper function to get quest type icon for dashboard cards
 */
function getQuestTypeIconForDashboard(questType) {
  const iconMap = {
    'Art': 'fa-palette',
    'Writing': 'fa-pen',
    'Interactive': 'fa-gamepad',
    'RP': 'fa-users',
    'Art / Writing': 'fa-paint-brush'
  };
  return iconMap[questType] || 'fa-scroll';
}

/**
 * Helper function to get quest status class for dashboard cards
 */
function getQuestStatusClassForDashboard(status) {
  const statusMap = {
    'active': 'status-active',
    'completed': 'status-completed',
    'cancelled': 'status-cancelled'
  };
  return statusMap[status] || 'status-unknown';
}

/**
 * Helper function to get quest status icon for dashboard cards
 */
function getQuestStatusIconForDashboard(status) {
  const iconMap = {
    'active': 'fa-play-circle',
    'completed': 'fa-check-circle',
    'cancelled': 'fa-times-circle'
  };
  return iconMap[status] || 'fa-question-circle';
}

/**
 * Helper function to extract village name from location string
 */
function extractVillageFromLocation(location) {
  if (!location) return null;
  
  // Common village names to look for
  const villages = ['Inariko', 'Rudania', 'Vhintl'];
  
  for (const village of villages) {
    if (location.toLowerCase().includes(village.toLowerCase())) {
      return village;
    }
  }
  
  // If no village found, return the location as-is (shortened if too long)
  return location.length > 20 ? location.substring(0, 20) + '...' : location;
}

/**
 * View full quest details in a modal
 */
window.viewQuestDetails = async function(questID) {
  console.log('🚀 viewQuestDetails called with questID:', questID);
  
  try {
    // Fetch the specific quest details
    console.log('📡 Fetching quests data...');
    const response = await fetch(`/api/models/quest?all=true`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const { data: quests } = await response.json();
    console.log('✅ Fetched quests:', quests.length);
    
    const quest = quests.find(q => q.questID === questID);
    console.log('🔍 Found quest:', quest);
    
    if (!quest) {
      console.error('❌ Quest not found with ID:', questID);
      alert('Quest not found');
      return;
    }
    
    // Show quest details in a modal
    console.log('📝 Showing quest modal...');
    showQuestDetailsModal(quest);
  } catch (error) {
    console.error('❌ Error viewing quest details:', error);
    alert('Failed to load quest details');
  }
};

/**
 * Show quest details in a modal
 */
function showQuestDetailsModal(quest) {
  console.log('🎯 showQuestDetailsModal called with quest:', quest);
  
  // Import helper functions from quests module
  const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  
  const questTypeClass = getQuestTypeClassForDashboard(quest.questType);
  const questTypeIcon = getQuestTypeIconForDashboard(quest.questType);
  const statusClass = getQuestStatusClassForDashboard(quest.status);
  const statusIcon = getQuestStatusIconForDashboard(quest.status);
  
  // Format dates
  const postedDate = quest.postedAt ? new Date(quest.postedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : 'N/A';
  
  const deadlineDate = quest.signupDeadline ? new Date(quest.signupDeadline).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : null;
  
  // Participant count
  const participantCount = quest.participants ? Object.keys(quest.participants).length : 0;
  const participantCap = quest.participantCap || '∞';
  
  // Token reward formatting
  const tokenReward = formatTokenRewardForModal(quest.tokenReward);
  
  // Item rewards
  const itemRewards = formatItemRewardsForModal(quest.itemRewards, quest.itemReward, quest.itemRewardQty);
  
  // Participation requirements
  const participationReqs = getParticipationRequirements(quest);
  
  // Create modal HTML
  const modalHTML = `
    <div id="quest-details-modal" class="quest-modal-overlay" onclick="if(event.target === this) closeQuestModal()">
      <div class="quest-modal-container quest-modal-large">
        <div class="quest-modal-header">
          <h2>Quest Details</h2>
          <button class="quest-modal-close" onclick="closeQuestModal()" aria-label="Close modal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="quest-details-modal">
          <div class="quest-details-header">
            <div class="quest-details-title-row">
              <h2>${quest.title}</h2>
              <div class="quest-status-badge ${statusClass}">
                <i class="fas ${statusIcon}"></i>
                <span>${capitalize(quest.status)}</span>
              </div>
            </div>
            
            <div class="quest-type-badge ${questTypeClass}">
              <i class="fas ${questTypeIcon}"></i>
              <span>${quest.questType}</span>
            </div>
          </div>
          
          <div class="quest-details-body">
            <div class="quest-detail-section">
              <h3><i class="fas fa-info-circle"></i> Description</h3>
              <p class="quest-description-text">${quest.description || 'No description provided'}</p>
            </div>
            
            <div class="quest-detail-section">
              <h3><i class="fas fa-list"></i> Quest Information</h3>
              <div class="quest-info-grid">
                <div class="quest-info-item">
                  <strong>📍 Location:</strong>
                  <span>${quest.location || 'N/A'}</span>
                </div>
                <div class="quest-info-item">
                  <strong>⏰ Time Limit:</strong>
                  <span>${quest.timeLimit || 'N/A'}</span>
                </div>
                <div class="quest-info-item">
                  <strong>👥 Participants:</strong>
                  <span>${participantCount}/${participantCap}</span>
                </div>
                <div class="quest-info-item">
                  <strong>📅 Posted:</strong>
                  <span>${postedDate}</span>
                </div>
                ${deadlineDate ? `
                  <div class="quest-info-item">
                    <strong>⏳ Signup Deadline:</strong>
                    <span>${deadlineDate}</span>
                  </div>
                ` : ''}
              </div>
            </div>
            
            ${tokenReward || itemRewards ? `
              <div class="quest-detail-section">
                <h3><i class="fas fa-gift"></i> Rewards</h3>
                <div class="quest-rewards-list">
                  ${tokenReward ? `<div class="reward-item">💰 ${tokenReward}</div>` : ''}
                  ${itemRewards ? `<div class="reward-item">🎁 ${itemRewards}</div>` : ''}
                </div>
              </div>
            ` : ''}
            
            ${participationReqs.length > 0 ? `
              <div class="quest-detail-section">
                <h3><i class="fas fa-tasks"></i> Participation Requirements</h3>
                <div class="quest-requirements-list">
                  ${participationReqs.map(req => `
                    <div class="requirement-item-modal">
                      <span>${req.icon}</span>
                      <span>${req.text}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            
            ${quest.rules ? `
              <div class="quest-detail-section">
                <h3><i class="fas fa-gavel"></i> Rules</h3>
                <p class="quest-rules-text">${quest.rules}</p>
              </div>
            ` : ''}
            
            ${quest.specialNote ? `
              <div class="quest-detail-section quest-special-note-section">
                <h3><i class="fas fa-star"></i> Special Note</h3>
                <p class="quest-special-note-text">${quest.specialNote}</p>
              </div>
            ` : ''}
            
            ${participantCount > 0 ? `
              <div class="quest-detail-section">
                <h3><i class="fas fa-users"></i> Participants (${participantCount})</h3>
                <div class="quest-participants-list-modal">
                  ${Object.values(quest.participants).map(participant => `
                    <div class="participant-card">
                      <div class="participant-name">${participant.characterName}</div>
                      <div class="participant-status ${participant.progress}">${capitalize(participant.progress)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
          
          <div class="quest-details-footer">
            <button class="btn-primary" onclick="closeQuestModal()">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Remove any existing modal
  const existingModal = document.getElementById('quest-details-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Show modal with animation
  setTimeout(() => {
    const modal = document.getElementById('quest-details-modal');
    if (modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }, 10);
}

/**
 * Close the quest details modal
 */
window.closeQuestModal = function() {
  const modal = document.getElementById('quest-details-modal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
    setTimeout(() => {
      modal.remove();
    }, 300);
  }
};

/**
 * Navigate to full quest page and highlight specific quest
 */
window.viewFullQuestPage = async function(questID) {
  hideModal();
  
  try {
    // Load the quest model data
    await loadModelData('quest');
    
    // Wait a bit for the model data to load
    setTimeout(() => {
      // Find the quest card with the matching ID
      const questCard = document.querySelector(`.quest-card[data-quest-id="${questID}"]`);
      if (questCard) {
        questCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight the card briefly
        questCard.style.boxShadow = '0 0 30px rgba(0, 163, 218, 0.6)';
        questCard.style.border = '2px solid rgba(0, 163, 218, 0.8)';
        setTimeout(() => {
          questCard.style.boxShadow = '';
          questCard.style.border = '';
        }, 3000);
      }
    }, 800);
  } catch (error) {
    console.error('❌ Error navigating to quest page:', error);
  }
};

/**
 * Helper functions for modal formatting
 */
function formatTokenRewardForModal(tokenReward) {
  if (!tokenReward || tokenReward === 'N/A' || tokenReward === 'No reward' || tokenReward === 'None') {
    return null;
  }
  
  if (typeof tokenReward === 'number') {
    return `${tokenReward} tokens`;
  }
  
  if (typeof tokenReward === 'string') {
    // Parse complex reward formats
    if (tokenReward.includes('per_unit:')) {
      const perUnitMatch = tokenReward.match(/per_unit:(\d+)/);
      const unitMatch = tokenReward.match(/unit:(\w+)/);
      const maxMatch = tokenReward.match(/max:(\d+)/);
      
      if (perUnitMatch && unitMatch && maxMatch) {
        const perUnit = parseInt(perUnitMatch[1]);
        const unit = unitMatch[1];
        const max = parseInt(maxMatch[1]);
        const total = perUnit * max;
        return `${perUnit} tokens per ${unit} (max ${max} = ${total} tokens total)`;
      }
    } else if (tokenReward.includes('flat:')) {
      const flatMatch = tokenReward.match(/flat:(\d+)/);
      if (flatMatch) {
        return `${flatMatch[1]} tokens (flat rate)`;
      }
    } else if (tokenReward.includes('collab_bonus:')) {
      const bonusMatch = tokenReward.match(/collab_bonus:(\d+)/);
      if (bonusMatch) {
        return `${bonusMatch[1]} tokens (collaboration bonus)`;
      }
    } else {
      const parsed = parseFloat(tokenReward);
      if (!isNaN(parsed)) {
        return `${parsed} tokens`;
      }
    }
  }
  
  return String(tokenReward);
}

function formatItemRewardsForModal(itemRewards, itemReward, itemRewardQty) {
  if (itemRewards && itemRewards.length > 0) {
    return itemRewards.map(item => `${item.quantity}x ${item.name}`).join(', ');
  }
  
  if (itemReward && itemReward !== 'N/A' && itemReward !== 'No reward') {
    const qty = itemRewardQty || 1;
    return `${qty}x ${itemReward}`;
  }
  
  return null;
}

function getParticipationRequirements(quest) {
  const requirements = [];
  
  if (quest.questType === 'RP' && quest.postRequirement) {
    requirements.push({
      icon: '💬',
      text: `${quest.postRequirement} RP Posts Required`
    });
  }
  
  if (quest.questType === 'Writing' && quest.postRequirement) {
    requirements.push({
      icon: '📝',
      text: `${quest.postRequirement} Writing Submissions`
    });
  }
  
  if (quest.questType === 'Art' && quest.postRequirement) {
    requirements.push({
      icon: '🎨',
      text: `${quest.postRequirement} Art Submissions`
    });
  }
  
  if (quest.questType === 'Art / Writing') {
    if (quest.postRequirement) {
      requirements.push({
        icon: '🎨📝',
        text: `${quest.postRequirement} Submissions Each (Art AND Writing)`
      });
    } else {
      requirements.push({
        icon: '🎨📝',
        text: '1 Submission Each (Art AND Writing)'
      });
    }
  }
  
  if (quest.questType === 'Interactive' && quest.requiredRolls) {
    requirements.push({
      icon: '🎲',
      text: `${quest.requiredRolls} Successful Rolls`
    });
  }
  
  if (quest.minRequirements) {
    if (typeof quest.minRequirements === 'number' && quest.minRequirements > 0) {
      requirements.push({
        icon: '📊',
        text: `Level ${quest.minRequirements}+ Required`
      });
    } else if (typeof quest.minRequirements === 'object' && quest.minRequirements.level) {
      requirements.push({
        icon: '📊',
        text: `Level ${quest.minRequirements.level}+ Required`
      });
    }
  }
  
  // Default requirements if none specified
  if (requirements.length === 0) {
    if (quest.questType === 'RP') {
      requirements.push({
        icon: '💬',
        text: '15 RP Posts Required (default)'
      });
    } else if (quest.questType === 'Writing') {
      requirements.push({
        icon: '📝',
        text: '1 Writing Submission'
      });
    } else if (quest.questType === 'Art') {
      requirements.push({
        icon: '🎨',
        text: '1 Art Submission'
      });
    }
  }
  
  return requirements;
}

// ------------------- Function: renderHelpWantedQuests -------------------
// Renders Help Wanted Quest data with search, filter, and pagination
async function renderHelpWantedQuests(data, contentDiv) {
  // Allow loading state to render
  await new Promise(resolve => setTimeout(resolve, 50));
  
  if (!data || data.length === 0) {
    contentDiv.innerHTML = `
      <div class="error-state">
        <i class="fas fa-inbox"></i>
        <p>No Help Wanted Quests found</p>
      </div>
    `;
    return;
  }

  // Store all quests in global variable for filtering
  window.allHWQs = data;
  window.hwqCurrentPage = 1;
  window.hwqItemsPerPage = 12;

  // Create the initial UI with filters
  createHWQInterface(contentDiv);
  
  // Populate NPC dropdown with unique NPCs
  populateHWQNPCFilter(data);
  
  // Apply initial filter and render
  await filterAndRenderHWQs();
}

// ------------------- Function: createHWQInterface -------------------
// Creates the HWQ interface with filters and containers
function createHWQInterface(contentDiv) {
  contentDiv.innerHTML = `
    <!-- HWQ Info Message -->
    <div class="hwq-info-message" style="
      padding: 1rem 1.5rem;
      background: linear-gradient(135deg, rgba(33, 150, 243, 0.15), rgba(33, 150, 243, 0.08));
      border: 1px solid rgba(33, 150, 243, 0.3);
      border-radius: 12px;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    ">
      <i class="fas fa-info-circle" style="font-size: 1.5rem; color: #2196f3;"></i>
      <div>
        <strong style="color: var(--text-primary); display: block; margin-bottom: 0.25rem;">
          Security Notice
        </strong>
        <span style="color: var(--text-secondary); font-size: 0.9rem;">
          Active quests are hidden to prevent early completion. Only completed and expired quests are shown.
        </span>
      </div>
    </div>

    <div class="hwq-filter-container"></div>

    <!-- HWQ Stats Grid -->
    <div class="hwq-stats-grid" id="hwq-stats-grid"></div>

    <!-- HWQ Results Info -->
    <div class="hwq-results-info" id="hwq-results-info"></div>

    <!-- HWQ Quest Cards Grid -->
    <div class="quest-details-grid" id="hwq-quests-grid"></div>

    <!-- HWQ Pagination -->
    <div class="hwq-pagination" id="hwq-pagination" style="display: none;"></div>
  `;

  renderHWQFilterBar(contentDiv);

  // Setup event listeners
  setupHWQEventListeners();
}

function renderHWQFilterBar(contentDiv) {
  const container = contentDiv.querySelector('.hwq-filter-container');
  if (!container) return;

  container.innerHTML = '';

  const { bar } = createSearchFilterBar({
    id: 'hwq-filter-bar',
    layout: 'wide',
    filters: [
      {
        type: 'input',
        id: 'hwq-search-input',
        placeholder: 'Search by NPC, requirements, or Quest ID...',
        attributes: { 'aria-label': 'Search Help Wanted Quests' },
        width: 'double',
        label: 'Search'
      },
      {
        type: 'select',
        id: 'hwq-village-filter',
        label: 'Village',
        attributes: { 'aria-label': 'Filter by village' },
        options: [
          { value: '', label: 'All Villages', selected: true },
          { value: 'Rudania', label: 'Rudania' },
          { value: 'Inariko', label: 'Inariko' },
          { value: 'Vhintl', label: 'Vhintl' }
        ]
      },
      {
        type: 'select',
        id: 'hwq-type-filter',
        label: 'Quest Type',
        attributes: { 'aria-label': 'Filter by quest type' },
        options: [
          { value: '', label: 'All Types', selected: true },
          { value: 'item', label: 'Item' },
          { value: 'monster', label: 'Monster' },
          { value: 'escort', label: 'Escort' },
          { value: 'crafting', label: 'Crafting' },
          { value: 'art', label: 'Art' },
          { value: 'writing', label: 'Writing' }
        ]
      },
      {
        type: 'select',
        id: 'hwq-npc-filter',
        label: 'NPC',
        attributes: { 'aria-label': 'Filter by NPC' },
        options: [{ value: '', label: 'All NPCs', selected: true }]
      },
      {
        type: 'select',
        id: 'hwq-status-filter',
        label: 'Status',
        attributes: { 'aria-label': 'Filter by status' },
        options: [
          { value: '', label: 'All', selected: true },
          { value: 'completed', label: 'Completed' },
          { value: 'expired', label: 'Expired' }
        ]
      },
      {
        type: 'select',
        id: 'hwq-sort-select',
        label: 'Sort By',
        attributes: { 'aria-label': 'Sort quests' },
        options: [
          { value: 'date-desc', label: 'Newest First', selected: true },
          { value: 'date-asc', label: 'Oldest First' },
          { value: 'village', label: 'Village' },
          { value: 'type', label: 'Type' },
          { value: 'npc', label: 'NPC Name' }
        ]
      }
    ],
    buttons: [
      {
        id: 'hwq-clear-filters',
        className: 'clear-filters-btn hwq-clear-filters-btn',
        html: '<i class="fas fa-times"></i> Clear Filters',
        attributes: { 'aria-label': 'Clear all filters' }
      }
    ]
  });

  container.appendChild(bar);
}

// ------------------- Function: populateHWQNPCFilter -------------------
// Populates the NPC filter dropdown with unique NPCs
function populateHWQNPCFilter(quests) {
  const npcFilter = document.getElementById('hwq-npc-filter');
  if (!npcFilter) return;

  // Get unique NPCs and sort them
  const uniqueNPCs = [...new Set(quests.map(q => q.npcName))].sort();
  
  // Keep the "All NPCs" option and add the rest
  npcFilter.innerHTML = '<option value="">All NPCs</option>';
  uniqueNPCs.forEach(npc => {
    const option = document.createElement('option');
    option.value = npc;
    option.textContent = npc;
    npcFilter.appendChild(option);
  });
}

// ------------------- Function: setupHWQEventListeners -------------------
// Sets up all event listeners for HWQ filters and pagination
function setupHWQEventListeners() {
  const searchInput = document.getElementById('hwq-search-input');
  const villageFilter = document.getElementById('hwq-village-filter');
  const typeFilter = document.getElementById('hwq-type-filter');
  const npcFilter = document.getElementById('hwq-npc-filter');
  const statusFilter = document.getElementById('hwq-status-filter');
  const sortSelect = document.getElementById('hwq-sort-select');
  const clearBtn = document.getElementById('hwq-clear-filters');

  if (searchInput) {
    searchInput.addEventListener('input', async () => {
      window.hwqCurrentPage = 1;
      await filterAndRenderHWQs();
    });
  }

  if (villageFilter) {
    villageFilter.addEventListener('change', async () => {
      window.hwqCurrentPage = 1;
      await filterAndRenderHWQs();
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', async () => {
      window.hwqCurrentPage = 1;
      await filterAndRenderHWQs();
    });
  }

  if (npcFilter) {
    npcFilter.addEventListener('change', async () => {
      window.hwqCurrentPage = 1;
      await filterAndRenderHWQs();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', async () => {
      window.hwqCurrentPage = 1;
      await filterAndRenderHWQs();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', async () => {
      await filterAndRenderHWQs();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (searchInput) searchInput.value = '';
      if (villageFilter) villageFilter.value = '';
      if (typeFilter) typeFilter.value = '';
      if (npcFilter) npcFilter.value = '';
      if (statusFilter) statusFilter.value = '';
      if (sortSelect) sortSelect.value = 'date-desc';
      window.hwqCurrentPage = 1;
      await filterAndRenderHWQs();
    });
  }
}

// ------------------- Function: filterAndRenderHWQs -------------------
// Filters and renders HWQs based on current filter settings
async function filterAndRenderHWQs() {
  if (!window.allHWQs) return;

  const searchInput = document.getElementById('hwq-search-input');
  const villageFilter = document.getElementById('hwq-village-filter');
  const typeFilter = document.getElementById('hwq-type-filter');
  const npcFilter = document.getElementById('hwq-npc-filter');
  const statusFilter = document.getElementById('hwq-status-filter');
  const sortSelect = document.getElementById('hwq-sort-select');

  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  const villageValue = villageFilter ? villageFilter.value : '';
  const typeValue = typeFilter ? typeFilter.value : '';
  const npcValue = npcFilter ? npcFilter.value : '';
  const statusValue = statusFilter ? statusFilter.value : '';
  const sortValue = sortSelect ? sortSelect.value : 'date-desc';

  const now = new Date();

  // Filter quests
  let filteredQuests = window.allHWQs.filter(quest => {
    // Determine if quest is expired (not completed and past its date + 24 hours)
    const questDate = new Date(quest.date);
    const expirationTime = new Date(questDate.getTime() + 24 * 60 * 60 * 1000); // 24 hours after quest date
    const isExpired = !quest.completed && now > expirationTime;
    
    // SECURITY: Hide active quests (not completed and not expired yet) to prevent sniping
    if (!quest.completed && !isExpired) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const searchable = [
        quest.questId,
        quest.npcName,
        quest.village,
        quest.type,
        JSON.stringify(quest.requirements)
      ].join(' ').toLowerCase();
      
      if (!searchable.includes(searchTerm)) return false;
    }

    // Village filter
    if (villageValue && quest.village !== villageValue) return false;

    // Type filter
    if (typeValue && quest.type !== typeValue) return false;

    // NPC filter
    if (npcValue && quest.npcName !== npcValue) return false;

    // Status filter
    if (statusValue === 'completed' && !quest.completed) return false;
    if (statusValue === 'expired' && (quest.completed || !isExpired)) return false;

    return true;
  });

  // Sort quests
  filteredQuests.sort((a, b) => {
    switch (sortValue) {
      case 'date-desc':
        return new Date(b.date) - new Date(a.date);
      case 'date-asc':
        return new Date(a.date) - new Date(b.date);
      case 'village':
        return a.village.localeCompare(b.village);
      case 'type':
        return a.type.localeCompare(b.type);
      case 'npc':
        return a.npcName.localeCompare(b.npcName);
      default:
        return 0;
    }
  });

  // Calculate stats for ALL quests (not just filtered)
  renderHWQStats(window.allHWQs);

  // Update results info
  updateHWQResultsInfo(filteredQuests.length, window.allHWQs.length);

  // Paginate and render
  const totalPages = Math.ceil(filteredQuests.length / window.hwqItemsPerPage);
  const startIndex = (window.hwqCurrentPage - 1) * window.hwqItemsPerPage;
  const endIndex = startIndex + window.hwqItemsPerPage;
  const paginatedQuests = filteredQuests.slice(startIndex, endIndex);

  // Render quest cards (async)
  await renderHWQCards(paginatedQuests);
  
  // Render pagination after cards are rendered
  renderHWQPagination(window.hwqCurrentPage, totalPages);
}

// ------------------- Function: renderHWQStats -------------------
// Renders the stats cards for HWQs (only for visible quests)
function renderHWQStats(quests) {
  const statsGrid = document.getElementById('hwq-stats-grid');
  if (!statsGrid) return;

  const now = new Date();
  
  // Filter to only show completed and expired quests (hide active ones)
  const visibleQuests = quests.filter(quest => {
    const questDate = new Date(quest.date);
    const expirationTime = new Date(questDate.getTime() + 24 * 60 * 60 * 1000);
    const isExpired = !quest.completed && now > expirationTime;
    return quest.completed || isExpired;
  });

  const totalQuests = visibleQuests.length;
  const completedQuests = visibleQuests.filter(q => q.completed).length;
  const expiredQuests = visibleQuests.filter(q => {
    const questDate = new Date(q.date);
    const expirationTime = new Date(questDate.getTime() + 24 * 60 * 60 * 1000);
    return !q.completed && now > expirationTime;
  }).length;
  const completionRate = totalQuests > 0 ? ((completedQuests / totalQuests) * 100).toFixed(1) : 0;

  statsGrid.innerHTML = `
    <div class="hwq-stat-card completed">
      <div class="hwq-stat-icon">
        <i class="fas fa-check-circle"></i>
      </div>
      <div class="hwq-stat-content">
        <h3>${completedQuests}</h3>
        <p>Completed</p>
      </div>
    </div>
    
    <div class="hwq-stat-card expired">
      <div class="hwq-stat-icon">
        <i class="fas fa-times-circle"></i>
      </div>
      <div class="hwq-stat-content">
        <h3>${expiredQuests}</h3>
        <p>Expired</p>
      </div>
    </div>
    
    <div class="hwq-stat-card total">
      <div class="hwq-stat-icon">
        <i class="fas fa-list-check"></i>
      </div>
      <div class="hwq-stat-content">
        <h3>${totalQuests}</h3>
        <p>Total Visible</p>
      </div>
    </div>
    
    <div class="hwq-stat-card completion-rate">
      <div class="hwq-stat-icon">
        <i class="fas fa-percentage"></i>
      </div>
      <div class="hwq-stat-content">
        <h3>${completionRate}%</h3>
        <p>Completion Rate</p>
      </div>
    </div>
  `;
}

// ------------------- Function: updateHWQResultsInfo -------------------
// Updates the results information text
function updateHWQResultsInfo(filteredCount, totalCount) {
  const resultsInfo = document.getElementById('hwq-results-info');
  if (!resultsInfo) return;

  if (filteredCount === totalCount) {
    resultsInfo.innerHTML = `<p>Showing <strong>${totalCount}</strong> quest${totalCount !== 1 ? 's' : ''}</p>`;
  } else {
    resultsInfo.innerHTML = `<p>Showing <strong>${filteredCount}</strong> of <strong>${totalCount}</strong> quests</p>`;
  }
}

// ------------------- Function: renderHWQCards -------------------
// Renders the quest cards
async function renderHWQCards(quests) {
  const questsGrid = document.getElementById('hwq-quests-grid');
  if (!questsGrid) return;

  if (quests.length === 0) {
    questsGrid.innerHTML = `
      <div class="error-state" style="grid-column: 1 / -1;">
        <i class="fas fa-search"></i>
        <p>No quests match your filters</p>
      </div>
    `;
    return;
  }

  // Fetch user and character data upfront
  const [usersData, charactersData] = await Promise.all([
    fetchHWQUsers(),
    fetchHWQCharacters()
  ]);

  const questCardsHTML = quests.map(quest => {
    // Determine if quest is expired
    const now = new Date();
    const questDate = new Date(quest.date);
    const expirationTime = new Date(questDate.getTime() + 24 * 60 * 60 * 1000);
    const isExpired = !quest.completed && now > expirationTime;
    
    const statusClass = quest.completed ? 'status-completed' : 'status-expired';
    const statusText = quest.completed ? 'Completed' : 'Expired';
    const typeClass = `type-${quest.type}`;
    
    // Format requirements
    let requirementsText = 'N/A';
    if (quest.requirements) {
      if (typeof quest.requirements === 'string') {
        requirementsText = quest.requirements;
      } else if (typeof quest.requirements === 'object') {
        const reqs = [];
        
        // Item quests
        if (quest.requirements.item) {
          reqs.push(`${quest.requirements.amount || 1}x ${quest.requirements.item}`);
        }
        
        // Monster quests
        if (quest.requirements.monster) {
          const monsterCount = quest.requirements.amount || quest.requirements.count || 1;
          reqs.push(`Defeat ${monsterCount}x ${quest.requirements.monster}`);
        }
        
        // Writing quests
        if (quest.requirements.prompt) {
          reqs.push(`Write: "${quest.requirements.prompt}"`);
          if (quest.requirements.requirement) {
            reqs.push(`(${quest.requirements.requirement})`);
          }
          if (quest.requirements.context) {
            reqs.push(`Context: ${quest.requirements.context}`);
          }
        }
        
        // Art quests
        if (quest.requirements.theme) {
          reqs.push(`Art Theme: "${quest.requirements.theme}"`);
          if (quest.requirements.requirement) {
            reqs.push(`(${quest.requirements.requirement})`);
          }
        }
        
        // Escort quests
        if (quest.requirements.location) {
          reqs.push(`Escort to: ${quest.requirements.location}`);
        }
        
        // Generic description
        if (quest.requirements.description && !quest.requirements.prompt && !quest.requirements.theme) {
          reqs.push(quest.requirements.description);
        }
        
        requirementsText = reqs.length > 0 ? reqs.join(' • ') : JSON.stringify(quest.requirements);
      }
    }
    
    // Format post time to EST
    let postTimeFormatted = 'N/A';
    if (quest.scheduledPostTime) {
      try {
        // Parse cron format (e.g., "0 5 * * *" means 5:00 AM UTC daily)
        const cronParts = quest.scheduledPostTime.split(' ');
        if (cronParts.length >= 2) {
          const minute = cronParts[0];
          const hour = cronParts[1];
          
          // Convert UTC to EST (EST is UTC-5)
          let hourNum = parseInt(hour);
          let minuteNum = parseInt(minute);
          
          if (!isNaN(hourNum) && !isNaN(minuteNum)) {
            // Convert to EST
            hourNum = hourNum - 5;
            if (hourNum < 0) hourNum += 24;
            
            const period = hourNum >= 12 ? 'PM' : 'AM';
            const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
            postTimeFormatted = `${hour12}:${minuteNum.toString().padStart(2, '0')} ${period} EST`;
          }
        }
      } catch (e) {
        postTimeFormatted = quest.scheduledPostTime;
      }
    }

    // Format completion info
    let completionHTML = '';
    if (quest.completed && quest.completedBy) {
      const completedDate = quest.completedBy.timestamp ? new Date(quest.completedBy.timestamp).toLocaleDateString() : 'Unknown';
      const userId = quest.completedBy.userId || 'Unknown';
      const characterId = quest.completedBy.characterId || null;
      
      // Lookup user name (use nickname if available)
      const user = usersData.find(u => u.discordId === userId);
      const userName = user ? `<i class="fas fa-user"></i> ${user.nickname || user.username}` : `<i class="fas fa-user"></i> Unknown User`;
      
      // Lookup character name
      let characterName = '';
      if (characterId) {
        const character = charactersData.find(c => c._id === characterId || c.discordId === characterId);
        characterName = character 
          ? `<i class="fas fa-user-circle"></i> ${character.name}${character.job ? ` (${character.job})` : ''}`
          : `<i class="fas fa-user-circle"></i> Unknown Character`;
      }
      
      completionHTML = `
        <div class="quest-detail-row">
          <strong>Completed By:</strong>
          <span style="color: var(--text-primary);">
            ${userName}
          </span>
        </div>
        ${characterId ? `
        <div class="quest-detail-row">
          <strong>Character:</strong>
          <span style="color: var(--text-primary);">
            ${characterName}
          </span>
        </div>
        ` : ''}
        <div class="quest-detail-row">
          <strong>Completion Date:</strong>
          <span>${completedDate}</span>
        </div>
      `;
    }

    return `
      <div class="quest-card ${typeClass}" data-quest-id="${quest.questId}">
        <div class="quest-card-inner">
          <div class="quest-header">
            <div class="quest-title-row">
              <h3 class="quest-title">${quest.npcName}'s Request</h3>
              <span class="quest-status-badge ${statusClass}">
                <i class="fas fa-${quest.completed ? 'check-circle' : 'clock'}"></i>
                ${statusText}
              </span>
            </div>
            <div class="quest-meta">
              <div class="quest-date">
                <i class="fas fa-calendar"></i>
                <span>${new Date(quest.date).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div class="quest-content">
            <div class="quest-type-badge ${typeClass}">
              <i class="fas fa-${getQuestTypeIcon(quest.type)}"></i>
              ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)}
            </div>

            <div class="quest-details">
              <div class="quest-detail-row">
                <strong>Quest ID:</strong>
                <span>${quest.questId}</span>
              </div>
              <div class="quest-detail-row">
                <strong>Village:</strong>
                <span>${quest.village}</span>
              </div>
              <div class="quest-detail-row">
                <strong>NPC:</strong>
                <span>${quest.npcName}</span>
              </div>
              <div class="quest-detail-row">
                <strong>Post Time:</strong>
                <span>${postTimeFormatted}</span>
              </div>
              ${quest.channelId ? `
              <div class="quest-detail-row">
                <strong>Channel:</strong>
                <span>${getChannelName(quest.channelId)}</span>
              </div>
              ` : ''}
              ${completionHTML}
              <div class="quest-detail-row" style="border-top: 1px solid rgba(255, 255, 255, 0.1); margin-top: 0.5rem; padding-top: 0.75rem;">
                <strong>Requirements:</strong>
                <span style="white-space: normal; word-break: break-word;">${requirementsText}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  questsGrid.innerHTML = questCardsHTML;
}

// ------------------- Function: getChannelName -------------------
// Maps channel IDs to village town hall names
function getChannelName(channelId) {
  const channelMap = {
    '629028823001858060': '🏛️ Rudania Town Hall',
    '629028490179510308': '🏛️ Inariko Town Hall',
    '629030018965700668': '🏛️ Vhintl Town Hall'
  };
  return channelMap[channelId] || 'Unknown Channel';
}

// ------------------- Function: fetchHWQUsers -------------------
// Fetches all users for lookup
async function fetchHWQUsers() {
  try {
    const response = await fetch(`/api/users?all=true`);
    if (!response.ok) {
      console.warn('Failed to fetch users, returning empty array');
      return [];
    }
    const result = await response.json();
    // Handle different response formats
    return result.users || result.data || result || [];
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

// ------------------- Function: fetchHWQCharacters -------------------
// Fetches all characters for lookup
async function fetchHWQCharacters() {
  try {
    const response = await fetch(`/api/models/character?all=true`);
    if (!response.ok) throw new Error('Failed to fetch characters');
    const { data: characters } = await response.json();
    return characters;
  } catch (error) {
    console.error('Error fetching characters:', error);
    return [];
  }
}

// ------------------- Function: renderHWQPagination -------------------
// Renders pagination controls
function renderHWQPagination(currentPage, totalPages) {
  const paginationDiv = document.getElementById('hwq-pagination');
  if (!paginationDiv) return;

  if (totalPages <= 1) {
    paginationDiv.style.display = 'none';
    return;
  }

  paginationDiv.style.display = 'flex';
  paginationDiv.innerHTML = `
    <button 
      class="hwq-pagination-button" 
      id="hwq-prev-btn" 
      ${currentPage === 1 ? 'disabled' : ''}
      aria-label="Previous page"
    >
      <i class="fas fa-chevron-left"></i> Previous
    </button>
    <span class="hwq-page-info">Page ${currentPage} of ${totalPages}</span>
    <button 
      class="hwq-pagination-button" 
      id="hwq-next-btn" 
      ${currentPage === totalPages ? 'disabled' : ''}
      aria-label="Next page"
    >
      Next <i class="fas fa-chevron-right"></i>
    </button>
  `;

  // Setup pagination event listeners
  const prevBtn = document.getElementById('hwq-prev-btn');
  const nextBtn = document.getElementById('hwq-next-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', async () => {
      if (window.hwqCurrentPage > 1) {
        window.hwqCurrentPage--;
        await filterAndRenderHWQs();
        // Scroll to top of quest grid
        document.getElementById('hwq-stats-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
      if (window.hwqCurrentPage < totalPages) {
        window.hwqCurrentPage++;
        await filterAndRenderHWQs();
        // Scroll to top of quest grid
        document.getElementById('hwq-stats-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}

// Helper function to get quest type icon
function getQuestTypeIcon(type) {
  const icons = {
    'item': 'box',
    'monster': 'dragon',
    'escort': 'walking',
    'crafting': 'hammer',
    'art': 'palette',
    'writing': 'pen'
  };
  return icons[type] || 'clipboard';
}

// Load recent quests when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadRecentQuests();
});

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
  loadModelData,
  showProfileSection,
  showGuildSection,
  showCalendarSection,
  showUsersSection,
  showSettingsSection,
  showSuggestionBoxSection,
  showMemberLoreSection,
  showLevelsSection,
  showAdminAreaSection
};
