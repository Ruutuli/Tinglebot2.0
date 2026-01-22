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
import * as villages from './villages.js';
import * as vending from './vending.js';
import * as vendingShops from './vendingShops.js';
import * as monsters from './monsters.js';
import * as pets from './pets.js';
import * as starterGear from './starterGear.js';
import * as quests from './quests.js';
import * as blank from './blank.js';
import { createPagination, setupBackToTopButton, scrollToTop, createSearchFilterBar } from './ui.js';
import { updateActiveNavState, updateBreadcrumb, clearActiveNavState, navigateToDashboard, resetFilterState } from './modules/navigation.js';

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
  vending,
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
    
    // Check for login redirect - add small delay to ensure session is ready
    const urlParams = new URLSearchParams(window.location.search);
    const isLoginRedirect = urlParams.has('error') === false && document.referrer.includes('/auth/discord');
    
    // If this might be a login redirect, wait a bit for session to be ready
    if (isLoginRedirect) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    await auth.checkUserAuthStatus();
    
    // Re-check auth status after a short delay if we just logged in
    // This ensures admin status is properly loaded
    if (isLoginRedirect) {
      setTimeout(async () => {
        console.log('[index.js] Re-checking auth status after login redirect');
        await auth.checkUserAuthStatus();
      }, 1000);
    }
    
    const backToTopButton = document.getElementById('backToTop');
    
    setupSidebarNavigation();
    setupBackToTopButton();
    setupModelCards();
    initializeNotificationSystem();
    
    // Check for denied applications after a short delay to ensure auth is ready
    setTimeout(() => {
      checkForDeniedApplications();
    }, 1000);
    
    // Check for login success and refresh suggestion box if needed
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

      // Clear sidebar active states when navigating to a model
      clearActiveNavState();
      
      // Update URL with hash
      const hash = `#${modelName}`;
      window.history.pushState({ model: modelName }, '', hash);
      
      // Update breadcrumb to show model name
      const modelDisplayName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
      updateBreadcrumb(modelDisplayName);
      
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
          // Use centralized navigation to go back to dashboard
          navigateToDashboard();
          
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

        // Skip API fetch for 'blank' and 'inventory' models - they fetch their own data
        if (modelName === 'blank') {
          title.textContent = 'Blank Template';
          await blank.initializeBlankPage([], 1, contentDiv);
          return; // Exit early, don't continue with API fetch or switch statement
        }
        
        if (modelName === 'inventory') {
          console.log(`[Inventory Load] 🖱️  setupModelCards: Inventory card clicked in OLD handler at ${new Date().toISOString()}`);
          title.textContent = 'Inventories';
          // Show loading state immediately
          contentDiv.innerHTML = `
            <div class="model-loading-overlay">
              <i class="fas fa-spinner fa-spin"></i>
              <p>Loading inventory data...</p>
            </div>
          `;
          console.log(`[Inventory Load] 📍 Loading state set in setupModelCards at ${new Date().toISOString()}`);
          await inventory.initializeInventoryPage([], 1, contentDiv);
          return; // Exit early, don't continue with API fetch or switch statement
        }

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
          case 'mount':
            title.textContent = 'Mounts';
            // TODO: Implement mount page initialization
            contentDiv.innerHTML = `
              <div class="blank-empty-state">
                <i class="fas fa-horse"></i>
                <p>Mounts page is not yet implemented</p>
              </div>
            `;
            break;
          case 'relic':
            title.textContent = 'Relics';
            // TODO: Implement relic page initialization
            contentDiv.innerHTML = `
              <div class="blank-empty-state">
                <i class="fas fa-gem"></i>
                <p>Relics page is not yet implemented</p>
              </div>
            `;
            break;
          case 'helpwantedquest':
            console.log('[HWQ] Rendering help wanted quest page with data:', data?.length || 0, 'items');
            title.textContent = 'Help Wanted Quests';
            // Show loading state while fetching user/character data
            contentDiv.innerHTML = `
              <div class="model-loading-overlay" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; min-height: 400px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent-color); margin-bottom: 1.5rem;"></i>
                <p style="font-size: 1.1rem; color: var(--text-primary); font-weight: 600;">Loading Help Wanted Quests...</p>
                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">Fetching quest and user data</p>
              </div>
            `;
            // Render async with proper delay to ensure loading shows
            try {
              await renderHelpWantedQuests(data, contentDiv);
              console.log('[HWQ] Help wanted quest page rendered successfully');
            } catch (error) {
              console.error('[HWQ] Error rendering help wanted quest page:', error);
              contentDiv.innerHTML = `
                <div class="blank-empty-state">
                  <i class="fas fa-exclamation-triangle"></i>
                  <p>Error loading Help Wanted Quests</p>
                  <p style="font-size: 0.9rem; margin-top: 0.5rem;">${error.message}</p>
                </div>
              `;
            }
            break;
          case 'vending':
            title.textContent = 'Vending Stock';
            await vending.initializeVendingPage(data, pagination.page, contentDiv);
            break;
          case 'vendingShops':
            title.textContent = 'Vending Shops';
            await vendingShops.initializeVendingShopsPage(data, pagination.page, contentDiv);
            break;
          case 'village':
            title.textContent = 'Villages';
            await villages.initializeVillagePage(data, pagination.page, contentDiv);
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

          // Skip pagination for vending shops as it uses its own efficient system
          if (modelName === 'vendingShops') {
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
// Loads a model view by triggering the model card click or directly initializing
async function loadModelByName(modelName) {
  if (modelName === 'inventory') {
    console.log(`[Inventory Load] 🔗 loadModelByName called for inventory at ${new Date().toISOString()}`);
  }
  const modelCard = document.querySelector(`.model-card[data-model="${modelName}"]`);
  if (modelCard) {
    if (modelName === 'inventory') {
      console.log(`[Inventory Load] 🎯 Found inventory card, clicking it at ${new Date().toISOString()}`);
    }
    modelCard.click();
  } else {
    // If card doesn't exist, directly initialize the model page
    console.log(`Model card not found for: ${modelName}, initializing directly...`);
    
    const dashboardSection = document.getElementById('dashboard-section');
    const modelDetailsPage = document.getElementById('model-details-page');
    const title = document.getElementById('model-details-title');
    const contentDiv = document.getElementById('model-details-data');
    const backButton = document.querySelector('.back-button');
    
    if (!dashboardSection || !modelDetailsPage || !title || !contentDiv) {
      console.error('Required DOM elements not found for direct model loading');
      return;
    }
    
    // Hide dashboard, show model page
    dashboardSection.style.display = 'none';
    modelDetailsPage.style.display = 'block';
    title.textContent = modelName.charAt(0).toUpperCase() + modelName.slice(1);
    contentDiv.innerHTML = '';
    
    // Setup back button
    if (backButton) {
      backButton.onclick = () => {
        navigateToDashboard();
        modelDetailsPage.style.display = 'none';
        dashboardSection.style.display = 'block';
        resetFilterState(modelName);
      };
    }
    
    setupBackToTopButton();
    
    // Initialize the model page
    // Skip API fetch for 'blank' and 'inventory' models - they fetch their own data
    if (modelName === 'blank' || modelName === 'inventory') {
      if (modelName === 'blank') {
        title.textContent = 'Blank Template';
        await blank.initializeBlankPage([], 1, contentDiv);
      } else if (modelName === 'inventory') {
        console.log(`[Inventory Load] 🔗 loadModelByName called directly (hash navigation) at ${new Date().toISOString()}`);
        title.textContent = 'Inventories';
        // Show loading state immediately
        if (contentDiv) {
          contentDiv.innerHTML = `
            <div class="model-loading-overlay">
              <i class="fas fa-spinner fa-spin"></i>
              <p>Loading inventory data...</p>
            </div>
          `;
          console.log(`[Inventory Load] 📍 Loading state set in loadModelByName at ${new Date().toISOString()}`);
        }
        await inventory.initializeInventoryPage([], 1, contentDiv);
      }
    } else {
      // For other models, try to fetch data
      try {
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
        
        // Use the switch statement from the model card handler
        switch (modelName) {
          case 'character':
            await characters.initializeCharacterPage(data, pagination.page, contentDiv);
            break;
          case 'weather':
            await weatherStats.initializeWeatherStatsPage();
            break;
          case 'item':
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
          case 'villageShops':
            await villageShops.initializeVillageShopsPage(data, pagination.page, contentDiv);
            break;
          case 'village':
            title.textContent = 'Villages';
            await villages.initializeVillagePage(data, pagination.page, contentDiv);
            break;
          case 'quest':
            await quests.initializeQuestPage(data, pagination.page, contentDiv);
            break;
          case 'mount':
            title.textContent = 'Mounts';
            // TODO: Implement mount page initialization
            contentDiv.innerHTML = `
              <div class="blank-empty-state">
                <i class="fas fa-horse"></i>
                <p>Mounts page is not yet implemented</p>
              </div>
            `;
            break;
          case 'relic':
            title.textContent = 'Relics';
            // TODO: Implement relic page initialization
            contentDiv.innerHTML = `
              <div class="blank-empty-state">
                <i class="fas fa-gem"></i>
                <p>Relics page is not yet implemented</p>
              </div>
            `;
            break;
          case 'helpwantedquest':
            console.log('[HWQ] Rendering help wanted quest page with data:', data?.length || 0, 'items');
            title.textContent = 'Help Wanted Quests';
            // Show loading state while fetching user/character data
            contentDiv.innerHTML = `
              <div class="model-loading-overlay" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; min-height: 400px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent-color); margin-bottom: 1.5rem;"></i>
                <p style="font-size: 1.1rem; color: var(--text-primary); font-weight: 600;">Loading Help Wanted Quests...</p>
                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">Fetching quest and user data</p>
              </div>
            `;
            // Render async with proper delay to ensure loading shows
            try {
              await renderHelpWantedQuests(data, contentDiv);
              console.log('[HWQ] Help wanted quest page rendered successfully');
            } catch (error) {
              console.error('[HWQ] Error rendering help wanted quest page:', error);
              contentDiv.innerHTML = `
                <div class="blank-empty-state">
                  <i class="fas fa-exclamation-triangle"></i>
                  <p>Error loading Help Wanted Quests</p>
                  <p style="font-size: 0.9rem; margin-top: 0.5rem;">${error.message}</p>
                </div>
              `;
            }
            break;
          case 'vending':
            title.textContent = 'Vending Stock';
            await vending.initializeVendingPage(data, pagination.page, contentDiv);
            break;
          case 'vendingShops':
            title.textContent = 'Vending Shops';
            await vendingShops.initializeVendingShopsPage(data, pagination.page, contentDiv);
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
      } catch (error) {
        console.error(`Error loading model ${modelName}:`, error);
        error.logError(error, 'Model Loading');
      }
    }
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
        // Skip API fetch for 'blank' and 'inventory' models - they fetch their own data
        if (modelName === 'blank' || modelName === 'inventory') {
          if (modelName === 'blank') {
            await blank.initializeBlankPage([], 1, contentDiv);
          } else if (modelName === 'inventory') {
            console.log(`[Inventory Load] 🔄 Retry button clicked for inventory, skipping loadModelData at ${new Date().toISOString()}`);
            await inventory.initializeInventoryPage([], 1, contentDiv);
          }
          return;
        }
        
        const { data, pagination } = await loadModelData(modelName);
        switch (modelName) {
          case 'character':
            await characters.initializeCharacterPage(data, pagination.page, contentDiv);
            break;
          case 'item':
            items.initializeItemPage(data, pagination.page, contentDiv);
            break;
          case 'monster':
            await monsters.initializeMonsterPage(data, pagination.page, contentDiv);
            break;
          case 'villageShops':
            await villageShops.initializeVillageShopsPage(data, pagination.page, contentDiv);
            break;
          case 'vending':
            await vending.initializeVendingPage(data, pagination.page, contentDiv);
            break;
          case 'vendingShops':
            await vendingShops.initializeVendingShopsPage(data, pagination.page, contentDiv);
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
  
  // Update active state in sidebar
  updateActiveNavState(sectionId);
  
  // Update breadcrumb - derive from sectionId
  const breadcrumbText = sectionId
    .replace('-section', '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  updateBreadcrumb(breadcrumbText);
}

// ============================================================================
// ------------------- Navigation Setup -------------------
// Handles all sidebar navigation including dashboard and stats
// ============================================================================
function setupSidebarNavigation() {
  
  // ============================================================================
  // ------------------- Dropdown Toggle Functionality -------------------
  // Handles dropdown menu toggles in sidebar navigation
  // ============================================================================
  const dropdownToggles = document.querySelectorAll('.nav-dropdown-toggle');
  
  dropdownToggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const dropdown = toggle.closest('.nav-dropdown');
      const isActive = dropdown.classList.contains('active');
      
      // Close all other dropdowns
      document.querySelectorAll('.nav-dropdown').forEach(item => {
        if (item !== dropdown) {
          item.classList.remove('active');
          item.querySelector('.nav-dropdown-toggle').setAttribute('aria-expanded', 'false');
        }
      });
      
      // Toggle current dropdown
      if (isActive) {
        dropdown.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        dropdown.classList.add('active');
        toggle.setAttribute('aria-expanded', 'true');
      }
      
      // Don't close sidebar when toggling dropdowns - only close when navigating to a page
      // closeMobileSidebar(); // Removed - sidebar should stay open when expanding/collapsing sections
    });
  });
  
  // Close dropdowns when clicking outside (but not on mobile when sidebar is open)
  document.addEventListener('click', (e) => {
    // Don't close dropdowns if clicking inside the sidebar on mobile
    if (isMobileView() && e.target.closest('.sidebar')) {
      return;
    }
    
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
        dropdown.classList.remove('active');
        const toggle = dropdown.querySelector('.nav-dropdown-toggle');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  });
  
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a:not(.nav-dropdown-toggle)');
  
  sidebarLinks.forEach(link => {
    const sectionId = link.getAttribute('data-section');
    
    link.addEventListener('click', e => {
      // Skip if this is a dropdown toggle (handled separately above)
      if (link.classList.contains('nav-dropdown-toggle')) {
        return;
      }
      
      // Allow external links (like /map) to work normally
      if (!sectionId) {
        // No data-section means it's an external link, don't prevent default
        if (isMobileView()) {
          closeMobileSidebar();
        }
        return;
      }
      
      e.preventDefault();
      
      // Close mobile sidebar if open (only for actual navigation links, not dropdown toggles)
      if (isMobileView()) {
        closeMobileSidebar();
      }
      
      // If link is inside a dropdown, open that dropdown
      const dropdown = link.closest('.nav-dropdown');
      if (dropdown) {
        // Close all other dropdowns
        document.querySelectorAll('.nav-dropdown').forEach(item => {
          if (item !== dropdown) {
            item.classList.remove('active');
            item.querySelector('.nav-dropdown-toggle').setAttribute('aria-expanded', 'false');
          }
        });
        // Open the parent dropdown
        dropdown.classList.add('active');
        dropdown.querySelector('.nav-dropdown-toggle').setAttribute('aria-expanded', 'true');
      }
      
      // Update URL
      const newUrl = sectionId === 'dashboard-section' ? '/' : `#${sectionId}`;
      window.history.pushState({ section: sectionId }, '', newUrl);
      
      // Ensure URL is correct (replace #dashboard with / if it somehow got set)
      if (sectionId === 'dashboard-section' && window.location.hash === '#dashboard') {
        window.history.replaceState({ section: sectionId }, '', '/');
      }
      
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
      } else if (sectionId === 'vending-section') {
        showVendingSection();
      } else if (sectionId === 'tokens-section') {
        showTokensSection();
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
      } else if (section === 'vending-section') {
        showVendingSection();
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
  
  // ============================================================================
  // ------------------- Helper: Open Dropdown for Section -------------------
  // Opens the parent dropdown if a section is inside one
  // ============================================================================
  function openDropdownForSection(sectionId) {
    if (!sectionId) return;
    
    // Map sections to dropdown categories
    const sectionToDropdown = {
      // User Area dropdown
      'profile-section': 'User Area',
      'settings-section': 'User Area',
      'vending-section': 'User Area',
      'tokens-section': 'User Area',
      'stats-section': 'User Area',
      // Community dropdown
      'guilds-section': 'Community',
      'users-section': 'Community',
      'member-lore-section': 'Community',
      'gallery-section': 'Community',
      'relationships-section': 'Community',
      'suggestion-box-section': 'Community',
      // Game Features dropdown
      'calendar-section': 'Game Features',
      'levels-section': 'Game Features',
      // Admin Area dropdown
      'admin-area-section': 'Admin Area'
    };
    
    const dropdownName = sectionToDropdown[sectionId];
    if (dropdownName) {
      const dropdowns = document.querySelectorAll('.nav-dropdown');
      dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.nav-dropdown-toggle');
        if (toggle) {
          const span = toggle.querySelector('span');
          if (span && span.textContent.trim() === dropdownName) {
            dropdown.classList.add('active');
            toggle.setAttribute('aria-expanded', 'true');
          }
        }
      });
    }
  }
  
  // Handle hash changes (for direct navigation to pages)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash) {
      const hashValue = hash.substring(1);
      const modelNames = ['character', 'monster', 'pet', 'mount', 'vending', 'vendingShops', 'item', 'starterGear', 'village', 'villageShops', 'relic', 'quest', 'helpwantedquest', 'inventory', 'blank'];
      
      if (modelNames.includes(hashValue)) {
        loadModelByName(hashValue);
      } else if (hashValue === 'dashboard' || hashValue === 'dashboard-section') {
        showDashboardSection();
        window.history.replaceState({ section: 'dashboard-section' }, '', '/');
      } else {
        // Handle other sections
        const sectionId = hashValue.replace('-section', '') + '-section';
        showSection(sectionId);
        openDropdownForSection(sectionId);
      }
    } else {
      // No hash, show dashboard
      showDashboardSection();
    }
  });

  // Handle initial URL on page load
  // Use a small delay to ensure all DOM elements are ready
  setTimeout(() => {
    const hash = window.location.hash;
    if (hash) {
      const hashValue = hash.substring(1);
      
      // List of known model names
      const modelNames = ['character', 'monster', 'pet', 'mount', 'vending', 'vendingShops', 'item', 'starterGear', 'village', 'villageShops', 'relic', 'quest', 'helpwantedquest', 'inventory', 'blank'];
      
      // Check for admin area sub-sections
      if (hashValue === 'admin-area-section/database-editor') {
        showAdminAreaSection();
        openDropdownForSection('admin-area-section');
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
      openDropdownForSection('stats-section');
    } else if (hashValue === 'dashboard' || hashValue === 'dashboard-section') {
      showDashboardSection();
      // Normalize URL to / instead of #dashboard
      if (window.location.hash === '#dashboard') {
        window.history.replaceState({ section: 'dashboard-section' }, '', '/');
      }
    } else if (hashValue === 'profile-section') {
      showProfileSection();
      openDropdownForSection('profile-section');
    } else if (hashValue === 'vending' || hashValue === 'vending-section') {
      showVendingSection();
      openDropdownForSection('vending-section');
    } else if (hashValue === 'guilds-section') {
      showGuildSection();
      openDropdownForSection('guilds-section');
    } else if (hashValue === 'calendar-section') {
      showCalendarSection();
      openDropdownForSection('calendar-section');
    } else if (hashValue === 'users-section') {
      showUsersSection();
      openDropdownForSection('users-section');
    } else if (hashValue === 'relationships-section') {
      relationshipsModule.showRelationshipsSection();
      openDropdownForSection('relationships-section');
    } else if (hashValue === 'admin-area-section') {
      showAdminAreaSection();
      openDropdownForSection('admin-area-section');
    } else if (hashValue === 'settings-section') {
      showSettingsSection();
      openDropdownForSection('settings-section');
    } else if (hashValue === 'levels-section') {
      showLevelsSection();
      openDropdownForSection('levels-section');
    } else if (hashValue === 'suggestion-box-section') {
      showSuggestionBoxSection();
      openDropdownForSection('suggestion-box-section');
    } else if (hashValue === 'member-lore-section') {
      showMemberLoreSection();
      openDropdownForSection('member-lore-section');
    } else {
      showSection(hashValue);
      openDropdownForSection(hashValue);
    }
    } else {
      // No hash, show dashboard
      showDashboardSection();
    }
  }, 100);
  
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
  updateActiveNavState('stats-section');
  
  // Update breadcrumb
  updateBreadcrumb('Stats');
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
    
    // Ensure village section is visible
    const villageSection = document.getElementById('village-section');
    if (villageSection) {
      villageSection.style.display = 'block';
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
    
    // Render village section
    if (window.renderVillageSection) {
      window.renderVillageSection();
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
  updateActiveNavState('dashboard-section');
  
  // Update breadcrumb
  updateBreadcrumb('Dashboard');
}



// ============================================================================
// ------------------- Profile Navigation -------------------
// Handles profile page navigation specifically
// ============================================================================
// ------------------- Function: showVendingSection -------------------
// Shows the vending management section
function showVendingSection() {
  // Scroll to top when showing vending section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the vending section
  const vendingSection = document.getElementById('vending-section');
  if (vendingSection) {
    vendingSection.style.display = 'block';
    
    // Load vending shops
    import('./profile.js?v=20251114').then(profileModule => {
      // Make module available globally for pagination callbacks
      window.profileModule = profileModule;
      
      // Load vending shops into the vending section container
      if (profileModule.loadVendingShops) {
        profileModule.loadVendingShops({
          containerId: 'vending-shops-container',
          loadingId: 'vending-shops-loading',
          infoId: 'vending-header-info',
          countId: 'vending-characters-count-full'
        });
      }
    }).catch(err => {
      console.error('[index.js]: Error loading vending module:', err);
    });
  }
  
  // Update active state in sidebar
  updateActiveNavState('vending-section');
  
  // Update breadcrumb
  updateBreadcrumb('Vending Management');
}

// ------------------- Function: showVendorDashboardSection -------------------
// Shows the vendor dashboard page for a specific character
function showVendorDashboardSection(characterId) {
  // Scroll to top when showing vendor dashboard section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the vendor dashboard section
  const vendorDashboardSection = document.getElementById('vendor-dashboard-section');
  if (vendorDashboardSection) {
    vendorDashboardSection.style.display = 'block';
    
    // Load vendor dashboard content
    import('./profile.js?v=20251114').then(profileModule => {
      if (profileModule.loadVendorDashboard) {
        profileModule.loadVendorDashboard(characterId);
      }
    }).catch(err => {
      console.error('[index.js]: Error loading vendor dashboard:', err);
    });
  }
  
  // Update active state in sidebar - keep vending section active
  updateActiveNavState('vending-section');
  
  // Update breadcrumb
  updateBreadcrumb('Vendor Dashboard');
  
  // Setup back button
  const backBtn = document.getElementById('vendor-dashboard-back-btn');
  if (backBtn) {
    backBtn.onclick = () => {
      showVendingSection();
    };
  }
}

// Make function available globally immediately
window.showVendorDashboardSection = showVendorDashboardSection;

function showTokensSection() {
  // Scroll to top when showing tokens section
  scrollToTop();
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the tokens section
  const tokensSection = document.getElementById('tokens-section');
  if (tokensSection) {
    tokensSection.style.display = 'block';
    
    // Load tokens section
    import('./tokens.js').then(tokensModule => {
      if (tokensModule.loadTokensSection) {
        tokensModule.loadTokensSection();
      }
    }).catch(err => {
      console.error('[index.js]: Error loading tokens module:', err);
    });
  }
  
  // Update active state in sidebar
  updateActiveNavState('tokens-section');
  
  // Update breadcrumb
  updateBreadcrumb('Token Tracking');
}

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
  updateActiveNavState('profile-section');
  
  // Update breadcrumb
  updateBreadcrumb('Profile');
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
  updateActiveNavState('guilds-section');
  
  // Update breadcrumb
  updateBreadcrumb('Guilds');
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
  updateActiveNavState('calendar-section');
  
  // Update breadcrumb
  updateBreadcrumb('Calendar');
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
  updateActiveNavState('users-section');
  
  // Update breadcrumb
  updateBreadcrumb('Users');
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
  updateActiveNavState('settings-section');
  
  // Update breadcrumb
  updateBreadcrumb('Settings');
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
  updateActiveNavState('suggestion-box-section');
  
  // Update breadcrumb
  updateBreadcrumb('Suggestion Box');
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
  updateActiveNavState('member-lore-section');
  
  // Update breadcrumb
  updateBreadcrumb('Member Lore');
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
    
    // Reinitialize blupee system when showing levels section
    if (window.reinitializeBlupee) {
      window.reinitializeBlupee();
    }
  } else {
    console.error('❌ Levels section not found');
  }
  
  // Update active state in sidebar
  updateActiveNavState('levels-section');
  
  // Update breadcrumb
  updateBreadcrumb('Levels');
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
  updateActiveNavState('admin-area-section');
  
  // Update breadcrumb
  updateBreadcrumb('Admin Area');
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

  // Update month title (will be set from first quest's postedAt when we have data)
  const monthTitle = document.getElementById('quest-month-title');

  try {
    // Fetch the most recent 6 quests from the latest month only
    const response = await fetch('/api/models/quest?limit=6&sort=postedAt&order=desc&latestMonthOnly=true');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const { data: quests } = await response.json();
    
    if (!quests || quests.length === 0) {
      if (monthTitle) {
        const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
        monthTitle.textContent = `${currentMonth} Quests`;
      }
      container.innerHTML = `
        <div class="no-recent-quests">
          <i class="fas fa-inbox"></i>
          <p>No recent quests available</p>
        </div>
      `;
      return;
    }

    // Set month title from the first quest's postedAt (all are from the same month when using latestMonthOnly)
    if (monthTitle) {
      const monthName = quests[0].postedAt
        ? new Date(quests[0].postedAt).toLocaleDateString('en-US', { month: 'long' })
        : new Date().toLocaleDateString('en-US', { month: 'long' });
      monthTitle.textContent = `${monthName} Quests`;
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
  try {
    console.log('[HWQ] renderHelpWantedQuests called with:', {
      dataLength: data?.length || 0,
      hasContentDiv: !!contentDiv
    });
    
    // Allow loading state to render
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!data || data.length === 0) {
      console.warn('[HWQ] No data provided or data is empty');
      contentDiv.innerHTML = `
        <div class="blank-empty-state">
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

    console.log('[HWQ] Creating interface with', data.length, 'quests');
    
    // Create the initial UI with filters
    createHWQInterface(contentDiv);
    
    // Small delay to ensure DOM elements are ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Populate NPC dropdown with unique NPCs
    populateHWQNPCFilter(data);
    
    // Apply initial filter and render
    console.log('[HWQ] Starting filterAndRenderHWQs');
    await filterAndRenderHWQs();
    console.log('[HWQ] filterAndRenderHWQs completed');
  } catch (error) {
    console.error('[HWQ] Error rendering Help Wanted Quests:', error);
    console.error('[HWQ] Error stack:', error.stack);
    if (contentDiv) {
      contentDiv.innerHTML = `
        <div class="blank-empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error loading Help Wanted Quests</p>
          <p style="font-size: 0.9rem; margin-top: 0.5rem;">${error.message}</p>
        </div>
      `;
    }
  }
}

// ------------------- Function: createHWQInterface -------------------
// Creates the HWQ interface with filters and containers
function createHWQInterface(contentDiv) {
  if (!contentDiv) {
    console.error('[HWQ] createHWQInterface: contentDiv is null or undefined');
    return;
  }
  
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

    <div class="hwq-filters-wrapper"></div>

    <!-- HWQ Stats Grid -->
    <div class="hwq-stats-grid" id="hwq-stats-grid"></div>

    <!-- HWQ Results Info -->
    <div class="model-results-info" id="hwq-results-info"></div>

    <!-- HWQ Quest Cards Grid -->
    <div class="quest-details-grid" id="hwq-quests-grid"></div>

    <!-- HWQ Pagination -->
    <div class="model-pagination blank-pagination" id="hwq-pagination"></div>
  `;

  try {
    createHWQSearchAndFilterBars(contentDiv);
  } catch (error) {
    console.error('[HWQ] Error creating search and filter bars:', error);
  }

  // Setup event listeners
  try {
    setupHWQEventListeners();
  } catch (error) {
    console.error('[HWQ] Error setting up event listeners:', error);
  }
}

function createHWQSearchAndFilterBars(contentDiv) {
  const filtersWrapper = contentDiv.querySelector('.hwq-filters-wrapper');
  if (!filtersWrapper) {
    console.error('[HWQ] createHWQSearchAndFilterBars: .hwq-filters-wrapper not found');
    return;
  }

  // Create separate search bar (like blank.js pattern)
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'model-search-wrapper blank-search-wrapper';
  
  const searchBar = document.createElement('div');
  searchBar.className = 'model-search-bar blank-search-bar';
  
  const searchIcon = document.createElement('i');
  searchIcon.className = 'fas fa-search model-search-icon blank-search-icon';
  searchIcon.setAttribute('aria-hidden', 'true');
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'hwq-search-input';
  searchInput.className = 'model-search-input blank-search-input';
  searchInput.placeholder = 'Search by NPC, requirements, or Quest ID...';
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.setAttribute('aria-label', 'Search Help Wanted Quests');
  
  searchBar.appendChild(searchIcon);
  searchBar.appendChild(searchInput);
  searchWrapper.appendChild(searchBar);
  filtersWrapper.appendChild(searchWrapper);

  // Create separate filter bar (like blank.js pattern)
  const filterWrapper = document.createElement('div');
  filterWrapper.className = 'model-filter-wrapper blank-filter-wrapper';
  
  const filterBar = document.createElement('div');
  filterBar.className = 'model-filter-bar blank-filter-bar';

  // Village Filter
  const villageControl = document.createElement('div');
  villageControl.className = 'model-filter-control blank-filter-control';
  const villageLabel = document.createElement('label');
  villageLabel.className = 'model-filter-label blank-filter-label';
  villageLabel.innerHTML = '<i class="fas fa-map-marker-alt"></i> Village';
  villageLabel.setAttribute('for', 'hwq-village-filter');
  const villageSelect = document.createElement('select');
  villageSelect.id = 'hwq-village-filter';
  villageSelect.className = 'model-filter-select blank-filter-select';
  villageSelect.innerHTML = `
    <option value="" selected>All Villages</option>
    <option value="Rudania">Rudania</option>
    <option value="Inariko">Inariko</option>
    <option value="Vhintl">Vhintl</option>
  `;
  villageControl.appendChild(villageLabel);
  villageControl.appendChild(villageSelect);
  filterBar.appendChild(villageControl);

  // Quest Type Filter
  const typeControl = document.createElement('div');
  typeControl.className = 'model-filter-control blank-filter-control';
  const typeLabel = document.createElement('label');
  typeLabel.className = 'model-filter-label blank-filter-label';
  typeLabel.innerHTML = '<i class="fas fa-tag"></i> Quest Type';
  typeLabel.setAttribute('for', 'hwq-type-filter');
  const typeSelect = document.createElement('select');
  typeSelect.id = 'hwq-type-filter';
  typeSelect.className = 'model-filter-select blank-filter-select';
  typeSelect.innerHTML = `
    <option value="" selected>All Types</option>
    <option value="item">Item</option>
    <option value="monster">Monster</option>
    <option value="escort">Escort</option>
    <option value="crafting">Crafting</option>
    <option value="art">Art</option>
    <option value="writing">Writing</option>
  `;
  typeControl.appendChild(typeLabel);
  typeControl.appendChild(typeSelect);
  filterBar.appendChild(typeControl);

  // NPC Filter
  const npcControl = document.createElement('div');
  npcControl.className = 'model-filter-control blank-filter-control';
  const npcLabel = document.createElement('label');
  npcLabel.className = 'model-filter-label blank-filter-label';
  npcLabel.innerHTML = '<i class="fas fa-user"></i> NPC';
  npcLabel.setAttribute('for', 'hwq-npc-filter');
  const npcSelect = document.createElement('select');
  npcSelect.id = 'hwq-npc-filter';
  npcSelect.className = 'model-filter-select blank-filter-select';
  npcSelect.innerHTML = '<option value="" selected>All NPCs</option>';
  npcControl.appendChild(npcLabel);
  npcControl.appendChild(npcSelect);
  filterBar.appendChild(npcControl);

  // Status Filter
  const statusControl = document.createElement('div');
  statusControl.className = 'model-filter-control blank-filter-control';
  const statusLabel = document.createElement('label');
  statusLabel.className = 'model-filter-label blank-filter-label';
  statusLabel.innerHTML = '<i class="fas fa-flag"></i> Status';
  statusLabel.setAttribute('for', 'hwq-status-filter');
  const statusSelect = document.createElement('select');
  statusSelect.id = 'hwq-status-filter';
  statusSelect.className = 'model-filter-select blank-filter-select';
  statusSelect.innerHTML = `
    <option value="" selected>All</option>
    <option value="completed">Completed</option>
    <option value="expired">Expired</option>
  `;
  statusControl.appendChild(statusLabel);
  statusControl.appendChild(statusSelect);
  filterBar.appendChild(statusControl);

  // Sort Filter
  const sortControl = document.createElement('div');
  sortControl.className = 'model-filter-control blank-filter-control';
  const sortLabel = document.createElement('label');
  sortLabel.className = 'model-filter-label blank-filter-label';
  sortLabel.innerHTML = '<i class="fas fa-sort"></i> Sort By';
  sortLabel.setAttribute('for', 'hwq-sort-select');
  const sortSelect = document.createElement('select');
  sortSelect.id = 'hwq-sort-select';
  sortSelect.className = 'model-filter-select blank-filter-select';
  sortSelect.innerHTML = `
    <option value="date-desc" selected>Newest First</option>
    <option value="date-asc">Oldest First</option>
    <option value="village">Village</option>
    <option value="type">Type</option>
    <option value="npc">NPC Name</option>
  `;
  sortControl.appendChild(sortLabel);
  sortControl.appendChild(sortSelect);
  filterBar.appendChild(sortControl);

  // Clear Filters Button
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.id = 'hwq-clear-filters';
  clearButton.className = 'model-clear-filters-btn blank-clear-filters-btn';
  clearButton.innerHTML = '<i class="fas fa-times"></i> Clear Filters';
  clearButton.setAttribute('aria-label', 'Clear all filters');
  filterBar.appendChild(clearButton);

  filterWrapper.appendChild(filterBar);
  filtersWrapper.appendChild(filterWrapper);
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
  if (!window.allHWQs) {
    console.warn('[HWQ] filterAndRenderHWQs: window.allHWQs not set');
    return;
  }

  const searchInput = document.getElementById('hwq-search-input');
  const villageFilter = document.getElementById('hwq-village-filter');
  const typeFilter = document.getElementById('hwq-type-filter');
  const npcFilter = document.getElementById('hwq-npc-filter');
  const statusFilter = document.getElementById('hwq-status-filter');
  const sortSelect = document.getElementById('hwq-sort-select');
  
  // Ensure required DOM elements exist
  const questsGrid = document.getElementById('hwq-quests-grid');
  if (!questsGrid) {
    console.error('[HWQ] filterAndRenderHWQs: hwq-quests-grid element not found');
    return;
  }

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
  try {
    await renderHWQCards(paginatedQuests);
  } catch (error) {
    console.error('[HWQ] Error rendering quest cards:', error);
    const questsGrid = document.getElementById('hwq-quests-grid');
    if (questsGrid) {
      questsGrid.innerHTML = `
        <div class="blank-empty-state" style="grid-column: 1 / -1;">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error rendering quest cards</p>
        </div>
      `;
    }
  }
  
  // Render pagination after cards are rendered
  try {
    renderHWQPagination(window.hwqCurrentPage, totalPages);
  } catch (error) {
    console.error('[HWQ] Error rendering pagination:', error);
  }
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
      <div class="blank-empty-state" style="grid-column: 1 / -1;">
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

// ------------------- Function: showHWQPageJumpModal -------------------
// Shows the page jump modal when ellipsis is clicked
function showHWQPageJumpModal(minPage, maxPage, totalPages) {
  // Remove existing modal if any
  const existingModal = document.getElementById('hwq-page-jump-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const pageRange = minPage === maxPage ? `Page ${minPage}` : `Pages ${minPage}-${maxPage}`;
  
  const overlay = document.createElement('div');
  overlay.className = 'blank-page-jump-modal-overlay';
  overlay.id = 'hwq-page-jump-modal';
  
  const modal = document.createElement('div');
  modal.className = 'blank-page-jump-modal';
  
  modal.innerHTML = `
    <div class="blank-page-jump-modal-header">
      <h3 class="blank-page-jump-modal-title">
        <i class="fas fa-arrow-right"></i>
        Jump to Page
      </h3>
      <button class="blank-page-jump-modal-close" aria-label="Close modal">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="blank-page-jump-modal-body">
      <p>Enter a page number between ${minPage} and ${maxPage} (of ${totalPages} total pages):</p>
      <input 
        type="number" 
        id="hwq-page-jump-input" 
        class="blank-page-jump-input"
        min="${minPage}" 
        max="${maxPage}" 
        placeholder="${minPage}-${maxPage}"
        autofocus
      />
      <div class="blank-page-jump-modal-actions">
        <button class="blank-page-jump-modal-cancel">Cancel</button>
        <button class="blank-page-jump-modal-go">Go</button>
      </div>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Close handlers
  const closeModal = () => overlay.remove();
  
  overlay.querySelector('.blank-page-jump-modal-close').onclick = closeModal;
  overlay.querySelector('.blank-page-jump-modal-cancel').onclick = closeModal;
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };
  
  // Go handler
  const pageInput = document.getElementById('hwq-page-jump-input');
  const goButton = overlay.querySelector('.blank-page-jump-modal-go');
  
  const jumpToPage = () => {
    const page = parseInt(pageInput.value);
    if (page >= minPage && page <= maxPage) {
      window.hwqCurrentPage = page;
      closeModal();
      filterAndRenderHWQs().then(() => {
        document.getElementById('hwq-stats-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      pageInput.setCustomValidity(`Please enter a number between ${minPage} and ${maxPage}`);
      pageInput.reportValidity();
    }
  };
  
  goButton.onclick = jumpToPage;
  pageInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      jumpToPage();
    }
  };
}

// ------------------- Function: renderHWQPagination -------------------
// Renders pagination controls with ellipsis modal
function renderHWQPagination(currentPage, totalPages) {
  const paginationDiv = document.getElementById('hwq-pagination');
  if (!paginationDiv) return;

  // Ensure it has the right classes
  if (!paginationDiv.classList.contains('model-pagination')) {
    paginationDiv.classList.add('model-pagination', 'blank-pagination');
  }

  // Remove any existing pagination
  paginationDiv.innerHTML = '';

  if (totalPages <= 1) return;

  // Create pagination bar
  const paginationBar = document.createElement('div');
  paginationBar.className = 'pagination';

  // Helper to create a button (matching blank.js style)
  const makeButton = (label, pageNum, isActive = false, icon = null) => {
    const btn = document.createElement('button');
    btn.className = `pagination-button ${isActive ? 'active' : ''}`;
    if (icon) {
      btn.innerHTML = `<i class="fas fa-chevron-${icon}"></i>`;
    } else {
      btn.textContent = label;
    }
    btn.title = `Page ${pageNum}`;
    btn.onclick = () => {
      window.hwqCurrentPage = pageNum;
      filterAndRenderHWQs().then(() => {
        document.getElementById('hwq-stats-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    return btn;
  };

  // Helper to create ellipsis
  const makeEllipsis = (minPage, maxPage) => {
    const ell = document.createElement('span');
    ell.className = 'pagination-ellipsis';
    ell.textContent = '...';
    ell.title = `Click to jump to a page (${minPage}-${maxPage})`;
    ell.style.cursor = 'pointer';
    ell.onclick = () => {
      showHWQPageJumpModal(minPage, maxPage, totalPages);
    };
    return ell;
  };

  // Previous button
  if (currentPage > 1) {
    paginationBar.appendChild(makeButton('Previous', currentPage - 1, false, 'left'));
  }

  // Page numbers (matching blank.js logic)
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    paginationBar.appendChild(makeButton('1', 1));
    if (startPage > 2) {
      paginationBar.appendChild(makeEllipsis(2, startPage - 1));
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    paginationBar.appendChild(makeButton(i.toString(), i, i === currentPage));
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationBar.appendChild(makeEllipsis(endPage + 1, totalPages - 1));
    }
    paginationBar.appendChild(makeButton(totalPages.toString(), totalPages));
  }

  // Next button
  if (currentPage < totalPages) {
    paginationBar.appendChild(makeButton('Next', currentPage + 1, false, 'right'));
  }

  paginationDiv.appendChild(paginationBar);
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
// ------------------- Notification System -------------------
// Handles notifications for denied applications and other alerts
// ============================================================================

let notifications = [];
let notificationBadge = null;
let notificationDropdown = null;

/**
 * Initialize the notification system UI
 */
function initializeNotificationSystem() {
  const container = document.getElementById('notification-container');
  if (!container) return;

  // Create notification badge
  notificationBadge = document.createElement('div');
  notificationBadge.className = 'notification-badge';
  notificationBadge.innerHTML = `
    <i class="fas fa-bell notification-icon"></i>
    <span class="notification-count" style="display: none;">0</span>
  `;
  notificationBadge.addEventListener('click', toggleNotificationDropdown);

  // Create dropdown
  notificationDropdown = document.createElement('div');
  notificationDropdown.className = 'notification-dropdown';
  notificationDropdown.innerHTML = `
    <div class="notification-header">
      <h3>Notifications</h3>
      <button class="notification-clear" onclick="clearAllNotifications()">Clear All</button>
    </div>
    <div class="notification-list"></div>
  `;

  container.appendChild(notificationBadge);
  container.appendChild(notificationDropdown);

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (notificationDropdown && !container.contains(e.target)) {
      notificationDropdown.classList.remove('show');
    }
  });
}

/**
 * Check for denied applications and show notifications
 */
async function checkForDeniedApplications() {
  try {
    const response = await fetch('/api/user/characters', {
      credentials: 'include'
    });

    if (!response.ok) return;

    const { data: characters } = await response.json();
    const deniedCharacters = characters.filter(char => char.status === 'denied');

    // Clear existing denied notifications
    notifications = notifications.filter(n => n.type !== 'denied');

    // Add new denied notifications
    deniedCharacters.forEach(character => {
      const existingNotification = notifications.find(
        n => n.type === 'denied' && n.characterId === character._id
      );

      if (!existingNotification) {
        notifications.push({
          type: 'denied',
          title: `Application Denied: ${character.name}`,
          characterId: character._id,
          characterName: character.name,
          message: character.denialReason || 'Your application has been denied.',
          timestamp: new Date(),
          id: `denied-${character._id}`
        });
      }
    });

    updateNotificationBadge();
    renderNotifications();
  } catch (error) {
    console.error('[index.js]: Error checking for denied applications:', error);
  }
}

/**
 * Add a notification
 */
function addNotification(type, title, message, data = {}) {
  const notification = {
    type,
    title,
    message,
    timestamp: new Date(),
    id: `notification-${Date.now()}-${Math.random()}`,
    ...data
  };

  notifications.unshift(notification);
  updateNotificationBadge();
  renderNotifications();
}

/**
 * Update the notification badge display
 */
function updateNotificationBadge() {
  if (!notificationBadge) return;

  const count = notifications.length;
  const countElement = notificationBadge.querySelector('.notification-count');
  const badge = notificationBadge;

  if (count > 0) {
    countElement.textContent = count > 99 ? '99+' : count;
    countElement.style.display = 'flex';
    badge.classList.add('has-notifications');
  } else {
    countElement.style.display = 'none';
    badge.classList.remove('has-notifications');
  }
}

/**
 * Render notifications in the dropdown
 */
function renderNotifications() {
  if (!notificationDropdown) return;

  const list = notificationDropdown.querySelector('.notification-list');
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">No notifications</div>';
    return;
  }

  list.innerHTML = notifications.map(notification => {
    const timeAgo = getTimeAgo(notification.timestamp);
    const icon = notification.type === 'denied' ? 'fa-exclamation-circle' : 'fa-info-circle';
    const characterLink = notification.characterId 
      ? `/ocs/${encodeURIComponent(notification.characterName)}`
      : '#';

    return `
      <div class="notification-item ${notification.type}" onclick="handleNotificationClick('${notification.id}')">
        <div class="notification-item-title">
          <i class="fas ${icon}"></i>
          <span>${notification.title || 'Notification'}</span>
        </div>
        <div class="notification-item-message">${notification.message}</div>
        ${notification.type === 'denied' ? `<div class="notification-item-time"><a href="${characterLink}" style="color: var(--primary-color);">View Character</a> • ${timeAgo}</div>` : `<div class="notification-item-time">${timeAgo}</div>`}
      </div>
    `;
  }).join('');
}

/**
 * Toggle notification dropdown
 */
function toggleNotificationDropdown() {
  if (!notificationDropdown) return;
  notificationDropdown.classList.toggle('show');
}

/**
 * Handle notification click
 */
function handleNotificationClick(notificationId) {
  const notification = notifications.find(n => n.id === notificationId);
  if (!notification) return;

  if (notification.type === 'denied' && notification.characterId) {
    window.location.href = `/ocs/${encodeURIComponent(notification.characterName)}`;
  }

  // Remove notification after clicking
  removeNotification(notificationId);
}

/**
 * Remove a notification
 */
function removeNotification(notificationId) {
  notifications = notifications.filter(n => n.id !== notificationId);
  updateNotificationBadge();
  renderNotifications();
}

/**
 * Clear all notifications
 */
window.clearAllNotifications = function() {
  notifications = [];
  updateNotificationBadge();
  renderNotifications();
};

/**
 * Get time ago string
 */
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

// Make notification functions available globally
window.addNotification = addNotification;
window.checkForDeniedApplications = checkForDeniedApplications;

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
