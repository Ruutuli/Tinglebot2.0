// ============================================================================
// ------------------- Model Loader Module -------------------
// Handles loading and displaying model data
// ============================================================================

import { showLoadingState } from './dashboard.js';
import { navigateToModel, navigateToDashboard, resetFilterState } from './navigation.js';
import { setupBackToTopButton, scrollToTop } from '../ui.js';
import * as characters from '../characters.js';
import * as items from '../items.js';
import * as stats from '../stats.js';
import * as weatherStats from '../weatherStats.js';
import * as monsters from '../monsters.js';
import * as pets from '../pets.js';
import * as starterGear from '../starterGear.js';
import * as quests from '../quests.js';
import * as inventory from '../inventory.js';
import * as villageShops from '../villageShops.js';
import * as villages from '../villages.js';
import * as vending from '../vending.js';
import * as vendingShops from '../vendingShops.js';
import * as blank from '../blank.js';
import * as error from '../error.js';

// ------------------- Function: getModelFetchUrl -------------------
// Gets the API URL for fetching model data
export function getModelFetchUrl(modelName) {
  if (modelName === 'starterGear') {
    return '/api/models/item?all=true';
  } else if (modelName === 'helpwantedquest') {
    return '/api/models/helpwantedquest?all=true';
  }
  return `/api/models/${modelName}`;
}

// ------------------- Function: loadModelData -------------------
// Loads data for a specific model
export async function loadModelData(modelName, page = 1) {
  const fetchUrl = getModelFetchUrl(modelName);
  const url = new URL(fetchUrl, window.location.origin);
  if (page > 1) {
    url.searchParams.set('page', page);
  }
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
}

// ------------------- Function: setupBackButton -------------------
// Sets up the back button handler
export function setupBackButton(modelName, modelDetailsPage, dashboardSection) {
  const backButton = document.querySelector('.back-button');
  if (!backButton) return;
  
  backButton.onclick = () => {
    navigateToDashboard();
    
    modelDetailsPage.style.display = 'none';
    dashboardSection.style.display = 'block';
    
    // Reset any global state
    resetFilterState(modelName);
  };
}

// ------------------- Function: showModelView -------------------
// Shows the model details view
export function showModelView(modelName, title, contentDiv, dashboardSection, modelDetailsPage) {
  console.log(`[Inventory Load] showModelView called for: ${modelName} at ${new Date().toISOString()}`);
  dashboardSection.style.display = 'none';
  modelDetailsPage.style.display = 'block';
  title.textContent = modelName.charAt(0).toUpperCase() + modelName.slice(1);
  contentDiv.innerHTML = '';
  
  // Show loading state immediately for inventory model
  if (modelName === 'inventory' && contentDiv) {
    console.log(`[Inventory Load] 📍 Setting initial loading state in showModelView at ${new Date().toISOString()}`);
    contentDiv.innerHTML = `
      <div class="model-loading-overlay">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading inventory data...</p>
      </div>
    `;
    console.log(`[Inventory Load] ✅ Loading state HTML set, checking DOM:`, contentDiv.querySelector('.model-loading-overlay') ? 'Found' : 'Not found');
  }
}

// ------------------- Function: initializeModelPage -------------------
// Initializes a model page based on model type
export async function initializeModelPage(modelName, data, page, contentDiv, title) {
  switch (modelName) {
    case 'character':
      await characters.initializeCharacterPage(data, page, contentDiv);
      break;
    case 'weather':
      await weatherStats.initializeWeatherStatsPage();
      break;
    case 'item':
      await items.initializeItemPage(data, page, contentDiv);
      break;
    case 'starterGear':
      title.textContent = 'Starter Gear';
      await starterGear.initializeStarterGearPage(data, page, contentDiv);
      break;
    case 'monster':
      await monsters.initializeMonsterPage(data, page, contentDiv);
      break;
    case 'pet':
      await pets.initializePetPage(data, page, contentDiv);
      break;
    case 'inventory':
      title.textContent = 'Inventories';
      console.log(`[Inventory Load] 🚀 initializeModelPage called for inventory at ${new Date().toISOString()}`);
      await inventory.initializeInventoryPage(data, page, contentDiv);
      console.log(`[Inventory Load] ✅ initializeModelPage completed for inventory at ${new Date().toISOString()}`);
      break;
    case 'villageShops':
      await villageShops.initializeVillageShopsPage(data, page, contentDiv);
      break;
    case 'village':
      title.textContent = 'Villages';
      await villages.initializeVillagePage(data, page, contentDiv);
      break;
    case 'quest':
      await quests.initializeQuestPage(data, page, contentDiv);
      break;
    case 'vending':
      title.textContent = 'Vending Stock';
      await vending.initializeVendingPage(data, page, contentDiv);
      break;
    case 'vendingShops':
      title.textContent = 'Vending Shops';
      await vendingShops.initializeVendingShopsPage(data, page, contentDiv);
      break;
    case 'blank':
      title.textContent = 'Blank Template';
      await blank.initializeBlankPage(data, page, contentDiv);
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
}

// ------------------- Function: setupModelCardHandlers -------------------
// Sets up click handlers for model cards
export function setupModelCardHandlers() {
  const modelCards = document.querySelectorAll('.model-card');
  
  modelCards.forEach(card => {
    const modelName = card.getAttribute('data-model');
    
    card.addEventListener('click', async (event) => {
      event.preventDefault();
      
      if (modelName === 'inventory') {
        console.log(`[Inventory Load] 🖱️  Inventory card clicked at ${new Date().toISOString()}`);
      }
      
      navigateToModel(modelName);
      resetFilterState(modelName);
      
      // Add visual feedback for click
      card.classList.add('clicked');
      setTimeout(() => card.classList.remove('clicked'), 200);
      
      showLoadingState();
      
      try {
        const dashboardSection = document.getElementById('dashboard-section');
        const modelDetailsPage = document.getElementById('model-details-page');
        const title = document.getElementById('model-details-title');
        const contentDiv = document.getElementById('model-details-data');
        const backButton = document.querySelector('.back-button');
        
        if (!dashboardSection || !modelDetailsPage || !title || !contentDiv || !backButton) {
          throw new Error('Required DOM elements not found');
        }
        
        if (modelName === 'inventory') {
          console.log(`[Inventory Load] 📍 About to call showModelView at ${new Date().toISOString()}`);
        }
        
        showModelView(modelName, title, contentDiv, dashboardSection, modelDetailsPage);
        setupBackButton(modelName, modelDetailsPage, dashboardSection);
        setupBackToTopButton();
        
        // Skip API fetch for 'blank' and 'inventory' models - they fetch their own data
        if (modelName === 'blank' || modelName === 'inventory') {
          if (modelName === 'inventory') {
            console.log(`[Inventory Load] ⏭️  Skipping loadModelData, calling initializeModelPage directly at ${new Date().toISOString()}`);
          }
          await initializeModelPage(modelName, [], 1, contentDiv, title);
        } else {
          const { data, pagination } = await loadModelData(modelName);
          await initializeModelPage(modelName, data, pagination.page, contentDiv, title);
        }
      } catch (err) {
        error.logError(err, 'Model Loading');
      }
    });
  });
}






